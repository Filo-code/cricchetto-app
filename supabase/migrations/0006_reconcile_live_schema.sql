-- 0006_reconcile_live_schema.sql
--
-- Purpose: bring live Cricchetto schema in line with the definitions declared in
-- migrations 0002, 0004, and 0005, which were partially applied out-of-band on
-- the production project (ref amajboqjhqifkkqmsttl).
--
-- Scope: ONLY structural reconciliation. No data change. No new objects.
-- Idempotent: safe to run on an already-aligned environment and on local/dev.
--
-- Fixes:
--   1. attachments_attachment_type_check: include 'audio'
--   2. reminders_check: include 'revision_due_35d' in the vehicle-scoped branch
--   3. attachments.intake_session_id FK: tenant-composite
--      (workshop_id, intake_session_id) -> intake_sessions(workshop_id, id)
--   4. uq_message_logs_provider_message_id: full 5-column key
--      (provider, direction, recipient_identifier, sender_identifier, provider_message_id)
--
-- Ordering of statements matters only for the attachments FK swap (drop then add).
-- Everything else is independent.

begin;

-- 1) attachments.attachment_type CHECK: add 'audio' ----------------------------
alter table public.attachments
  drop constraint if exists attachments_attachment_type_check;

alter table public.attachments
  add constraint attachments_attachment_type_check
  check (attachment_type in ('photo', 'document', 'audio', 'other'));


-- 2) reminders_check: include 'revision_due_35d' ------------------------------
-- Live currently has an anonymous-named CHECK `reminders_check` that restricts
-- vehicle-scoped rows to ('revision_due_30d','revision_due_7d','revision_due_1d').
-- Drop by that name and recreate with explicit canonical name.
alter table public.reminders
  drop constraint if exists reminders_check;

-- Also drop an explicitly-named variant, in case a future migration renames it.
alter table public.reminders
  drop constraint if exists reminders_vehicle_or_work_order_scope_check;

alter table public.reminders
  add constraint reminders_vehicle_or_work_order_scope_check
  check (
    (reminder_type = 'ready_not_collected' and work_order_id is not null and vehicle_id is null)
    or
    (reminder_type in ('revision_due_35d','revision_due_30d','revision_due_7d','revision_due_1d')
      and vehicle_id is not null and work_order_id is null)
  );


-- 3) attachments.intake_session_id FK: tenant-composite -----------------------
-- Drop any known variant of the existing FK on intake_session_id, then add the
-- canonical composite FK. The DO block guards against re-adding when the
-- canonical form already exists under the expected name.

-- Possible existing names (live + local variants):
alter table public.attachments
  drop constraint if exists attachments_intake_session_id_fkey;

alter table public.attachments
  drop constraint if exists attachments_workshop_intake_session_fkey;

-- Also defensively drop any other FK on (intake_session_id) alone by scanning
-- pg_constraint; keeps this migration robust against renames done out-of-band.
do $$
declare
  r record;
begin
  for r in
    select c.conname
    from pg_constraint c
    join pg_class t on t.oid = c.conrelid
    join pg_namespace n on n.oid = t.relnamespace
    where n.nspname = 'public'
      and t.relname = 'attachments'
      and c.contype = 'f'
      and c.conkey = array(
        select a.attnum
        from pg_attribute a
        where a.attrelid = t.oid
          and a.attname = 'intake_session_id'
      )
  loop
    execute format('alter table public.attachments drop constraint %I', r.conname);
  end loop;
end
$$;

-- Add the canonical composite FK only if it isn't already present under the
-- expected name.
do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'attachments_workshop_intake_session_fkey'
  ) then
    alter table public.attachments
      add constraint attachments_workshop_intake_session_fkey
      foreign key (workshop_id, intake_session_id)
      references public.intake_sessions (workshop_id, id);
  end if;
end
$$;


-- 3b) idx_attachments_intake_session ------------------------------------------
-- Missing in live; declared by migration 0004 but never applied.
create index if not exists idx_attachments_intake_session
  on public.attachments (workshop_id, intake_session_id, created_at desc);


-- 4) uq_message_logs_provider_message_id: full 5-column key -------------------
-- Live currently has (provider, provider_message_id, direction). Replace with
-- (provider, direction, recipient_identifier, sender_identifier, provider_message_id)
-- matching migration 0002 + original 0001 intent.

drop index if exists public.uq_message_logs_provider_message_id;

create unique index if not exists uq_message_logs_provider_message_id
  on public.message_logs (
    provider,
    direction,
    recipient_identifier,
    sender_identifier,
    provider_message_id
  )
  where provider_message_id is not null;


commit;
