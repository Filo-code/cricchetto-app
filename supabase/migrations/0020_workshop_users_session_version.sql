-- Add session_version to workshop_users.
-- Incremented automatically by trigger on password_hash change.
-- Cookie sessions include this value; verifyDashboardSession rejects cookies
-- where the stored version doesn't match the DB value, invalidating all
-- prior sessions on password change/reset without a separate session table.

alter table workshop_users
  add column if not exists session_version integer not null default 0;

-- Trigger: auto-increment session_version whenever password_hash is changed.
create or replace function increment_session_version_on_password_change()
returns trigger
language plpgsql
as $$
begin
  if new.password_hash is distinct from old.password_hash then
    new.session_version = coalesce(old.session_version, 0) + 1;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_workshop_users_session_version on workshop_users;
create trigger trg_workshop_users_session_version
  before update on workshop_users
  for each row
  execute function increment_session_version_on_password_change();
