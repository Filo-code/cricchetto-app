-- Migration 0023: per-workshop subscription + 7-day trial.
--
-- Subscription is per-workshop (the tenant), not per-user.
-- Enforcement happens server-side at session/request boundaries only.
--
-- subscription_status lifecycle:
--   trial_active  → trial window open, payment not required yet
--   trial_expired → trial ended, payment not confirmed → use to block
--   active        → payment confirmed, full access
--   blocked       → access denied (trial expired + no payment)
--
-- Existing workshops: backfilled as 'active' + payment_confirmed=true
-- so they are unaffected by this migration.

ALTER TABLE workshops
  ADD COLUMN IF NOT EXISTS trial_started_at timestamptz NOT NULL DEFAULT now(),
  ADD COLUMN IF NOT EXISTS trial_ends_at    timestamptz NOT NULL DEFAULT (now() + interval '7 days'),
  ADD COLUMN IF NOT EXISTS subscription_status text NOT NULL DEFAULT 'trial_active'
    CONSTRAINT workshops_subscription_status_check
      CHECK (subscription_status IN ('trial_active', 'trial_expired', 'active', 'blocked')),
  ADD COLUMN IF NOT EXISTS payment_confirmed boolean NOT NULL DEFAULT false;

-- Backfill: all existing workshops are already paying customers — mark active.
UPDATE workshops
SET
  subscription_status = 'active',
  payment_confirmed   = true
WHERE trial_started_at <= now();

CREATE INDEX IF NOT EXISTS idx_workshops_subscription_status
  ON workshops(subscription_status);

CREATE INDEX IF NOT EXISTS idx_workshops_trial_ends_at
  ON workshops(trial_ends_at)
  WHERE subscription_status = 'trial_active';
