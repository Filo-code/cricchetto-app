alter table public.reminders
  drop constraint if exists reminders_reminder_type_check;

alter table public.reminders
  add constraint reminders_reminder_type_check
  check (reminder_type in (
    'ready_pickup',
    'ready_not_collected',
    'revision_due_35d',
    'revision_due_30d',
    'revision_due_7d',
    'revision_due_1d'
  ));

alter table public.reminders
  drop constraint if exists reminders_vehicle_or_work_order_scope_check;

alter table public.reminders
  drop constraint if exists reminders_check;

alter table public.reminders
  add constraint reminders_vehicle_or_work_order_scope_check
  check (
    (reminder_type in ('ready_pickup', 'ready_not_collected') and work_order_id is not null and vehicle_id is null)
    or
    (reminder_type in ('revision_due_35d', 'revision_due_30d', 'revision_due_7d', 'revision_due_1d') and vehicle_id is not null and work_order_id is null)
  );

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
      and t.relname = 'reminders'
      and c.contype = 'c'
      and pg_get_constraintdef(c.oid) like '%revision_due_date%'
  loop
    execute format('alter table public.reminders drop constraint %I', r.conname);
  end loop;
end
$$;

alter table public.reminders
  add constraint reminders_revision_due_date_metadata_check
  check (
    reminder_type in ('ready_pickup', 'ready_not_collected')
    or metadata ? 'revision_due_date'
  );
