# n8n Runtime Package

n8n owns provider ingress, provider outbound delivery, and schedules. The backend owns command parsing, domain mutations, audit rules, durable reminder state, and document state.

## Required n8n Environment Variables

- `Criccheto_BACKEND_BASE_URL`: backend base URL, for example `https://app.example.com`.
- `Criccheto_INTERNAL_API_SECRET`: shared secret sent as `x-internal-secret` to backend internal endpoints.
- `Criccheto_N8N_PUBLIC_BASE_URL`: public n8n base URL, used to call WF-03 from other workflows.
- `Criccheto_N8N_DISPATCH_SECRET`: shared secret sent as `x-dispatch-secret` when calling WF-03.
- `Criccheto_WHATSAPP_PROVIDER`: fixed value for this MVP: `meta_whatsapp_cloud_api`.
- `Criccheto_WHATSAPP_GRAPH_API_BASE_URL`: Meta Graph API base, for example `https://graph.facebook.com/v20.0`.
- `Criccheto_WHATSAPP_PHONE_NUMBER_ID`: Meta WhatsApp phone number ID.
- `Criccheto_WHATSAPP_ACCESS_TOKEN`: Meta WhatsApp Cloud API token.
- `Criccheto_WHATSAPP_VERIFY_TOKEN`: token used by Meta webhook verification.
- `Criccheto_TELEGRAM_BOT_TOKEN`: Telegram Bot API token.
- `Criccheto_TELEGRAM_WEBHOOK_SECRET`: Telegram webhook secret token.
- `Criccheto_TELEGRAM_BOT_IDENTIFIER`: stable Telegram route key matching `workshop_channels.recipient_identifier`; default seed value is `Cricchetto_bot`.

## Backend-Only Environment Variables

- `Criccheto_SUPABASE_URL`: Supabase project URL.
- `Criccheto_SUPABASE_SERVICE_ROLE_KEY`: Supabase service role key.
- `Criccheto_INTERNAL_API_SECRET`: same value as n8n.
- `Criccheto_BACKEND_BASE_URL`: backend base URL.
- `Criccheto_DOCUMENTS_BUCKET`: private Supabase Storage bucket for generated PDFs; defaults to `documents`.
- `Criccheto_ATTACHMENTS_BUCKET`: private Supabase Storage bucket for inbound/dashboard media; defaults to `attachments`.
- `Criccheto_WHATSAPP_GRAPH_API_BASE_URL`: required by backend media ingest for WhatsApp attachments.
- `Criccheto_WHATSAPP_ACCESS_TOKEN`: required by backend media ingest for WhatsApp attachments.
- `Criccheto_TELEGRAM_BOT_TOKEN`: required by backend media ingest for Telegram attachments.
- `Criccheto_WHATSAPP_APP_SECRET`: deprecated provider-to-backend fallback only.
- `Criccheto_WHATSAPP_VERIFY_TOKEN`: deprecated WhatsApp fallback verification only.
- `Criccheto_WHATSAPP_PHONE_NUMBER_ID`: deprecated WhatsApp fallback normalization only.
- `Criccheto_TELEGRAM_WEBHOOK_SECRET`: deprecated Telegram fallback only.
- `Criccheto_TELEGRAM_BOT_IDENTIFIER`: deprecated Telegram fallback normalization route key.

## Provider Strategy

- WhatsApp production: Meta WhatsApp Cloud API.
- Telegram test/admin: Telegram Bot API.

## Security Notes

- Backend internal calls always include `x-internal-secret`.
- Outbound dispatch calls to WF-03 always include `x-dispatch-secret`; WF-03 rejects requests before sending if this header is missing or invalid.
- Telegram ingress checks `x-telegram-bot-api-secret-token` when `Criccheto_TELEGRAM_WEBHOOK_SECRET` is set.
- WhatsApp GET verification is handled in WF-01.
- WhatsApp signed request verification requires the exact raw request body. The deprecated backend fallback webhook verifies Meta `x-hub-signature-256` with Node.js `crypto` and `Criccheto_WHATSAPP_APP_SECRET`. WF-01 does not fake this verification; production n8n ingress must sit behind a reverse proxy/API gateway that verifies Meta signatures and forwards only verified WhatsApp POST requests with `x-upstream-verified-meta-signature: 1`.

## Workflow Status

All committed workflow JSON exports are stored inactive (`active: false`) and must be activated explicitly after secrets and base URLs are configured.

- `WF-01_Inbound_Channel_Entry.json`: production-useful ingress for Meta WhatsApp Cloud API and Telegram Bot API. WhatsApp status callbacks and Telegram `callback_query` updates are acknowledged as ignored; text, image/document media, and audio are normalized and sent to backend.
- `WF-02_Command_Router.json`: deprecated; command routing is backend-owned.
- `WF-03_Outbound_Message_Dispatch.json`: production-useful outbound dispatch for Meta WhatsApp Cloud API and Telegram Bot API.
- `WF-04_Ready_Reminder_Scheduler.json`: production-useful scheduler that asks backend for due ready reminders and dispatches queued jobs.
- `WF-05_Revision_Reminder_Scheduler.json`: production-useful scheduler that asks backend for due revision reminders and dispatches queued jobs.
- `WF-06_Document_Worker.json`: scheduler that calls the backend document worker. Backend owns claim, deterministic minimal PDF generation, private Supabase Storage upload, and final status updates.
- `WF-07_Intake_Expiry_Cleanup.json`: production-useful cleanup scheduler.

## Backend Endpoints Used

- `POST /api/internal/messages/process-inbound`
- `POST /api/internal/messages/send-outbound-result`
- `POST /api/internal/reminders/run`
- `POST /api/internal/documents/run`
- `POST /api/internal/intake/expire-cleanup`

## Channel Identity Semantics

- WhatsApp inbound `senderIdentifier` is the end-user/provider sender identifier; `recipientIdentifier` is the workshop route key, normally the Meta phone number ID.
- Telegram inbound `senderIdentifier` is the chat ID.
- Telegram inbound `recipientIdentifier` is the stable bot route key stored in `workshop_channels.recipient_identifier`; the committed seed/runtime default is `Cricchetto_bot`.
- Telegram `callback_query` updates are acknowledged as ignored and are not forwarded to backend command processing.

## Outbound Input Contract

WF-03 expects:

```json
{
  "messageLogId": "uuid",
  "channel": "whatsapp",
  "provider": "meta_whatsapp_cloud_api",
  "recipientIdentifier": "393331234567",
  "text": "Messaggio",
  "relatedReminderId": "optional uuid",
  "relatedDocumentId": "optional uuid"
}
```

The request must include:

```text
x-dispatch-secret: {{$env.Criccheto_N8N_DISPATCH_SECRET}}
```

WF-03 marks the message as `sending`, sends it through the provider, then reports `accepted` or `failed` to the backend with the real provider message ID when available. WF-03 does not report `delivered`; WhatsApp delivery callbacks are not wired in this MVP package, and Telegram Bot API has no equivalent delivery callback in this path.

## Reminder Run Contract

WF-04 and WF-05 call `POST /api/internal/reminders/run` with `x-internal-secret`.

Request:

```json
{
  "limit": 20,
  "reminderTypes": ["ready_not_collected"]
}
```

Response:

```json
{
  "ok": true,
  "queued": [
    {
      "messageLogId": "uuid",
      "channel": "whatsapp",
      "provider": "meta_whatsapp_cloud_api",
      "recipientIdentifier": "393331234567",
      "text": "Promemoria...",
      "relatedReminderId": "uuid"
    }
  ]
}
```

Each queued item is passed to WF-03 with `x-dispatch-secret`.

Current runtime note: `recipient_policy = both` can return two queued outbound jobs for the same `relatedReminderId`. WF-04 and WF-05 dispatch every queued item returned by backend.

## Document Worker Contract

WF-06 calls `POST /api/internal/documents/run` with `x-internal-secret` and body `{"limit":10}`. Backend claims pending rows, generates deterministic minimal PDFs, uploads them to private Supabase Storage, and updates document rows to `generated` or `failed`. n8n only schedules the worker.

Response:

```json
{
  "ok": true,
  "claimed": 1,
  "processed": 1,
  "failed": 0,
  "documents": [
    {
      "id": "uuid",
      "status": "generated",
      "document_type": "final_summary",
      "work_order_id": "uuid",
      "version": 1,
      "storage_bucket": "documents",
      "storage_path": "workshop-uuid/work-order-uuid/final_summary_v1_WO-2026-000001.pdf",
      "filename": "final_summary_v1_WO-2026-000001.pdf"
    }
  ]
}
```
