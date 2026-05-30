import "server-only";

import { AppError } from "./errors";
import { getWorkshopPlan, type PlanType } from "./subscription";

export type PlanFeature =
  | "reminders"
  | "revision_automation"
  | "scheduled_notifications";

const PRO_FEATURES: ReadonlySet<PlanFeature> = new Set([
  "reminders",
  "revision_automation",
  "scheduled_notifications",
]);

export const PLAN_PRICES: Record<PlanType, { amount: number; currency: string; label: string }> = {
  basic: { amount: 7900, currency: "eur", label: "Basic €79/mese" },
  pro:   { amount: 10900, currency: "eur", label: "Pro €109/mese" },
};

// Stripe Price IDs — set in environment per deployment.
// Create these in the Stripe dashboard and add to env vars.
// export const STRIPE_PRICE_IDS: Record<PlanType, string> = {
//   basic: process.env.Cricchetto_STRIPE_PRICE_BASIC!,
//   pro:   process.env.Cricchetto_STRIPE_PRICE_PRO!,
// };

export function planIncludesFeature(planType: PlanType, feature: PlanFeature): boolean {
  if (!PRO_FEATURES.has(feature)) {
    return true; // Basic features are available on all plans.
  }
  return planType === "pro";
}

export async function requirePlanFeature(workshopId: string, feature: PlanFeature): Promise<void> {
  const { planType, adminFreeAccess } = await getWorkshopPlan(workshopId);

  if (adminFreeAccess) return;

  if (!planIncludesFeature(planType, feature)) {
    throw new AppError(`Feature '${feature}' requires Pro plan`, {
      statusCode: 403,
      parseStatus: "ignored",
    });
  }
}
