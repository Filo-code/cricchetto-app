# Internal API Contracts

All endpoints in this file are backend-internal endpoints called by n8n only.

Required request header for backend endpoints:

```text
x-internal-secret: <Criccheto_INTERNAL_API_SECRET>
```

Standard error response:

```json
{
  "ok": false,
  "error": "short error message"
}
```

Status codes:

- `200`: accepted and processed, including duplicate-safe no-op responses.
- `400`: malformed request body.
- `401`: missing or invalid internal secret.
- `404`: referenced internal row not found, for example an outbound message result for an unknown `messageLogId`.
- `500`: unexpected backend error or missing required backend environment.

WF-03 is an n8n webhook, not a backend endpoint. It additionally requires:

```text
x-dispatch-secret: <Criccheto_N8N_DISPATCH_SECRET>
```

## Ignored Provider Event Shape

WF-01 returns this directly and does not call backend:

```json
{
  "ignored": true,
  "reason": "whatsapp_status_event"
}
```

Allowed `reason` values:

- `whatsapp_status_event`
- `unsupported_whatsapp_payload`
- `unsupported_whatsapp_message_type`
- `unsupported_telegram_message_type`
- `unsupported_telegram_callback`
- `unsupported_telegram_update`

## POST /api/internal/messages/process-inbound

Request:

```json
{
  "channel": "whatsapp",
  "provider": "meta_whatsapp_cloud_api",
  "providerMessageId": "wamid...",
  "senderIdentifier": "393331234567",
  "recipientIdentifier": "123456789",
  "text": "STATO AB123CD",
  "rawPayload": {}
}
```

Request rules:

- Body must be a JSON object.
- `channel`, `provider`, `providerMessageId`, `senderIdentifier`, `recipientIdentifier`, and `text` are required non-empty strings.
- `rawPayload` is required and must be a JSON object.

Identifier semantics:

- WhatsApp: `senderIdentifier` is the end-user/provider sender identifier; `recipientIdentifier` is the workshop route key, normally the Meta phone number ID.
- Telegram: `senderIdentifier` is the chat ID; `recipientIdentifier` is the stable bot route key stored in `workshop_channels.recipient_identifier`. The committed seed/runtime default is `Cricchetto_bot`.
- WF-01 ignores Telegram `callback_query` updates and does not send them to this endpoint.

Success response:

```json
{
  "ok": true,
  "parseStatus": "processed",
  "relatedWorkOrderId": "optional uuid",
  "outboundMessages": [
    {
      "messageLogId": "uuid",
      "channel": "whatsapp",
      "provider": "meta_whatsapp_cloud_api",
      "recipientIdentifier": "393331234567",
      "text": "Stato AB123CD: ...",
      "relatedWorkOrderId": "optional uuid",
      "relatedReminderId": "optional uuid",
      "relatedDocumentId": "optional uuid"
    }
  ]
}
```

Duplicate-safe response:

```json
{
  "ok": true,
  "duplicate": true,
  "outboundMessages": []
}
```

Duplicate detection uses provider, `recipientIdentifier`, `senderIdentifier`, and `providerMessageId` so Telegram message IDs remain safe even though Telegram `message_id` values are scoped to a chat.

## POST /api/internal/messages/send-outbound-result

Sending marker request:

```json
{
  "messageLogId": "uuid",
  "providerStatus": "sending"
}
```

Accepted provider result request:

```json
{
  "messageLogId": "uuid",
  "providerStatus": "accepted",
  "providerMessageId": "real-provider-message-id"
}
```

Failed provider result request:

```json
{
  "messageLogId": "uuid",
  "providerStatus": "failed",
  "errorMessage": "provider error"
}
```

Request rules:

- Body must be a JSON object.
- `messageLogId` and `providerStatus` are required strings.
- `providerStatus` must be exactly `sending`, `accepted`, or `failed`.
- `accepted` requires a real non-empty `providerMessageId`.
- `failed` requires a non-empty `errorMessage`.

Success response:

```json
{
  "ok": true
}
```

WF-03 reports only `sending`, `accepted`, and `failed`. It does not report `delivered`.

## POST /api/internal/reminders/run

Request:

```json
{
  "limit": 20,
  "reminderTypes": ["ready_pickup", "ready_not_collected"]
}
```

Request rules:

- Body must be a JSON object.
- `limit` is optional and must be an integer between `1` and `50`.
- `reminderTypes` is optional; when omitted or empty, all schema-valid reminder types are eligible.
- When present and non-empty, `reminderTypes` must be an array containing only schema-valid reminder types.

Success response with queued messages:

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

Empty success response:

```json
{
  "ok": true,
  "queued": []
}
```

WF-04 and WF-05 validate each queued item before forwarding it to WF-03.

Reminder recipient behavior:

- `mechanic_only` queues one mechanic-targeted outbound message when a mechanic identifier is configured.
- `customer_only` queues one customer-targeted WhatsApp outbound message when a customer identifier is configured; otherwise it falls back to the mechanic identifier with an explicit fallback notice.
- `both` queues up to two outbound messages, one customer target and one mechanic target.
- Customer-targeted reminder delivery is WhatsApp-only in this runtime. Telegram test reminders use mechanic targets and record skipped customer targets in reminder metadata.
- A reminder is marked `sending` only after at least one outbound message row is queued and the reminder row is still `scheduled`.
- Reminder metadata stores per-target dispatch state in `dispatch_targets`.
- Provider results transition a reminder to `sent` when every required target is accepted, `partial` when at least one target is accepted and at least one target failed or was skipped, and `failed` when no target is accepted.


## POST /api/internal/outbound/recover-stuck

Request:

```json
{
  "limit": 20
}
```

Request rules:

- Body must be a JSON object.
- `limit` is optional and must be an integer between `1` and `50`.
- Backend recovers stale outbound rows in `message_logs.provider_status in ('queued','sending')`.
- Recovery is idempotent at the row level: it reuses the existing `message_logs.id` and does not create a new outbound row.
- Recovery caps retry count and marks exhausted rows `failed`.
- Reminder-linked exhausted rows finalize the related reminder state.

Success response:

```json
{
  "ok": true,
  "scanned": 2,
  "recovered": 1,
  "failed": 1,
  "remindersRecovered": 1,
  "queued": [
    {
      "messageLogId": "uuid",
      "channel": "whatsapp",
      "provider": "meta_whatsapp_cloud_api",
      "recipientIdentifier": "393331234567",
      "text": "Messaggio recuperato"
    }
  ]
}
```

WF-08 validates each returned queued item before forwarding it to WF-03.
## POST /api/internal/documents/run

Request:

```json
{
  "limit": 10
}
```

Request rules:

- Body must be a JSON object.
- `limit` is optional and must be an integer between `1` and `50`.

Success response:

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

Failed document item shape:

```json
{
  "id": "uuid",
  "status": "failed",
  "document_type": "final_summary",
  "work_order_id": "uuid",
  "version": 1,
  "errorMessage": "storage error"
}
```

Empty success response:

```json
{
  "ok": true,
  "claimed": 0,
  "processed": 0,
  "failed": 0,
  "documents": []
}
```

Current repo state: backend owns claim, deterministic minimal PDF generation, private Supabase Storage upload, and final status update. The storage bucket defaults to `documents` and can be overridden with `Criccheto_DOCUMENTS_BUCKET`.

## POST /api/internal/intake/expire-cleanup

Request body: empty.

Success response:

```json
{
  "ok": true,
  "expired": 0
}
```


