alter table public.workshops
add column if not exists display_name text;

update public.workshops
set display_name = coalesce(display_name, name)
where display_name is null;

alter table public.vehicles
add column if not exists revision_reminder_enabled boolean not null default true;

alter table public.vehicles
add column if not exists revision_appointment_date date;

alter table public.vehicles
add column if not exists revision_appointment_time time;

create table if not exists public.vehicle_revision_events (
  id uuid primary key default gen_random_uuid(),
  vehicle_id uuid not null references public.vehicles(id) on delete cascade,
  previous_revision_due_date date,
  new_revision_due_date date,
  source text not null default 'manual',
  created_by text,
  created_at timestamp with time zone not null default now()
);

create index if not exists vehicle_revision_events_vehicle_id_created_at_idx
on public.vehicle_revision_events(vehicle_id, created_at desc);