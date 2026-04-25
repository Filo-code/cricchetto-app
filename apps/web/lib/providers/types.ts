import type { Channel, NormalizedInboundMessage, ProviderSendResult } from "../types";

export interface ProviderAdapter {
  channel: Channel;
  verifyInboundSignature(request: Request, rawBody: string): Promise<void>;
  normalizeInboundPayload(rawPayload: unknown): NormalizedInboundMessage;
  sendTextMessage(input: {
    provider: string;
    senderIdentifier?: string;
    recipientIdentifier: string;
    text: string;
  }): Promise<ProviderSendResult>;
}
