import { AppError } from "../errors";
import { supabaseServer } from "../supabase-server";
import type { OutboundMessageRequest, ProviderStatus, QueuedOutboundMessage } from "../types";

export async function queueOutbound(outbound: OutboundMessageRequest): Promise<QueuedOutboundMessage | null> {
  const { data, error } = await supabaseServer
    .from("message_logs")
    .insert({
      workshop_id: outbound.workshopId,
      channel: outbound.channel,
      provider: outbound.provider,
      direction: "outbound",
      sender_identifier: outbound.senderIdentifier ?? null,
      recipient_identifier: outbound.recipientIdentifier,
      raw_text: outbound.text,
      raw_payload: {},
      parse_status: null,
      provider_status: "queued",
      related_work_order_id: outbound.relatedWorkOrderId ?? null,
      related_reminder_id: outbound.relatedReminderId ?? null,
      related_document_id: outbound.relatedDocumentId ?? null,
      idempotency_key: outbound.idempotencyKey,
    })
    .select("id,channel,provider,sender_identifier,recipient_identifier,raw_text,related_work_order_id,related_reminder_id,related_document_id")
    .single();

  if (error?.code === "23505") {
    const existing = await readQueuedOutboundByIdempotencyKey(outbound.idempotencyKey);
    return existing;
  }
  if (error) {
    throw new Error(`Failed to queue outbound message: ${error.message}`);
  }

  return {
    messageLogId: data.id,
    channel: data.channel,
    provider: data.provider,
    senderIdentifier: data.sender_identifier ?? undefined,
    recipientIdentifier: data.recipient_identifier,
    text: data.raw_text,
    relatedWorkOrderId: data.related_work_order_id ?? undefined,
    relatedReminderId: data.related_reminder_id ?? undefined,
    relatedDocumentId: data.related_document_id ?? undefined,
  };
}

export async function recordOutboundResult(input: {
  messageLogId: string;
  providerStatus: Extract<ProviderStatus, "accepted" | "delivered" | "failed" | "skipped">;
  providerMessageId?: string;
  errorMessage?: string;
}): Promise<void> {
  const { data, error } = await supabaseServer
    .from("message_logs")
    .update({
      provider_status: input.providerStatus,
      provider_message_id: input.providerMessageId ?? null,
      error_message: input.errorMessage ?? null,
    })
    .eq("id", input.messageLogId)
    .eq("direction", "outbound")
    .select("id")
    .maybeSingle();

  if (error) {
    throw new Error(`Failed to record outbound result: ${error.message}`);
  }
  if (!data) {
    throw new AppError("Outbound message log not found", { statusCode: 404, parseStatus: "not_found" });
  }
}

export async function markOutboundSending(messageLogId: string): Promise<void> {
  const { data, error } = await supabaseServer
    .from("message_logs")
    .update({ provider_status: "sending" })
    .eq("id", messageLogId)
    .eq("direction", "outbound")
    .select("id")
    .maybeSingle();

  if (error) {
    throw new Error(`Failed to mark outbound sending: ${error.message}`);
  }
  if (!data) {
    throw new AppError("Outbound message log not found", { statusCode: 404, parseStatus: "not_found" });
  }
}

async function readQueuedOutboundByIdempotencyKey(idempotencyKey: string): Promise<QueuedOutboundMessage | null> {
  const { data, error } = await supabaseServer
    .from("message_logs")
    .select("id,channel,provider,sender_identifier,recipient_identifier,raw_text,related_work_order_id,related_reminder_id,related_document_id")
    .eq("idempotency_key", idempotencyKey)
    .eq("direction", "outbound")
    .maybeSingle();

  if (error) {
    throw new Error(`Failed to read existing outbound message: ${error.message}`);
  }
  if (!data) {
    return null;
  }

  return {
    messageLogId: data.id,
    channel: data.channel,
    provider: data.provider,
    senderIdentifier: data.sender_identifier ?? undefined,
    recipientIdentifier: data.recipient_identifier,
    text: data.raw_text,
    relatedWorkOrderId: data.related_work_order_id ?? undefined,
    relatedReminderId: data.related_reminder_id ?? undefined,
    relatedDocumentId: data.related_document_id ?? undefined,
  };
}
