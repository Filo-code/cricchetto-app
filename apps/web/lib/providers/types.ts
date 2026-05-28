import type { Channel, NormalizedInboundMessage, ProviderSendResult } from "../types";

export interface ProviderAdapter {
  channel: Channel;
  verifyInboundSignature(request: Request, rawBody: string, providerConfig?: Record<string, unknown>): Promise<void>;
  normalizeInboundPayload(rawPayload: unknown, providerConfig?: Record<string, unknown>): NormalizedInboundMessage;
  sendTextMessage(input: {
    provider: string;
    senderIdentifier?: string;
    recipientIdentifier: string;
    text: string;
    providerConfig?: Record<string, unknown>;
  }): Promise<ProviderSendResult>;
}
