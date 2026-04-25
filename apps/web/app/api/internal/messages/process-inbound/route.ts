import { AppError, getErrorMessage } from "../../../../../lib/errors";
import { requireInternalRequest } from "../../../../../lib/internal-auth";
import { processNormalizedInbound } from "../../../../../lib/messages";
import { CHANNELS } from "../../../../../lib/types";
import type { NormalizedInboundAttachment, NormalizedInboundMessage } from "../../../../../lib/types";

export async function POST(request: Request): Promise<Response> {
  let inboundContext: Partial<NormalizedInboundMessage> | undefined;

  try {
    requireInternalRequest(request);
    const inbound = (await request.json().catch(() => {
      throw new AppError("Malformed JSON", { statusCode: 400, parseStatus: "malformed" });
    })) as NormalizedInboundMessage;
    inboundContext = inbound;
    if (
      !inbound
      || !CHANNELS.includes(inbound.channel)
      || typeof inbound.provider !== "string"
      || !inbound.provider
      || typeof inbound.providerMessageId !== "string"
      || !inbound.providerMessageId
      || typeof inbound.senderIdentifier !== "string"
      || !inbound.senderIdentifier
      || typeof inbound.recipientIdentifier !== "string"
      || !inbound.recipientIdentifier
      || typeof inbound.text !== "string"
      || !hasValidRawPayload(inbound.rawPayload)
      || !hasTextOrAttachments(inbound)
      || !hasValidAttachmentShape(inbound.attachments)
    ) {
      throw new AppError("Invalid normalized inbound payload", { statusCode: 400, parseStatus: "validation_failed" });
    }
    const result = await processNormalizedInbound(inbound);
    return Response.json(result);
  } catch (error) {
    console.error("[internal.messages.process-inbound] request_failed", {
      channel: inboundContext?.channel,
      provider: inboundContext?.provider,
      providerMessageId: inboundContext?.providerMessageId,
      senderIdentifier: inboundContext?.senderIdentifier,
      recipientIdentifier: inboundContext?.recipientIdentifier,
      textLength: typeof inboundContext?.text === "string" ? inboundContext.text.length : undefined,
      attachmentCount: Array.isArray(inboundContext?.attachments) ? inboundContext.attachments.length : undefined,
      parseStatus: error instanceof AppError ? error.parseStatus : "error",
      errorMessage: getErrorMessage(error),
      errorStack: error instanceof Error ? error.stack : undefined,
    });
    const status = error instanceof AppError ? error.statusCode : 500;
    return Response.json({ ok: false, error: getErrorMessage(error) }, { status });
  }
}

function hasTextOrAttachments(inbound: Partial<NormalizedInboundMessage>): boolean {
  const hasText = typeof inbound.text === "string" && inbound.text.trim().length > 0;
  const hasAttachments = Array.isArray(inbound.attachments) && inbound.attachments.length > 0;
  return hasText || hasAttachments;
}

function hasValidRawPayload(rawPayload: unknown): boolean {
  if (rawPayload === undefined || rawPayload === null) {
    return true;
  }
  return typeof rawPayload === "object";
}

function hasValidAttachmentShape(attachments: unknown): attachments is NormalizedInboundAttachment[] | undefined {
  if (attachments === undefined) {
    return true;
  }
  if (!Array.isArray(attachments)) {
    return false;
  }

  return attachments.every((attachment) => (
    attachment
    && typeof attachment === "object"
    && typeof attachment.attachmentType === "string"
    && ["photo", "document", "audio", "other"].includes(attachment.attachmentType)
    && (attachment.providerMediaId === undefined || attachment.providerMediaId === null || typeof attachment.providerMediaId === "string")
    && (attachment.providerFileId === undefined || attachment.providerFileId === null || typeof attachment.providerFileId === "string")
    && (attachment.providerFileUniqueId === undefined || attachment.providerFileUniqueId === null || typeof attachment.providerFileUniqueId === "string")
    && (attachment.filename === undefined || attachment.filename === null || typeof attachment.filename === "string")
    && (attachment.mimeType === undefined || attachment.mimeType === null || typeof attachment.mimeType === "string")
    && (attachment.fileSize === undefined || attachment.fileSize === null || typeof attachment.fileSize === "number")
    && (attachment.caption === undefined || attachment.caption === null || typeof attachment.caption === "string")
  ));
}
