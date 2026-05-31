-- Webhook idempotency: record every processed Stripe event ID.
-- Before processing any event, INSERT here. On conflict (23505) = already processed, skip.
CREATE TABLE stripe_processed_events (
  stripe_event_id text        PRIMARY KEY,
  event_type      text        NOT NULL,
  processed_at    timestamptz NOT NULL DEFAULT now()
);
