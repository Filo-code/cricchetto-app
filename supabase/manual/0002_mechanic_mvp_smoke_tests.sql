-- Dev validation script for the mechanic MVP schema.
-- Run manually against a fresh development database after all migrations and seed.sql.
-- This script intentionally rolls back all test data.

begin;

insert into workshops (id, name, timezone)
values ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'Smoke Test Workshop', 'Europe/Rome')
on conflict (id) do nothing;

insert into workshop_settings (
  workshop_id,
  hourly_rate,
  currency,
  ready_reminder_days,
  revision_reminders_enabled,
  revision_reminder_offsets_days,
  ready_reminder_recipient_policy,
  revision_reminder_recipient_policy
)
values (
  'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
  35.00,
  'EUR',
  4,
  true,
  array[30,7,1],
  'mechanic_only',
  'mechanic_only'
)
on conflict (workshop_id) do nothing;

insert into customers (
  id,
  workshop_id,
  name,
  phone,
  phone_normalized
)
values (
  'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb',
  'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
  'Smoke Customer',
  '+390000000001',
  '+390000000001'
);

insert into vehicles (
  id,
  workshop_id,
  customer_id,
  plate,
  plate_normalized,
  model,
  revision_due_date
)
values (
  'cccccccc-cccc-cccc-cccc-cccccccccccc',
  'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
  'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb',
  'AB123CD',
  'AB123CD',
  'Smoke Model',
  current_date + 30
);

insert into work_orders (
  id,
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
  'dddddddd-dddd-dddd-dddd-dddddddddddd',
  'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
  'cccccccc-cccc-cccc-cccc-cccccccccccc',
  'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb',
  'AB123CD-2026-000001',
  'AB123CD',
  'AB123CD',
  'Smoke Model',
  'Smoke Customer',
  '+390000000001',
  'accepted',
  'Smoke issue',
  100000,
  now()
);

insert into intake_sessions (
  id,
  workshop_id,
  channel,
  sender_identifier,
  plate_normalized,
  current_step,
  data,
  expires_at
)
values (
  'eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee',
  'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
  'telegram_test',
  'smoke-telegram-intake',
  'ZZ123ZZ',
  'customer_phone',
  jsonb_build_object(
    'vehicle_model', 'Smoke Intake Model',
    'reported_issue', 'Phone normalization smoke',
    'kilometers', 54321,
    'customer_name', 'Italian Phone Smoke',
    'customer_phone', '333 123 4567'
  ),
  now() + interval '1 hour'
);

do $$
declare
  v_work_order_id uuid;
  v_public_code text;
  v_plate text;
  v_phone text;
  v_phone_normalized text;
  v_phone_snapshot text;
begin
  select work_order_id, public_code, plate_normalized
  into v_work_order_id, v_public_code, v_plate
  from complete_intake_work_order(
    'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
    'eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee',
    'smoke-test',
    null,
    null
  );

  if v_work_order_id is null or v_public_code is null or v_plate <> 'ZZ123ZZ' then
    raise exception 'complete_intake_work_order did not return the expected result';
  end if;

  select phone, phone_normalized
  into v_phone, v_phone_normalized
  from customers
  where workshop_id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'
    and name = 'Italian Phone Smoke';

  if v_phone <> '+393331234567' or v_phone_normalized <> '+393331234567' then
    raise exception 'customer phone was not canonicalized: %, %', v_phone, v_phone_normalized;
  end if;

  select customer_phone_snapshot
  into v_phone_snapshot
  from work_orders
  where workshop_id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'
    and id = v_work_order_id;

  if v_phone_snapshot <> '+393331234567' then
    raise exception 'work order phone snapshot was not canonicalized: %', v_phone_snapshot;
  end if;
end;
$$;

do $$
begin
  begin
    insert into work_orders (
      workshop_id,
      vehicle_id,
      customer_id,
      public_code,
      plate_snapshot,
      plate_normalized,
      status,
      reported_issue,
      intake_completed_at
    )
    values (
      'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
      'cccccccc-cccc-cccc-cccc-cccccccccccc',
      'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb',
      'AB123CD-2026-000002',
      'AB123CD',
      'AB123CD',
      'in_progress',
      'Duplicate active test',
      now()
    );
    raise exception 'duplicate active work order was allowed';
  exception
    when unique_violation then null;
  end;
end;
$$;

do $$
begin
  begin
    insert into message_logs (
      workshop_id,
      channel,
      provider,
      provider_message_id,
      direction,
      sender_identifier,
      recipient_identifier,
      raw_text,
      raw_payload,
      idempotency_key
    )
    values (
      'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
      'whatsapp',
      'smoke_provider',
      'inbound-missing-parse-status',
      'inbound',
      '+390000000001',
      'workshop_whatsapp',
      'STATO AB123CD',
      '{}',
      'smoke:inbound:missing-parse-status'
    );
    raise exception 'inbound message without parse_status was allowed';
  exception
    when check_violation then null;
  end;
end;
$$;

do $$
begin
  begin
    insert into message_logs (
      workshop_id,
      channel,
      provider,
      direction,
      sender_identifier,
      recipient_identifier,
      raw_text,
      raw_payload,
      idempotency_key
    )
    values (
      'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
      'whatsapp',
      'smoke_provider',
      'outbound',
      'workshop_whatsapp',
      '+390000000001',
      'Smoke outbound',
      '{}',
      'smoke:outbound:missing-provider-status'
    );
    raise exception 'outbound message without provider_status was allowed';
  exception
    when check_violation then null;
  end;
end;
$$;

insert into intake_sessions (
  workshop_id,
  channel,
  sender_identifier,
  plate_normalized,
  current_step,
  expires_at
)
values (
  'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
  'whatsapp',
  '+390000000001',
  'AB123CD',
  'vehicle_model',
  now() + interval '1 hour'
);

do $$
begin
  begin
    insert into intake_sessions (
      workshop_id,
      channel,
      sender_identifier,
      plate_normalized,
      current_step,
      expires_at
    )
    values (
      'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
      'whatsapp',
      '+390000000001',
      'EF456GH',
      'vehicle_model',
      now() + interval '1 hour'
    );
    raise exception 'duplicate active intake session was allowed';
  exception
    when unique_violation then null;
  end;
end;
$$;

insert into message_logs (
  workshop_id,
  channel,
  provider,
  provider_message_id,
  direction,
  sender_identifier,
  recipient_identifier,
  raw_text,
  raw_payload,
  parse_status,
  idempotency_key
)
values (
  'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
  'whatsapp',
  'smoke_provider',
  'provider-duplicate-message',
  'inbound',
  '+390000000001',
  'workshop_whatsapp',
  'STATO AB123CD',
  '{}',
  'received',
  'smoke:inbound:provider-dedupe-1'
);

do $$
begin
  begin
    insert into message_logs (
      workshop_id,
      channel,
      provider,
      provider_message_id,
      direction,
      sender_identifier,
      recipient_identifier,
      raw_text,
      raw_payload,
      parse_status,
      idempotency_key
    )
    values (
      'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
      'whatsapp',
      'smoke_provider',
      'provider-duplicate-message',
      'inbound',
      '+390000000001',
      'workshop_whatsapp',
      'STATO AB123CD',
      '{}',
      'received',
      'smoke:inbound:provider-dedupe-2'
    );
    raise exception 'provider-level message dedupe was not enforced';
  exception
    when unique_violation then null;
  end;
end;
$$;

insert into work_order_items (
  workshop_id,
  work_order_id,
  item_type,
  description,
  quantity,
  unit_price,
  source
)
values (
  'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
  'dddddddd-dddd-dddd-dddd-dddddddddddd',
  'part',
  'Active smoke part',
  1,
  100,
  'system'
);

insert into work_order_items (
  workshop_id,
  work_order_id,
  item_type,
  description,
  quantity,
  unit_price,
  source,
  voided_at,
  void_reason
)
values (
  'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
  'dddddddd-dddd-dddd-dddd-dddddddddddd',
  'part',
  'Voided smoke part',
  1,
  50,
  'system',
  now(),
  'smoke test void'
);

do $$
declare
  total numeric(10,2);
begin
  select grand_total
  into total
  from work_order_totals
  where workshop_id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'
    and work_order_id = 'dddddddd-dddd-dddd-dddd-dddddddddddd';

  if total <> 100 then
    raise exception 'voided items were included in totals: %', total;
  end if;
end;
$$;

do $$
begin
  begin
    insert into documents (
      workshop_id,
      work_order_id,
      document_type,
      version,
      status
    )
    values (
      'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
      'dddddddd-dddd-dddd-dddd-dddddddddddd',
      'final_summary',
      1,
      'generated'
    );
    raise exception 'generated document without storage fields was allowed';
  exception
    when check_violation then null;
  end;
end;
$$;

insert into reminders (
  workshop_id,
  vehicle_id,
  reminder_type,
  recipient_policy,
  resolved_mechanic_identifier,
  scheduled_for,
  status,
  idempotency_key,
  metadata
)
values (
  'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
  'cccccccc-cccc-cccc-cccc-cccccccccccc',
  'revision_due_30d',
  'mechanic_only',
  'workshop_whatsapp',
  now() + interval '1 day',
  'scheduled',
  'smoke:reminder:revision-1',
  '{"revision_due_date":"2026-11-20"}'
);

do $$
begin
  begin
    insert into reminders (
      workshop_id,
      vehicle_id,
      reminder_type,
      recipient_policy,
      resolved_mechanic_identifier,
      scheduled_for,
      status,
      idempotency_key,
      metadata
    )
    values (
      'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
      'cccccccc-cccc-cccc-cccc-cccccccccccc',
      'revision_due_30d',
      'mechanic_only',
      'workshop_whatsapp',
      now() + interval '1 day',
      'scheduled',
      'smoke:reminder:revision-2',
      '{"revision_due_date":"2026-11-20"}'
    );
    raise exception 'revision reminder dedupe was not enforced';
  exception
    when unique_violation then null;
  end;
end;
$$;

rollback;
