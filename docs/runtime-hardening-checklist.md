# Runtime Hardening Checklist

## Environment

Backend must define:

- `Criccheto_SUPABASE_URL`
- `Criccheto_SUPABASE_SERVICE_ROLE_KEY`
- `Criccheto_INTERNAL_API_SECRET`
- `Criccheto_BACKEND_BASE_URL`
- `Criccheto_DOCUMENTS_BUCKET`

Backend fallback routes require these only when enabled:

- `Criccheto_WHATSAPP_APP_SECRET`
- `Criccheto_WHATSAPP_VERIFY_TOKEN`
- `Criccheto_WHATSAPP_PHONE_NUMBER_ID`
- `Criccheto_TELEGRAM_WEBHOOK_SECRET`
- `Criccheto_TELEGRAM_BOT_IDENTIFIER`

n8n must define:

- `Criccheto_BACKEND_BASE_URL`
- `Criccheto_INTERNAL_API_SECRET`
- `Criccheto_N8N_DISPATCH_SECRET`
- `Criccheto_N8N_PUBLIC_BASE_URL`
- `Criccheto_WHATSAPP_PROVIDER`
- `Criccheto_WHATSAPP_GRAPH_API_BASE_URL`
- `Criccheto_WHATSAPP_PHONE_NUMBER_ID`
- `Criccheto_WHATSAPP_ACCESS_TOKEN`
- `Criccheto_WHATSAPP_VERIFY_TOKEN`
- `Criccheto_TELEGRAM_BOT_TOKEN`
- `Criccheto_TELEGRAM_WEBHOOK_SECRET`
- `Criccheto_TELEGRAM_BOT_IDENTIFIER`

## Ingress Security

- WhatsApp POST ingress to WF-01 must pass through an upstream verifier that validates Meta `x-hub-signature-256` against the raw request body.
- The upstream verifier must add `x-upstream-verified-meta-signature: 1`.
- WF-01 rejects WhatsApp POST traffic without that trusted header.
- Telegram ingress must send `x-telegram-bot-api-secret-token` matching `Criccheto_TELEGRAM_WEBHOOK_SECRET`.

## Internal Calls

- Every n8n call to backend includes `x-internal-secret`.
- Every call to WF-03 includes `x-dispatch-secret`.
- WF-03 rejects before provider send if `x-dispatch-secret` is missing or invalid.

## Backend Endpoints Required

- `POST /api/internal/messages/process-inbound`
- `POST /api/internal/messages/send-outbound-result`
- `POST /api/internal/reminders/run`
- `POST /api/internal/documents/run`
- `POST /api/internal/intake/expire-cleanup`

## Reminder Contract

- `/api/internal/reminders/run` returns `{ "ok": true, "queued": [] }` when no reminders are due.
- Each queued item must include `messageLogId`, `channel`, `provider`, `recipientIdentifier`, `text`, and `relatedReminderId`.
- WF-04 and WF-05 validate queued items before calling WF-03.
- Reminder-linked outbound results transition reminder status from `sending` to `sent`, `partial`, or `failed`.
- A reminder is returned as queued only when backend created at least one outbound row and successfully claimed the scheduled reminder.
- Workshops that use mechanic-targeted reminders must configure `workshop_channels.sender_identifier`.

## Document Worker Contract

- `/api/internal/documents/run` returns `ok`, `claimed`, `processed`, `failed`, and `documents`.
- Backend owns claim, deterministic minimal PDF generation, private Supabase Storage upload, and final status updates.
- `Criccheto_DOCUMENTS_BUCKET` defaults to `documents` when omitted.
- WF-06 only schedules the backend endpoint.

## Atomic Intake Requirement

- Production intake completion uses the `complete_intake_work_order` Supabase RPC/transaction boundary.
- Backend runtime is wired through `completeIntakeAtomically(...)`, which calls the required `complete_intake_work_order(...)` database transaction function.
- Migration `0001_mechanic_mvp_schema.sql` defines the function. The SQL smoke script remains a begin/rollback schema validation script and does not exercise intake RPC completion.

## Backend Runtime Verification

- n8n workflows import without broken node references.
- n8n Code-node JavaScript compiles.
- n8n workflow JSON exports are intentionally committed inactive and must be activated explicitly after configuration.
- No unprefixed environment names remain.
- WF-03 dispatch is secret-protected.
- WF-01 safely ignores provider noise.
- Internal API contracts are locked in `docs/internal-api-contracts.md` and `apps/web/lib/contracts/internal.ts`.
