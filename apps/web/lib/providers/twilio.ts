import { createHmac, timingSafeEqual } from "node:crypto";
import { AppError } from "../errors";
import type { NormalizedInboundMessage, ProviderSendResult } from "../types";
import type { ProviderAdapter } from "./types";

function verifyTwilioSignature(input: {
  authToken: string;
  url: string;
  params: Record<string, string>;
  signature: string;
}): boolean {
  const sortedKeys = Object.keys(input.params).sort();
  const paramString = sortedKeys.map((k) => `${k}${input.params[k]}`).join("");
  const expected = createHmac("sha1", input.authToken)
    .update(input.url + paramString)
    .digest("base64");
  const expectedBuf = Buffer.from(expected);
  const receivedBuf = Buffer.from(input.signature);
  if (expectedBuf.length !== receivedBuf.length) return false;
  return timingSafeEqual(expectedBuf, receivedBuf);
}

export const twilioProvider: ProviderAdapter = {
  channel: "whatsapp",
  async verifyInboundSignature(request: Request, rawBody: string, _providerConfig?: Record<string, unknown>): Promise<void> {
    const authToken = process.env.Cricchetto_TWILIO_AUTH_TOKEN;
    if (!authToken) {
      throw new AppError("Cricchetto_TWILIO_AUTH_TOKEN is required", { statusCode: 500, parseStatus: "error" });
    }

    const signature = request.headers.get("x-twilio-signature") ?? "";
    if (!signature) {
      throw new AppError("Missing Twilio signature", { statusCode: 401, parseStatus: "ignored" });
    }

    const url = request.url;
    const params: Record<string, string> = {};
    for (const [k, v] of new URLSearchParams(rawBody)) {
      params[k] = v;
    }

    if (!verifyTwilioSignature({ authToken, url, params, signature })) {
      throw new AppError("Invalid Twilio signature", { statusCode: 401, parseStatus: "ignored" });
    }
  },
  normalizeInboundPayload(rawPayload: any, providerConfig?: Record<string, unknown>): NormalizedInboundMessage {
    const text = rawPayload.Body ?? "";
    const providerMessageId = rawPayload.MessageSid;
    const senderIdentifier = rawPayload.From?.replace("whatsapp:", "") ?? rawPayload.from;
    const recipientIdentifier =
      rawPayload.To?.replace("whatsapp:", "")
      ?? rawPayload.to
      ?? (typeof providerConfig?.from_number === "string" ? providerConfig.from_number.replace("whatsapp:", "") : undefined);
    const attachments = normalizeTwilioAttachments(rawPayload);

    if ((!text && attachments.length === 0) || !providerMessageId || !senderIdentifier || !recipientIdentifier) {
      throw new AppError("Invalid Twilio WhatsApp payload", {
        parseStatus: "validation_failed",
        publicMessage: "Messaggio WhatsApp non valido.",
      });
    }

    return {
      channel: "whatsapp",
      provider: "twilio_whatsapp",
      providerMessageId,
      senderIdentifier,
      recipientIdentifier,
      text,
      rawPayload,
      attachments,
    };
  },
  async sendTextMessage(): Promise<ProviderSendResult> {
    // Twilio outbound dispatch is handled by n8n (WF-03), same as Meta.
    return {
      accepted: false,
      errorMessage: "Twilio WhatsApp outbound is dispatched by n8n, not called directly",
    };
  },
};

function normalizeTwilioAttachments(payload: any): NonNullable<NormalizedInboundMessage["attachments"]> {
  const numMedia = Number(payload.NumMedia ?? 0);
  if (!numMedia) return [];

  const attachments: NonNullable<NormalizedInboundMessage["attachments"]> = [];
  for (let i = 0; i < numMedia; i++) {
    const url = payload[`MediaUrl${i}`] as string | undefined;
    const mimeType = (payload[`MediaContentType${i}`] as string | undefined) ?? null;
    if (!url) continue;
    const attachmentType = mimeType?.startsWith("image/") ? "photo"
      : mimeType?.startsWith("audio/") ? "audio"
        : "document";
    attachments.push({ attachmentType, providerMediaId: url, mimeType });
  }
  return attachments;
}
