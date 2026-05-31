import "server-only";

import { AppError } from "./errors";
import { supabaseServer } from "./supabase-server";
import { writePlatformAuditEvent } from "./admin/platform-audit";

export type SubscriptionStatus = "trial_active" | "trial_expired" | "active" | "blocked" | "past_due";
export type PlanType = "basic" | "pro";

// ── STATE MACHINE ─────────────────────────────────────────────────────────────

/**
 * Every state transition must name its trigger.
 * No code may call .update({ subscription_status }) directly.
 */
export type TransitionTrigger =
  | "stripe:checkout_completed"
  | "stripe:invoice_paid"
  | "stripe:invoice_payment_failed"
  | "stripe:subscription_deleted"
  | "stripe:subscription_canceled"
  | "system:trial_expired";

/**
 * Transition matrix: "trigger->target" => valid source states.
 *
 * Hierarchy (strongest wins): blocked > past_due > active > trial_*
 *
 * blocked is terminal for Stripe events.
 * blocked → active is only possible via forceTransitionSubscriptionState (admin).
 */
const TRANSITION_MATRIX: Readonly<Record<string, SubscriptionStatus[]>> = {
  "stripe:checkout_completed->active":       ["trial_active", "trial_expired"],
  "stripe:invoice_paid->active":             ["active", "past_due"],
  "stripe:invoice_payment_failed->past_due": ["active", "past_due"],
  "stripe:subscription_deleted->blocked":    ["active", "past_due"],
  "stripe:subscription_canceled->blocked":   ["active", "past_due"],
  "system:trial_expired->blocked":           ["trial_active", "trial_expired"],
};

/**
 * Single entry point for all Stripe-driven state transitions.
 *
 * Returns "applied" if the row was updated, "noop" if the current state
 * was not in the allowed sources (valid e.g. for checkout on a blocked workshop).
 *
 * Throws only on: unknown transition key, or DB error.
 * Never throws for expected no-ops — callers decide whether to log.
 */
export async function transitionSubscriptionState(
  workshopId: string,
  trigger: TransitionTrigger,
  targetState: SubscriptionStatus,
  options: {
    /**
     * When set, the UPDATE also requires:
     *   stripe_subscription_id = stripeSubscriptionId
     *   OR stripe_subscription_id IS NULL (data-inconsistency recovery)
     *
     * Prevents stale events for a canceled subscription from affecting a
     * workshop already on a new subscription.
     */
    stripeSubscriptionId?: string;
    /** Extra columns to update atomically with subscription_status. */
    additionalUpdate?: Record<string, unknown>;
  } = {},
): Promise<"applied" | "noop"> {
  const matrixKey = `${trigger}->${targetState}`;
  const allowedFrom = TRANSITION_MATRIX[matrixKey];

  if (!allowedFrom) {
    throw new Error(`[subscription] transition not in matrix: ${matrixKey}`);
  }

  const patch: Record<string, unknown> = {
    subscription_status: targetState,
    ...options.additionalUpdate,
  };

  let query = supabaseServer
    .from("workshops")
    .update(patch)
    .eq("id", workshopId)
    .in("subscription_status", allowedFrom)
    .select("id");

  if (options.stripeSubscriptionId) {
    query = (query as any).or(
      `stripe_subscription_id.eq.${options.stripeSubscriptionId},stripe_subscription_id.is.null`,
    );
  }

  const { data, error } = await query;

  if (error) {
    throw new Error(`[subscription] ${matrixKey} DB error for ${workshopId}: ${error.message}`);
  }

  return data && data.length > 0 ? "applied" : "noop";
}

/**
 * Admin-only: bypasses the transition matrix.
 * Use for trial resets, manual unblocks, support escalations.
 *
 * Order of operations:
 *   1. Read current state (for audit from_state)
 *   2. Write audit event to platform_audit_events (best effort — never blocks the update)
 *   3. Apply DB update
 *
 * If audit write fails: logged, update proceeds (best-effort audit).
 * If DB update fails: throws — audit record persists showing the INTENT.
 */
export async function forceTransitionSubscriptionState(
  workshopId: string,
  targetState: SubscriptionStatus,
  options: {
    reason: string;
    actorEmail: string;  // required — identifies the admin performing the override
    additionalUpdate?: Record<string, unknown>;
  },
): Promise<void> {
  if (!options.actorEmail?.trim()) {
    throw new Error("[subscription] forceTransition: actorEmail is required");
  }

  // Read current state to record from_state in audit.
  const { data: currentRow } = await supabaseServer
    .from("workshops")
    .select("subscription_status,stripe_customer_id")
    .eq("id", workshopId)
    .maybeSingle();

  const fromState: string = (currentRow as any)?.subscription_status ?? "unknown";
  const stripeCustomerId: string | null = (currentRow as any)?.stripe_customer_id ?? null;

  // 1. Audit FIRST — record intent before touching state.
  //    writePlatformAuditEvent is best-effort (swallows errors internally).
  //    If this fails, update still proceeds; the console.warn inside is the fallback.
  await writePlatformAuditEvent({
    eventType: "workshop.subscription_force_transition",
    actorEmail: options.actorEmail,
    targetWorkshopId: workshopId,
    details: {
      from_state: fromState,
      to_state: targetState,
      reason: options.reason,
      ...(stripeCustomerId ? { stripe_customer_id: stripeCustomerId } : {}),
    },
  });

  // 2. Apply state update.
  const patch: Record<string, unknown> = {
    subscription_status: targetState,
    ...options.additionalUpdate,
  };

  const { data, error } = await supabaseServer
    .from("workshops")
    .update(patch)
    .eq("id", workshopId)
    .select("id");

  if (error) {
    throw new Error(`[subscription] forceTransition to ${targetState} failed: ${error.message}`);
  }

  if (!data || data.length === 0) {
    throw new Error(`[subscription] forceTransition: workshop ${workshopId} not found`);
  }

  console.log("[subscription] force_transition_applied", {
    workshopId,
    actorEmail: options.actorEmail,
    from_state: fromState,
    to_state: targetState,
  });
}

// ── SUBSCRIPTION ROW ──────────────────────────────────────────────────────────

export interface WorkshopSubscription {
  workshopId: string;
  subscriptionStatus: SubscriptionStatus;
  planType: PlanType;
  trialStartedAt: string;
  trialEndsAt: string;
  adminFreeAccess: boolean;
  stripeCustomerId: string | null;
  stripeSubscriptionId: string | null;
}

interface WorkshopSubscriptionRow {
  subscription_status: SubscriptionStatus;
  plan_type: PlanType;
  trial_started_at: string;
  trial_ends_at: string;
  admin_free_access: boolean;
  stripe_customer_id: string | null;
  stripe_subscription_id: string | null;
}

async function readWorkshopSubscription(workshopId: string): Promise<WorkshopSubscriptionRow> {
  const { data, error } = await supabaseServer
    .from("workshops")
    .select("subscription_status,plan_type,trial_started_at,trial_ends_at,admin_free_access,stripe_customer_id,stripe_subscription_id")
    .eq("id", workshopId)
    .single();

  if (error || !data) {
    throw new Error(`Failed to read workshop subscription: ${error?.message ?? "not found"}`);
  }

  return data as WorkshopSubscriptionRow;
}

export async function getWorkshopSubscription(workshopId: string): Promise<WorkshopSubscription> {
  const row = await readWorkshopSubscription(workshopId);
  return {
    workshopId,
    subscriptionStatus: row.subscription_status,
    planType: row.plan_type,
    trialStartedAt: row.trial_started_at,
    trialEndsAt: row.trial_ends_at,
    adminFreeAccess: row.admin_free_access,
    stripeCustomerId: row.stripe_customer_id,
    stripeSubscriptionId: row.stripe_subscription_id,
  };
}

// ── ACCESS CONTROL ────────────────────────────────────────────────────────────

export async function checkAndUpdateSubscriptionStatus(workshopId: string): Promise<SubscriptionStatus> {
  const row = await readWorkshopSubscription(workshopId);
  const current = row.subscription_status;

  if (row.admin_free_access) {
    return "active";
  }

  if (current === "active" || current === "blocked" || current === "past_due") {
    return current;
  }

  const now = Date.now();
  const trialEndsAt = new Date(row.trial_ends_at).getTime();

  if (now <= trialEndsAt) {
    return "trial_active";
  }

  // Trial ended — transition via state machine.
  // Conditional UPDATE prevents overwriting "active" set by a concurrent webhook.
  await transitionSubscriptionState(workshopId, "system:trial_expired", "blocked");
  return "blocked";
}

export async function requireWorkshopAccess(workshopId: string): Promise<void> {
  const status = await checkAndUpdateSubscriptionStatus(workshopId);

  if (status === "blocked") {
    throw new AppError("Workshop subscription required", {
      statusCode: 402,
      parseStatus: "ignored",
    });
  }
}

// ── PLAN ──────────────────────────────────────────────────────────────────────

export async function getWorkshopPlan(workshopId: string): Promise<{ planType: PlanType; adminFreeAccess: boolean }> {
  const row = await readWorkshopSubscription(workshopId);
  return { planType: row.plan_type, adminFreeAccess: row.admin_free_access };
}

// ── WEBHOOK FACADES ───────────────────────────────────────────────────────────
// Kept for backward compatibility. The webhook handler calls transitionSubscriptionState
// directly; these exist for any other callers and make the trigger explicit.

export async function activateWorkshopSubscription(input: {
  workshopId: string;
  planType: PlanType;
  stripeCustomerId: string;
  stripeSubscriptionId: string;
}): Promise<void> {
  const result = await transitionSubscriptionState(
    input.workshopId,
    "stripe:checkout_completed",
    "active",
    {
      stripeSubscriptionId: input.stripeSubscriptionId,
      additionalUpdate: {
        plan_type: input.planType,
        stripe_customer_id: input.stripeCustomerId,
        stripe_subscription_id: input.stripeSubscriptionId,
      },
    },
  );

  if (result === "noop") {
    // Expected when current state not in ["trial_active", "trial_expired"].
    // blocked workshops cannot be activated via checkout (matrix rule).
    console.log("[subscription] activateWorkshopSubscription: noop", { workshopId: input.workshopId });
  }
}

export async function blockWorkshopSubscription(workshopId: string, subscriptionId?: string, trigger: "stripe:subscription_deleted" | "stripe:subscription_canceled" = "stripe:subscription_deleted"): Promise<void> {
  await transitionSubscriptionState(
    workshopId,
    trigger,
    "blocked",
    {
      stripeSubscriptionId: subscriptionId,
      additionalUpdate: { stripe_subscription_id: null },
    },
  );
}

export async function confirmWorkshopPayment(workshopId: string, stripeCustomerId?: string): Promise<void> {
  const additional: Record<string, unknown> = {};
  if (stripeCustomerId) additional.stripe_customer_id = stripeCustomerId;

  await transitionSubscriptionState(
    workshopId,
    "stripe:invoice_paid",
    "active",
    { additionalUpdate: additional },
  );
}

export async function markWorkshopPastDue(workshopId: string): Promise<void> {
  await transitionSubscriptionState(workshopId, "stripe:invoice_payment_failed", "past_due");
}

// ── ADMIN OPERATIONS ──────────────────────────────────────────────────────────

export async function resetWorkshopTrial(workshopId: string, actorEmail: string): Promise<void> {
  // Source guard: only allow reset from trial/blocked states — never from active/past_due.
  // Read-then-check has a small TOCTOU window but this is admin-only, not an automated path.
  const { data: currentRow } = await supabaseServer
    .from("workshops")
    .select("subscription_status")
    .eq("id", workshopId)
    .maybeSingle();

  const currentStatus = (currentRow as any)?.subscription_status as string | undefined;
  const allowedFrom = ["trial_active", "trial_expired", "blocked"];

  if (!currentStatus || !allowedFrom.includes(currentStatus)) {
    throw new Error(`Cannot reset trial for workshop ${workshopId}: active or past_due subscription exists`);
  }

  const now = new Date();
  await forceTransitionSubscriptionState(workshopId, "trial_active", {
    reason: "admin trial reset",
    actorEmail,
    additionalUpdate: {
      trial_started_at: now.toISOString(),
      trial_ends_at: new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000).toISOString(),
    },
  });
}
