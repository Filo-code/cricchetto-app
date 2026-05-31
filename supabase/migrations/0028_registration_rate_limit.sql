-- Migration 0028: persistent rate limiting for self-service registration.
--
-- Tracks registration attempts by hashed IP address (SHA-256, no salt).
-- Allows server-side rate limiting without in-memory state.
-- 5 attempts per IP per 24-hour window enforced in application code.
--
-- Cleanup: old rows are ignored by the application window query.
-- Periodic cleanup (e.g. DELETE WHERE attempted_at < now() - interval '7 days')
-- can be added as a cron job later without schema changes.

CREATE TABLE IF NOT EXISTS registration_attempts (
  id           uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  ip_hash      text        NOT NULL,
  attempted_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_registration_attempts_ip_hash_time
  ON registration_attempts(ip_hash, attempted_at DESC);
