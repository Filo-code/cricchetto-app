import { AppError } from "../errors";
import { timingSafeEqualString } from "../crypto";
import type { NormalizedInboundMessage, ProviderSendResult } from "../types";
import type { ProviderAdapter } from "./types";

export const telegramProvider: ProviderAdapter = {
  channel: "telegram_test",
  async verifyInboundSignature(request: Request, _rawBody: string): Promise<void> {
    const expected = process.env.Cricchetto_TELEGRAM_WEBHOOK_SECRET;
    if (!expected) {
      if (process.env.NODE_ENV === "production") {
        throw new AppError("Cricchetto_TELEGRAM_WEBHOOK_SECRET is required", { statusCode: 500, parseStatus: "error" });
      }
      return;
    }
    if (!timingSafeEqualString(request.headers.get("x-telegram-bot-api-secret-token"), expected)) {
      throw new AppError("Invalid Telegram webhook secret", { statusCode: 401, parseStatus: "ignored" });
    }
  },
  normalizeInboundPayload(rawPayload: any): NormalizedInboundMessage {
    const message = rawPayload.message ?? rawPayload.edited_message;
    const text = rawPayload.text ?? message?.text ?? message?.caption ?? "";
    const providerMessageId = rawPayload.provider_message_id ?? (message?.message_id ? String(message.message_id) : undefined);
    const senderIdentifier = rawPayload.sender ?? (message?.chat?.id ? String(message.chat.id) : undefined);
    const recipientIdentifier = normalizeTelegramBotIdentifier(
      rawPayload.recipient ?? rawPayload.bot_username ?? process.env.Cricchetto_TELEGRAM_BOT_IDENTIFIER ?? "Cricchetto_bot",
    );
    const attachments = normalizeTelegramAttachments(message);

    if ((!text && attachments.length === 0) || !providerMessageId || !senderIdentifier || !recipientIdentifier) {
      throw new AppError("Invalid Telegram payload", {
        parseStatus: "validation_failed",
        publicMessage: "Messaggio Telegram non valido.",
      });
    }

    return {
      channel: "telegram_test",
      provider: rawPayload.provider ?? "telegram_bot_api",
      providerMessageId,
      senderIdentifier,
      recipientIdentifier,
      text,
      rawPayload,
      attachments,
    };
  },
  async sendTextMessage(): Promise<ProviderSendResult> {
    return {
      accepted: false,
      errorMessage: "Telegram send adapter is not configured",
    };
  },
};

function normalizeTelegramAttachments(message: any): NonNullable<NormalizedInboundMessage["attachments"]> {
  if (!message || typeof message !== "object") {
    return [];
  }

  if (Array.isArray(message.photo) && message.photo.length > 0) {
    const largest = [...message.photo]
      .filter((entry) => entry?.file_id)
      .sort((left, right) => Number(right?.file_size ?? 0) - Number(left?.file_size ?? 0))[0];
    if (largest?.file_id) {
      return [{
        attachmentType: "photo",
        providerFileId: largest.file_id,
        providerFileUniqueId: largest.file_unique_id,
        mimeType: "image/jpeg",
        fileSize: typeof largest.file_size === "number" ? largest.file_size : null,
        caption: typeof message.caption === "string" ? message.caption : null,
      }];
    }
  }

  if (message.document?.file_id) {
    return [{
      attachmentType: "document",
      providerFileId: message.document.file_id,
      providerFileUniqueId: message.document.file_unique_id,
      filename: typeof message.document.file_name === "string" ? message.document.file_name : null,
      mimeType: typeof message.document.mime_type === "string" ? message.document.mime_type : null,
      fileSize: typeof message.document.file_size === "number" ? message.document.file_size : null,
      caption: typeof message.caption === "string" ? message.caption : null,
    }];
  }

  if (message.audio?.file_id) {
    return [{
      attachmentType: "audio",
      providerFileId: message.audio.file_id,
      providerFileUniqueId: message.audio.file_unique_id,
      filename: typeof message.audio.file_name === "string" ? message.audio.file_name : null,
      mimeType: typeof message.audio.mime_type === "string" ? message.audio.mime_type : null,
      fileSize: typeof message.audio.file_size === "number" ? message.audio.file_size : null,
      caption: typeof message.caption === "string" ? message.caption : null,
    }];
  }

  if (message.voice?.file_id) {
    return [{
      attachmentType: "audio",
      providerFileId: message.voice.file_id,
      providerFileUniqueId: message.voice.file_unique_id,
      filename: "voice-message.ogg",
      mimeType: typeof message.voice.mime_type === "string" ? message.voice.mime_type : "audio/ogg",
      fileSize: typeof message.voice.file_size === "number" ? message.voice.file_size : null,
      caption: typeof message.caption === "string" ? message.caption : null,
    }];
  }

  if (message.video?.file_id) {
    return [{
      attachmentType: "other",
      providerFileId: message.video.file_id,
      providerFileUniqueId: message.video.file_unique_id,
      filename: typeof message.video.file_name === "string" ? message.video.file_name : "telegram-video.mp4",
      mimeType: typeof message.video.mime_type === "string" ? message.video.mime_type : "video/mp4",
      fileSize: typeof message.video.file_size === "number" ? message.video.file_size : null,
      caption: typeof message.caption === "string" ? message.caption : null,
    }];
  }

  return [];
}
function normalizeTelegramBotIdentifier(value: string): string {
  return value === "Crichetto_bot" ? "Cricchetto_bot" : value;
}
