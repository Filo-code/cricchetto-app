import { addDays, scheduledReminderTimestamp } from "../time";
import { queueOutbound } from "../outbound";
import { supabaseServer } from "../supabase-server";
import type { Channel, RecipientPolicy, ReminderType } from "../types";

interface ReminderDispatchRoute {
  channel: Channel;
  provider: string;
  recipient_identifier: string;
  sender_identifier?: string;
}

interface DueReminderRow {
  id: string;
  workshop_id: string;
  reminder_type: ReminderType;
  recipient_policy: RecipientPolicy;
  resolved_mechanic_identifier?: string | null;
  resolved_customer_identifier?: string | null;
  metadata?: Record<string, unknown> | null;
}

interface ReminderDispatchTarget {
  recipientIdentifier: string;
  targetKind: "customer" | "mechanic";
  targetKey: "customer" | "mechanic";
  usedFallback: boolean;
  fallbackFor?: "customer" | "mechanic";
  text: string;
}

interface QueuedReminderMessage {
  relatedReminderId: string;
  messageLogId: string;
  channel: Channel;
  provider: string;
  recipientIdentifier: string;
  text: string;
}

export interface ReminderRunResult {
  scanned: number;
  queued: number;
  skipped: number;
  failed: number;
}

export interface ReminderScheduleInput {
  workshopId: string;
  reminderType: ReminderType;
  recipientPolicy: RecipientPolicy;
  scheduledFor: string;
  workOrderId?: string;
  vehicleId?: string;
  mechanicIdentifier?: string;
  customerIdentifier?: string | null;
  metadata?: Record<string, unknown>;
}

export async function scheduleReminder(input: ReminderScheduleInput): Promise<void> {
  const { error } = await supabaseServer.from("reminders").insert({
    workshop_id: input.workshopId,
    work_order_id: input.workOrderId ?? null,
    vehicle_id: input.vehicleId ?? null,
    reminder_type: input.reminderType,
    recipient_policy: input.recipientPolicy,
    resolved_mechanic_identifier: input.mechanicIdentifier ?? null,
    resolved_customer_identifier: input.customerIdentifier ?? null,
    scheduled_for: input.scheduledFor,
    status: "scheduled",
    idempotency_key: reminderIdempotencyKey(input),
    metadata: input.metadata ?? {},
  });

  if (error && error.code !== "23505") {
    throw new Error(`Failed to schedule reminder: ${error.message}`);
  }
}

export async function scheduleReadyReminder(input: {
  workshopId: string;
  workOrderId: string;
  readyAt: string;
  readyReminderDays: number;
  recipientPolicy: RecipientPolicy;
  mechanicIdentifier?: string;
  customerIdentifier?: string | null;
}): Promise<void> {
  const readyDate = input.readyAt.slice(0, 10);
  await scheduleReminder({
    workshopId: input.workshopId,
    reminderType: "ready_not_collected",
    recipientPolicy: input.recipientPolicy,
    workOrderId: input.workOrderId,
    scheduledFor: scheduledReminderTimestamp(addDays(readyDate, input.readyReminderDays)),
    mechanicIdentifier: input.mechanicIdentifier,
    customerIdentifier: input.customerIdentifier,
    metadata: { ready_at: input.readyAt },
  });
}

export async function cancelReadyReminders(workshopId: string, workOrderId: string): Promise<void> {
  const { error } = await supabaseServer
    .from("reminders")
    .update({ status: "cancelled", cancelled_at: new Date().toISOString() })
    .eq("workshop_id", workshopId)
    .eq("work_order_id", workOrderId)
    .eq("reminder_type", "ready_not_collected")
    .in("status", ["scheduled", "sending"]);

  if (error) {
    throw new Error(`Failed to cancel ready reminders: ${error.message}`);
  }
}

export async function cancelRevisionReminders(workshopId: string, vehicleId: string): Promise<void> {
  const { error } = await supabaseServer
    .from("reminders")
    .update({ status: "cancelled", cancelled_at: new Date().toISOString() })
    .eq("workshop_id", workshopId)
    .eq("vehicle_id", vehicleId)
    .in("reminder_type", ["revision_due_30d", "revision_due_7d", "revision_due_1d"])
    .in("status", ["scheduled", "sending"]);

  if (error) {
    throw new Error(`Failed to cancel revision reminders: ${error.message}`);
  }
}

export async function scheduleRevisionReminders(input: {
  workshopId: string;
  vehicleId: string;
  revisionDueDate: string;
  offsets: number[];
  recipientPolicy: RecipientPolicy;
  mechanicIdentifier?: string;
  customerIdentifier?: string | null;
  preferredChannel?: Channel | null;
}): Promise<void> {
  for (const offset of input.offsets) {
    const reminderType = `revision_due_${offset}d` as ReminderType;
    if (!["revision_due_35d", "revision_due_30d", "revision_due_7d", "revision_due_1d"].includes(reminderType)) {
      continue;
    }
    await scheduleReminder({
      workshopId: input.workshopId,
      reminderType,
      recipientPolicy: input.recipientPolicy,
      vehicleId: input.vehicleId,
      scheduledFor: scheduledReminderTimestamp(addDays(input.revisionDueDate, -offset)),
      mechanicIdentifier: input.mechanicIdentifier,
      customerIdentifier: input.customerIdentifier,
      metadata: {
        revision_due_date: input.revisionDueDate,
        offset_days: offset,
        ...(input.preferredChannel ? { preferred_channel: input.preferredChannel } : {}),
      },
    });
  }
}

export async function queueDueReminderMessages(input: { limit?: number; reminderTypes?: ReminderType[] } = {}): Promise<ReminderRunResult> {
  let query = supabaseServer
    .from("reminders")
    .select("id,workshop_id,reminder_type,recipient_policy,resolved_mechanic_identifier,resolved_customer_identifier,metadata")
    .lte("scheduled_for", new Date().toISOString())
    .eq("status", "scheduled")
    .limit(input.limit ?? 20);

  if (input.reminderTypes?.length) {
    query = query.in("reminder_type", input.reminderTypes);
  }

  const { data, error } = await query;

  if (error) {
    throw new Error(`Failed to read due reminders: ${error.message}`);
  }

  const rows = (data ?? []) as DueReminderRow[];
  let queued = 0;
  let skipped = 0;
  let failed = 0;

  for (const reminder of rows) {
    const preferredChannel = typeof reminder.metadata?.preferred_channel === "string"
      ? reminder.metadata.preferred_channel as Channel
      : undefined;

    let route: ReminderDispatchRoute;
    try {
      route = await readDispatchChannel(reminder.workshop_id, preferredChannel);
    } catch {
      console.warn(`[reminders] no dispatch channel for reminder ${reminder.id} workshop ${reminder.workshop_id} preferred_channel=${preferredChannel ?? "none"}`);
      skipped += 1;
      continue;
    }

    const targets = buildReminderDispatchTargets(reminder, route);
    const targetMetadata = buildInitialReminderTargetMetadata(reminder, route);
    if (targets.length === 0) {
      await updateReminderStatus(reminder.id, "failed", {
        ...(reminder.metadata ?? {}),
        dispatch_channel: route.channel,
        dispatch_provider: route.provider,
        dispatch_targets: targetMetadata,
        last_dispatch_error: "No valid reminder recipient available",
      });
      failed += 1;
      continue;
    }

    let queuedCount = 0;
    for (const target of targets) {
      const outbound = await queueOutbound({
        workshopId: reminder.workshop_id,
        channel: route.channel,
        provider: route.provider,
        senderIdentifier: route.recipient_identifier,
        recipientIdentifier: target.recipientIdentifier,
        text: target.text,
        idempotencyKey: `outbound:reminder:${reminder.id}:${target.targetKey}`,
        relatedReminderId: reminder.id,
      });
      if (!outbound) {
        targetMetadata[target.targetKey] = {
          ...(targetMetadata[target.targetKey] ?? {}),
          status: "failed",
          target_kind: target.targetKind,
          recipient_identifier: target.recipientIdentifier,
          used_fallback_target: target.usedFallback,
          fallback_for: target.fallbackFor ?? null,
          last_error_message: "Outbound message was not queued",
        };
        continue;
      }
      queuedCount += 1;
      targetMetadata[target.targetKey] = {
        ...(targetMetadata[target.targetKey] ?? {}),
        status: "queued",
        target_kind: target.targetKind,
        recipient_identifier: target.recipientIdentifier,
        message_log_id: outbound.messageLogId,
        used_fallback_target: target.usedFallback,
        fallback_for: target.fallbackFor ?? null,
      };
    }

    if (queuedCount === 0) {
      await updateReminderStatus(reminder.id, "failed", {
        ...(reminder.metadata ?? {}),
        dispatch_channel: route.channel,
        dispatch_provider: route.provider,
        dispatch_targets: targetMetadata,
        last_dispatch_error: "No outbound messages were queued",
      });
      failed += 1;
      continue;
    }

    const claimed = await markReminderSendingIfScheduled(reminder.id, {
      ...(reminder.metadata ?? {}),
      dispatch_channel: route.channel,
      dispatch_provider: route.provider,
      dispatch_targets: targetMetadata,
    });
    if (claimed) {
      queued += queuedCount;
    } else {
      skipped += 1;
    }
  }

  return { scanned: rows.length, queued, skipped, failed };
}

export async function finalizeReminderDeliveryForMessageLog(input: {
  messageLogId: string;
  providerStatus: "accepted" | "failed";
  errorMessage?: string;
}): Promise<void> {
  const { data: messageLog, error: readLogError } = await supabaseServer
    .from("message_logs")
    .select("related_reminder_id")
    .eq("id", input.messageLogId)
    .maybeSingle();

  if (readLogError) {
    throw new Error(`Failed to read outbound message log: ${readLogError.message}`);
  }

  const reminderId = messageLog?.related_reminder_id;
  if (!reminderId) {
    return;
  }

  const { data: reminder, error: readReminderError } = await supabaseServer
    .from("reminders")
    .select("metadata")
    .eq("id", reminderId)
    .single();

  if (readReminderError) {
    throw new Error(`Failed to read reminder for outbound result: ${readReminderError.message}`);
  }

  const metadata = { ...(reminder.metadata ?? {}) };
  const targets = normalizeReminderTargetMetadata(metadata.dispatch_targets);
  let matched = false;
  for (const key of Object.keys(targets)) {
    if (targets[key]?.message_log_id === input.messageLogId) {
      targets[key] = {
        ...targets[key],
        status: input.providerStatus,
        last_error_message: input.errorMessage ?? null,
        completed_at: new Date().toISOString(),
      };
      matched = true;
    }
  }

  const finalMetadata = {
    ...metadata,
    dispatch_targets: targets,
    last_message_log_id: input.messageLogId,
    last_provider_status: input.providerStatus,
    last_error_message: input.errorMessage ?? null,
  };
  const finalStatus = matched
    ? deriveReminderStatusFromTargets(targets)
    : input.providerStatus === "accepted" ? "sent" : "failed";

  await updateReminderStatus(
    reminderId,
    finalStatus,
    finalMetadata,
    ["sent", "partial"].includes(finalStatus) ? new Date().toISOString() : null,
  );
}

function reminderIdempotencyKey(input: ReminderScheduleInput): string {
  const owner = input.workOrderId ? `work_order:${input.workOrderId}` : `vehicle:${input.vehicleId}`;
  const sourceDate = input.metadata?.revision_due_date ?? input.metadata?.ready_at ?? input.scheduledFor;
  return `reminder:${input.workshopId}:${owner}:${input.reminderType}:${sourceDate}`;
}

async function readDispatchChannel(workshopId: string, preferredChannel?: Channel): Promise<ReminderDispatchRoute> {
  let query = supabaseServer
    .from("workshop_channels")
    .select("channel,provider,recipient_identifier,sender_identifier")
    .eq("workshop_id", workshopId)
    .eq("is_active", true);

  if (preferredChannel) {
    query = query.eq("channel", preferredChannel);
  } else {
    query = query.in("channel", ["whatsapp", "telegram_test"]);
  }

  const { data, error } = await query;

  if (error) {
    throw new Error(`Failed to resolve reminder channel: ${error.message}`);
  }

  const candidates = (data ?? []) as ReminderDispatchRoute[];
  const route = preferredChannel
    ? candidates[0]
    : candidates.sort((left, right) => {
        if (left.channel === right.channel) return 0;
        return left.channel === "whatsapp" ? -1 : 1;
      })[0];

  if (!route) {
    throw new Error(`No active reminder dispatch channel configured${preferredChannel ? ` for ${preferredChannel}` : ""}`);
  }

  return route;
}

function buildReminderDispatchTargets(reminder: DueReminderRow, route: ReminderDispatchRoute): ReminderDispatchTarget[] {
  const mechanicIdentifier = reminder.resolved_mechanic_identifier ?? route.sender_identifier ?? null;
  const customerIdentifier = normalizeReminderCustomerIdentifier(route.channel, reminder.resolved_customer_identifier);
  const baseText = reminderText(reminder);

  switch (reminder.recipient_policy) {
    case "mechanic_only":
      return mechanicIdentifier
        ? [{
            recipientIdentifier: mechanicIdentifier,
            targetKey: "mechanic",
            targetKind: "mechanic",
            usedFallback: false,
            text: baseText,
          }]
        : [];
    case "customer_only":
      if (customerIdentifier) {
        return [{
          recipientIdentifier: customerIdentifier,
          targetKey: "customer",
          targetKind: "customer",
          usedFallback: false,
          text: baseText,
        }];
      }
      return mechanicIdentifier
        ? [{
            recipientIdentifier: mechanicIdentifier,
            targetKey: "mechanic",
            targetKind: "mechanic",
            usedFallback: true,
            fallbackFor: "customer",
            text: `Promemoria cliente non inviato: contatto cliente assente.\n${baseText}`,
          }]
        : [];
    case "both":
      return [
        customerIdentifier
          ? {
              recipientIdentifier: customerIdentifier,
              targetKey: "customer",
              targetKind: "customer",
              usedFallback: false,
              text: baseText,
            }
          : null,
        mechanicIdentifier
          ? {
              recipientIdentifier: mechanicIdentifier,
              targetKey: "mechanic",
              targetKind: "mechanic",
              usedFallback: false,
              text: baseText,
            }
          : null,
      ].filter((target): target is ReminderDispatchTarget => Boolean(target));
  }

  return [];
}

async function updateReminderStatus(
  reminderId: string,
  status: "sending" | "sent" | "partial" | "failed",
  metadata: Record<string, unknown>,
  sentAt?: string | null,
): Promise<void> {
  const payload: Record<string, unknown> = {
    status,
    metadata,
  };
  if (status === "sent" || status === "partial") {
    payload.sent_at = sentAt ?? new Date().toISOString();
  }

  const { error } = await supabaseServer
    .from("reminders")
    .update(payload)
    .eq("id", reminderId);

  if (error) {
    throw new Error(`Failed to update reminder status: ${error.message}`);
  }
}

async function markReminderSendingIfScheduled(
  reminderId: string,
  metadata: Record<string, unknown>,
): Promise<boolean> {
  const { data, error } = await supabaseServer
    .from("reminders")
    .update({
      status: "sending",
      metadata,
    })
    .eq("id", reminderId)
    .eq("status", "scheduled")
    .select("id")
    .maybeSingle();

  if (error) {
    throw new Error(`Failed to mark reminder sending: ${error.message}`);
  }

  return Boolean(data);
}

function normalizeReminderCustomerIdentifier(channel: Channel, identifier?: string | null): string | null {
  if (!identifier) {
    return null;
  }
  if (channel !== "whatsapp") {
    return null;
  }

  const normalized = identifier.trim().replace(/[^\d+]/g, "");
  return normalized || null;
}

function reminderText(reminder: DueReminderRow): string {
  if (reminder.reminder_type === "ready_not_collected") {
    return "Promemoria: veicolo pronto non ancora ritirato.";
  }
  return `Promemoria revisione: scadenza ${reminder.metadata?.revision_due_date ?? "non disponibile"}.`;
}

function buildInitialReminderTargetMetadata(reminder: DueReminderRow, route: ReminderDispatchRoute): Record<string, Record<string, unknown>> {
  const metadata: Record<string, Record<string, unknown>> = {};
  const mechanicIdentifier = reminder.resolved_mechanic_identifier ?? route.sender_identifier ?? null;
  const customerIdentifier = normalizeReminderCustomerIdentifier(route.channel, reminder.resolved_customer_identifier);

  if ((reminder.recipient_policy === "mechanic_only" || reminder.recipient_policy === "both") && !mechanicIdentifier) {
    metadata.mechanic = {
      status: "skipped",
      target_kind: "mechanic",
      last_error_message: "No mechanic recipient configured",
    };
  }

  if ((reminder.recipient_policy === "customer_only" || reminder.recipient_policy === "both") && !customerIdentifier) {
    metadata.customer = {
      status: "skipped",
      target_kind: "customer",
      last_error_message: route.channel === "whatsapp" ? "No customer recipient configured" : "Customer reminder delivery is WhatsApp-only",
    };
  }

  return metadata;
}

function normalizeReminderTargetMetadata(value: unknown): Record<string, Record<string, unknown>> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return {};
  }
  return value as Record<string, Record<string, unknown>>;
}

function deriveReminderStatusFromTargets(targets: Record<string, Record<string, unknown>>): "sending" | "sent" | "partial" | "failed" {
  const statuses = Object.values(targets).map((target) => target.status);
  const terminalStatuses = ["accepted", "failed", "skipped"];
  if (statuses.length === 0) {
    return "failed";
  }
  if (statuses.some((status) => !terminalStatuses.includes(String(status)))) {
    return "sending";
  }
  const acceptedCount = statuses.filter((status) => status === "accepted").length;
  if (acceptedCount === statuses.length) {
    return "sent";
  }
  if (acceptedCount > 0) {
    return "partial";
  }
  return "failed";
}
