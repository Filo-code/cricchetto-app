import Stripe from "stripe";
import { transitionSubscriptionState, type TransitionTrigger, type PlanType } from "../../../../lib/subscription";
import { supabaseServer } from "../../../../lib/supabase-server";
import { getErrorMessage } from "../../../../lib/errors";

// Stripe webhook handler.
//
// All state changes go through transitionSubscriptionState().
// No direct DB writes. No subscription_status updates outside the state machine.
//
// Event → trigger mapping:
//   checkout.session.completed        stripe:checkout_completed
//   invoice.paid                      stripe:invoice_paid
//   invoice.payment_failed            stripe:invoice_payment_failed
//   customer.subscription.updated     stripe:subscription_canceled  (canceled | unpaid only)
//   customer.subscription.deleted     stripe:subscription_deleted
//
// Idempotency: stripe_processed_events table (PK = stripe_event_id).
// On processing failure: idempotency record deleted → Stripe retries safely.
// All handlers are idempotent (conditional SET semantics, not increments).

export async function POST(request: Request): Promise<Response> {
  const rawBody = await request.text();
  const stripeSignature = request.headers.get("stripe-signature");

  if (!stripeSignature) {
    return Response.json({ error: "Missing stripe-signature" }, { status: 400 });
  }

  const webhookSecret = process.env.Cricchetto_STRIPE_WEBHOOK_SECRET;
  if (!webhookSecret) {
    console.error("[stripe-webhook] Cricchetto_STRIPE_WEBHOOK_SECRET not set");
    return Response.json({ error: "Webhook not configured" }, { status: 500 });
  }

  const stripeKey = process.env.Cricchetto_STRIPE_SECRET_KEY;
  if (!stripeKey) {
    console.error("[stripe-webhook] Cricchetto_STRIPE_SECRET_KEY not set");
    return Response.json({ error: "Stripe not configured" }, { status: 500 });
  }

  let event: Stripe.Event;
  try {
    event = new Stripe(stripeKey).webhooks.constructEvent(rawBody, stripeSignature, webhookSecret);
  } catch (err) {
    console.error("[stripe-webhook] signature_verification_failed", {
      error: err instanceof Error ? err.message : err,
    });
    return Response.json({ error: "Invalid signature" }, { status: 400 });
  }

  // ── IDEMPOTENCY GATE ──────────────────────────────────────────────────────
  const { error: dupError } = await supabaseServer
    .from("stripe_processed_events")
    .insert({ stripe_event_id: event.id, event_type: event.type });

  if (dupError?.code === "23505") {
    return new Response(null, { status: 200 });
  }
  if (dupError) {
    console.error("[stripe-webhook] idempotency_insert_failed", {
      eventId: event.id,
      eventType: event.type,
      error: dupError.message,
    });
    return Response.json({ error: "Internal error" }, { status: 500 });
  }
  // ─────────────────────────────────────────────────────────────────────────

  try {
    switch (event.type) {
      case "checkout.session.completed":
        await handleCheckoutCompleted(event.data.object as Stripe.Checkout.Session);
        break;
      case "invoice.paid":
        await handleInvoicePaid(event.data.object as Stripe.Invoice, event.id);
        break;
      case "invoice.payment_failed":
        await handleInvoicePaymentFailed(event.data.object as Stripe.Invoice, event.id);
        break;
      case "customer.subscription.updated":
        await handleSubscriptionUpdated(event.data.object as Stripe.Subscription, event.id);
        break;
      case "customer.subscription.deleted":
        await handleSubscriptionDeleted(event.data.object as Stripe.Subscription, event.id);
        break;
      default:
        break;
    }
  } catch (error) {
    // Processing failed after idempotency record was committed.
    // All handlers use conditional SET semantics — rolling back lets Stripe retry safely.
    console.error("[stripe-webhook] handler_error_after_idempotency_record", {
      eventId: event.id,
      eventType: event.type,
      error: getErrorMessage(error),
    });

    const { error: rollbackError } = await supabaseServer
      .from("stripe_processed_events")
      .delete()
      .eq("stripe_event_id", event.id);

    if (rollbackError) {
      // Rollback failed — idempotency record persists, Stripe retry will be a no-op.
      // Manual recovery: inspect stripe_processed_events + replay from Stripe dashboard.
      console.error("[stripe-webhook] idempotency_rollback_failed", {
        eventId: event.id,
        rollbackError: rollbackError.message,
      });
      return new Response(null, { status: 200 });
    }

    return Response.json({ error: "Processing failed" }, { status: 500 });
  }

  return new Response(null, { status: 200 });
}

// ── EVENT HANDLERS ────────────────────────────────────────────────────────────

async function handleCheckoutCompleted(session: Stripe.Checkout.Session): Promise<void> {
  const stripeCustomerId = toId(session.customer);
  const stripeSubscriptionId = toId(session.subscription);
  const workshopId = session.metadata?.workshop_id;
  const rawPlan = session.metadata?.plan_type;

  if (!stripeCustomerId || !stripeSubscriptionId || !workshopId || !rawPlan) {
    console.error("[stripe-webhook] CRITICAL: checkout.session.completed missing required metadata", {
      stripeCustomerId, stripeSubscriptionId, workshopId, rawPlan,
    });
    return; // Metadata is set at checkout creation — retrying won't fix it.
  }

  const planType: PlanType = rawPlan === "pro" ? "pro" : "basic";

  const result = await transitionSubscriptionState(
    workshopId,
    "stripe:checkout_completed",
    "active",
    {
      stripeSubscriptionId,
      additionalUpdate: {
        plan_type: planType,
        stripe_customer_id: stripeCustomerId,
        stripe_subscription_id: stripeSubscriptionId,
      },
    },
  );

  if (result === "noop") {
    // Matrix: checkout_completed→active only from trial_active|trial_expired.
    // If state is blocked: user paid but was not activated — admin must unblock manually.
    // If state is active/past_due: duplicate checkout or race with renewal — safe noop.
    // Log as error because any noop here may represent uncollected payment.
    console.error("[stripe-webhook] checkout.session.completed: noop — REVIEW REQUIRED", {
      workshopId,
      stripeSubscriptionId,
      note: "Payment may have been collected without activating access. Check workshop state.",
    });
    return;
  }

  console.log("[stripe-webhook] checkout.session.completed: activated", {
    workshopId, planType, stripeCustomerId, stripeSubscriptionId,
  });
}

async function handleInvoicePaid(invoice: Stripe.Invoice, eventId: string): Promise<void> {
  const stripeCustomerId = toId(invoice.customer);
  if (!stripeCustomerId) {
    console.warn("[stripe-webhook] invoice.paid: missing customer id", { eventId });
    return;
  }

  const stripeSubscriptionId = toId(invoice.subscription) ?? undefined;

  const workshopId = await resolveWorkshopByStripeCustomer(stripeCustomerId, eventId, "invoice.paid");
  if (!workshopId) {
    // Throw triggers idempotency rollback → Stripe retry.
    // Handles the race where invoice.paid arrives before checkout.session.completed
    // (stripe_customer_id not yet in DB). On retry, checkout will have been processed.
    throw new Error(`invoice.paid: no workshop for customer ${stripeCustomerId}`);
  }

  const result = await transitionSubscriptionState(
    workshopId,
    "stripe:invoice_paid",
    "active",
    {
      stripeSubscriptionId,
      additionalUpdate: { stripe_customer_id: stripeCustomerId },
    },
  );

  if (result === "noop") {
    // Workshop is blocked or in an unexpected state — payment confirmed by Stripe
    // but access not updated. May indicate state drift. Review workshop manually.
    console.warn("[state_machine] noop_transition", {
      workshopId,
      trigger: "stripe:invoice_paid",
      to: "active",
      reason: "current_state_not_in_allowed_sources_or_subscription_id_mismatch",
    });
    console.error("[stripe-webhook] invoice.paid: noop — REVIEW REQUIRED", {
      workshopId,
      stripeCustomerId,
      stripeSubscriptionId,
    });
  } else {
    console.log("[stripe-webhook] invoice.paid: applied", { workshopId, stripeCustomerId, stripeSubscriptionId });
  }
}

async function handleInvoicePaymentFailed(invoice: Stripe.Invoice, eventId: string): Promise<void> {
  const stripeCustomerId = toId(invoice.customer);
  if (!stripeCustomerId) {
    console.warn("[stripe-webhook] invoice.payment_failed: missing customer id", { eventId });
    return;
  }

  const stripeSubscriptionId = toId(invoice.subscription) ?? undefined;

  const workshopId = await resolveWorkshopByStripeCustomer(stripeCustomerId, eventId, "invoice.payment_failed");
  if (!workshopId) return;

  const result = await transitionSubscriptionState(
    workshopId,
    "stripe:invoice_payment_failed",
    "past_due",
    { stripeSubscriptionId },
  );

  if (result === "noop") {
    console.warn("[state_machine] noop_transition", {
      workshopId,
      trigger: "stripe:invoice_payment_failed",
      to: "past_due",
      reason: "current_state_not_in_allowed_sources_or_subscription_id_mismatch",
    });
  } else {
    console.log("[stripe-webhook] invoice.payment_failed: applied", { workshopId, stripeCustomerId, stripeSubscriptionId });
  }
}

async function handleSubscriptionUpdated(subscription: Stripe.Subscription, eventId: string): Promise<void> {
  // Only terminal Stripe states trigger blocking: canceled and unpaid.
  // past_due is handled by invoice.payment_failed.
  if (subscription.status !== "canceled" && subscription.status !== "unpaid") {
    return;
  }

  const stripeCustomerId = toId(subscription.customer);
  if (!stripeCustomerId) {
    console.warn("[stripe-webhook] customer.subscription.updated: missing customer id", { eventId });
    return;
  }

  const workshopId = await resolveWorkshopByStripeCustomer(stripeCustomerId, eventId, "customer.subscription.updated");
  if (!workshopId) return;

  const result = await transitionSubscriptionState(
    workshopId,
    "stripe:subscription_canceled",
    "blocked",
    {
      stripeSubscriptionId: subscription.id,
      additionalUpdate: { stripe_subscription_id: null },
    },
  );

  if (result === "noop") {
    console.warn("[state_machine] noop_transition", {
      workshopId,
      trigger: "stripe:subscription_canceled",
      to: "blocked",
      reason: "current_state_not_in_allowed_sources_or_subscription_id_mismatch",
    });
  } else {
    console.log("[stripe-webhook] customer.subscription.updated: applied", {
      workshopId, stripeCustomerId, stripeStatus: subscription.status,
    });
  }
}

async function handleSubscriptionDeleted(subscription: Stripe.Subscription, eventId: string): Promise<void> {
  const stripeCustomerId = toId(subscription.customer);
  if (!stripeCustomerId) {
    console.warn("[stripe-webhook] customer.subscription.deleted: missing customer id", { eventId });
    return;
  }

  const workshopId = await resolveWorkshopByStripeCustomer(stripeCustomerId, eventId, "customer.subscription.deleted");
  if (!workshopId) return;

  const result = await transitionSubscriptionState(
    workshopId,
    "stripe:subscription_deleted",
    "blocked",
    {
      stripeSubscriptionId: subscription.id,
      additionalUpdate: { stripe_subscription_id: null },
    },
  );

  if (result === "noop") {
    console.warn("[state_machine] noop_transition", {
      workshopId,
      trigger: "stripe:subscription_deleted",
      to: "blocked",
      reason: "current_state_not_in_allowed_sources_or_subscription_id_mismatch",
    });
  } else {
    console.log("[stripe-webhook] customer.subscription.deleted: applied", { workshopId, stripeCustomerId });
  }
}

// ── HELPERS ───────────────────────────────────────────────────────────────────

async function resolveWorkshopByStripeCustomer(
  stripeCustomerId: string,
  eventId: string,
  eventType: string,
): Promise<string | null> {
  const { data } = await supabaseServer
    .from("workshops")
    .select("id")
    .eq("stripe_customer_id", stripeCustomerId)
    .maybeSingle();

  if (!data) {
    console.error("[stripe-webhook] CRITICAL: stripe_customer_id not mapped to any workshop", {
      stripeCustomerId,
      stripeEventId: eventId,
      stripeEventType: eventType,
    });
    return null;
  }

  return data.id;
}

/** Extracts the string ID from a Stripe expandable field. */
function toId(field: string | { id: string } | null | undefined): string | undefined {
  if (!field) return undefined;
  return typeof field === "string" ? field : field.id;
}
