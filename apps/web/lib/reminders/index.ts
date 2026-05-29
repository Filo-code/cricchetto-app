import { addDays, scheduledReminderTimestamp } from "../time";
import { queueOutbound } from "../outbound";
import { supabaseServer } from "../supabase-server";
import type { Channel, RecipientPolicy, ReminderType } from "../types";

const REMINDER_STALE_MINUTES = 10;

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
  skipped: number;
  failed: number;
  queued: Array<{
    messageLogId: string;
    channel: Channel;
    provider: string;
    recipientIdentifier: string;
    text: string;
    relatedReminderId: string;
  }>;
}

export interface RecoverStuckRemindersResult {
  scanned: number;
  recovered: number;
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
    .in("reminder_type", ["revision_due_35d", "revision_due_30d", "revision_due_7d", "revision_due_1d"])
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
  vehiclePlate?: string | null;
  customerName?: string | null;
}): Promise<void> {
  // Fetch vehicle details if plate/customer_name not provided
  let plate = input.vehiclePlate;
  let customerName = input.customerName;
  if (!plate || !customerName) {
    const vehicle = await supabaseServer
      .from("vehicles")
      .select("plate_normalized")
      .eq("id", input.vehicleId)
      .maybeSingle();
    if (vehicle?.data) {
      plate = plate ?? vehicle.data.plate_normalized;
    }
  }

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
        plate: plate ?? null,
        customer_name: customerName ?? null,
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
  const queuedMessages: ReminderRunResult["queued"] = [];
  let skipped = 0;
  let failed = 0;

  // Check workshop statuses once for all due reminders to avoid per-row queries.
  const distinctWorkshopIds = [...new Set(rows.map((r) => r.workshop_id))];
  const suspendedOrClosed = new Set<string>();
  if (distinctWorkshopIds.length > 0) {
    const { data: wStatuses } = await supabaseServer
      .from("workshops")
      .select("id,status")
      .in("id", distinctWorkshopIds);
    for (const w of (wStatuses ?? []) as any[]) {
      if (w.status === "suspended" || w.status === "closed") {
        suspendedOrClosed.add(w.id);
      }
    }
  }

  for (const reminder of rows) {
    if (suspendedOrClosed.has(reminder.workshop_id)) {
      skipped += 1;
      continue;
    }
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

    const queuedForReminder: ReminderRunResult["queued"] = [];
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
      queuedForReminder.push({
        messageLogId: outbound.messageLogId,
        channel: outbound.channel,
        provider: outbound.provider,
        recipientIdentifier: outbound.recipientIdentifier,
        text: outbound.text ?? "",
        relatedReminderId: reminder.id,
      });
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
      queuedMessages.push(...queuedForReminder);
    } else {
      skipped += 1;
    }
  }

  return { scanned: rows.length, queued: queuedMessages, skipped, failed };
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

// Client reminders must use whatsapp. telegram_test is internal/admin-only.
// When no preferredChannel, whatsapp is chosen first via sort.
// The caller (updateRevisionDueDate) enforces telegram_test is only set by platform owners.
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

// backend resolves tenant/channel/recipient; n8n only dispatches the already-normalized payload.
// Add new recipient policies here — never in n8n workflow logic.
// Customer reminders are WhatsApp-only. telegram_test targets the internal admin chat only.
function buildReminderDispatchTargets(reminder: DueReminderRow, route: ReminderDispatchRoute): ReminderDispatchTarget[] {
  // For telegram_test: route.recipient_identifier = admin chat ID (valid Telegram chat_id).
  // route.sender_identifier = bot name ("Cricchetto_bot"), which is NOT a valid chat_id.
  // For whatsapp: route.sender_identifier = WhatsApp phone number ID (the platform sender).
  const mechanicIdentifier = reminder.resolved_mechanic_identifier
    ?? (route.channel === "telegram_test" ? route.recipient_identifier : route.sender_identifier)
    ?? null;
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
  const nextMetadata = {
    ...metadata,
    dispatch_started_at: new Date().toISOString(),
  };
  const { data, error } = await supabaseServer
    .from("reminders")
    .update({
      status: "sending",
      metadata: nextMetadata,
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

// Customer delivery is WhatsApp-only. telegram_test is for internal/mechanic use.
// If channel is not whatsapp, customer identifier is intentionally suppressed here.
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

export async function scheduleReadyPickupNotification(input: {
  workshopId: string;
  workOrderId: string;
  readyAt: string;
  customerIdentifier?: string | null;
  customerName?: string | null;
  plate?: string | null;
  workshopDisplayName?: string | null;
}): Promise<void> {
  if (!input.customerIdentifier) return;
  await scheduleReminder({
    workshopId: input.workshopId,
    reminderType: "ready_pickup",
    recipientPolicy: "customer_only",
    workOrderId: input.workOrderId,
    scheduledFor: input.readyAt,
    customerIdentifier: input.customerIdentifier,
    metadata: {
      ready_at: input.readyAt,
      customer_name: input.customerName ?? null,
      plate: input.plate ?? null,
      workshop_display_name: input.workshopDisplayName ?? null,
    },
  });
}

function reminderText(reminder: DueReminderRow): string {
  if (reminder.reminder_type === "ready_pickup") {
    const firstName = typeof reminder.metadata?.customer_name === "string"
      ? reminder.metadata.customer_name.trim().split(/\s+/)[0]
      : null;
    const plate = typeof reminder.metadata?.plate === "string" ? reminder.metadata.plate : null;
    const officina = typeof reminder.metadata?.workshop_display_name === "string" ? reminder.metadata.workshop_display_name : null;
    if (firstName && plate && officina) {
      return `Ciao ${firstName}, la tua auto ${plate} è pronta per il ritiro presso ${officina}. Grazie.`;
    }
    return "La tua auto è pronta per il ritiro. Grazie.";
  }
  if (reminder.reminder_type === "ready_not_collected") {
    return "Promemoria: veicolo pronto non ancora ritirato.";
  }
  if (reminder.reminder_type.startsWith("revision_due_")) {
    const firstName = typeof reminder.metadata?.customer_name === "string"
      ? reminder.metadata.customer_name.trim().split(/\s+/)[0]
      : "Cliente";
    const plate = typeof reminder.metadata?.plate === "string" ? reminder.metadata.plate : "";
    const offsetDays = typeof reminder.metadata?.offset_days === "number" ? reminder.metadata.offset_days : 0;
    const dueDate = typeof reminder.metadata?.revision_due_date === "string" ? reminder.metadata.revision_due_date : "";
    return `Ciao ${firstName}, la revisione del veicolo ${plate} scade tra ${offsetDays} giorni (${dueDate}).`;
  }
  return "Promemoria non disponibile.";
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

export async function recoverStuckSendingReminders(limit = 20): Promise<RecoverStuckRemindersResult> {
  const { data, error } = await supabaseServer
    .from("reminders")
    .select("id,metadata")
    .eq("status", "sending")
    .order("created_at", { ascending: true })
    .limit(limit);

  if (error) {
    throw new Error(`Failed to read stuck reminders: ${error.message}`);
  }

  let recovered = 0;
  const reminders = data ?? [];

  for (const reminder of reminders) {
    const metadata = reminder.metadata && typeof reminder.metadata === "object" && !Array.isArray(reminder.metadata)
      ? reminder.metadata as Record<string, unknown>
      : {};
    const dispatchStartedAt = typeof metadata.dispatch_started_at === "string" ? metadata.dispatch_started_at : null;
    if (!dispatchStartedAt || Date.now() - Date.parse(dispatchStartedAt) < REMINDER_STALE_MINUTES * 60 * 1000) {
      continue;
    }

    const { data: activeLogs, error: logError } = await supabaseServer
      .from("message_logs")
      .select("id")
      .eq("related_reminder_id", reminder.id)
      .eq("direction", "outbound")
      .in("provider_status", ["queued", "sending"])
      .limit(1);

    if (logError) {
      throw new Error(`Failed to read active reminder logs: ${logError.message}`);
    }
    if ((activeLogs ?? []).length > 0) {
      continue;
    }

    const targets = normalizeReminderTargetMetadata(metadata.dispatch_targets);
    const status = deriveReminderStatusFromTargets(targets);
    const terminalStatus = status === "sending" ? "failed" : status;
    const nextMetadata = {
      ...metadata,
      dispatch_recovered_at: new Date().toISOString(),
      ...(terminalStatus === "failed" && status === "sending"
        ? { last_dispatch_error: "Recovered stale reminder without active outbound dispatch" }
        : {}),
    };

    await updateReminderStatus(
      reminder.id,
      terminalStatus,
      nextMetadata,
      ["sent", "partial"].includes(terminalStatus) ? new Date().toISOString() : null,
    );
    recovered += 1;
  }

  return {
    scanned: reminders.length,
    recovered,
  };
}

