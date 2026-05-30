-- Migration 0024: Stripe customer ID field for future payment integration.
--
-- stripe_customer_id is nullable until a workshop completes Stripe onboarding.
-- When set, the webhook handler will confirm payment and set subscription_status = 'active'.
-- No Stripe logic implemented yet — this column is the seam.

ALTER TABLE workshops
  ADD COLUMN IF NOT EXISTS stripe_customer_id text NULL;

CREATE UNIQUE INDEX IF NOT EXISTS idx_workshops_stripe_customer_id
  ON workshops(stripe_customer_id)
  WHERE stripe_customer_id IS NOT NULL;
