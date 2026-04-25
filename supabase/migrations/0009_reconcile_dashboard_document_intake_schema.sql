-- Reconcile dashboard/document/intake schema drift detected in production.
-- Safe/idempotent where possible. Do not drop data.

alter table public.workshops
add column if not exists display_name text;

update public.workshops
set display_name = coalesce(display_name, name)
where display_name is null;

alter table public.vehicles
add column if not exists revision_reminder_enabled boolean not null default true;

alter table public.vehicles
add column if not exists revision_appointment_date date;

alter table public.vehicles
add column if not exists revision_appointment_time time;

-- Documents status reconciliation:
-- legacy 'generated' existed in live DB, current code expects 'ready'.
alter table public.documents
drop constraint if exists documents_status_check;

alter table public.documents
add constraint documents_status_check
check (status in ('pending', 'generating', 'generated', 'ready', 'failed', 'void'));

update public.documents
set status = 'ready',
    updated_at = now()
where status = 'generated';

alter table public.documents
drop constraint if exists documents_status_check;

alter table public.documents
add constraint documents_status_check
check (status in ('pending', 'generating', 'ready', 'failed', 'void'));

create table if not exists public.vehicle_revision_events (
  id uuid primary key default gen_random_uuid(),
  vehicle_id uuid not null references public.vehicles(id) on delete cascade,
  previous_revision_due_date date,
  new_revision_due_date date,
  source text not null default 'manual',
  created_by text,
  created_at timestamp with time zone not null default now()
);

create index if not exists vehicle_revision_events_vehicle_id_created_at_idx
on public.vehicle_revision_events(vehicle_id, created_at desc);

create or replace function complete_intake_work_order(
  p_workshop_id uuid,
  p_intake_session_id uuid,
  p_actor_ref text,
  p_intake_data jsonb default null,
  p_plate_normalized text default null
)
returns table (
  work_order_id uuid,
  public_code text,
  plate_normalized text
)
language plpgsql
as $$
declare
  v_intake intake_sessions%rowtype;
  v_data jsonb;
  v_plate_normalized text;
  v_vehicle_model text;
  v_reported_issue text;
  v_customer_name text;
  v_customer_phone text;
  v_customer_phone_normalized text;
  v_kilometers int;
  v_customer_id uuid;
  v_vehicle_id uuid;
  v_year int;
  v_sequence_number int;
  v_public_code text;
  v_work_order_id uuid;
begin
  select i.*
  into v_intake
  from intake_sessions as i
  where i.workshop_id = p_workshop_id
    and i.id = p_intake_session_id
    and i.is_active = true
  for update;

  if not found then
    raise exception 'Active intake session not found';
  end if;

  v_data := coalesce(p_intake_data, v_intake.data, '{}'::jsonb);
  v_plate_normalized := coalesce(nullif(trim(p_plate_normalized), ''), v_intake.plate_normalized);
  v_vehicle_model := nullif(trim(coalesce(v_data->>'vehicle_model', '')), '');
  v_reported_issue := nullif(trim(coalesce(v_data->>'reported_issue', '')), '');
  v_customer_name := nullif(trim(coalesce(v_data->>'customer_name', '')), '');
  v_customer_phone := nullif(trim(coalesce(v_data->>'customer_phone', '')), '');

  if v_customer_phone is not null and v_customer_phone !~ '^[+0-9\s()./-]+$' then
    raise exception 'customer_phone is invalid';
  end if;

  v_customer_phone_normalized := regexp_replace(coalesce(v_customer_phone, ''), '[\s()./-]+', '', 'g');

  if v_plate_normalized is null then
    raise exception 'plate_normalized is required';
  end if;
  if v_vehicle_model is null then
    raise exception 'vehicle_model is required';
  end if;
  if v_reported_issue is null then
    raise exception 'reported_issue is required';
  end if;
  if v_customer_name is null then
    raise exception 'customer_name is required';
  end if;
  if v_customer_phone is null or v_customer_phone_normalized = '' then
    raise exception 'customer_phone is required';
  end if;

  if v_customer_phone_normalized like '00%' then
    v_customer_phone_normalized := '+' || substr(v_customer_phone_normalized, 3);
  end if;

  if v_customer_phone_normalized ~ '^\+\d{6,15}$' then
    null;
  elsif v_customer_phone_normalized ~ '^\d{6,12}$' then
    v_customer_phone_normalized := '+39' || v_customer_phone_normalized;
  else
    raise exception 'customer_phone is invalid';
  end if;

  v_customer_phone := v_customer_phone_normalized;

  if coalesce(v_data->>'kilometers', '') !~ '^\d+$' then
    raise exception 'kilometers must be a non-negative integer';
  end if;

  v_kilometers := (v_data->>'kilometers')::int;
  v_year := extract(year from now())::int;

  insert into customers as c (
    workshop_id,
    name,
    phone,
    phone_normalized
  )
  values (
    p_workshop_id,
    v_customer_name,
    v_customer_phone,
    v_customer_phone_normalized
  )
  on conflict (workshop_id, phone_normalized)
    where phone_normalized is not null
  do nothing
  returning c.id into v_customer_id;

  if v_customer_id is null then
    select c.id
    into v_customer_id
    from customers as c
    where c.workshop_id = p_workshop_id
      and c.phone_normalized = v_customer_phone_normalized;
  end if;

  insert into vehicles as v (
    workshop_id,
    customer_id,
    plate,
    plate_normalized,
    model
  )
  values (
    p_workshop_id,
    v_customer_id,
    v_plate_normalized,
    v_plate_normalized,
    v_vehicle_model
  )
  on conflict on constraint vehicles_workshop_id_plate_normalized_key do nothing
  returning v.id into v_vehicle_id;

  if v_vehicle_id is null then
    select v.id
    into v_vehicle_id
    from vehicles as v
    where v.workshop_id = p_workshop_id
      and v.plate_normalized = v_plate_normalized;
  end if;

  update vehicles as v
  set customer_id = v_customer_id,
      model = v_vehicle_model
  where v.workshop_id = p_workshop_id
    and v.id = v_vehicle_id;

  insert into work_order_number_sequences as seq (
    workshop_id,
    year,
    last_number
  )
  values (
    p_workshop_id,
    v_year,
    1
  )
  on conflict (workshop_id, year)
  do update
  set last_number = seq.last_number + 1,
      updated_at = now()
  returning seq.last_number into v_sequence_number;

  v_public_code := v_plate_normalized || '-' || v_year::text || '-' || lpad(v_sequence_number::text, 6, '0');

  insert into work_orders as wo (
    workshop_id,
    vehicle_id,
    customer_id,
    public_code,
    plate_snapshot,
    plate_normalized,
    vehicle_model_snapshot,
    customer_name_snapshot,
    customer_phone_snapshot,
    status,
    reported_issue,
    kilometers,
    intake_completed_at
  )
  values (
    p_workshop_id,
    v_vehicle_id,
    v_customer_id,
    v_public_code,
    v_plate_normalized,
    v_plate_normalized,
    v_vehicle_model,
    v_customer_name,
    v_customer_phone,
    'accepted',
    v_reported_issue,
    v_kilometers,
    now()
  )
  returning wo.id into v_work_order_id;

  insert into work_order_audit_events as audit (
    workshop_id,
    work_order_id,
    event_type,
    actor_type,
    actor_ref,
    before,
    after
  )
  values (
    p_workshop_id,
    v_work_order_id,
    'work_order_created',
    'mechanic',
    p_actor_ref,
    '{}'::jsonb,
    jsonb_build_object(
      'public_code', v_public_code,
      'plate', v_plate_normalized
    )
  );

  update intake_sessions as i
  set is_active = false
  where i.workshop_id = p_workshop_id
    and i.id = p_intake_session_id;

  insert into documents as d (
    workshop_id,
    work_order_id,
    document_type,
    version,
    status,
    created_by
  )
  values (
    p_workshop_id,
    v_work_order_id,
    'intake_acceptance',
    1,
    'pending',
    p_actor_ref
  );

  return query
  select
    v_work_order_id as work_order_id,
    v_public_code as public_code,
    v_plate_normalized as plate_normalized;
end;
$$;