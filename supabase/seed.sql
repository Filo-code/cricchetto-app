insert into workshops (id, name, timezone)
values (
  '11111111-1111-1111-1111-111111111111',
  'Officina Demo',
  'Europe/Rome'
)
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
  '11111111-1111-1111-1111-111111111111',
  35.00,
  'EUR',
  4,
  true,
  array[35],
  'mechanic_only',
  'mechanic_only'
)
on conflict (workshop_id) do nothing;

insert into workshop_channels (
  id,
  workshop_id,
  channel,
  provider,
  recipient_identifier,
  sender_identifier,
  is_active
)
values
(
  '22222222-2222-2222-2222-222222222222',
  '11111111-1111-1111-1111-111111111111',
  'whatsapp',
  'meta_whatsapp_cloud_api',
  'whatsapp_business_number_demo',
  'mechanic_whatsapp_number_demo',
  true
),
(
  '33333333-3333-3333-3333-333333333333',
  '11111111-1111-1111-1111-111111111111',
  'telegram_test',
  'telegram_bot_api',
  'Cricchetto_bot',
  'mechanic_telegram_chat_id_demo',
  true
)
on conflict (id) do nothing;
