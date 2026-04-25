-- Workshop profile: fiscal data and legal/document text
-- 1:1 with workshops, upsert on workshop_id conflict

alter table public.workshops
add column if not exists logo_url text;

create table if not exists public.workshop_profiles (
  id                       uuid        primary key default gen_random_uuid(),
  workshop_id              uuid        not null unique references public.workshops(id) on delete cascade,

  -- Fiscal identity
  ragione_sociale          text,
  partita_iva              text,
  codice_fiscale           text,
  indirizzo                text,
  citta                    text,
  cap                      text,
  provincia                text,
  telefono                 text,
  email                    text,
  pec                      text,
  sdi                      text,

  -- Legal / document text
  condizioni_accettazione  text,
  condizioni_preventivo    text,
  footer_documenti         text,

  created_at               timestamptz not null default now(),
  updated_at               timestamptz not null default now()
);