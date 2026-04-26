alter table public.vehicle_revision_events
  add column if not exists event_type text
  check (event_type is null or event_type in ('revision_due_date_updated', 'revision_appointment_updated'));
