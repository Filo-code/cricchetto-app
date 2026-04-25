drop index if exists uq_message_logs_provider_message_id;

create unique index if not exists uq_message_logs_provider_message_id
  on message_logs(provider, direction, recipient_identifier, sender_identifier, provider_message_id)
  where provider_message_id is not null;
