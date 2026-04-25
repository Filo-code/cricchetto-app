create extension if not exists pgcrypto;

create or replace function set_updated_at_only()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create or replace function set_updated_at_and_row_version()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  new.row_version = old.row_version + 1;
  return new;
end;
$$;

create or replace function valid_revision_offsets(offsets int[])
returns boolean
language sql
immutable
as $$
  select offsets is not null
    and cardinality(offsets) > 0
    and not exists (
      select 1
      from unnest(offsets) as v
      where v < 1 or v > 365
    )
    and (
      select count(*)
      from unnest(offsets)
    ) = (
      select count(distinct v)
      from unnest(offsets) as v
    );
$$;

create table workshops (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  timezone text not null default 'Europe/Rome',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table workshop_settings (
  workshop_id uuid primary key references workshops(id) on delete cascade,
  hourly_rate numeric(10,2) not null check (hourly_rate >= 0),
  currency text not null default 'EUR',
  ready_reminder_days int not null default 4 check (ready_reminder_days between 1 and 14),
  revision_reminders_enabled boolean not null default true,
  revision_reminder_offsets_days int[] not null default array[30,7,1] check (valid_revision_offsets(revision_reminder_offsets_days)),
  ready_reminder_recipient_policy text not null default 'mechanic_only' check (ready_reminder_recipient_policy in ('mechanic_only','customer_only','both')),
  revision_reminder_recipient_policy text not null default 'mechanic_only' check (revision_reminder_recipient_policy in ('mechanic_only','customer_only','both')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table workshop_channels (
  id uuid primary key default gen_random_uuid(),
  workshop_id uuid not null references workshops(id) on delete cascade,
  channel text not null check (channel in ('whatsapp','telegram_test')),
  provider text not null,
  recipient_identifier text not null,
  sender_identifier text,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (workshop_id, id)
);

create unique index uq_active_workshop_channel_route
  on workshop_channels(channel, provider, recipient_identifier)
  where is_active = true;

create table customers (
  id uuid primary key default gen_random_uuid(),
  workshop_id uuid not null references workshops(id) on delete cascade,
  name text not null,
  phone text,
  phone_normalized text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (workshop_id, id)
);

create unique index uq_customers_phone_normalized
  on customers(workshop_id, phone_normalized)
  where phone_normalized is not null;

create index idx_customers_phone_normalized
  on customers(workshop_id, phone_normalized);

create table vehicles (
  id uuid primary key default gen_random_uuid(),
  workshop_id uuid not null references workshops(id) on delete cascade,
  customer_id uuid,
  plate text not null,
  plate_normalized text not null,
  model text,
  revision_due_date date,
  revision_last_updated_at timestamptz,
  row_version bigint not null default 1,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (workshop_id, id),
  unique (workshop_id, plate_normalized),
  foreign key (workshop_id, customer_id) references customers(workshop_id, id)
);

create index idx_vehicles_plate_normalized
  on vehicles(workshop_id, plate_normalized);

create index idx_vehicles_revision_due_date
  on vehicles(workshop_id, revision_due_date);

create table vehicle_revision_events (
  id uuid primary key default gen_random_uuid(),
  workshop_id uuid not null references workshops(id) on delete cascade,
  vehicle_id uuid not null,
  previous_revision_due_date date,
  new_revision_due_date date,
  source text not null check (source in ('whatsapp','telegram_test','dashboard','system')),
  created_by text,
  created_at timestamptz not null default now(),
  foreign key (workshop_id, vehicle_id) references vehicles(workshop_id, id)
);

create index idx_vehicle_revision_events_vehicle
  on vehicle_revision_events(workshop_id, vehicle_id, created_at desc);

create table work_order_number_sequences (
  workshop_id uuid not null references workshops(id) on delete cascade,
  year int not null check (year between 2000 and 2100),
  last_number int not null default 0 check (last_number >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (workshop_id, year)
);

create table work_orders (
  id uuid primary key default gen_random_uuid(),
  workshop_id uuid not null references workshops(id) on delete cascade,
  vehicle_id uuid not null,
  customer_id uuid,
  public_code text not null,
  plate_snapshot text not null,
  plate_normalized text not null,
  vehicle_model_snapshot text,
  customer_name_snapshot text,
  customer_phone_snapshot text,
  status text not null check (status in ('accepted','in_progress','ready','collected','archived')),
  reported_issue text not null,
  kilometers int check (kilometers is null or kilometers >= 0),
  intake_completed_at timestamptz not null,
  ready_at timestamptz,
  collected_at timestamptz,
  archived_at timestamptz,
  row_version bigint not null default 1,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (workshop_id, id),
  unique (workshop_id, public_code),
  foreign key (workshop_id, vehicle_id) references vehicles(workshop_id, id),
  foreign key (workshop_id, customer_id) references customers(workshop_id, id)
);

create unique index uq_work_orders_one_active_per_plate
  on work_orders(workshop_id, plate_normalized)
  where status in ('accepted','in_progress','ready');

create index idx_work_orders_plate_history
  on work_orders(workshop_id, plate_normalized, created_at desc);

create index idx_work_orders_status
  on work_orders(workshop_id, status, updated_at desc);

create table work_order_items (
  id uuid primary key default gen_random_uuid(),
  workshop_id uuid not null references workshops(id) on delete cascade,
  work_order_id uuid not null,
  item_type text not null check (item_type in ('labor','part')),
  description text not null,
  quantity numeric(10,2) not null check (quantity > 0),
  unit_price numeric(10,2) not null check (unit_price >= 0),
  source text not null check (source in ('whatsapp','telegram_test','dashboard','system')),
  voided_at timestamptz,
  void_reason text,
  created_by text,
  updated_by text,
  row_version bigint not null default 1,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (workshop_id, id),
  check (voided_at is not null or void_reason is null),
  foreign key (workshop_id, work_order_id) references work_orders(workshop_id, id)
);

create index idx_work_order_items_active
  on work_order_items(workshop_id, work_order_id)
  where voided_at is null;

create table work_order_notes (
  id uuid primary key default gen_random_uuid(),
  workshop_id uuid not null references workshops(id) on delete cascade,
  work_order_id uuid not null,
  note text not null,
  source text not null check (source in ('whatsapp','telegram_test','dashboard','system')),
  voided_at timestamptz,
  void_reason text,
  created_by text,
  updated_by text,
  row_version bigint not null default 1,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (workshop_id, id),
  check (voided_at is not null or void_reason is null),
  foreign key (workshop_id, work_order_id) references work_orders(workshop_id, id)
);

create index idx_work_order_notes_active
  on work_order_notes(workshop_id, work_order_id)
  where voided_at is null;

create table work_order_audit_events (
  id uuid primary key default gen_random_uuid(),
  workshop_id uuid not null references workshops(id) on delete cascade,
  work_order_id uuid,
  event_type text not null,
  actor_type text not null check (actor_type in ('mechanic','dashboard_user','system')),
  actor_ref text,
  before jsonb not null default '{}',
  after jsonb not null default '{}',
  created_at timestamptz not null default now(),
  foreign key (workshop_id, work_order_id) references work_orders(workshop_id, id)
);

create index idx_work_order_audit_events_order
  on work_order_audit_events(workshop_id, work_order_id, created_at desc);

create table documents (
  id uuid primary key default gen_random_uuid(),
  workshop_id uuid not null references workshops(id) on delete cascade,
  work_order_id uuid not null,
  document_type text not null check (document_type in ('intake_acceptance','estimate','final_summary')),
  version int not null check (version > 0),
  status text not null check (status in ('pending','generating','generated','failed','void')),
  storage_bucket text,
  storage_path text,
  filename text,
  metadata jsonb not null default '{}',
  generated_at timestamptz,
  created_by text,
  row_version bigint not null default 1,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (workshop_id, id),
  unique (work_order_id, document_type, version),
  check (
    status <> 'generated'
    or (
      storage_bucket is not null
      and storage_path is not null
      and filename is not null
      and generated_at is not null
    )
  ),
  foreign key (workshop_id, work_order_id) references work_orders(workshop_id, id)
);

create index idx_documents_work_order
  on documents(workshop_id, work_order_id, document_type, version desc);

create table intake_sessions (
  id uuid primary key default gen_random_uuid(),
  workshop_id uuid not null references workshops(id) on delete cascade,
  channel text not null check (channel in ('whatsapp','telegram_test')),
  sender_identifier text not null,
  plate_normalized text not null,
  current_step text not null check (current_step in ('vehicle_model','reported_issue','kilometers','customer_name','customer_phone')),
  data jsonb not null default '{}',
  is_active boolean not null default true,
  expires_at timestamptz not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (workshop_id, id)
);

create unique index uq_active_intake_session_per_sender
  on intake_sessions(workshop_id, channel, sender_identifier)
  where is_active = true;

create index idx_intake_sessions_expired_active
  on intake_sessions(expires_at)
  where is_active = true;

create table reminders (
  id uuid primary key default gen_random_uuid(),
  workshop_id uuid not null references workshops(id) on delete cascade,
  work_order_id uuid,
  vehicle_id uuid,
  reminder_type text not null check (reminder_type in ('ready_not_collected','revision_due_30d','revision_due_7d','revision_due_1d')),
  recipient_policy text not null check (recipient_policy in ('mechanic_only','customer_only','both')),
  resolved_mechanic_identifier text,
  resolved_customer_identifier text,
  scheduled_for timestamptz not null,
  sent_at timestamptz,
  cancelled_at timestamptz,
  status text not null check (status in ('scheduled','sending','sent','partial','cancelled','failed')),
  idempotency_key text not null unique,
  metadata jsonb not null default '{}',
  created_at timestamptz not null default now(),
  unique (workshop_id, id),
  check (
    (reminder_type = 'ready_not_collected' and work_order_id is not null and vehicle_id is null)
    or
    (reminder_type in ('revision_due_30d','revision_due_7d','revision_due_1d') and vehicle_id is not null and work_order_id is null)
  ),
  check (
    reminder_type = 'ready_not_collected'
    or metadata ? 'revision_due_date'
  ),
  foreign key (workshop_id, work_order_id) references work_orders(workshop_id, id),
  foreign key (workshop_id, vehicle_id) references vehicles(workshop_id, id)
);

create unique index uq_ready_reminder_scheduled
  on reminders(work_order_id, reminder_type)
  where status in ('scheduled','sending');

create unique index uq_revision_reminder_dedupe
  on reminders(vehicle_id, reminder_type, ((metadata->>'revision_due_date')))
  where reminder_type in ('revision_due_30d','revision_due_7d','revision_due_1d')
    and status in ('scheduled','sending','sent','partial');

create index idx_reminders_due
  on reminders(status, scheduled_for)
  where status in ('scheduled','sending');

create table message_logs (
  id uuid primary key default gen_random_uuid(),
  workshop_id uuid references workshops(id) on delete cascade,
  channel text not null check (channel in ('whatsapp','telegram_test')),
  provider text not null,
  provider_message_id text,
  direction text not null check (direction in ('inbound','outbound')),
  sender_identifier text,
  recipient_identifier text,
  raw_text text,
  raw_payload jsonb not null default '{}',
  parsed_command text,
  parsed_plate_normalized text,
  parse_status text,
  provider_status text,
  related_work_order_id uuid,
  related_reminder_id uuid,
  related_document_id uuid,
  idempotency_key text not null unique,
  error_message text,
  created_at timestamptz not null default now(),
  unique (workshop_id, id),
  check (direction <> 'inbound' or provider_message_id is not null),
  check (
    (
      direction = 'inbound'
      and parse_status is not null
      and parse_status in (
        'received',
        'duplicate',
        'parsed',
        'continued_intake',
        'malformed',
        'unknown_command',
        'validation_failed',
        'not_found',
        'conflict',
        'processed',
        'ignored',
        'error'
      )
    )
    or
    (
      direction = 'outbound'
      and parse_status is null
    )
  ),
  check (
    (
      direction = 'inbound'
      and provider_status is null
    )
    or
    (
      direction = 'outbound'
      and provider_status is not null
      and provider_status in ('queued','sending','accepted','delivered','failed','skipped')
    )
  ),
  check (related_work_order_id is null or workshop_id is not null),
  check (related_reminder_id is null or workshop_id is not null),
  check (related_document_id is null or workshop_id is not null),
  foreign key (workshop_id, related_work_order_id) references work_orders(workshop_id, id),
  foreign key (workshop_id, related_reminder_id) references reminders(workshop_id, id),
  foreign key (workshop_id, related_document_id) references documents(workshop_id, id)
);

create unique index uq_message_logs_provider_message_id
  on message_logs(provider, direction, recipient_identifier, sender_identifier, provider_message_id)
  where provider_message_id is not null;

create index idx_message_logs_work_order
  on message_logs(workshop_id, related_work_order_id, created_at desc);

create table attachments (
  id uuid primary key default gen_random_uuid(),
  workshop_id uuid not null references workshops(id) on delete cascade,
  work_order_id uuid,
  message_log_id uuid,
  attachment_type text not null check (attachment_type in ('photo','document','other')),
  storage_bucket text not null,
  storage_path text not null,
  mime_type text,
  filename text,
  created_by text,
  captured_at timestamptz,
  created_at timestamptz not null default now(),
  check (work_order_id is not null or message_log_id is not null),
  foreign key (workshop_id, work_order_id) references work_orders(workshop_id, id),
  foreign key (workshop_id, message_log_id) references message_logs(workshop_id, id)
);

create index idx_attachments_work_order
  on attachments(workshop_id, work_order_id, created_at desc);

create index idx_attachments_message_log
  on attachments(workshop_id, message_log_id, created_at desc);

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
  v_customer_phone_normalized := regexp_replace(coalesce(v_customer_phone, ''), '[^0-9+]', '', 'g');

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
  on conflict (workshop_id, phone_normalized) do nothing
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
  on conflict (workshop_id, plate_normalized) do nothing
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

create view work_order_totals as
select
  wo.id as work_order_id,
  wo.workshop_id,
  coalesce(sum(case when i.item_type = 'labor' then i.quantity * i.unit_price else 0 end), 0) as labor_total,
  coalesce(sum(case when i.item_type = 'part' then i.quantity * i.unit_price else 0 end), 0) as parts_total,
  coalesce(sum(i.quantity * i.unit_price), 0) as grand_total
from work_orders wo
left join work_order_items i
  on i.workshop_id = wo.workshop_id
  and i.work_order_id = wo.id
  and i.voided_at is null
group by wo.id, wo.workshop_id;

create trigger set_updated_at_workshops
  before update on workshops
  for each row execute function set_updated_at_only();

create trigger set_updated_at_workshop_settings
  before update on workshop_settings
  for each row execute function set_updated_at_only();

create trigger set_updated_at_workshop_channels
  before update on workshop_channels
  for each row execute function set_updated_at_only();

create trigger set_updated_at_customers
  before update on customers
  for each row execute function set_updated_at_only();

create trigger set_updated_at_vehicles
  before update on vehicles
  for each row execute function set_updated_at_and_row_version();

create trigger set_updated_at_work_order_number_sequences
  before update on work_order_number_sequences
  for each row execute function set_updated_at_only();

create trigger set_updated_at_work_orders
  before update on work_orders
  for each row execute function set_updated_at_and_row_version();

create trigger set_updated_at_work_order_items
  before update on work_order_items
  for each row execute function set_updated_at_and_row_version();

create trigger set_updated_at_work_order_notes
  before update on work_order_notes
  for each row execute function set_updated_at_and_row_version();

create trigger set_updated_at_documents
  before update on documents
  for each row execute function set_updated_at_and_row_version();

create trigger set_updated_at_intake_sessions
  before update on intake_sessions
  for each row execute function set_updated_at_only();

alter table workshops enable row level security;
alter table workshop_settings enable row level security;
alter table workshop_channels enable row level security;
alter table customers enable row level security;
alter table vehicles enable row level security;
alter table vehicle_revision_events enable row level security;
alter table work_order_number_sequences enable row level security;
alter table work_orders enable row level security;
alter table work_order_items enable row level security;
alter table work_order_notes enable row level security;
alter table work_order_audit_events enable row level security;
alter table documents enable row level security;
alter table intake_sessions enable row level security;
alter table reminders enable row level security;
alter table message_logs enable row level security;
alter table attachments enable row level security;
