# Backend Flow Summary

## Normalized Inbound Flow

1. n8n receives provider webhook.
2. n8n normalizes Meta WhatsApp Cloud API or Telegram Bot API payload to `NormalizedInboundMessage`.
3. n8n calls `/api/internal/messages/process-inbound`.
4. Backend resolves `workshop_id` through `workshop_channels`.
5. Backend inserts inbound `message_logs` with:
   - `direction = inbound`
   - `parse_status = received`
   - deterministic idempotency key including provider, recipient route key, sender, and provider message ID
6. Duplicate insert returns `200` without side effects.
7. Expired active intake session for the sender is deactivated.
8. Active intake session, if present, consumes the message as the next guided answer.
9. Otherwise the strict command parser runs.
10. Command handler returns short outbound reply text.
11. Outbound reply is queued in `message_logs` with `provider_status = queued`.
12. n8n dispatches queued outbound messages through WF-03.
13. n8n reports provider result to `/api/internal/messages/send-outbound-result`.
14. WF-08 periodically calls `/api/internal/outbound/recover-stuck` to retry stale outbound rows and clean up stale reminder dispatch state.

## Parser and Command Flow

Supported commands:

- `NUOVA <TARGA>`
- `STATO <TARGA>`
- `NOTA <TARGA> <text>`
- `RICAMBIO <TARGA> <description...> <qty> <unit_price>`
- `MANODOPERA <TARGA> <hours>`
- `CHIUDI <TARGA>`
- `RITIRATA <TARGA>`
- `REVISIONE <TARGA>`
- `REVISIONE <TARGA> <YYYY-MM-DD>`
- `REVISIONIINSCADENZA`

Parser rules:

- command keyword is case-insensitive
- plate is normalized and validated
- comma and dot decimals are accepted
- `RICAMBIO` treats the last two tokens as quantity and unit price
- no AI/free-form parsing exists

## Intake Completion Flow

Guided intake stores temporary state only in `intake_sessions`.

Completion service:

1. find/create customer by normalized phone
2. find/create vehicle by normalized plate
3. update vehicle current customer/model
4. allocate `public_code` from `work_order_number_sequences`
5. create accepted `work_order`
6. write audit event
7. deactivate intake session
8. enqueue pending intake document

Locked production rule:

- Intake completion is already RPC-backed and executes as one backend-enforced atomic database operation through the `complete_intake_work_order` Supabase RPC/database transaction.
- Backend callers use `completeIntakeAtomically(...)`, which calls the required atomic RPC path directly.
- Migration `supabase/migrations/0001_mechanic_mvp_schema.sql` defines the required runtime dependency `complete_intake_work_order(...)`. If that migration is not applied, intake completion fails with an explicit deployment error instead of attempting unsafe multi-write application fallback.
- The transaction performs customer lookup/create, vehicle lookup/create, public-code allocation, work-order creation, audit insertion, intake deactivation, and pending document insertion together.

## Outbound Logging Flow

Before send:

- insert outbound `message_logs`
- `parse_status = null`
- `provider_status = queued`

Before provider call, n8n reports:

- update `provider_status = sending`

After provider response, n8n reports:

- accepted response sets `provider_status = accepted`
- failed response sets `provider_status = failed`

WF-03 reports only `accepted` or `failed` after provider send. The database allows `delivered` for a future WhatsApp provider-status callback, but no current workflow writes `delivered`. Telegram Bot API has no delivered callback in this MVP runtime path.

Reminder finalization:

- when WF-03 reports `accepted` or `failed` for an outbound `message_logs` row linked to `related_reminder_id`, backend updates that target inside `reminders.metadata.dispatch_targets`
- backend marks the reminder `sent` when all required targets are accepted
- backend marks the reminder `partial` when at least one target is accepted and at least one target failed or was skipped
- backend marks the reminder `failed` when no target is accepted
- `recipient_policy = both` fans out to customer and mechanic targets when both identifiers are available
- no reminder is returned to n8n as queued unless backend successfully transitions that reminder from `scheduled` to `sending`

## Reminder and Revision Flow

`CHIUDI`:

- sets work order to `ready`
- enqueues final summary document
- schedules immediate `ready_pickup` customer reminder
- schedules `ready_not_collected` reminder from workshop settings

`RITIRATA`:

- sets work order to `collected`
- cancels scheduled ready reminders

`REVISIONE <TARGA> <YYYY-MM-DD>`:

- updates `vehicles.revision_due_date`
- writes `vehicle_revision_events`
- cancels scheduled revision reminders
- schedules new revision reminders from workshop settings when enabled

`REVISIONIINSCADENZA`:

- uses workshop local date
- includes overdue and next 30 days
- sorts overdue first, then due date, then plate
- returns max 10 rows with remaining count

## Runtime Provider Notes

- WhatsApp outbound uses Meta WhatsApp Cloud API.
- Telegram outbound uses Telegram Bot API.
- WF-02 is deprecated; backend owns command routing.
- WF-06 only triggers backend document processing. Backend claims pending documents, generates a deterministic minimal PDF, uploads it to private Supabase Storage, and updates each document to `ready` or `failed`.
- Document storage uses `Criccheto_DOCUMENTS_BUCKET` when set and defaults to `documents`.
- Direct provider-to-backend webhooks are deprecated fallback paths only.
- The WhatsApp fallback verifies Meta `x-hub-signature-256` against the exact raw request body using Node.js `crypto` and `Criccheto_WHATSAPP_APP_SECRET`.
- The Telegram fallback verifies `x-telegram-bot-api-secret-token`.
- n8n WF-01 cannot safely validate Meta HMAC without guaranteed raw-body access, so production WhatsApp POST ingress must be protected by upstream Meta signature verification. The upstream verifier must forward verified requests with `x-upstream-verified-meta-signature: 1`; WF-01 rejects WhatsApp POSTs without it.
- Telegram `callback_query` updates are ignored in WF-01 and do not enter backend command processing.
- Date handling uses native `Date` and `Intl.DateTimeFormat`; no Luxon dependency is required.

