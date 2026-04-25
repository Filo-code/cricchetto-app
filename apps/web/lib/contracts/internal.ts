import type { Channel, NormalizedInboundAttachment, ParseStatus, ProviderStatus, ReminderType } from "../types";

export interface InternalErrorResponse {
  ok: false;
  error: string;
}

export interface InternalQueuedOutboundMessage {
  messageLogId: string;
  channel: Channel;
  provider: string;
  recipientIdentifier: string;
  text: string;
  senderIdentifier?: string;
  relatedWorkOrderId?: string;
  relatedReminderId?: string;
  relatedDocumentId?: string;
}

export interface InternalProcessInboundRequest {
  channel: Channel;
  provider: string;
  providerMessageId: string;
  senderIdentifier: string;
  recipientIdentifier: string;
  text: string;
  rawPayload?: Record<string, unknown>;
  attachments?: NormalizedInboundAttachment[];
}

export interface InternalProcessInboundResponse {
  ok: true;
  parseStatus?: ParseStatus;
  relatedWorkOrderId?: string;
  outboundMessages: InternalQueuedOutboundMessage[];
}

export interface InternalProcessInboundDuplicateResponse {
  ok: true;
  duplicate: true;
  outboundMessages: [];
}

export type InternalProcessInboundResult =
  | InternalProcessInboundResponse
  | InternalProcessInboundDuplicateResponse;

export interface InternalIgnoredProviderEventResponse {
  ignored: true;
  reason:
    | "whatsapp_status_event"
    | "unsupported_whatsapp_payload"
    | "unsupported_whatsapp_message_type"
    | "unsupported_telegram_message_type"
    | "unsupported_telegram_callback"
    | "unsupported_telegram_update";
}

export interface InternalOutboundSendingRequest {
  messageLogId: string;
  providerStatus: Extract<ProviderStatus, "sending">;
}

export type InternalOutboundResultRequest =
  | {
      messageLogId: string;
      providerStatus: Extract<ProviderStatus, "accepted">;
      providerMessageId: string;
    }
  | {
      messageLogId: string;
      providerStatus: Extract<ProviderStatus, "failed">;
      errorMessage: string;
    };

export type InternalSendOutboundResultRequest =
  | InternalOutboundSendingRequest
  | InternalOutboundResultRequest;

export interface InternalOkResponse {
  ok: true;
}

export interface InternalReminderRunRequest {
  limit?: number;
  reminderTypes?: ReminderType[];
}

export interface InternalReminderRunResponse {
  ok: true;
  queued: InternalQueuedReminderMessage[];
}

export interface InternalQueuedReminderMessage {
  messageLogId: string;
  channel: Channel;
  provider: string;
  recipientIdentifier: string;
  text: string;
  relatedReminderId: string;
}

export interface InternalDocumentRunRequest {
  limit?: number;
}

export interface InternalDocumentRunResponse {
  ok: true;
  claimed: number;
  processed: number;
  failed: number;
  documents: InternalDocumentRunItem[];
}

export type InternalDocumentRunItem =
  | {
      id: string;
      status: "ready";
      document_type: string;
      work_order_id: string;
      version: number;
      storage_bucket: string;
      storage_path: string;
      filename: string;
    }
  | {
      id: string;
      status: "failed";
      document_type: string;
      work_order_id: string;
      version: number;
      errorMessage: string;
    };

export interface InternalIntakeExpireCleanupResponse {
  ok: true;
  expired: number;
}

export type InternalIntakeExpireCleanupRequest = Record<string, never>;
