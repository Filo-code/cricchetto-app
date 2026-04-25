# Backend vs n8n Boundaries

## n8n Owns

- Meta WhatsApp Cloud API webhook ingress.
- Telegram Bot API webhook ingress.
- Provider-specific outbound HTTP calls.
- Scheduled runs for reminders, documents, and intake cleanup.
- Dispatching backend-queued outbound messages.

## Backend Owns

- Command parsing.
- Plate, phone, decimal, and date validation.
- Intake session progression.
- Intake completion.
- Work-order mutation logic.
- Revision update logic.
- Reminder scheduling/cancellation state.
- Audit event creation.
- Outbound message log creation and provider-result recording.

## Supabase Owns

- Durable data.
- Composite tenant foreign keys.
- Unique invariants.
- One active work order per plate.
- One active intake session per sender/channel/workshop.
- `work_order_totals`.
- Reminder dedupe.
- Document lifecycle constraints.

## Channel Route Semantics

- `workshop_channels.recipient_identifier` is the provider-side route key that backend uses to resolve inbound workshop ownership.
- The same `recipient_identifier` is the provider sender identity logged for outbound `message_logs`.
- `workshop_channels.sender_identifier` is optional and is used as the mechanic/admin reminder fallback target when configured. It must be populated for mechanic-targeted reminders to deliver.

## Deprecated Direct Provider Routes

The backend still contains fallback routes:

- `/api/webhooks/whatsapp/inbound`
- `/api/webhooks/telegram/inbound`

They are not the production ingress path. Production ingress is:

```text
Provider -> n8n WF-01 -> /api/internal/messages/process-inbound
```

Fallback route security is still real, not placeholder logic:

- WhatsApp fallback verifies Meta `x-hub-signature-256` with `Criccheto_WHATSAPP_APP_SECRET` and Node.js `crypto`.
- Telegram fallback verifies `x-telegram-bot-api-secret-token`.
- Backend internal endpoints verify `x-internal-secret`.
- WF-03 outbound dispatch verifies `x-dispatch-secret` before any provider send attempt.
- Production WhatsApp POST ingress into n8n requires upstream Meta HMAC verification and the forwarded header `x-upstream-verified-meta-signature: 1`.

## WF-02 Status

`WF-02_Command_Router` is intentionally deprecated. It remains as an inert imported workflow note so operators do not build command routing in n8n.
