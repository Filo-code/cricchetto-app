import { AppError } from "../errors";
import { verifyMetaSha256Signature } from "../crypto";
import type { NormalizedInboundMessage, ProviderSendResult } from "../types";
import type { ProviderAdapter } from "./types";

export const whatsappProvider: ProviderAdapter = {
  channel: "whatsapp",
  async verifyInboundSignature(request: Request, rawBody: string): Promise<void> {
    const appSecret = process.env.Cricchetto_WHATSAPP_APP_SECRET;
    if (!appSecret) {
      throw new AppError("Cricchetto_WHATSAPP_APP_SECRET is required", { statusCode: 500, parseStatus: "error" });
    }

    verifyMetaSha256Signature({
      rawBody,
      signatureHeader: request.headers.get("x-hub-signature-256"),
      appSecret,
    });
  },
  normalizeInboundPayload(rawPayload: any): NormalizedInboundMessage {
    const value = rawPayload.entry?.[0]?.changes?.[0]?.value;
    const metaMessage = value?.messages?.[0];
    const text =
      rawPayload.text
      ?? rawPayload.message?.text
      ?? rawPayload.Body
      ?? metaMessage?.text?.body
      ?? metaMessage?.image?.caption
      ?? metaMessage?.document?.caption
      ?? "";
    const providerMessageId = rawPayload.provider_message_id ?? rawPayload.message?.id ?? rawPayload.MessageSid ?? metaMessage?.id;
    const senderIdentifier = rawPayload.sender ?? rawPayload.from ?? rawPayload.From ?? metaMessage?.from;
    const recipientIdentifier =
      rawPayload.recipient ??
      rawPayload.to ??
      rawPayload.To ??
      value?.metadata?.phone_number_id ??
      process.env.Cricchetto_WHATSAPP_PHONE_NUMBER_ID;
    const provider = rawPayload.provider ?? "meta_whatsapp_cloud_api";
    const attachments = normalizeWhatsAppAttachments(metaMessage);

    if ((!text && attachments.length === 0) || !providerMessageId || !senderIdentifier || !recipientIdentifier) {
      throw new AppError("Invalid WhatsApp payload", {
        parseStatus: "validation_failed",
        publicMessage: "Messaggio WhatsApp non valido.",
      });
    }

    return {
      channel: "whatsapp",
      provider,
      providerMessageId,
      senderIdentifier,
      recipientIdentifier,
      text,
      rawPayload,
      attachments,
    };
  },
  async sendTextMessage(): Promise<ProviderSendResult> {
    // Outbound WhatsApp dispatch is handled entirely by n8n (WF-03).
    // The backend never calls this directly — messages are queued in message_logs
    // with provider_status="queued" and n8n polls and sends them.
    // This method exists to satisfy the ProviderAdapter interface.
    return {
      accepted: false,
      errorMessage: "WhatsApp outbound is dispatched by n8n, not called directly",
    };
  },
};

function normalizeWhatsAppAttachments(message: any): NonNullable<NormalizedInboundMessage["attachments"]> {
  if (!message || typeof message !== "object") {
    return [];
  }

  if (message.type === "image" && message.image?.id) {
    return [{
      attachmentType: "photo",
      providerMediaId: message.image.id,
      mimeType: typeof message.image.mime_type === "string" ? message.image.mime_type : null,
      fileSize: typeof message.image.file_size === "number" ? message.image.file_size : null,
      caption: typeof message.image.caption === "string" ? message.image.caption : null,
    }];
  }

  if (message.type === "document" && message.document?.id) {
    return [{
      attachmentType: "document",
      providerMediaId: message.document.id,
      filename: typeof message.document.filename === "string" ? message.document.filename : null,
      mimeType: typeof message.document.mime_type === "string" ? message.document.mime_type : null,
      fileSize: typeof message.document.file_size === "number" ? message.document.file_size : null,
      caption: typeof message.document.caption === "string" ? message.document.caption : null,
    }];
  }

  if (message.type === "audio" && message.audio?.id) {
    return [{
      attachmentType: "audio",
      providerMediaId: message.audio.id,
      mimeType: typeof message.audio.mime_type === "string" ? message.audio.mime_type : null,
      fileSize: typeof message.audio.file_size === "number" ? message.audio.file_size : null,
    }];
  }

  if (message.type === "video" && message.video?.id) {
    return [{
      attachmentType: "other",
      providerMediaId: message.video.id,
      mimeType: typeof message.video.mime_type === "string" ? message.video.mime_type : null,
      fileSize: typeof message.video.file_size === "number" ? message.video.file_size : null,
      caption: typeof message.video.caption === "string" ? message.video.caption : null,
    }];
  }

  return [];
}
