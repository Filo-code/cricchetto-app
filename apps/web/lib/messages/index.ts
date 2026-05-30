import { attachMessageAttachmentsToIntake, attachMessageAttachmentsToWorkOrder, saveInboundAttachments } from "../attachments";
import { buildSendDocumentCommandResult } from "../documents";
import { AppError, getErrorMessage } from "../errors";
import { deactivateExpiredIntake, continueIntake, getActiveIntake, startIntake, type IntakeSession } from "../intake";
import { queueOutbound } from "../outbound";
import { parseCommand } from "../parser";
import { normalizePlate } from "../plates";
import { lookupRevision, listRevisionDue, updateRevisionByPlate } from "../revisions";
import { resolveAuthorizedStaffByPhone } from "../staff";
import { supabaseServer } from "../supabase-server";
import { addLabor, addNote, addPart, closeWorkOrder, handleStatus, markCollected } from "../work-orders";
import { requireWorkshopAccess } from "../subscription";
import { executeCommandEffects } from "./effect-executor";
import type {
  Channel,
  CommandExecutionResult,
  InboundProcessingResult,
  NormalizedInboundMessage,
  ParseStatus,
  QueuedOutboundMessage,
  WorkshopRoute,
} from "../types";

export async function processNormalizedInbound(inbound: NormalizedInboundMessage): Promise<InboundProcessingResult> {
  let route: WorkshopRoute | undefined;
  let inboundLog: { id: string; duplicate: boolean } | undefined;
  let activeIntake: IntakeSession | null = null;
  const hasText = inbound.text.trim().length > 0;
  const hasAttachments = (inbound.attachments?.length ?? 0) > 0;

  try {
    route = await resolveWorkshopRoute(inbound);
    inboundLog = await logInbound(inbound, route.workshopId);

    if (inboundLog.duplicate) {
      return { ok: true, duplicate: true, outboundMessages: [] };
    }

    // Block telegram_test in production — it has no staff auth gate.
    if (inbound.channel === "telegram_test" && process.env.NODE_ENV === "production") {
      throw new AppError("telegram_test channel is not allowed in production", {
        parseStatus: "ignored",
      });
    }

    // WhatsApp staff authorization gate.
    // Telegram (telegram_test) is internal/test — bypasses this check.
    if (inbound.channel === "whatsapp") {
      const staff = await resolveAuthorizedStaffByPhone(route.workshopId, inbound.senderIdentifier);
      if (!staff) {
        return await processCustomerInbound(route, inbound, inboundLog.id);
      }
    }

    await deactivateExpiredIntake(route.workshopId, inbound.channel, inbound.senderIdentifier);
    activeIntake = await getActiveIntake(route.workshopId, inbound.channel, inbound.senderIdentifier);

    if (hasAttachments) {
      await saveInboundAttachments({
        workshopId: route.workshopId,
        inbound,
        messageLogId: inboundLog.id,
        intakeSessionId: activeIntake?.id ?? undefined,
        actorRef: inbound.senderIdentifier,
      });
    }

    let result: CommandExecutionResult;

    if (activeIntake) {
      if (!hasText) {
        result = attachmentOnlyIntakeResult();
      } else {
        result = await continueIntake({
          workshopId: route.workshopId,
          intake: activeIntake,
          answer: inbound.text,
          actorRef: inbound.senderIdentifier,
          messageContext: {
            channel: inbound.channel,
            provider: inbound.provider,
            providerMessageId: inbound.providerMessageId,
            senderIdentifier: inbound.senderIdentifier,
            recipientIdentifier: inbound.recipientIdentifier,
          },
        });
      }
    } else if (!hasText) {
      result = unattachedMediaResult();
    } else {
      const command = parseCommand({ channel: inbound.channel, text: inbound.text });
      result = await executeParsedCommand(command, route, inbound);
      if (hasAttachments && result.attachmentContext) {
        await finalizeInboundAttachments({
          route,
          inbound,
          messageLogId: inboundLog.id,
          attachmentContext: result.attachmentContext,
        });
      }
    }

    await updateInboundLog(inboundLog.id, result.parseStatus ?? "processed", result.relatedWorkOrderId);
    const outboundMessages = await queueReplies(route, inbound, result);

    return {
      ok: true,
      parseStatus: result.parseStatus ?? "processed",
      relatedWorkOrderId: result.relatedWorkOrderId,
      outboundMessages,
    };
  } catch (error) {
    const appError = normalizeError(error);
    logInboundProcessingError({
      inbound,
      route,
      intakeSessionId: activeIntake?.id,
      currentStep: activeIntake?.current_step,
      parseStatus: appError.parseStatus,
      error,
    });
    if (!route || !inboundLog) {
      throw error;
    }

    await updateInboundLog(inboundLog.id, appError.parseStatus, undefined, getErrorMessage(error));
    const outboundMessages = appError.publicMessage
      ? await queueReplies(route, inbound, {
          parseStatus: appError.parseStatus,
          replies: [{
            recipientIdentifier: inbound.senderIdentifier,
            text: appError.publicMessage,
            idempotencyKey: errorReplyKey(inbound, appError.parseStatus),
          }],
        })
      : [];

    return { ok: true, parseStatus: appError.parseStatus, outboundMessages };
  }
}

async function executeParsedCommand(command: ReturnType<typeof parseCommand>, route: WorkshopRoute, inbound: NormalizedInboundMessage): Promise<CommandExecutionResult> {
  const result = await dispatchCommand(command, route, inbound);
  if (result.effects?.length) {
    await executeCommandEffects(route.workshopId, result.effects);
  }
  return result;
}

async function dispatchCommand(command: ReturnType<typeof parseCommand>, route: WorkshopRoute, inbound: NormalizedInboundMessage): Promise<CommandExecutionResult> {
  switch (command.kind) {
    case "NUOVA":
      return startIntake({ workshopId: route.workshopId, channel: inbound.channel, senderIdentifier: inbound.senderIdentifier, plate: command.plate });
    case "STATO":
      return handleStatus(route.workshopId, command.plate);
    case "NOTA":
      return addNote(route.workshopId, command.plate, command.text, inbound.senderIdentifier, inbound.channel);
    case "RICAMBIO":
      return addPart({ workshopId: route.workshopId, plate: command.plate, description: command.description, quantity: command.quantity, unitPrice: command.unitPrice, actorRef: inbound.senderIdentifier, source: inbound.channel });
    case "MANODOPERA":
      return addLabor(route.workshopId, command.plate, command.hours, inbound.senderIdentifier, inbound.channel);
    case "CHIUDI":
      return closeWorkOrder({ workshopId: route.workshopId, plate: command.plate, actorRef: inbound.senderIdentifier, mechanicIdentifier: route.senderIdentifier });
    case "RITIRATA":
      return markCollected(route.workshopId, command.plate, inbound.senderIdentifier);
    case "REVISIONE_LOOKUP":
      return lookupRevision(route.workshopId, command.plate);
    case "REVISIONE_UPDATE":
      return updateRevisionByPlate({ workshopId: route.workshopId, plate: command.plate, revisionDueDate: command.revisionDueDate, actorRef: inbound.senderIdentifier, source: inbound.channel, mechanicIdentifier: route.senderIdentifier });
    case "REVISIONIINSCADENZA":
      return listRevisionDue(route.workshopId);
    case "CERCA":
      return searchByPlateOrCustomer(route.workshopId, command.query);
    case "INVIA_DOCUMENTO":
      return buildSendDocumentCommandResult({
        workshopId: route.workshopId,
        plate: command.plate,
        documentType: command.documentType,
        actorRef: inbound.senderIdentifier,
        recipientIdentifier: inbound.senderIdentifier,
        providerMessageId: inbound.providerMessageId,
      });
    case "COMANDO":
      return commandHelpResult();
  }
}

function commandHelpResult(): CommandExecutionResult {
  const text = [
    "COMANDI DISPONIBILI",
    "",
    "NUOVA AB123CD",
    "Crea o riprende una scheda per targa.",
    "",
    "CERCA AB123CD",
    "Cerca storico veicolo o schede aperte.",
    "",
    "NOTA AB123CD testo nota",
    "Aggiunge una nota alla scheda.",
    "",
    "STATO AB123CD",
    "Mostra stato e totale scheda.",
    "",
    "RICAMBIO AB123CD descrizione qty prezzo",
    "Aggiunge un ricambio alla scheda.",
    "",
    "MANODOPERA AB123CD ore",
    "Aggiunge ore di manodopera alla scheda.",
    "",
    "CHIUDI AB123CD",
    "Marca il veicolo come pronto al ritiro.",
    "",
    "RITIRATA AB123CD",
    "Conferma ritiro veicolo e chiude scheda.",
    "",
    "REVISIONE AB123CD 2026-05-20",
    "Aggiorna la scadenza revisione.",
    "",
    "REVISIONE AB123CD",
    "Consulta la scadenza revisione.",
    "",
    "REVISIONIINSCADENZA",
    "Revisioni in scadenza nei prossimi 30 giorni.",
    "",
    "INVIA ACCETTAZIONE|PREVENTIVO|RIEPILOGO AB123CD",
    "Recupera link documento se gia generato.",
    "",
    "COMANDO",
    "Mostra questa guida.",
  ].join("\n");
  return {
    parseStatus: "processed",
    replies: [{ recipientIdentifier: "", text, idempotencyKey: "" }],
  };
}

async function searchByPlateOrCustomer(workshopId: string, query: string): Promise<CommandExecutionResult> {
  const cleanQuery = query.trim().replace(/\s+/g, " ");
  if (cleanQuery.length < 2) {
    throw new AppError("Search query too short", {
      parseStatus: "validation_failed",
      publicMessage: "Ricerca troppo breve.\nUsa almeno due caratteri.",
    });
  }

  const plateQuery = normalizePlate(cleanQuery).replace(/[%_]/g, "");
  const nameQuery = cleanQuery.replace(/[%_]/g, "");
  const candidates = new Map<string, {
    plate: string;
    model: string | null;
    customerName: string | null;
    activeWorkOrderId: string | null;
    activeStatus: string | null;
    latestWorkOrderId: string | null;
    latestStatus: string | null;
    latestPublicCode: string | null;
  }>();

  if (plateQuery.length >= 2) {
    const { data, error } = await supabaseServer
      .from("vehicles")
      .select("id,customer_id,plate_normalized,model")
      .eq("workshop_id", workshopId)
      .ilike("plate_normalized", `%${plateQuery}%`)
      .order("updated_at", { ascending: false })
      .limit(8);
    if (error) {
      throw new Error(`Failed to search vehicles by plate: ${error.message}`);
    }
    for (const row of data ?? []) {
      candidates.set(row.plate_normalized, {
        plate: row.plate_normalized,
        model: row.model,
        customerName: null,
        activeWorkOrderId: null,
        activeStatus: null,
        latestWorkOrderId: null,
        latestStatus: null,
        latestPublicCode: null,
      });
    }
  }

  if (nameQuery.length >= 2) {
    const { data: workOrders, error } = await supabaseServer
      .from("work_orders")
      .select("id,public_code,plate_normalized,vehicle_model_snapshot,customer_name_snapshot,status,updated_at")
      .eq("workshop_id", workshopId)
      .ilike("customer_name_snapshot", `%${nameQuery}%`)
      .order("updated_at", { ascending: false })
      .limit(10);
    if (error) {
      throw new Error(`Failed to search work orders by customer: ${error.message}`);
    }
    for (const row of workOrders ?? []) {
      const existing = candidates.get(row.plate_normalized);
      candidates.set(row.plate_normalized, {
        plate: row.plate_normalized,
        model: row.vehicle_model_snapshot,
        customerName: row.customer_name_snapshot,
        activeWorkOrderId: existing?.activeWorkOrderId ?? null,
        activeStatus: existing?.activeStatus ?? null,
        latestWorkOrderId: row.id,
        latestStatus: row.status,
        latestPublicCode: row.public_code,
      });
    }
  }

  const plates = [...candidates.keys()];
  if (plates.length > 0) {
    const { data, error } = await supabaseServer
      .from("work_orders")
      .select("id,public_code,plate_normalized,vehicle_model_snapshot,customer_name_snapshot,status,updated_at")
      .eq("workshop_id", workshopId)
      .in("plate_normalized", plates)
      .order("updated_at", { ascending: false })
      .limit(30);
    if (error) {
      throw new Error(`Failed to read search work order context: ${error.message}`);
    }
    for (const row of data ?? []) {
      const candidate = candidates.get(row.plate_normalized);
      if (!candidate) continue;
      if (!candidate.latestWorkOrderId) {
        candidate.latestWorkOrderId = row.id;
        candidate.latestStatus = row.status;
        candidate.latestPublicCode = row.public_code;
      }
      if (["accepted", "in_progress", "ready"].includes(row.status) && !candidate.activeWorkOrderId) {
        candidate.activeWorkOrderId = row.id;
        candidate.activeStatus = row.status;
      }
      candidate.model = candidate.model ?? row.vehicle_model_snapshot;
      candidate.customerName = candidate.customerName ?? row.customer_name_snapshot;
    }
  }

  const results = [...candidates.values()]
    .sort((left, right) => Number(Boolean(right.activeWorkOrderId)) - Number(Boolean(left.activeWorkOrderId)) || left.plate.localeCompare(right.plate))
    .slice(0, 8);

  if (results.length === 0) {
    return {
      parseStatus: "not_found",
      replies: [{
        recipientIdentifier: "",
        text: `Nessun risultato per "${cleanQuery}".`,
        idempotencyKey: "",
      }],
    };
  }

  if (results.length === 1) {
    const result = results[0];
    const resolvedWorkOrderId = result.activeWorkOrderId ?? result.latestWorkOrderId ?? undefined;
    return {
      parseStatus: "processed",
      relatedWorkOrderId: resolvedWorkOrderId,
      attachmentContext: resolvedWorkOrderId ? { kind: "work_order", id: resolvedWorkOrderId } : undefined,
      replies: [{
        recipientIdentifier: "",
        text: [
          `${result.plate}`,
          `Cliente: ${result.customerName ?? "non disponibile"}`,
          `Veicolo: ${result.model ?? "non disponibile"}`,
          `Scheda: ${result.activeStatus ? statusLabelForSearch(result.activeStatus) : result.latestStatus ? statusLabelForSearch(result.latestStatus) : "non disponibile"}`,
          result.latestPublicCode ? `Codice: ${result.latestPublicCode}` : null,
          `Comandi: STATO ${result.plate}, NOTA ${result.plate} testo, REVISIONE ${result.plate}`,
        ].filter(Boolean).join("\n"),
        idempotencyKey: "",
      }],
    };
  }

  return {
    parseStatus: "processed",
    replies: [{
      recipientIdentifier: "",
      text: `Risultati per "${cleanQuery}":\n${results.map((result, index) => {
        const status = result.activeStatus ?? result.latestStatus;
        return `${index + 1}. ${result.plate} - ${result.customerName ?? "cliente n/d"} - ${status ? statusLabelForSearch(status) : "nessuna scheda"}`;
      }).join("\n")}\nUsa la targa con STATO, NOTA, RICAMBIO, MANODOPERA, CHIUDI, RITIRATA o REVISIONE.`,
      idempotencyKey: "",
    }],
  };
}

async function finalizeInboundAttachments(input: {
  route: WorkshopRoute;
  inbound: NormalizedInboundMessage;
  messageLogId: string;
  attachmentContext: { kind: "intake" | "work_order"; id: string };
}): Promise<void> {
  if (input.attachmentContext.kind === "intake") {
    await attachMessageAttachmentsToIntake({
      workshopId: input.route.workshopId,
      messageLogId: input.messageLogId,
      intakeSessionId: input.attachmentContext.id,
    });
    return;
  }

  await attachMessageAttachmentsToWorkOrder({
    workshopId: input.route.workshopId,
    messageLogId: input.messageLogId,
    workOrderId: input.attachmentContext.id,
    actorType: "mechanic",
    actorRef: input.inbound.senderIdentifier,
  });
}

async function processCustomerInbound(
  route: WorkshopRoute,
  inbound: NormalizedInboundMessage,
  messageLogId: string,
): Promise<InboundProcessingResult> {
  await updateInboundLog(messageLogId, "ignored");
  const outboundMessages = await queueReplies(route, inbound, {
    parseStatus: "ignored",
    replies: [{
      recipientIdentifier: inbound.senderIdentifier,
      text: "Ciao, abbiamo ricevuto il tuo messaggio. L'officina ti risponderà appena possibile.",
      idempotencyKey: `customer-ack:${inbound.provider}:${inbound.providerMessageId}`,
    }],
  });
  return { ok: true, parseStatus: "ignored", outboundMessages };
}

async function resolveWorkshopRoute(inbound: NormalizedInboundMessage): Promise<WorkshopRoute> {
  const { data, error } = await supabaseServer
    .from("workshop_channels")
    .select("workshop_id,channel,provider,recipient_identifier,sender_identifier,provider_config")
    .eq("channel", inbound.channel)
    .eq("provider", inbound.provider)
    .eq("recipient_identifier", inbound.recipientIdentifier)
    .eq("is_active", true)
    .single();

  if (error) {
    throw new AppError("Workshop route not found", {
      parseStatus: "ignored",
      publicMessage: "Canale non configurato.",
    });
  }

  // Gate suspended/closed workshops and blocked subscriptions.
  const { data: workshop } = await supabaseServer
    .from("workshops")
    .select("status")
    .eq("id", data.workshop_id)
    .maybeSingle();
  const workshopStatus = (workshop as any)?.status ?? "active";
  if (workshopStatus === "suspended" || workshopStatus === "closed") {
    throw new AppError("Workshop not active", {
      parseStatus: "ignored",
      publicMessage: "Officina non attiva.",
    });
  }

  await requireWorkshopAccess(data.workshop_id);

  return {
    workshopId: data.workshop_id,
    channel: data.channel as Channel,
    provider: data.provider,
    recipientIdentifier: data.recipient_identifier,
    senderIdentifier: data.sender_identifier ?? undefined,
    providerConfig: (data.provider_config as Record<string, unknown>) ?? {},
  };
}

async function logInbound(inbound: NormalizedInboundMessage, workshopId: string): Promise<{ id: string; duplicate: boolean }> {
  const { data, error } = await supabaseServer
    .from("message_logs")
    .insert({
      workshop_id: workshopId,
      channel: inbound.channel,
      provider: inbound.provider,
      provider_message_id: inbound.providerMessageId,
      direction: "inbound",
      sender_identifier: inbound.senderIdentifier,
      recipient_identifier: inbound.recipientIdentifier,
      raw_text: inbound.text,
      raw_payload: inbound.rawPayload ?? {},
      parse_status: "received",
      idempotency_key: inboundIdempotencyKey(inbound),
    })
    .select("id")
    .single();

  if (error?.code === "23505") {
    return { id: "", duplicate: true };
  }
  if (error) {
    throw new Error(`Failed to log inbound message: ${error.message}`);
  }

  return { id: data.id, duplicate: false };
}

async function updateInboundLog(id: string, parseStatus: ParseStatus, relatedWorkOrderId?: string, errorMessage?: string): Promise<void> {
  if (!id) return;
  const { error } = await supabaseServer
    .from("message_logs")
    .update({
      parse_status: parseStatus,
      related_work_order_id: relatedWorkOrderId ?? null,
      error_message: errorMessage ?? null,
    })
    .eq("id", id);

  if (error) {
    throw new Error(`Failed to update inbound message log: ${error.message}`);
  }
}

async function queueReplies(route: WorkshopRoute, inbound: NormalizedInboundMessage, result: CommandExecutionResult): Promise<QueuedOutboundMessage[]> {
  const queued: QueuedOutboundMessage[] = [];
  for (let index = 0; index < result.replies.length; index += 1) {
    const reply = result.replies[index];
    const outbound = await queueOutbound({
      workshopId: route.workshopId,
      channel: inbound.channel,
      provider: inbound.provider,
      senderIdentifier: route.recipientIdentifier,
      recipientIdentifier: reply.recipientIdentifier || inbound.senderIdentifier,
      text: reply.text,
      idempotencyKey: reply.idempotencyKey || `outbound:${inbound.provider}:${inbound.recipientIdentifier}:${inbound.senderIdentifier}:${inbound.providerMessageId}:${index}`,
      relatedWorkOrderId: result.relatedWorkOrderId,
      relatedReminderId: reply.relatedReminderId,
      relatedDocumentId: reply.relatedDocumentId,
    });
    if (outbound) queued.push(outbound);
  }
  return queued;
}

function attachmentOnlyIntakeResult(): CommandExecutionResult {
  return {
    parseStatus: "processed",
    replies: [{
      recipientIdentifier: "",
      text: "Allegato salvato nella scheda in compilazione.\nOra rispondi con il testo richiesto.",
      idempotencyKey: "",
    }],
  };
}

function unattachedMediaResult(): CommandExecutionResult {
  return {
    parseStatus: "processed",
    replies: [{
      recipientIdentifier: "",
      text: "Allegato ricevuto.\nPer collegarlo a una scheda usa un comando con targa oppure il dashboard.",
      idempotencyKey: "",
    }],
  };
}

function inboundIdempotencyKey(inbound: NormalizedInboundMessage): string {
  return `inbound:${inbound.provider}:${inbound.recipientIdentifier}:${inbound.senderIdentifier}:${inbound.providerMessageId}`;
}

function errorReplyKey(inbound: NormalizedInboundMessage, parseStatus: ParseStatus): string {
  return `outbound:${inbound.provider}:${inbound.recipientIdentifier}:${inbound.senderIdentifier}:${inbound.providerMessageId}:error:${parseStatus}`;
}

function normalizeError(error: unknown): AppError {
  if (error instanceof AppError) {
    return error;
  }

  return new AppError(getErrorMessage(error), {
    parseStatus: "error",
    publicMessage: "Errore interno.\nRiprova tra poco.",
  });
}

function logInboundProcessingError(input: {
  inbound: NormalizedInboundMessage;
  route?: WorkshopRoute;
  intakeSessionId?: string;
  currentStep?: string;
  parseStatus: ParseStatus;
  error: unknown;
}): void {
  console.error("[messages.processNormalizedInbound] processing_failed", {
    workshopId: input.route?.workshopId,
    channel: input.inbound.channel,
    provider: input.inbound.provider,
    providerMessageId: input.inbound.providerMessageId,
    senderIdentifier: input.inbound.senderIdentifier,
    recipientIdentifier: input.inbound.recipientIdentifier,
    textLength: input.inbound.text.length,
    attachmentCount: input.inbound.attachments?.length ?? 0,
    attachmentTypes: (input.inbound.attachments ?? []).map((attachment) => attachment.attachmentType),
    intakeSessionId: input.intakeSessionId,
    current_step: input.currentStep,
    parseStatus: input.parseStatus,
    errorMessage: getErrorMessage(input.error),
    errorStack: input.error instanceof Error ? input.error.stack : undefined,
    errorCode: getErrorField(input.error, "code"),
    errorDetails: getErrorField(input.error, "details"),
    errorHint: getErrorField(input.error, "hint"),
  });
}

function getErrorField(error: unknown, key: "code" | "details" | "hint"): string | undefined {
  if (!error || typeof error !== "object") {
    return undefined;
  }

  const value = (error as Record<string, unknown>)[key];
  return typeof value === "string" && value ? value : undefined;
}

function statusLabelForSearch(status: string): string {
  const labels: Record<string, string> = {
    accepted: "accettata",
    in_progress: "in lavorazione",
    ready: "pronta",
    collected: "ritirata",
    archived: "archiviata",
  };
  return labels[status] ?? status;
}
