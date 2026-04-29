-- Migration 0017: WhatsApp-authorized workshop staff members
-- Additive only. No existing tables modified.

create table workshop_staff_members (
  id              uuid        primary key default gen_random_uuid(),
  workshop_id     uuid        not null references workshops(id) on delete cascade,
  display_name    text        not null,
  phone           text        not null,
  phone_normalized text       not null,
  role            text        not null default 'staff'
    constraint workshop_staff_members_role_check check (role in ('owner', 'staff')),
  is_active       boolean     not null default true,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  unique (workshop_id, phone_normalized)
);

create index idx_workshop_staff_members_workshop
  on workshop_staff_members(workshop_id);

create index idx_workshop_staff_members_active_phone
  on workshop_staff_members(workshop_id, phone_normalized)
  where is_active = true;

create trigger trg_workshop_staff_members_updated_at
  before update on workshop_staff_members
  for each row execute function set_updated_at_only();

alter table workshop_staff_members enable row level security;
