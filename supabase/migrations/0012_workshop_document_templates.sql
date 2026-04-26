-- Document templates uploaded by workshop operators
-- One active template per workshop + document_type enforced by partial unique index
-- Soft-delete only: is_active=false, no physical storage deletion

create table if not exists public.workshop_document_templates (
  id             uuid        primary key default gen_random_uuid(),
  workshop_id    uuid        not null references public.workshops(id) on delete cascade,
  document_type  text        not null check (document_type in ('intake_acceptance', 'estimate', 'final_summary')),
  filename       text        not null,
  storage_bucket text        not null,
  storage_path   text        not null,
  mime_type      text        not null,
  size_bytes     bigint      not null check (size_bytes > 0),
  is_active      boolean     not null default true,
  created_by     text,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);

-- Enforces: only one active template per workshop + document_type
create unique index if not exists uq_active_workshop_document_template
  on public.workshop_document_templates(workshop_id, document_type)
  where is_active = true;

-- For efficient listing by workshop + type, newest first
create index if not exists idx_workshop_document_templates_lookup
  on public.workshop_document_templates(workshop_id, document_type, created_at desc);

create trigger set_updated_at_workshop_document_templates
  before update on public.workshop_document_templates
  for each row execute function set_updated_at_only();

alter table public.workshop_document_templates enable row level security;

-- Required manual step before deploying (run in Supabase SQL editor or dashboard):
-- insert into storage.buckets (id, name, public)
-- values ('document-templates', 'document-templates', false)
-- on conflict (id) do update set public = false;
