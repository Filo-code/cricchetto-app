-- Migration 0025: plan type (basic/pro) and admin free-access override.
--
-- plan_type controls feature gating — see lib/plan.ts.
-- admin_free_access is a platform-owner override that bypasses all subscription checks.
-- stripe_subscription_id is populated on checkout.session.completed.
--
-- Existing workshops: backfilled as 'basic', no admin free access.
-- Plan can be changed by updating plan_type after a Pro Stripe subscription is confirmed.

ALTER TABLE workshops
  ADD COLUMN IF NOT EXISTS plan_type text NOT NULL DEFAULT 'basic'
    CONSTRAINT workshops_plan_type_check CHECK (plan_type IN ('basic', 'pro')),
  ADD COLUMN IF NOT EXISTS stripe_subscription_id text NULL,
  ADD COLUMN IF NOT EXISTS admin_free_access boolean NOT NULL DEFAULT false;

CREATE UNIQUE INDEX IF NOT EXISTS idx_workshops_stripe_subscription_id
  ON workshops(stripe_subscription_id)
  WHERE stripe_subscription_id IS NOT NULL;
