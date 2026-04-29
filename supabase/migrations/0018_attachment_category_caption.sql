-- Migration 0018: Additive nullable category and caption columns for attachments.
-- Existing attachments unaffected (columns default to null).

alter table attachments
  add column if not exists category text null
    constraint attachments_category_check
      check (category is null or category in ('ingresso','danno','ricambio','lavoro_finito','documento','altro')),
  add column if not exists caption text null;

create index if not exists idx_attachments_category
  on attachments(workshop_id, work_order_id, category)
  where deleted_at is null;
