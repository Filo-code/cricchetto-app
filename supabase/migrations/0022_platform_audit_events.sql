-- Migration 0022: platform-level audit trail for admin actions.
-- Distinct from work_order_audit_events (which is workshop/work-order scoped).
-- Records platform-owner actions: workshop create/suspend/close/reactivate,
-- workshop update, password reset link generation.
--
-- actor_email = platform owner email (from env session allowlist), never a DB user.
-- target_workshop_id is nullable so non-workshop events can be recorded too.

create table if not exists platform_audit_events (
  id uuid primary key default gen_random_uuid(),
  event_type text not null,
  actor_email text not null,
  target_workshop_id uuid null references workshops(id) on delete set null,
  target_user_id uuid null,
  details jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists idx_platform_audit_events_created_at
  on platform_audit_events(created_at desc);

create index if not exists idx_platform_audit_events_workshop
  on platform_audit_events(target_workshop_id);

-- Defense-in-depth RLS: deny anon + authenticated. Backend uses service_role (bypasses RLS).
alter table platform_audit_events enable row level security;
drop policy if exists "deny_anon_platform_audit_events" on platform_audit_events;
drop policy if exists "deny_authenticated_platform_audit_events" on platform_audit_events;
create policy "deny_anon_platform_audit_events" on platform_audit_events for all to anon using (false) with check (false);
create policy "deny_authenticated_platform_audit_events" on platform_audit_events for all to authenticated using (false) with check (false);
