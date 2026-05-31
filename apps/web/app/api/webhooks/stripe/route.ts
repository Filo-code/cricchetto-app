import Stripe from "stripe";
import {
  activateWorkshopSubscription,
  blockWorkshopSubscription,
  confirmWorkshopPayment,
  markWorkshopPastDue,
} from "../../../../lib/subscription";
import { getErrorMessage } from "../../../../lib/errors";
import type { PlanType } from "../../../../lib/subscription";

// Stripe webhook handler.
//
// Signature verification uses stripe.webhooks.constructEvent with:
//   Cricchetto_STRIPE_SECRET_KEY
//   Cricchetto_STRIPE_WEBHOOK_SECRET
//
// Checkout metadata must include:
//   { workshop_id: string, plan_type: "basic" | "pro" }
//
// Subscription status lifecycle via webhooks:
//   checkout.session.completed        → active
//   invoice.paid                      → active (keeps active on renewal; recovers past_due)
//   invoice.payment_failed            → past_due (Stripe retrying; access retained)
//   customer.subscription.updated     → blocked when status = canceled | unpaid
//   customer.subscription.deleted     → blocked

function createStripeClient(): Stripe {
  const key = process.env.Cricchetto_STRIPE_SECRET_KEY;
  if (!key) {
    throw new Error("Cricchetto_STRIPE_SECRET_KEY is not set");
  }
  return new Stripe(key);
}

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

  let stripe: Stripe;
  let event: Stripe.Event;
  try {
    stripe = createStripeClient();
    event = stripe.webhooks.constructEvent(rawBody, stripeSignature, webhookSecret);
  } catch (err) {
    console.error("[stripe-webhook] signature_verification_failed", {
      error: err instanceof Error ? err.message : err,
    });
    return Response.json({ error: "Invalid signature" }, { status: 400 });
  }

  try {
    switch (event.type) {
      case "checkout.session.completed":
        await handleCheckoutCompleted(event.data.object as Stripe.Checkout.Session);
        break;

      case "invoice.paid":
        await handleInvoicePaid(event.data.object as Stripe.Invoice);
        break;

      case "invoice.payment_failed":
        await handleInvoicePaymentFailed(event.data.object as Stripe.Invoice);
        break;

      case "customer.subscription.updated":
        await handleSubscriptionUpdated(event.data.object as Stripe.Subscription);
        break;

      case "customer.subscription.deleted":
        await handleSubscriptionDeleted(event.data.object as Stripe.Subscription);
        break;

      default:
        break;
    }
  } catch (error) {
    console.error("[stripe-webhook] handler_error", {
      eventType: event.type,
      errorMessage: getErrorMessage(error),
    });
    return Response.json({ error: "Internal error" }, { status: 500 });
  }

  return Response.json({ received: true });
}

async function handleCheckoutCompleted(session: Stripe.Checkout.Session): Promise<void> {
  const stripeCustomerId = typeof session.customer === "string" ? session.customer : session.customer?.id;
  const stripeSubscriptionId = typeof session.subscription === "string" ? session.subscription : session.subscription?.id;
  const metadata = session.metadata ?? {};
  const workshopId = metadata.workshop_id;
  const rawPlan = metadata.plan_type;

  if (!stripeCustomerId || !stripeSubscriptionId || !workshopId || !rawPlan) {
    console.warn("[stripe-webhook] checkout.session.completed: missing required fields", {
      stripeCustomerId,
      stripeSubscriptionId,
      workshopId,
      rawPlan,
    });
    return;
  }

  const planType: PlanType = rawPlan === "pro" ? "pro" : "basic";

  await activateWorkshopSubscription({
    workshopId,
    planType,
    stripeCustomerId,
    stripeSubscriptionId,
  });

  console.log("[stripe-webhook] checkout.session.completed: activated", {
    workshopId,
    planType,
    stripeCustomerId,
    stripeSubscriptionId,
  });
}

async function handleInvoicePaid(invoice: Stripe.Invoice): Promise<void> {
  const stripeCustomerId = typeof invoice.customer === "string" ? invoice.customer : invoice.customer?.id;
  if (!stripeCustomerId) {
    console.warn("[stripe-webhook] invoice.paid: missing customer id");
    return;
  }

  const workshopId = await resolveWorkshopByStripeCustomer(stripeCustomerId);
  if (!workshopId) {
    console.warn("[stripe-webhook] invoice.paid: no workshop for stripe_customer_id", { stripeCustomerId });
    return;
  }

  await confirmWorkshopPayment(workshopId, stripeCustomerId);
  console.log("[stripe-webhook] invoice.paid: payment confirmed", { workshopId, stripeCustomerId });
}

async function handleInvoicePaymentFailed(invoice: Stripe.Invoice): Promise<void> {
  const stripeCustomerId = typeof invoice.customer === "string" ? invoice.customer : invoice.customer?.id;
  if (!stripeCustomerId) {
    console.warn("[stripe-webhook] invoice.payment_failed: missing customer id");
    return;
  }

  const workshopId = await resolveWorkshopByStripeCustomer(stripeCustomerId);
  if (!workshopId) {
    console.warn("[stripe-webhook] invoice.payment_failed: no workshop for stripe_customer_id", { stripeCustomerId });
    return;
  }

  await markWorkshopPastDue(workshopId);
  console.log("[stripe-webhook] invoice.payment_failed: marked past_due", { workshopId, stripeCustomerId });
}

async function handleSubscriptionUpdated(subscription: Stripe.Subscription): Promise<void> {
  // Block only on terminal Stripe states: canceled or unpaid.
  // "past_due" is handled by invoice.payment_failed above.
  if (subscription.status !== "canceled" && subscription.status !== "unpaid") {
    return;
  }

  const stripeCustomerId = typeof subscription.customer === "string" ? subscription.customer : subscription.customer?.id;
  if (!stripeCustomerId) {
    console.warn("[stripe-webhook] customer.subscription.updated: missing customer id");
    return;
  }

  const workshopId = await resolveWorkshopByStripeCustomer(stripeCustomerId);
  if (!workshopId) {
    console.warn("[stripe-webhook] customer.subscription.updated: no workshop for stripe_customer_id", { stripeCustomerId });
    return;
  }

  await blockWorkshopSubscription(workshopId);
  console.log("[stripe-webhook] customer.subscription.updated: workshop blocked", {
    workshopId,
    stripeCustomerId,
    subscriptionStatus: subscription.status,
  });
}

async function handleSubscriptionDeleted(subscription: Stripe.Subscription): Promise<void> {
  const stripeCustomerId = typeof subscription.customer === "string" ? subscription.customer : subscription.customer?.id;
  if (!stripeCustomerId) {
    console.warn("[stripe-webhook] customer.subscription.deleted: missing customer id");
    return;
  }

  const workshopId = await resolveWorkshopByStripeCustomer(stripeCustomerId);
  if (!workshopId) {
    console.warn("[stripe-webhook] customer.subscription.deleted: no workshop for stripe_customer_id", { stripeCustomerId });
    return;
  }

  await blockWorkshopSubscription(workshopId);
  console.log("[stripe-webhook] customer.subscription.deleted: workshop blocked", { workshopId, stripeCustomerId });
}

async function resolveWorkshopByStripeCustomer(stripeCustomerId: string): Promise<string | null> {
  const { supabaseServer } = await import("../../../../lib/supabase-server");
  const { data } = await supabaseServer
    .from("workshops")
    .select("id")
    .eq("stripe_customer_id", stripeCustomerId)
    .maybeSingle();
  return (data as { id: string } | null)?.id ?? null;
}
