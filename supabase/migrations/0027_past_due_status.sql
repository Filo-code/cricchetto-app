-- Migration 0027: add 'past_due' subscription_status.
--
-- past_due lifecycle:
--   active → past_due   when invoice.payment_failed fires (Stripe retrying)
--   past_due → active   when invoice.paid fires (payment recovered)
--   past_due → blocked  when customer.subscription.updated (status=canceled/unpaid)
--                       or customer.subscription.deleted fires
--
-- past_due workshops retain access (not blocked). UI may show a warning.

ALTER TABLE workshops
  DROP CONSTRAINT IF EXISTS workshops_subscription_status_check;

ALTER TABLE workshops
  ADD CONSTRAINT workshops_subscription_status_check
  CHECK (subscription_status IN ('trial_active', 'trial_expired', 'active', 'blocked', 'past_due'));
