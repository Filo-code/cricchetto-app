-- Soft-delete support for attachments (no physical Storage deletion in this phase).
alter table public.attachments
  add column if not exists deleted_at timestamptz;

create index if not exists idx_attachments_deleted_at
  on public.attachments (workshop_id, work_order_id)
  where deleted_at is null;
