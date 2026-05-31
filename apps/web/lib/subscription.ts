import "server-only";

import { AppError } from "./errors";
import { supabaseServer } from "./supabase-server";

export type SubscriptionStatus = "trial_active" | "trial_expired" | "active" | "blocked" | "past_due";
export type PlanType = "basic" | "pro";

export interface WorkshopSubscription {
  workshopId: string;
  subscriptionStatus: SubscriptionStatus;
  planType: PlanType;
  trialStartedAt: string;
  trialEndsAt: string;
  paymentConfirmed: boolean;
  adminFreeAccess: boolean;
  stripeCustomerId: string | null;
  stripeSubscriptionId: string | null;
}

interface WorkshopSubscriptionRow {
  subscription_status: SubscriptionStatus;
  plan_type: PlanType;
  trial_started_at: string;
  trial_ends_at: string;
  payment_confirmed: boolean;
  admin_free_access: boolean;
  stripe_customer_id: string | null;
  stripe_subscription_id: string | null;
}

async function readWorkshopSubscription(workshopId: string): Promise<WorkshopSubscriptionRow> {
  const { data, error } = await supabaseServer
    .from("workshops")
    .select("subscription_status,plan_type,trial_started_at,trial_ends_at,payment_confirmed,admin_free_access,stripe_customer_id,stripe_subscription_id")
    .eq("id", workshopId)
    .single();

  if (error || !data) {
    throw new Error(`Failed to read workshop subscription: ${error?.message ?? "not found"}`);
  }

  return data as WorkshopSubscriptionRow;
}

function rowToSubscription(workshopId: string, row: WorkshopSubscriptionRow): WorkshopSubscription {
  return {
    workshopId,
    subscriptionStatus: row.subscription_status,
    planType: row.plan_type,
    trialStartedAt: row.trial_started_at,
    trialEndsAt: row.trial_ends_at,
    paymentConfirmed: row.payment_confirmed,
    adminFreeAccess: row.admin_free_access,
    stripeCustomerId: row.stripe_customer_id,
    stripeSubscriptionId: row.stripe_subscription_id,
  };
}

export async function getWorkshopSubscription(workshopId: string): Promise<WorkshopSubscription> {
  const row = await readWorkshopSubscription(workshopId);
  return rowToSubscription(workshopId, row);
}

async function persistSubscriptionStatus(workshopId: string, status: SubscriptionStatus): Promise<void> {
  const { error } = await supabaseServer
    .from("workshops")
    .update({ subscription_status: status })
    .eq("id", workshopId);

  if (error) {
    throw new Error(`Failed to update subscription status: ${error.message}`);
  }
}

export async function checkAndUpdateSubscriptionStatus(workshopId: string): Promise<SubscriptionStatus> {
  const row = await readWorkshopSubscription(workshopId);
  const current = row.subscription_status;

  // Admin override bypasses all subscription logic.
  if (row.admin_free_access) {
    return "active";
  }

  // Terminal states — no recomputation needed.
  if (current === "active" || current === "blocked" || current === "past_due") {
    return current;
  }

  const now = Date.now();
  const trialEndsAt = new Date(row.trial_ends_at).getTime();

  if (now <= trialEndsAt) {
    return "trial_active";
  }

  // Trial has ended. Determine final state from payment confirmation.
  const next: SubscriptionStatus = row.payment_confirmed ? "active" : "blocked";

  await persistSubscriptionStatus(workshopId, next);

  return next;
}

export async function requireWorkshopAccess(workshopId: string): Promise<void> {
  const status = await checkAndUpdateSubscriptionStatus(workshopId);

  // past_due retains access — Stripe is retrying payment. Only blocked means no access.
  if (status === "blocked") {
    throw new AppError("Workshop subscription required", {
      statusCode: 402,
      parseStatus: "ignored",
    });
  }
}

export async function markWorkshopPastDue(workshopId: string): Promise<void> {
  const { error } = await supabaseServer
    .from("workshops")
    .update({ subscription_status: "past_due" })
    .eq("id", workshopId);

  if (error) {
    throw new Error(`Failed to mark workshop past_due: ${error.message}`);
  }
}

export async function resetWorkshopTrial(workshopId: string): Promise<void> {
  const { error } = await supabaseServer
    .from("workshops")
    .update({
      trial_started_at: new Date().toISOString(),
      trial_ends_at: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
      subscription_status: "trial_active",
      payment_confirmed: false,
    })
    .eq("id", workshopId);

  if (error) {
    throw new Error(`Failed to reset workshop trial: ${error.message}`);
  }
}

export async function getWorkshopPlan(workshopId: string): Promise<{ planType: PlanType; adminFreeAccess: boolean }> {
  const row = await readWorkshopSubscription(workshopId);
  return { planType: row.plan_type, adminFreeAccess: row.admin_free_access };
}

export async function activateWorkshopSubscription(input: {
  workshopId: string;
  planType: PlanType;
  stripeCustomerId: string;
  stripeSubscriptionId: string;
}): Promise<void> {
  const { error } = await supabaseServer
    .from("workshops")
    .update({
      payment_confirmed: true,
      subscription_status: "active",
      plan_type: input.planType,
      stripe_customer_id: input.stripeCustomerId,
      stripe_subscription_id: input.stripeSubscriptionId,
    })
    .eq("id", input.workshopId);

  if (error) {
    throw new Error(`Failed to activate workshop subscription: ${error.message}`);
  }
}

export async function blockWorkshopSubscription(workshopId: string): Promise<void> {
  const { error } = await supabaseServer
    .from("workshops")
    .update({
      payment_confirmed: false,
      subscription_status: "blocked",
      stripe_subscription_id: null,
    })
    .eq("id", workshopId);

  if (error) {
    throw new Error(`Failed to block workshop subscription: ${error.message}`);
  }
}

// Kept for backward compatibility — callers that only need payment confirmation
// without a plan change (e.g. invoice.paid for renewals).
export async function confirmWorkshopPayment(workshopId: string, stripeCustomerId?: string): Promise<void> {
  const patch: Record<string, unknown> = {
    payment_confirmed: true,
    subscription_status: "active",
  };
  if (stripeCustomerId) {
    patch.stripe_customer_id = stripeCustomerId;
  }

  const { error } = await supabaseServer
    .from("workshops")
    .update(patch)
    .eq("id", workshopId);

  if (error) {
    throw new Error(`Failed to confirm workshop payment: ${error.message}`);
  }
}
