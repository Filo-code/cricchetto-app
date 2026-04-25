import { randomUUID } from "node:crypto";
import { Buffer } from "node:buffer";
import { writeAuditEvent } from "../audit";
import { AppError } from "../errors";
import { supabaseServer } from "../supabase-server";
import type { AttachmentType, NormalizedInboundAttachment, NormalizedInboundMessage } from "../types";

const ATTACHMENTS_BUCKET = process.env.Criccheto_ATTACHMENTS_BUCKET || "attachments";
const MAX_ATTACHMENT_BYTES = 25 * 1024 * 1024;

type AttachmentActorType = "mechanic" | "dashboard_user" | "system";

interface StoredAttachmentRow {
  id: string;
  attachment_type: AttachmentType;
  filename: string | null;
  mime_type: string | null;
  created_at: string;
  metadata: Record<string, unknown> | null;
}

interface ResolvedAttachmentFile {
  bytes: Buffer;
  mimeType: string | null;
  filename: string | null;
  fileSize: number | null;
}

export async function saveInboundAttachments(input: {
  workshopId: string;
  inbound: NormalizedInboundMessage;
  messageLogId: string;
  intakeSessionId?: string;
  workOrderId?: string;
  actorRef?: string;
}): Promise<number> {
  const attachments = input.inbound.attachments ?? [];
  if (attachments.length === 0) {
    return 0;
  }

  const capturedAt = extractCapturedAt(input.inbound);
  let stored = 0;

  for (let index = 0; index < attachments.length; index += 1) {
    const attachment = attachments[index];
    const file = await resolveInboundAttachmentFile(input.inbound, attachment);
    assertAttachmentSize(file.fileSize ?? file.bytes.byteLength);
    const filename = sanitizeFilename(
      file.filename
      ?? attachment.filename
      ?? defaultAttachmentFilename(input.inbound, attachment, index),
    );
    const storagePath = buildStoragePath({
      workshopId: input.workshopId,
      scope: "inbound",
      workOrderId: input.workOrderId,
      messageId: input.inbound.providerMessageId,
      filename,
    });
    const mimeType = file.mimeType ?? attachment.mimeType ?? defaultMimeType(attachment.attachmentType);

    const { error: uploadError } = await supabaseServer.storage
      .from(ATTACHMENTS_BUCKET)
      .upload(storagePath, file.bytes, {
        contentType: mimeType ?? undefined,
        upsert: false,
      });

    if (uploadError) {
      throw new AppError(`Failed to upload attachment: ${uploadError.message}`, {
        statusCode: 502,
        parseStatus: "error",
        publicMessage: "Allegato non disponibile.\nRiprova tra poco.",
      });
    }

    const { error: insertError } = await supabaseServer
      .from("attachments")
      .insert({
        workshop_id: input.workshopId,
        work_order_id: input.workOrderId ?? null,
        intake_session_id: input.intakeSessionId ?? null,
        message_log_id: input.messageLogId,
        attachment_type: attachment.attachmentType,
        storage_bucket: ATTACHMENTS_BUCKET,
        storage_path: storagePath,
        mime_type: mimeType,
        filename,
        created_by: input.actorRef ?? input.inbound.senderIdentifier,
        captured_at: capturedAt,
        metadata: buildInboundAttachmentMetadata(input.inbound, attachment, file),
      });

    if (insertError) {
      throw new Error(`Failed to save attachment row: ${insertError.message}`);
    }

    stored += 1;
  }

  return stored;
}

export async function attachMessageAttachmentsToIntake(input: {
  workshopId: string;
  messageLogId: string;
  intakeSessionId: string;
}): Promise<number> {
  const { data, error } = await supabaseServer
    .from("attachments")
    .update({ intake_session_id: input.intakeSessionId })
    .eq("workshop_id", input.workshopId)
    .eq("message_log_id", input.messageLogId)
    .is("intake_session_id", null)
    .select("id");

  if (error) {
    throw new Error(`Failed to attach message attachments to intake: ${error.message}`);
  }

  return data?.length ?? 0;
}

export async function attachMessageAttachmentsToWorkOrder(input: {
  workshopId: string;
  messageLogId: string;
  workOrderId: string;
  actorType: AttachmentActorType;
  actorRef?: string;
}): Promise<number> {
  const updated = await updateAttachmentsWorkOrder({
    workshopId: input.workshopId,
    workOrderId: input.workOrderId,
    actorType: input.actorType,
    actorRef: input.actorRef,
    query: supabaseServer
      .from("attachments")
      .update({ work_order_id: input.workOrderId })
      .eq("workshop_id", input.workshopId)
      .eq("message_log_id", input.messageLogId)
      .is("work_order_id", null),
  });

  return updated.length;
}

export async function linkIntakeAttachmentsToWorkOrder(input: {
  workshopId: string;
  intakeSessionId: string;
  workOrderId: string;
  actorType: AttachmentActorType;
  actorRef?: string;
}): Promise<number> {
  const updated = await updateAttachmentsWorkOrder({
    workshopId: input.workshopId,
    workOrderId: input.workOrderId,
    actorType: input.actorType,
    actorRef: input.actorRef,
    query: supabaseServer
      .from("attachments")
      .update({ work_order_id: input.workOrderId })
      .eq("workshop_id", input.workshopId)
      .eq("intake_session_id", input.intakeSessionId)
      .is("work_order_id", null),
  });

  return updated.length;
}

export async function uploadDashboardAttachment(input: {
  workshopId: string;
  workOrderId: string;
  actorRef: string;
  file: File;
}): Promise<void> {
  if (!(input.file instanceof File) || input.file.size <= 0) {
    throw new AppError("Missing dashboard attachment file", {
      statusCode: 400,
      parseStatus: "validation_failed",
      publicMessage: "Seleziona un file prima di caricare.",
    });
  }

  assertAttachmentSize(input.file.size);
  const attachmentType = classifyDashboardAttachment(input.file);

  const filename = sanitizeFilename(input.file.name || `dashboard_${Date.now()}`);
  const storagePath = buildStoragePath({
    workshopId: input.workshopId,
    scope: "dashboard",
    workOrderId: input.workOrderId,
    filename,
  });
  const bytes = Buffer.from(await input.file.arrayBuffer());

  const { error: uploadError } = await supabaseServer.storage
    .from(ATTACHMENTS_BUCKET)
    .upload(storagePath, bytes, {
      contentType: input.file.type || undefined,
      upsert: false,
    });

  if (uploadError) {
    throw new Error(`Failed to upload dashboard attachment: ${uploadError.message}`);
  }

  const { data, error } = await supabaseServer
    .from("attachments")
    .insert({
      workshop_id: input.workshopId,
      work_order_id: input.workOrderId,
      message_log_id: null,
      attachment_type: attachmentType,
      storage_bucket: ATTACHMENTS_BUCKET,
      storage_path: storagePath,
      mime_type: input.file.type || null,
      filename,
      created_by: input.actorRef,
      captured_at: new Date().toISOString(),
      metadata: {
        source: "dashboard",
        fileSize: input.file.size,
        originalFilename: input.file.name || null,
      },
    })
    .select("id,attachment_type,filename,mime_type,created_at,metadata")
    .single();

  if (error) {
    throw new Error(`Failed to save dashboard attachment row: ${error.message}`);
  }

  await writeAttachmentAuditEvent({
    workshopId: input.workshopId,
    workOrderId: input.workOrderId,
    actorType: "dashboard_user",
    actorRef: input.actorRef,
    attachment: data,
  });
}

async function updateAttachmentsWorkOrder(input: {
  workshopId: string;
  workOrderId: string;
  actorType: AttachmentActorType;
  actorRef?: string;
  query: any;
}): Promise<StoredAttachmentRow[]> {
  const { data, error } = await (input.query as any)
    .select("id,attachment_type,filename,mime_type,created_at,metadata");

  if (error) {
    throw new Error(`Failed to update attachment work order: ${error.message}`);
  }

  const updated = (data ?? []) as StoredAttachmentRow[];
  for (const attachment of updated) {
    await writeAttachmentAuditEvent({
      workshopId: input.workshopId,
      workOrderId: input.workOrderId,
      actorType: input.actorType,
      actorRef: input.actorRef,
      attachment,
    });
  }

  return updated;
}

async function writeAttachmentAuditEvent(input: {
  workshopId: string;
  workOrderId: string;
  actorType: AttachmentActorType;
  actorRef?: string;
  attachment: StoredAttachmentRow;
}): Promise<void> {
  await writeAuditEvent({
    workshopId: input.workshopId,
    workOrderId: input.workOrderId,
    eventType: "attachment_added",
    actorType: input.actorType,
    actorRef: input.actorRef,
    after: {
      attachment_id: input.attachment.id,
      attachment_type: input.attachment.attachment_type,
      filename: input.attachment.filename,
      mime_type: input.attachment.mime_type,
      source: typeof input.attachment.metadata?.source === "string" ? input.attachment.metadata.source : null,
    },
  });
}

async function resolveInboundAttachmentFile(
  inbound: NormalizedInboundMessage,
  attachment: NormalizedInboundAttachment,
): Promise<ResolvedAttachmentFile> {
  if (inbound.channel === "telegram_test") {
    return downloadTelegramAttachment(inbound, attachment);
  }
  if (inbound.channel === "whatsapp") {
    return downloadWhatsAppAttachment(inbound, attachment);
  }

  throw new Error(`Unsupported attachment channel: ${inbound.channel}`);
}

async function downloadTelegramAttachment(
  inbound: NormalizedInboundMessage,
  attachment: NormalizedInboundAttachment,
): Promise<ResolvedAttachmentFile> {
  const token = process.env.Criccheto_TELEGRAM_BOT_TOKEN;
  if (!token) {
    throw new AppError("Criccheto_TELEGRAM_BOT_TOKEN is required for Telegram attachments", {
      statusCode: 500,
      parseStatus: "error",
      publicMessage: "Allegato Telegram non disponibile.\nRiprova tra poco.",
    });
  }
  if (!attachment.providerFileId) {
    throw new AppError("Missing Telegram attachment file id", {
      statusCode: 400,
      parseStatus: "validation_failed",
      publicMessage: "Allegato Telegram non valido.",
    });
  }

  const metadataResponse = await fetch(
    `https://api.telegram.org/bot${token}/getFile?file_id=${encodeURIComponent(attachment.providerFileId)}`,
    { cache: "no-store" },
  );
  if (!metadataResponse.ok) {
    throw new AppError(`Telegram getFile failed with ${metadataResponse.status}`, {
      statusCode: 502,
      parseStatus: "error",
      publicMessage: "Allegato Telegram non disponibile.\nRiprova tra poco.",
    });
  }

  const metadata = await metadataResponse.json().catch(() => ({}));
  const filePath = typeof metadata?.result?.file_path === "string" ? metadata.result.file_path : null;
  if (!filePath) {
    throw new AppError("Telegram attachment file path is missing", {
      statusCode: 502,
      parseStatus: "error",
      publicMessage: "Allegato Telegram non disponibile.\nRiprova tra poco.",
    });
  }

  const downloadResponse = await fetch(`https://api.telegram.org/file/bot${token}/${filePath}`, { cache: "no-store" });
  if (!downloadResponse.ok) {
    throw new AppError(`Telegram file download failed with ${downloadResponse.status}`, {
      statusCode: 502,
      parseStatus: "error",
      publicMessage: "Allegato Telegram non disponibile.\nRiprova tra poco.",
    });
  }

  const bytes = Buffer.from(await downloadResponse.arrayBuffer());
  return {
    bytes,
    mimeType: attachment.mimeType ?? downloadResponse.headers.get("content-type"),
    filename: attachment.filename ?? filePath.split("/").pop() ?? null,
    fileSize: attachment.fileSize ?? bytes.byteLength,
  };
}

async function downloadWhatsAppAttachment(
  _inbound: NormalizedInboundMessage,
  attachment: NormalizedInboundAttachment,
): Promise<ResolvedAttachmentFile> {
  const accessToken = process.env.Criccheto_WHATSAPP_ACCESS_TOKEN;
  const baseUrl = (process.env.Criccheto_WHATSAPP_GRAPH_API_BASE_URL || "https://graph.facebook.com/v20.0").replace(/\/$/, "");
  if (!accessToken) {
    throw new AppError("Criccheto_WHATSAPP_ACCESS_TOKEN is required for WhatsApp attachments", {
      statusCode: 500,
      parseStatus: "error",
      publicMessage: "Allegato WhatsApp non disponibile.\nRiprova tra poco.",
    });
  }
  if (!attachment.providerMediaId) {
    throw new AppError("Missing WhatsApp attachment media id", {
      statusCode: 400,
      parseStatus: "validation_failed",
      publicMessage: "Allegato WhatsApp non valido.",
    });
  }

  const metadataResponse = await fetch(`${baseUrl}/${encodeURIComponent(attachment.providerMediaId)}`, {
    cache: "no-store",
    headers: {
      Authorization: `Bearer ${accessToken}`,
    },
  });
  if (!metadataResponse.ok) {
    throw new AppError(`WhatsApp media lookup failed with ${metadataResponse.status}`, {
      statusCode: 502,
      parseStatus: "error",
      publicMessage: "Allegato WhatsApp non disponibile.\nRiprova tra poco.",
    });
  }

  const metadata = await metadataResponse.json().catch(() => ({}));
  const mediaUrl = typeof metadata?.url === "string" ? metadata.url : null;
  if (!mediaUrl) {
    throw new AppError("WhatsApp media URL is missing", {
      statusCode: 502,
      parseStatus: "error",
      publicMessage: "Allegato WhatsApp non disponibile.\nRiprova tra poco.",
    });
  }

  const downloadResponse = await fetch(mediaUrl, {
    cache: "no-store",
    headers: {
      Authorization: `Bearer ${accessToken}`,
    },
  });
  if (!downloadResponse.ok) {
    throw new AppError(`WhatsApp media download failed with ${downloadResponse.status}`, {
      statusCode: 502,
      parseStatus: "error",
      publicMessage: "Allegato WhatsApp non disponibile.\nRiprova tra poco.",
    });
  }

  const bytes = Buffer.from(await downloadResponse.arrayBuffer());
  return {
    bytes,
    mimeType: attachment.mimeType ?? (typeof metadata?.mime_type === "string" ? metadata.mime_type : null) ?? downloadResponse.headers.get("content-type"),
    filename: attachment.filename ?? (typeof metadata?.file_name === "string" ? metadata.file_name : null),
    fileSize: attachment.fileSize ?? normalizeNumber(metadata?.file_size) ?? bytes.byteLength,
  };
}

function buildInboundAttachmentMetadata(
  inbound: NormalizedInboundMessage,
  attachment: NormalizedInboundAttachment,
  file: ResolvedAttachmentFile,
): Record<string, unknown> {
  return {
    source: inbound.channel,
    provider: inbound.provider,
    providerMessageId: inbound.providerMessageId,
    providerMediaId: attachment.providerMediaId ?? null,
    providerFileId: attachment.providerFileId ?? null,
    providerFileUniqueId: attachment.providerFileUniqueId ?? null,
    originalMimeType: attachment.mimeType ?? file.mimeType,
    fileSize: file.fileSize ?? null,
    caption: attachment.caption ?? null,
    transcriptionStatus: attachment.attachmentType === "audio" ? "not_configured" : null,
  };
}

function extractCapturedAt(inbound: NormalizedInboundMessage): string | null {
  const raw = (inbound.rawPayload ?? {}) as Record<string, unknown>;
  if (inbound.channel === "telegram_test") {
    const message = (raw.message ?? raw.edited_message) as Record<string, unknown> | undefined;
    const unix = normalizeNumber(message?.date);
    return unix ? new Date(unix * 1000).toISOString() : null;
  }
  if (inbound.channel === "whatsapp") {
    const message = (((raw.entry as any)?.[0]?.changes?.[0]?.value?.messages as any)?.[0] ?? null) as Record<string, unknown> | null;
    const unix = normalizeNumber(message?.timestamp);
    return unix ? new Date(unix * 1000).toISOString() : null;
  }
  return null;
}

function classifyDashboardAttachment(file: File): AttachmentType {
  const name = file.name.toLowerCase();
  const mime = file.type.toLowerCase();
  if (mime.startsWith("image/")) {
    return "photo";
  }
  if (mime.startsWith("audio/") || /\.(mp3|wav|ogg|m4a|aac|opus)$/i.test(name)) {
    return "audio";
  }
  if (mime.startsWith("application/") || mime.startsWith("text/") || /\.(pdf|doc|docx|xls|xlsx|txt|zip)$/i.test(name)) {
    return "document";
  }
  return "other";
}

function assertAttachmentSize(size: number): void {
  if (!Number.isFinite(size) || size <= 0 || size > MAX_ATTACHMENT_BYTES) {
    throw new AppError("Attachment exceeds size limit", {
      statusCode: 400,
      parseStatus: "validation_failed",
      publicMessage: "Allegato troppo grande o non valido.",
    });
  }
}

function buildStoragePath(input: {
  workshopId: string;
  scope: "dashboard" | "inbound";
  filename: string;
  workOrderId?: string;
  messageId?: string;
}): string {
  const safeFilename = sanitizeFilename(input.filename);
  if (input.scope === "dashboard") {
    return `${input.workshopId}/dashboard/work-orders/${input.workOrderId ?? "unknown"}/${Date.now()}-${randomUUID()}-${safeFilename}`;
  }

  return `${input.workshopId}/inbound/${input.messageId ?? randomUUID()}/${randomUUID()}-${safeFilename}`;
}

function sanitizeFilename(filename: string): string {
  const cleaned = filename
    .trim()
    .normalize("NFKD")
    .replace(/[^\w.\-]+/g, "_")
    .replace(/_+/g, "_")
    .replace(/^_+|_+$/g, "");

  return cleaned || `attachment_${Date.now()}`;
}

function defaultAttachmentFilename(
  inbound: NormalizedInboundMessage,
  attachment: NormalizedInboundAttachment,
  index: number,
): string {
  const base = `${inbound.channel}_${inbound.providerMessageId}_${index + 1}`;
  const extension = fileExtensionForMime(attachment.mimeType ?? defaultMimeType(attachment.attachmentType));
  return `${base}${extension}`;
}

function defaultMimeType(type: AttachmentType): string | null {
  if (type === "photo") return "image/jpeg";
  if (type === "audio") return "audio/ogg";
  if (type === "document") return "application/octet-stream";
  return null;
}

function fileExtensionForMime(mimeType: string | null | undefined): string {
  const normalized = (mimeType ?? "").toLowerCase();
  if (normalized.includes("jpeg") || normalized.includes("jpg")) return ".jpg";
  if (normalized.includes("png")) return ".png";
  if (normalized.includes("webp")) return ".webp";
  if (normalized.includes("mp4")) return ".mp4";
  if (normalized.includes("quicktime")) return ".mov";
  if (normalized.includes("pdf")) return ".pdf";
  if (normalized.includes("mpeg") || normalized.includes("mp3")) return ".mp3";
  if (normalized.includes("ogg") || normalized.includes("opus")) return ".ogg";
  if (normalized.includes("wav")) return ".wav";
  if (normalized.includes("plain")) return ".txt";
  return "";
}

function normalizeNumber(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }
  if (typeof value === "string" && value.trim()) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}
