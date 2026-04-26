-- Add per-vehicle revision reminder channel preference.
-- Nullable: null means use workshop default (whatsapp preferred).
-- Idempotent.

alter table public.vehicles
  add column if not exists revision_reminder_channel text
  check (revision_reminder_channel in ('whatsapp', 'telegram_test'));
