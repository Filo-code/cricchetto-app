alter table attachments
  add column if not exists intake_session_id uuid,
  add column if not exists metadata jsonb not null default '{}'::jsonb;

alter table attachments
  drop constraint if exists attachments_attachment_type_check;

alter table attachments
  add constraint attachments_attachment_type_check
  check (attachment_type in ('photo', 'document', 'audio', 'other'));

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'attachments_workshop_intake_session_fkey'
  ) then
    alter table attachments
      add constraint attachments_workshop_intake_session_fkey
      foreign key (workshop_id, intake_session_id)
      references intake_sessions(workshop_id, id);
  end if;
end $$;

create index if not exists idx_attachments_intake_session
  on attachments(workshop_id, intake_session_id, created_at desc);
