alter table workshops
  add column if not exists display_name text,
  add column if not exists logo_url text;

alter table vehicles
  add column if not exists revision_reminder_enabled boolean not null default true,
  add column if not exists revision_appointment_date date,
  add column if not exists revision_appointment_time time without time zone;

alter table workshop_settings
  alter column revision_reminder_offsets_days set default array[30];

update workshop_settings
set revision_reminder_offsets_days = array[30]
where revision_reminder_offsets_days = array[35];

update documents
set status = 'ready'
where status = 'generated';

alter table documents
  drop constraint if exists documents_status_check;

alter table documents
  add constraint documents_status_check
  check (status in ('pending', 'generating', 'ready', 'failed', 'void'));

alter table documents
  drop constraint if exists documents_check;

alter table documents
  drop constraint if exists documents_ready_storage_check;

alter table documents
  add constraint documents_ready_storage_check
  check (
    status <> 'ready'
    or (
      storage_bucket is not null
      and storage_path is not null
      and filename is not null
      and generated_at is not null
    )
  );
