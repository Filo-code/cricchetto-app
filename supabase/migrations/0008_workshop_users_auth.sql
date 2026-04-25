-- workshop_users: one row per staff/owner account per workshop
create table workshop_users (
  id             uuid        primary key default gen_random_uuid(),
  workshop_id    uuid        not null references workshops(id) on delete cascade,
  email          text        not null,
  display_name   text,
  password_hash  text,                         -- null until first password set
  role           text        not null check (role in ('owner', 'staff')),
  is_active      boolean     not null default true,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);

-- email must be unique globally (one account per email across all workshops)
create unique index uq_workshop_users_email on workshop_users (lower(email));

-- fast lookup by workshop
create index idx_workshop_users_workshop on workshop_users (workshop_id);

-- password_reset_tokens: one-time tokens for initial setup and password reset
create table password_reset_tokens (
  id          uuid        primary key default gen_random_uuid(),
  user_id     uuid        not null references workshop_users(id) on delete cascade,
  token_hash  text        not null unique,     -- sha256(raw_token) hex
  expires_at  timestamptz not null,
  used_at     timestamptz,
  created_at  timestamptz not null default now()
);

create index idx_prt_user on password_reset_tokens (user_id);

-- updated_at trigger for workshop_users
create or replace function set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger trg_workshop_users_updated_at
  before update on workshop_users
  for each row execute function set_updated_at();
