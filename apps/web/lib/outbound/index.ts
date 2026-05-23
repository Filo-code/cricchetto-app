import { AppError } from "../errors";
import { supabaseServer } from "../supabase-server";
import type { OutboundMessageRequest, ProviderStatus, QueuedOutboundMessage } from "../types";

const OUTBOUND_STALE_MINUTES = 10;
const OUTBOUND_MAX_RECOVERY_RETRIES = 3;

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
      raw_payload: {
        dispatch_attempt_count: 0,
        dispatch_recovery_count: 0,
        queued_at: new Date().toISOString(),
      },
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
  // Resolve workshopId first so the UPDATE is scoped to the correct tenant.
  const { data: existing, error: readError } = await supabaseServer
    .from("message_logs")
    .select("workshop_id")
    .eq("id", input.messageLogId)
    .eq("direction", "outbound")
    .maybeSingle();

  if (readError) throw new Error(`Failed to read outbound message log: ${readError.message}`);
  if (!existing) throw new AppError("Outbound message log not found", { statusCode: 404, parseStatus: "not_found" });

  const { data, error } = await supabaseServer
    .from("message_logs")
    .update({
      provider_status: input.providerStatus,
      provider_message_id: input.providerMessageId ?? null,
      error_message: input.errorMessage ?? null,
    })
    .eq("id", input.messageLogId)
    .eq("workshop_id", existing.workshop_id)
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
  const { data: existing, error: readError } = await supabaseServer
    .from("message_logs")
    .select("workshop_id,raw_payload")
    .eq("id", messageLogId)
    .eq("direction", "outbound")
    .maybeSingle();

  if (readError) throw new Error(`Failed to read outbound message log: ${readError.message}`);
  if (!existing) throw new AppError("Outbound message log not found", { statusCode: 404, parseStatus: "not_found" });

  const rawPayload = normalizeRawPayload(existing.raw_payload);
  const { data, error } = await supabaseServer
    .from("message_logs")
    .update({
      provider_status: "sending",
      raw_payload: {
        ...rawPayload,
        dispatch_attempt_count: readInteger(rawPayload.dispatch_attempt_count) + 1,
        dispatch_last_started_at: new Date().toISOString(),
      },
    })
    .eq("id", messageLogId)
    .eq("workshop_id", existing.workshop_id)
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

export interface RecoverStuckOutboundResult {
  scanned: number;
  recovered: number;
  failed: number;
  queued: QueuedOutboundMessage[];
  failedMessageLogIds: string[];
}

export async function recoverStuckOutbound(limit = 20): Promise<RecoverStuckOutboundResult> {
  const fetchLimit = Math.max(limit * 3, limit);
  const { data, error } = await supabaseServer
    .from("message_logs")
    .select("id,workshop_id,channel,provider,provider_status,provider_message_id,sender_identifier,recipient_identifier,raw_text,raw_payload,error_message,related_work_order_id,related_reminder_id,related_document_id,created_at")
    .eq("direction", "outbound")
    .in("provider_status", ["queued", "sending"])
    .order("created_at", { ascending: true })
    .limit(fetchLimit);

  if (error) {
    throw new Error(`Failed to read stuck outbound messages: ${error.message}`);
  }

  const staleRows = (data ?? []).filter((row) => isRecoverableStaleOutbound(row)).slice(0, limit);
  const result: RecoverStuckOutboundResult = {
    scanned: staleRows.length,
    recovered: 0,
    failed: 0,
    queued: [],
    failedMessageLogIds: [],
  };

  for (const row of staleRows) {
    const rawPayload = normalizeRawPayload(row.raw_payload);
    const recoveryCount = readInteger(rawPayload.dispatch_recovery_count);
    const nextRecoveryCount = recoveryCount + 1;

    if (nextRecoveryCount > OUTBOUND_MAX_RECOVERY_RETRIES) {
      const failedRow = await updateRecoveredOutboundRow(row, {
        provider_status: "failed",
        error_message: `Outbound dispatch recovery exhausted after ${OUTBOUND_MAX_RECOVERY_RETRIES} retries`,
        raw_payload: {
          ...rawPayload,
          dispatch_recovery_count: recoveryCount,
          dispatch_recovery_exhausted_at: new Date().toISOString(),
          dispatch_recovery_last_status: row.provider_status,
        },
      });
      if (failedRow) {
        result.failed += 1;
        result.failedMessageLogIds.push(row.id);
      }
      continue;
    }

    const recoveredRow = await updateRecoveredOutboundRow(row, {
      provider_status: "queued",
      raw_payload: {
        ...rawPayload,
        dispatch_recovery_count: nextRecoveryCount,
        dispatch_last_recovered_at: new Date().toISOString(),
        dispatch_recovery_last_status: row.provider_status,
      },
    });

    if (!recoveredRow) {
      continue;
    }

    result.recovered += 1;
    result.queued.push({
      messageLogId: row.id,
      channel: row.channel,
      provider: row.provider,
      senderIdentifier: row.sender_identifier ?? undefined,
      recipientIdentifier: row.recipient_identifier,
      text: row.raw_text,
      relatedWorkOrderId: row.related_work_order_id ?? undefined,
      relatedReminderId: row.related_reminder_id ?? undefined,
      relatedDocumentId: row.related_document_id ?? undefined,
    });
  }

  return result;
}

async function updateRecoveredOutboundRow(
  row: {
    id: string;
    workshop_id: string;
    provider_status: string;
  },
  update: {
    provider_status: "queued" | "failed";
    raw_payload: Record<string, unknown>;
    error_message?: string;
  },
): Promise<boolean> {
  const payload: Record<string, unknown> = {
    provider_status: update.provider_status,
    raw_payload: update.raw_payload,
  };
  if (update.error_message !== undefined) {
    payload.error_message = update.error_message;
  }

  const { data, error } = await supabaseServer
    .from("message_logs")
    .update(payload)
    .eq("id", row.id)
    .eq("workshop_id", row.workshop_id)
    .eq("direction", "outbound")
    .eq("provider_status", row.provider_status)
    .select("id")
    .maybeSingle();

  if (error) {
    throw new Error(`Failed to recover outbound message ${row.id}: ${error.message}`);
  }

  return Boolean(data);
}

function isRecoverableStaleOutbound(row: {
  provider_status: string | null;
  provider_message_id: string | null;
  raw_payload: unknown;
  created_at: string;
}): boolean {
  if (!row.provider_status) {
    return false;
  }
  if (row.provider_status === "sending" && row.provider_message_id) {
    return false;
  }

  const rawPayload = normalizeRawPayload(row.raw_payload);
  const anchor = row.provider_status === "sending"
    ? readTimestamp(rawPayload.dispatch_last_started_at) ?? readTimestamp(rawPayload.dispatch_last_recovered_at) ?? row.created_at
    : readTimestamp(rawPayload.dispatch_last_recovered_at) ?? row.created_at;

  return Date.now() - Date.parse(anchor) >= OUTBOUND_STALE_MINUTES * 60 * 1000;
}

function normalizeRawPayload(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return {};
  }
  return value as Record<string, unknown>;
}

function readInteger(value: unknown): number {
  return typeof value === "number" && Number.isInteger(value) && value >= 0 ? value : 0;
}

function readTimestamp(value: unknown): string | null {
  return typeof value === "string" && Number.isFinite(Date.parse(value)) ? value : null;
}
