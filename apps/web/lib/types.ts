export const WORK_ORDER_STATUSES = [
  "accepted",
  "in_progress",
  "ready",
  "collected",
  "archived",
] as const;

export const ACTIVE_WORK_ORDER_STATUSES = [
  "accepted",
  "in_progress",
  "ready",
] as const;

export const CHANNELS = ["whatsapp", "telegram_test"] as const;

export const PARSE_STATUSES = [
  "received",
  "duplicate",
  "parsed",
  "continued_intake",
  "malformed",
  "unknown_command",
  "validation_failed",
  "not_found",
  "conflict",
  "processed",
  "ignored",
  "error",
] as const;

export const PROVIDER_STATUSES = [
  "queued",
  "sending",
  "accepted",
  "delivered",
  "failed",
  "skipped",
] as const;

export const REMINDER_TYPES = [
  "ready_pickup",
  "ready_not_collected",
  "revision_due_35d",
  "revision_due_30d",
  "revision_due_7d",
  "revision_due_1d",
] as const;

export const RECIPIENT_POLICIES = [
  "mechanic_only",
  "customer_only",
  "both",
] as const;

export const DOCUMENT_TYPES = [
  "intake_acceptance",
  "estimate",
  "final_summary",
] as const;

export const DOCUMENT_STATUSES = [
  "pending",
  "generating",
  "ready",
  "failed",
  "void",
] as const;

export const ATTACHMENT_TYPES = [
  "photo",
  "document",
  "audio",
  "other",
] as const;

export type WorkOrderStatus = (typeof WORK_ORDER_STATUSES)[number];
export type ActiveWorkOrderStatus = (typeof ACTIVE_WORK_ORDER_STATUSES)[number];
export type Channel = (typeof CHANNELS)[number];
export type ParseStatus = (typeof PARSE_STATUSES)[number];
export type ProviderStatus = (typeof PROVIDER_STATUSES)[number];
export type ReminderType = (typeof REMINDER_TYPES)[number];
export type RecipientPolicy = (typeof RECIPIENT_POLICIES)[number];
export type DocumentType = (typeof DOCUMENT_TYPES)[number];
export type DocumentStatus = (typeof DOCUMENT_STATUSES)[number];
export type AttachmentType = (typeof ATTACHMENT_TYPES)[number];

export type IntakeStep =
  | "vehicle_model"
  | "reported_issue"
  | "kilometers"
  | "customer_name"
  | "customer_phone";

export type CommandKind =
  | "NUOVA"
  | "STATO"
  | "NOTA"
  | "RICAMBIO"
  | "MANODOPERA"
  | "CHIUDI"
  | "RITIRATA"
  | "REVISIONE_LOOKUP"
  | "REVISIONE_UPDATE"
  | "REVISIONIINSCADENZA"
  | "CERCA"
  | "INVIA_DOCUMENTO";

export interface NormalizedInboundMessage {
  channel: Channel;
  provider: string;
  providerMessageId: string;
  senderIdentifier: string;
  recipientIdentifier: string;
  text: string;
  rawPayload?: unknown;
  attachments?: NormalizedInboundAttachment[];
}

export interface NormalizedInboundAttachment {
  attachmentType: AttachmentType;
  providerMediaId?: string;
  providerFileId?: string;
  providerFileUniqueId?: string;
  filename?: string | null;
  mimeType?: string | null;
  fileSize?: number | null;
  caption?: string | null;
}

export interface OutboundMessageRequest {
  workshopId: string;
  channel: Channel;
  provider: string;
  senderIdentifier?: string;
  recipientIdentifier: string;
  text: string;
  idempotencyKey: string;
  relatedWorkOrderId?: string;
  relatedReminderId?: string;
  relatedDocumentId?: string;
}

export interface QueuedOutboundMessage {
  messageLogId: string;
  channel: Channel;
  provider: string;
  senderIdentifier?: string;
  recipientIdentifier: string;
  text: string;
  relatedWorkOrderId?: string;
  relatedReminderId?: string;
  relatedDocumentId?: string;
}

export interface ProviderSendResult {
  accepted: boolean;
  providerMessageId?: string;
  errorMessage?: string;
}

export type CommandEffectType =
  | "insert_note"
  | "insert_work_order_item"
  | "update_work_order_status"
  | "enqueue_document"
  | "schedule_reminder"
  | "schedule_pickup_notification"
  | "cancel_reminders"
  | "write_audit";

export interface CommandEffect {
  type: CommandEffectType;
  payload: Record<string, unknown>;
}

export interface CommandExecutionResult {
  parseStatus?: ParseStatus;
  relatedWorkOrderId?: string;
  replies: Array<Omit<OutboundMessageRequest, "workshopId" | "channel" | "provider">>;
  effects?: CommandEffect[];
  attachmentContext?: { kind: "intake" | "work_order"; id: string };
}

export interface DashboardMutationEnvelope<TChanges> {
  expectedRowVersion: number;
  changes: TChanges;
}

export interface WorkshopRoute {
  workshopId: string;
  channel: Channel;
  provider: string;
  recipientIdentifier: string;
  senderIdentifier?: string;
  providerConfig: Record<string, unknown>;
}

export interface InboundProcessingResult {
  ok: boolean;
  duplicate?: boolean;
  parseStatus?: ParseStatus;
  relatedWorkOrderId?: string;
  outboundMessages: QueuedOutboundMessage[];
}
