alter table reminders
  drop constraint if exists reminders_reminder_type_check;

alter table reminders
  add constraint reminders_reminder_type_check
  check (reminder_type in (
    'ready_not_collected',
    'revision_due_35d',
    'revision_due_30d',
    'revision_due_7d',
    'revision_due_1d'
  ));

alter table workshop_settings
  alter column revision_reminder_offsets_days set default array[35];

update workshop_settings
set revision_reminder_offsets_days = array[35]
where revision_reminder_offsets_days = array[30,7,1];

drop index if exists uq_revision_reminder_dedupe;

create unique index uq_revision_reminder_dedupe
  on reminders(vehicle_id, reminder_type, ((metadata->>'revision_due_date')))
  where reminder_type in ('revision_due_35d','revision_due_30d','revision_due_7d','revision_due_1d')
    and status in ('scheduled','sending','sent','partial');
