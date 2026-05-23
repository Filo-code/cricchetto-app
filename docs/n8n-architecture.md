# n8n Runtime Architecture

## Runtime Split

n8n is the runtime orchestration layer. Backend is the domain logic layer. Supabase is the system of record.

## Production-Useful Workflows

- `WF-01_Inbound_Channel_Entry`: receives Meta WhatsApp Cloud API and Telegram Bot API inbound events, normalizes command-bearing text payloads, safely ignores status/non-text provider events plus Telegram `callback_query` updates, and calls backend only for normalized text commands.
- `WF-03_Outbound_Message_Dispatch`: requires `x-dispatch-secret`, sends queued outbound messages through Meta WhatsApp Cloud API or Telegram Bot API, and reports provider accept/fail result to backend.
- `WF-04_Ready_Reminder_Scheduler`: calls backend for due `ready_pickup` and `ready_not_collected` reminders and dispatches returned outbound jobs.
- `WF-05_Revision_Reminder_Scheduler`: calls backend for due revision reminders and dispatches returned outbound jobs.
- `WF-06_Document_Worker`: calls backend document worker. Backend owns claim, deterministic minimal PDF generation, private Supabase Storage upload, and final document status updates.
- `WF-07_Intake_Expiry_Cleanup`: calls backend expired-intake cleanup.
- `WF-08_Outbound_Recovery_Scheduler`: calls backend stuck-dispatch recovery and re-dispatches returned outbound jobs.

All committed workflow JSON exports are stored inactive (`active: false`) and must be activated by the operator only after environment variables and secrets are configured.

## Deprecated Workflow

- `WF-02_Command_Router`: deprecated. Command parsing and command routing are backend-owned because they affect durable domain state.

## Provider Choices

- WhatsApp: Meta WhatsApp Cloud API.
- Telegram: Telegram Bot API.

## Internal Backend Calls

Every n8n call to backend includes:

```text
x-internal-secret: {{$env.Criccheto_INTERNAL_API_SECRET}}
```

Every call to WF-03 from another n8n workflow includes:

```text
x-dispatch-secret: {{$env.Criccheto_N8N_DISPATCH_SECRET}}
```

Used endpoints:

- `POST /api/internal/messages/process-inbound`
- `POST /api/internal/messages/send-outbound-result`
- `POST /api/internal/reminders/run`
- `POST /api/internal/documents/run`
- `POST /api/internal/intake/expire-cleanup`
- `POST /api/internal/outbound/recover-stuck`

## Inbound Command Flow

1. Provider sends inbound webhook to WF-01.
2. WF-01 verifies the trusted ingress marker for WhatsApp POSTs, normalizes provider-specific payloads, and returns `ignored` for provider status callbacks, Telegram `callback_query` updates, or unsupported non-text events.
3. WF-01 calls backend `/api/internal/messages/process-inbound` only for normalized command text.
4. Backend logs inbound idempotently, parses command, mutates state, queues outbound messages.
5. WF-01 sends queued outbound messages to WF-03.
6. WF-03 dispatches provider messages and reports provider result to backend.

## Reminder Flow

1. WF-04/WF-05 schedule triggers run.
2. Workflow calls backend `/api/internal/reminders/run` with explicit `reminderTypes`.
3. Backend selects due reminders and returns `queued` outbound jobs shaped as `{ messageLogId, channel, provider, recipientIdentifier, text, relatedReminderId }`.
4. Workflow sends returned queued jobs to WF-03.
5. WF-03 dispatches and reports result.
6. WF-08 periodically calls `/api/internal/outbound/recover-stuck` to recover stale `queued`/`sending` outbound rows and stale reminder dispatches.

Current runtime note: `recipient_policy = both` can return two queued outbound jobs for the same `relatedReminderId`. WF-04 and WF-05 dispatch every queued item returned by backend.

## Document Flow

WF-06 calls `/api/internal/documents/run`.

Current repo state: backend claims pending document rows, generates deterministic minimal PDFs, uploads them to private Supabase Storage, and updates rows to `ready` or `failed`. n8n only schedules the worker.

Expected backend response:

```json
{
  "ok": true,
  "claimed": 1,
  "processed": 1,
  "failed": 0,
  "documents": [
    {
      "id": "uuid",
      "status": "ready",
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

## Channel Identity Semantics

- WhatsApp inbound `senderIdentifier` is the end-user WhatsApp identifier; `recipientIdentifier` is the workshop route key, normally the Meta phone number ID.
- Telegram inbound `senderIdentifier` is the Telegram chat ID.
- Telegram inbound `recipientIdentifier` is the stable bot route key used in `workshop_channels.recipient_identifier`; the committed seed/runtime default is `Cricchetto_bot` unless a consistent upstream bot identifier is injected.
- Telegram `callback_query` updates are acknowledged as ignored and are not forwarded to backend command processing.

## Security Assumptions

- Telegram webhook secret is checked in WF-01 when configured.
- WhatsApp verification challenge is handled in WF-01.
- WhatsApp request signature verification must be enforced upstream before n8n because Meta HMAC validation requires the exact raw request body. The trusted upstream verifier forwards only verified WhatsApp POST requests with `x-upstream-verified-meta-signature: 1`; WF-01 rejects WhatsApp POSTs without that header. The deprecated backend fallback webhook verifies `x-hub-signature-256` with Node.js `crypto` and `Criccheto_WHATSAPP_APP_SECRET`.
- WF-03 reports `accepted` or `failed` only. WhatsApp delivery callbacks are not implemented in this package. Telegram Bot API delivery callbacks are not available for this MVP path.

