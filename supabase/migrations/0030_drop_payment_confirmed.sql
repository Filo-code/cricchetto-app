-- Remove payment_confirmed: redundant with subscription_status.
-- subscription_status IN ('active', 'past_due') already implies confirmed payment.
-- Webhook sets subscription_status directly; no need for a separate boolean.
ALTER TABLE workshops DROP COLUMN payment_confirmed;
