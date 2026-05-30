import { activateWorkshopSubscription, blockWorkshopSubscription, confirmWorkshopPayment } from "../../../../lib/subscription";
import { getErrorMessage } from "../../../../lib/errors";
import type { PlanType } from "../../../../lib/subscription";

// Stripe webhook handler.
//
// Signature verification is stubbed — enable by installing the Stripe SDK:
//   npm install stripe
// Then set env vars:
//   Cricchetto_STRIPE_SECRET_KEY
//   Cricchetto_STRIPE_WEBHOOK_SECRET
//
// Checkout metadata must include:
//   { workshop_id: string, plan_type: "basic" | "pro" }
//
// Events handled:
//   checkout.session.completed   → activate subscription, set plan + IDs
//   invoice.paid                 → renew (keep active on recurring billing)
//   customer.subscription.deleted → block workshop on cancellation

export async function POST(request: Request): Promise<Response> {
  const rawBody = await request.text();
  const stripeSignature = request.headers.get("stripe-signature");

  if (!stripeSignature) {
    return Response.json({ error: "Missing stripe-signature" }, { status: 400 });
  }

  // TODO: replace manual parse with verified Stripe SDK call when installed:
  // import Stripe from "stripe";
  // const stripe = new Stripe(process.env.Cricchetto_STRIPE_SECRET_KEY!);
  // const event = stripe.webhooks.constructEvent(
  //   rawBody,
  //   stripeSignature,
  //   process.env.Cricchetto_STRIPE_WEBHOOK_SECRET!,
  // );

  let event: StripeEvent;
  try {
    event = JSON.parse(rawBody) as StripeEvent;
  } catch {
    return Response.json({ error: "Invalid JSON" }, { status: 400 });
  }

  try {
    switch (event.type) {
      case "checkout.session.completed":
        await handleCheckoutCompleted(event.data.object);
        break;

      case "invoice.paid":
        await handleInvoicePaid(event.data.object);
        break;

      case "customer.subscription.deleted":
        await handleSubscriptionDeleted(event.data.object);
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

async function handleCheckoutCompleted(obj: Record<string, unknown>): Promise<void> {
  const stripeCustomerId = obj.customer as string | undefined;
  const stripeSubscriptionId = obj.subscription as string | undefined;
  const metadata = (obj.metadata ?? {}) as Record<string, string>;
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

  const planType = rawPlan === "pro" ? "pro" : "basic" as PlanType;

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

async function handleInvoicePaid(obj: Record<string, unknown>): Promise<void> {
  const stripeCustomerId = obj.customer as string | undefined;
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

async function handleSubscriptionDeleted(obj: Record<string, unknown>): Promise<void> {
  const stripeCustomerId = obj.customer as string | undefined;
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

interface StripeEvent {
  type: string;
  data: { object: Record<string, unknown> };
}
