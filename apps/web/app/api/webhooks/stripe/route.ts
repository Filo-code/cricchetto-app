import Stripe from "stripe";
import {
  transitionSubscriptionState,
  type PlanType,
} from "../../../../lib/subscription";
import { supabaseServer } from "../../../../lib/supabase-server";
import { getErrorMessage } from "../../../../lib/errors";

// ─────────────────────────────────────────────────────────────
// Stripe webhook handler
// ─────────────────────────────────────────────────────────────

export async function POST(request: Request): Promise<Response> {
  const rawBody = await request.text();
  const stripeSignature = request.headers.get("stripe-signature");

  if (!stripeSignature) {
    return Response.json({ error: "Missing stripe-signature" }, { status: 400 });
  }

  const webhookSecret = process.env.Cricchetto_STRIPE_WEBHOOK_SECRET;
  const stripeKey = process.env.Cricchetto_STRIPE_SECRET_KEY;

  if (!webhookSecret || !stripeKey) {
    return Response.json({ error: "Stripe not configured" }, { status: 500 });
  }

  let event: Stripe.Event;

  try {
    event = new Stripe(stripeKey).webhooks.constructEvent(
      rawBody,
      stripeSignature,
      webhookSecret,
    );
  } catch (err) {
    return Response.json({ error: "Invalid signature" }, { status: 400 });
  }

  // ── IDEMPOTENCY ───────────────────────────────────────────

  const { error: dupError } = await supabaseServer
    .from("stripe_processed_events")
    .insert({ stripe_event_id: event.id, event_type: event.type });

  if (dupError?.code === "23505") {
    return new Response(null, { status: 200 });
  }

  if (dupError) {
    console.error("[stripe-webhook] idempotency_insert_failed", {
      eventId: event.id,
      error: dupError.message,
    });
    return Response.json({ error: "Internal error" }, { status: 500 });
  }

  // ── ROUTER ───────────────────────────────────────────────

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
        await handleSubscriptionUpdated(event.data.object as Stripe.Subscription);
        break;

      case "customer.subscription.deleted":
        await handleSubscriptionDeleted(event.data.object as Stripe.Subscription);
        break;
    }
  } catch (error) {
    console.error("[stripe-webhook] handler_error", {
      eventId: event.id,
      error: getErrorMessage(error),
    });

    await supabaseServer
      .from("stripe_processed_events")
      .delete()
      .eq("stripe_event_id", event.id);

    return Response.json({ error: "Processing failed" }, { status: 500 });
  }

  return new Response(null, { status: 200 });
}

// ─────────────────────────────────────────────────────────────
// HANDLERS
// ─────────────────────────────────────────────────────────────

async function handleCheckoutCompleted(session: Stripe.Checkout.Session) {
  const stripeCustomerId = toId(session.customer);
  const stripeSubscriptionId = toId(session.subscription);
  const workshopId = session.metadata?.workshop_id;

  if (!stripeCustomerId || !stripeSubscriptionId || !workshopId) return;

  await transitionSubscriptionState(
    workshopId,
    "stripe:checkout_completed",
    "active",
    {
      stripeSubscriptionId,
      additionalUpdate: {
        stripe_customer_id: stripeCustomerId,
        stripe_subscription_id: stripeSubscriptionId,
      },
    },
  );
}

async function handleInvoicePaid(invoice: Stripe.Invoice, eventId: string) {
  const stripeCustomerId = toId(invoice.customer);
  if (!stripeCustomerId) return;

  // ── FIX STRIPE TYPE ISSUE ───────────────────────────────
  const stripeSubscriptionId = extractSubscriptionId(invoice);

  const workshopId = await resolveWorkshopByStripeCustomer(stripeCustomerId);
  if (!workshopId) return;

  await transitionSubscriptionState(
    workshopId,
    "stripe:invoice_paid",
    "active",
    {
      stripeSubscriptionId,
      additionalUpdate: { stripe_customer_id: stripeCustomerId },
    },
  );
}

async function handleInvoicePaymentFailed(invoice: Stripe.Invoice, eventId: string) {
  const stripeCustomerId = toId(invoice.customer);
  if (!stripeCustomerId) return;

  const stripeSubscriptionId = extractSubscriptionId(invoice);

  const workshopId = await resolveWorkshopByStripeCustomer(stripeCustomerId);
  if (!workshopId) return;

  await transitionSubscriptionState(
    workshopId,
    "stripe:invoice_payment_failed",
    "past_due",
    { stripeSubscriptionId },
  );
}

async function handleSubscriptionUpdated(subscription: Stripe.Subscription) {
  if (!["canceled", "unpaid"].includes(subscription.status)) return;

  const stripeCustomerId = toId(subscription.customer);
  if (!stripeCustomerId) return;

  const workshopId = await resolveWorkshopByStripeCustomer(stripeCustomerId);
  if (!workshopId) return;

  await transitionSubscriptionState(
    workshopId,
    "stripe:subscription_canceled",
    "blocked",
    {
      stripeSubscriptionId: subscription.id,
      additionalUpdate: { stripe_subscription_id: null },
    },
  );
}

async function handleSubscriptionDeleted(subscription: Stripe.Subscription) {
  const stripeCustomerId = toId(subscription.customer);
  if (!stripeCustomerId) return;

  const workshopId = await resolveWorkshopByStripeCustomer(stripeCustomerId);
  if (!workshopId) return;

  await transitionSubscriptionState(
    workshopId,
    "stripe:subscription_deleted",
    "blocked",
    {
      stripeSubscriptionId: subscription.id,
      additionalUpdate: { stripe_subscription_id: null },
    },
  );
}

// ─────────────────────────────────────────────────────────────
// HELPERS (FIX STRIPE TYPES HERE)
// ─────────────────────────────────────────────────────────────

function extractSubscriptionId(invoice: Stripe.Invoice): string | undefined {
  const sub = (invoice as unknown as { subscription?: string | { id: string } }).subscription;
  if (!sub) return undefined;
  if (typeof sub === "string") return sub;
  return sub.id;
}

async function resolveWorkshopByStripeCustomer(
  stripeCustomerId: string,
): Promise<string | null> {
  const { data } = await supabaseServer
    .from("workshops")
    .select("id")
    .eq("stripe_customer_id", stripeCustomerId)
    .maybeSingle();

  return data?.id ?? null;
}

function toId(field: string | { id: string } | null | undefined) {
  if (!field) return undefined;
  return typeof field === "string" ? field : field.id;
}