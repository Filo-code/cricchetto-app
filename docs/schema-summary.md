# Mechanic Workshop MVP Schema Summary

## Tables

- `workshops`
- `workshop_settings`
- `workshop_channels`
- `customers`
- `vehicles`
- `vehicle_revision_events`
- `work_order_number_sequences`
- `work_orders`
- `work_order_items`
- `work_order_notes`
- `work_order_audit_events`
- `documents`
- `intake_sessions`
- `reminders`
- `message_logs`
- `attachments`

## Views

- `work_order_totals`

## Key Invariants

- `work_orders.id` is the internal technical work order ID.
- `public_code` is visible to users and generated server-side from `work_order_number_sequences`.
- `plate_normalized` is the visible operational lookup key, not the technical primary key.
- `workshop_channels.recipient_identifier` is the provider-side route key used for inbound workshop resolution and outbound sender logging.
- `workshop_channels.sender_identifier` is an optional mechanic/admin fallback target for reminders, not the provider sender identity. It must be populated if mechanic-targeted reminder delivery is required.
- Composite foreign keys enforce tenant consistency for related workshop-owned rows.
- RLS is enabled on all tables. MVP operational writes are server-side with the Supabase service role.
- `complete_intake_work_order(...)` is the atomic intake completion boundary for customer, vehicle, work order, audit, intake-session, and intake-document writes.

## Trigger Strategy

Two trigger functions are used:

- `set_updated_at_only()` for mutable tables without optimistic concurrency versioning
- `set_updated_at_and_row_version()` for mutable tables that use `row_version`

`set_updated_at_only()` is applied to:

- `workshops`
- `workshop_settings`
- `workshop_channels`
- `customers`
- `work_order_number_sequences`
- `intake_sessions`

`set_updated_at_and_row_version()` is applied to:

- `vehicles`
- `work_orders`
- `work_order_items`
- `work_order_notes`
- `documents`

## Active Work Order Rule

Exactly one active work order is allowed per workshop and plate.

Active statuses:

- `accepted`
- `in_progress`
- `ready`

Enforced by:

```sql
unique on work_orders(workshop_id, plate_normalized)
where status in ('accepted','in_progress','ready')
```

Durable work order statuses:

- `accepted`
- `in_progress`
- `ready`
- `collected`
- `archived`

There is no durable `draft` work order status. Incomplete intake state exists only in `intake_sessions`.

## Intake Sessions

Only one active intake session is allowed per `(workshop_id, channel, sender_identifier)`.

Expired sessions are deactivated by backend cleanup or passively before opening a new `NUOVA` intake.

## Message Lifecycle

`parse_status` applies only to inbound `message_logs`.

Inbound rows require:

- `provider_message_id`
- `parse_status`
- `provider_status = null`

Allowed inbound `parse_status` values:

- `received`
- `duplicate`
- `parsed`
- `continued_intake`
- `malformed`
- `unknown_command`
- `validation_failed`
- `not_found`
- `conflict`
- `processed`
- `ignored`
- `error`

`provider_status` applies only to outbound `message_logs`.

Outbound rows require:

- `parse_status = null`
- `provider_status`

Allowed outbound `provider_status` values:

- `queued`
- `sending`
- `accepted`
- `delivered`
- `failed`
- `skipped`

Provider message ID dedupe is enforced on `(provider, direction, recipient_identifier, sender_identifier, provider_message_id)` when `provider_message_id is not null`. The recipient/sender scope is required because Telegram `message_id` values are chat-scoped, not provider-global.

## Reminder Recipient Behavior

Recipient policies:

- `mechanic_only`
- `customer_only`
- `both`

Reminder rows store resolved mechanic/customer identifiers and dispatch metadata such as selected channel/provider, chosen target, fallback usage, and last delivery outcome.

Current runtime queues outbound messages according to `recipient_policy`:

- `mechanic_only` targets `resolved_mechanic_identifier`
- `customer_only` targets normalized `resolved_customer_identifier` on WhatsApp when available, otherwise falls back to the mechanic target with an explicit fallback notice
- `both` fans out to customer and mechanic targets when both identifiers are available
- customer targets are WhatsApp-only in this runtime; Telegram test reminders use mechanic targets and record skipped customer targets in metadata
- reminder status moves from `scheduled` to `sending`, then to `sent`, `partial`, or `failed`
- `partial` means at least one target was accepted and at least one target failed or was skipped
- `reminders.metadata.dispatch_targets` stores per-target queued and provider-result state

## Revision Tracking

Vehicles store `revision_due_date`.

Revision changes are audited in `vehicle_revision_events`.

Revision reminders use `reminders.vehicle_id` and reminder types:

- `revision_due_30d`
- `revision_due_7d`
- `revision_due_1d`

Revision reminders dedupe by vehicle, reminder type, and `metadata->>'revision_due_date'`.

## Void Semantics

Notes and work items are never hard-deleted by product flows.

Removal means:

- set `voided_at`
- optionally set `void_reason`
- write an audit event from backend code

`work_order_totals` excludes all work items where `voided_at is not null`.

## Public Code Generation

`work_order_number_sequences` has primary key `(workshop_id, year)`.

Intake completion allocates the next number inside the same transaction as durable work order creation:

```sql
insert into work_order_number_sequences(workshop_id, year, last_number)
values ($1, $2, 1)
on conflict (workshop_id, year)
do update
set last_number = work_order_number_sequences.last_number + 1,
    updated_at = now()
returning last_number;
```

Public code format:

```text
{PLATE_NORMALIZED}-{YYYY}-{NUMBER_PADDED_TO_6}
```

Uniqueness and concurrency safety are required. Gapless numbering is not required.
