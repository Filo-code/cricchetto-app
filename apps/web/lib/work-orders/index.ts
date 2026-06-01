import { randomUUID } from "node:crypto";
import { writeAuditEvent } from "../audit";
import { formatDecimal, formatMoney } from "../decimals";
import { AppError } from "../errors";
import { completeIntakeAtomically } from "../intake";
import { enqueueDocumentGeneration, processPendingDocuments } from "../documents";
import { CUSTOMER_PHONE_VALIDATION_MESSAGE, normalizeCustomerPhone } from "../phones";
import { assertValidPlate } from "../plates";
import { supabaseServer } from "../supabase-server";
import type { Channel, CommandEffect, CommandExecutionResult, RecipientPolicy, WorkOrderStatus } from "../types";

type WorkOrderMutationSource = Channel | "dashboard" | "system";
type WorkOrderActorType = "mechanic" | "dashboard_user" | "system";

const ACTIVE_STATUSES = ["accepted", "in_progress", "ready"];

const ALLOWED_TRANSITIONS: Record<WorkOrderStatus, WorkOrderStatus[]> = {
  accepted:    ["ready", "archived"],
  in_progress: ["ready", "archived"],
  ready:       ["collected"],
  collected:   [],
  archived:    [],
};

function assertTransitionAllowed(from: WorkOrderStatus, to: WorkOrderStatus, plate: string): void {
  if (!ALLOWED_TRANSITIONS[from]?.includes(to)) {
    throw new AppError(`Cannot transition work order from ${from} to ${to}`, {
      statusCode: 409,
      parseStatus: "validation_failed",
      publicMessage: `${plate}: operazione non consentita (stato attuale: ${from}).`,
    });
  }
}

export interface WorkOrderLookupInput {
  workshopId: string;
  plateNormalized: string;
}

export interface DashboardWorkOrderCreateInput {
  workshopId: string;
  plate: string;
  vehicleModel: string;
  reportedIssue: string;
  kilometers: number;
  customerFirstName: string;
  customerLastName: string;
  customerPhone: string;
  actorRef: string;
}

export interface DashboardWorkOrderCreateResult {
  workOrderId: string;
  publicCode: string;
  plate: string;
}

export async function getActiveWorkOrderByPlate(input: WorkOrderLookupInput): Promise<any | null> {
  const { data, error } = await supabaseServer
    .from("work_orders")
    .select("*")
    .eq("workshop_id", input.workshopId)
    .eq("plate_normalized", input.plateNormalized)
    .in("status", ACTIVE_STATUSES)
    .limit(2);

  if (error) {
    throw new Error(`Failed to lookup work order: ${error.message}`);
  }
  if ((data?.length ?? 0) > 1) {
    throw new AppError("Multiple active work orders", {
      parseStatus: "conflict",
      publicMessage: `Errore scheda per ${input.plateNormalized}.\nControlla manualmente.`,
    });
  }

  return data?.[0] ?? null;
}

export async function handleStatus(workshopId: string, plate: string): Promise<CommandExecutionResult> {
  const workOrder = await requireActiveWorkOrder(workshopId, plate);
  const totals = await getTotals(workshopId, workOrder.id);
  return {
    parseStatus: "processed",
    relatedWorkOrderId: workOrder.id,
    replies: [{ recipientIdentifier: "", text: `${plate}\nStato: ${statusLabel(workOrder.status)}\nTotale: ${formatMoney(totals.grand_total)}\nCodice: ${workOrder.public_code}`, idempotencyKey: "" }],
    attachmentContext: { kind: "work_order", id: workOrder.id },
  };
}

export async function createDashboardWorkOrder(input: DashboardWorkOrderCreateInput): Promise<DashboardWorkOrderCreateResult> {
  const plate = assertValidPlate(requiredText(input.plate, "La targa è obbligatoria."));
  const vehicleModel = requiredText(input.vehicleModel, "Il modello auto è obbligatorio.");
  const reportedIssue = requiredText(input.reportedIssue, "Il problema segnalato è obbligatorio.");
  const firstName = requiredText(input.customerFirstName, "Il nome cliente è obbligatorio.");
  const lastName = requiredText(input.customerLastName, "Il cognome cliente è obbligatorio.");
  const customerName = `${firstName} ${lastName}`.replace(/\s+/g, " ").trim();
  const customerPhone = normalizeCustomerPhone(requiredText(input.customerPhone, "Il telefono cliente e obbligatorio."));
  if (!customerPhone) {
    throw new AppError("Invalid customer phone", {
      statusCode: 400,
      parseStatus: "validation_failed",
      publicMessage: CUSTOMER_PHONE_VALIDATION_MESSAGE,
    });
  }
  if (!Number.isInteger(input.kilometers) || input.kilometers < 0 || input.kilometers > 999999) {
    throw new AppError("Invalid kilometers", {
      statusCode: 400,
      parseStatus: "validation_failed",
      publicMessage: "Km non validi. Inserisci un numero compreso tra 0 e 999999.",
    });
  }

  const active = await getActiveWorkOrderByPlate({ workshopId: input.workshopId, plateNormalized: plate });
  if (active) {
    throw new AppError("Active work order already exists", {
      statusCode: 409,
      parseStatus: "conflict",
      publicMessage: `Esiste già una scheda attiva per ${plate}.`,
    });
  }

  const intakeSessionId = randomUUID();
  const senderIdentifier = `dashboard:${input.actorRef}:${intakeSessionId}`;
  const intakeData = {
    vehicle_model: vehicleModel,
    reported_issue: reportedIssue,
    kilometers: input.kilometers,
    customer_name: customerName,
    customer_phone: customerPhone,
  };

  const { error: intakeError } = await supabaseServer.from("intake_sessions").insert({
    id: intakeSessionId,
    workshop_id: input.workshopId,
    channel: "telegram_test",
    sender_identifier: senderIdentifier,
    plate_normalized: plate,
    current_step: "customer_phone",
    data: intakeData,
    expires_at: new Date(Date.now() + 10 * 60 * 1000).toISOString(),
  });

  if (intakeError) {
    throw new Error(`Failed to create dashboard intake session: ${intakeError.message}`);
  }

  try {
    const result = await completeIntakeAtomically({
      workshopId: input.workshopId,
      intakeSessionId,
      actorRef: input.actorRef,
      data: intakeData,
      plate,
    });
    const workOrderId = result.relatedWorkOrderId;
    if (!workOrderId) {
      throw new Error("Dashboard work order creation did not return work order id");
    }
    const created = await readCreatedWorkOrder(input.workshopId, workOrderId);
    return {
      workOrderId,
      publicCode: created.public_code,
      plate: created.plate_normalized,
    };
  } catch (error) {
    await deactivateDashboardIntake(input.workshopId, intakeSessionId).catch(() => undefined);
    if (isActiveWorkOrderConstraintError(error)) {
      throw new AppError("Active work order already exists", {
        statusCode: 409,
        parseStatus: "conflict",
        publicMessage: `Esiste già una scheda attiva per ${plate}.`,
      });
    }
    throw error;
  }
}

export async function addNote(workshopId: string, plate: string, text: string, actorRef: string, source: WorkOrderMutationSource): Promise<CommandExecutionResult> {
  const workOrder = await requireMutableWorkOrder(workshopId, plate);
  const noteId = randomUUID();
  return {
    parseStatus: "processed",
    relatedWorkOrderId: workOrder.id,
    replies: [{ recipientIdentifier: "", text: `Nota aggiunta a ${plate}.`, idempotencyKey: "" }],
    attachmentContext: { kind: "work_order", id: workOrder.id },
    effects: [
      {
        type: "insert_note",
        payload: { id: noteId, workOrderId: workOrder.id, note: text, source, createdBy: actorRef },
      },
      {
        type: "write_audit",
        payload: { workOrderId: workOrder.id, eventType: "note_created", actorType: "mechanic", actorRef, after: { id: noteId, note: text } },
      },
    ],
  };
}

export async function addPart(input: {
  workshopId: string;
  plate: string;
  description: string;
  quantity: number;
  unitPrice: number;
  actorRef: string;
  source: WorkOrderMutationSource;
}): Promise<CommandExecutionResult> {
  const workOrder = await requireMutableWorkOrder(input.workshopId, input.plate);
  const itemId = randomUUID();
  const rowTotal = input.quantity * input.unitPrice;
  return {
    parseStatus: "processed",
    relatedWorkOrderId: workOrder.id,
    replies: [{ recipientIdentifier: "", text: `Ricambio aggiunto:\n${input.description}\n${formatDecimal(input.quantity)} x ${input.unitPrice.toFixed(2).replace(".", ",")} = ${formatMoney(rowTotal)}`, idempotencyKey: "" }],
    attachmentContext: { kind: "work_order", id: workOrder.id },
    effects: [
      {
        type: "insert_work_order_item",
        payload: { id: itemId, workOrderId: workOrder.id, itemType: "part", description: input.description, quantity: input.quantity, unitPrice: input.unitPrice, source: input.source, createdBy: input.actorRef },
      },
      {
        type: "write_audit",
        payload: { workOrderId: workOrder.id, eventType: "item_created", actorType: "mechanic", actorRef: input.actorRef, after: { id: itemId, description: input.description, quantity: input.quantity, unit_price: input.unitPrice } },
      },
    ],
  };
}

export async function addLabor(workshopId: string, plate: string, hours: number, actorRef: string, source: WorkOrderMutationSource): Promise<CommandExecutionResult> {
  const workOrder = await requireMutableWorkOrder(workshopId, plate);
  const settings = await getSettings(workshopId);
  const hourlyRate = Number(settings.hourly_rate);
  const itemId = randomUUID();
  return {
    parseStatus: "processed",
    relatedWorkOrderId: workOrder.id,
    replies: [{ recipientIdentifier: "", text: `Manodopera aggiunta:\n${formatDecimal(hours)} ore x ${hourlyRate.toFixed(2).replace(".", ",")} = ${formatMoney(hours * hourlyRate)}`, idempotencyKey: "" }],
    attachmentContext: { kind: "work_order", id: workOrder.id },
    effects: [
      {
        type: "insert_work_order_item",
        payload: { id: itemId, workOrderId: workOrder.id, itemType: "labor", description: "Manodopera", quantity: hours, unitPrice: hourlyRate, source, createdBy: actorRef },
      },
      {
        type: "write_audit",
        payload: { workOrderId: workOrder.id, eventType: "item_created", actorType: "mechanic", actorRef, after: { id: itemId, description: "Manodopera", quantity: hours, unit_price: hourlyRate } },
      },
    ],
  };
}

export async function closeWorkOrder(input: {
  workshopId: string;
  plate: string;
  actorRef: string;
  mechanicIdentifier?: string;
  actorType?: WorkOrderActorType;
  notifyCustomer?: boolean;
}): Promise<CommandExecutionResult> {
  const workOrder = await requireMutableWorkOrder(input.workshopId, input.plate);
  assertTransitionAllowed(workOrder.status, "ready", input.plate);
  const before = { status: workOrder.status, ready_at: workOrder.ready_at };
  const readyAt = new Date().toISOString();
  const [settings, workshopDisplayName] = await Promise.all([
    getSettings(input.workshopId),
    getWorkshopDisplayName(input.workshopId),
  ]);
  const customerPhone = workOrder.customer_phone_snapshot ? normalizeCustomerPhone(workOrder.customer_phone_snapshot) : null;
  return {
    parseStatus: "processed",
    relatedWorkOrderId: workOrder.id,
    replies: [{ recipientIdentifier: "", text: `${input.plate} pronta per ritiro.\nRiepilogo finale in preparazione.`, idempotencyKey: "" }],
    attachmentContext: { kind: "work_order", id: workOrder.id },
    effects: [
      {
        type: "update_work_order_status",
        payload: { workOrderId: workOrder.id, status: "ready", readyAt },
      },
      {
        type: "write_audit",
        payload: { workOrderId: workOrder.id, eventType: "status_changed", actorType: input.actorType ?? "mechanic", actorRef: input.actorRef, before, after: { status: "ready", ready_at: readyAt } },
      },
      {
        type: "enqueue_document",
        payload: { workOrderId: workOrder.id, documentType: "final_summary", createdBy: input.actorRef },
      },
      {
        type: "schedule_reminder",
        payload: { workOrderId: workOrder.id, readyAt, readyReminderDays: Number(settings.ready_reminder_days), recipientPolicy: settings.ready_reminder_recipient_policy as RecipientPolicy, mechanicIdentifier: input.mechanicIdentifier, customerIdentifier: customerPhone },
      },
      ...(input.notifyCustomer !== false ? [{
        type: "schedule_pickup_notification" as const,
        payload: { workOrderId: workOrder.id, readyAt, customerIdentifier: customerPhone, customerName: workOrder.customer_name_snapshot ?? null, plate: workOrder.plate_normalized, workshopDisplayName },
      }] : []),
    ],
  };
}

export async function generateEstimateDocument(input: {
  workshopId: string;
  workOrderId: string;
  actorRef: string;
  actorType?: WorkOrderActorType;
}): Promise<{ workOrderId: string; publicCode: string }> {
  const { data: workOrder, error } = await supabaseServer
    .from("work_orders")
    .select("id,public_code,plate_normalized,status")
    .eq("workshop_id", input.workshopId)
    .eq("id", input.workOrderId)
    .single();

  if (error || !workOrder) {
    throw new AppError("Work order not found", {
      statusCode: 404,
      parseStatus: "not_found",
      publicMessage: "Scheda non trovata.",
    });
  }
  if (!ACTIVE_STATUSES.includes(workOrder.status)) {
    throw new AppError("Work order is not in an estimable state", {
      statusCode: 409,
      parseStatus: "validation_failed",
      publicMessage: "Il preventivo puo essere generato solo su schede attive.",
    });
  }

  await enqueueDocumentGeneration({
    workshopId: input.workshopId,
    workOrderId: workOrder.id,
    documentType: "estimate",
    createdBy: input.actorRef,
  });
  await processPendingDocuments(1).catch((error) => {
    console.warn("[work-orders.generateEstimateDocument] document_processing_failed", {
      workshopId: input.workshopId,
      workOrderId: workOrder.id,
      errorMessage: error instanceof Error ? error.message : String(error),
    });
  });

  await writeAuditEvent({
    workshopId: input.workshopId,
    workOrderId: workOrder.id,
    eventType: "document_requested",
    actorType: input.actorType ?? "dashboard_user",
    actorRef: input.actorRef,
    after: { document_type: "estimate" },
  });

  return { workOrderId: workOrder.id, publicCode: workOrder.public_code };
}

export async function markCollected(workshopId: string, plate: string, actorRef: string, actorType: WorkOrderActorType = "mechanic"): Promise<CommandExecutionResult> {
  const workOrder = await requireActiveWorkOrder(workshopId, plate);
  assertTransitionAllowed(workOrder.status, "collected", plate);
  const before = { status: workOrder.status, collected_at: workOrder.collected_at };
  const collectedAt = new Date().toISOString();
  return {
    parseStatus: "processed",
    relatedWorkOrderId: workOrder.id,
    replies: [{ recipientIdentifier: "", text: `${plate} segnata come ritirata.\nPromemoria fermati.`, idempotencyKey: "" }],
    attachmentContext: { kind: "work_order", id: workOrder.id },
    effects: [
      {
        type: "update_work_order_status",
        payload: { workOrderId: workOrder.id, status: "collected", collectedAt },
      },
      {
        type: "cancel_reminders",
        payload: { workOrderId: workOrder.id },
      },
      {
        type: "write_audit",
        payload: { workOrderId: workOrder.id, eventType: "status_changed", actorType, actorRef, before, after: { status: "collected", collected_at: collectedAt } },
      },
    ],
  };
}

async function readCreatedWorkOrder(workshopId: string, workOrderId: string): Promise<{ public_code: string; plate_normalized: string }> {
  const { data, error } = await supabaseServer
    .from("work_orders")
    .select("public_code,plate_normalized")
    .eq("workshop_id", workshopId)
    .eq("id", workOrderId)
    .single();

  if (error) {
    throw new Error(`Failed to read created work order: ${error.message}`);
  }

  return data;
}

async function deactivateDashboardIntake(workshopId: string, intakeSessionId: string): Promise<void> {
  const { error } = await supabaseServer
    .from("intake_sessions")
    .update({ is_active: false })
    .eq("workshop_id", workshopId)
    .eq("id", intakeSessionId);

  if (error) {
    throw new Error(`Failed to deactivate failed dashboard intake: ${error.message}`);
  }
}

function requiredText(value: unknown, publicMessage: string): string {
  const trimmed = typeof value === "string" ? value.trim().replace(/\s+/g, " ") : "";
  if (!trimmed) {
    throw new AppError("Required field is missing", {
      statusCode: 400,
      parseStatus: "validation_failed",
      publicMessage,
    });
  }
  return trimmed;
}

function isActiveWorkOrderConstraintError(error: unknown): boolean {
  if (!(error instanceof Error)) return false;
  return /uq_work_orders_one_active_per_plate|duplicate key value/i.test(error.message);
}

async function requireActiveWorkOrder(workshopId: string, plate: string): Promise<any> {
  const workOrder = await getActiveWorkOrderByPlate({ workshopId, plateNormalized: plate });
  if (!workOrder) {
    throw new AppError("No active work order", {
      parseStatus: "not_found",
      publicMessage: `Nessuna scheda aperta per ${plate}.\nPer crearla: NUOVA ${plate}`,
    });
  }
  return workOrder;
}

async function requireMutableWorkOrder(workshopId: string, plate: string): Promise<any> {
  const workOrder = await getActiveWorkOrderByPlate({ workshopId, plateNormalized: plate });
  if (!workOrder) {
    const readOnlyWorkOrder = await getLatestReadOnlyWorkOrderByPlate(workshopId, plate);
    if (readOnlyWorkOrder) {
      throw new AppError("Work order is read-only", {
        parseStatus: "validation_failed",
        publicMessage: `${plate} non e modificabile.`,
      });
    }
    throw new AppError("No active work order", {
      parseStatus: "not_found",
      publicMessage: `Nessuna scheda aperta per ${plate}.\nPer crearla: NUOVA ${plate}`,
    });
  }
  if (workOrder.status === "collected" || workOrder.status === "archived") {
    throw new AppError("Work order is read-only", {
      parseStatus: "validation_failed",
      publicMessage: `${plate} non e modificabile.`,
    });
  }
  return workOrder;
}

async function getLatestReadOnlyWorkOrderByPlate(workshopId: string, plate: string): Promise<any | null> {
  const { data, error } = await supabaseServer
    .from("work_orders")
    .select("id,status")
    .eq("workshop_id", workshopId)
    .eq("plate_normalized", plate)
    .in("status", ["collected", "archived"])
    .order("created_at", { ascending: false })
    .limit(1);

  if (error) {
    throw new Error(`Failed to lookup read-only work order: ${error.message}`);
  }

  return data?.[0] ?? null;
}

async function getTotals(workshopId: string, workOrderId: string): Promise<{ grand_total: number }> {
  const { data, error } = await supabaseServer
    .from("work_order_totals")
    .select("grand_total")
    .eq("workshop_id", workshopId)
    .eq("work_order_id", workOrderId)
    .single();

  if (error) {
    throw new Error(`Failed to read totals: ${error.message}`);
  }

  return { grand_total: Number(data.grand_total) };
}

async function getSettings(workshopId: string): Promise<any> {
  const { data, error } = await supabaseServer
    .from("workshop_settings")
    .select("*")
    .eq("workshop_id", workshopId)
    .single();

  if (error) {
    throw new Error(`Failed to read workshop settings: ${error.message}`);
  }

  return data;
}

async function getWorkshopDisplayName(workshopId: string): Promise<string> {
  const { data } = await supabaseServer
    .from("workshops")
    .select("name,display_name")
    .eq("id", workshopId)
    .maybeSingle();
  return (data as any)?.display_name || (data as any)?.name || "Officina";
}

function reply(text: string, workOrderId?: string): CommandExecutionResult {
  return {
    parseStatus: "processed",
    relatedWorkOrderId: workOrderId,
    replies: [{ recipientIdentifier: "", text, idempotencyKey: "" }],
  };
}

function statusLabel(status: string): string {
  const labels: Record<string, string> = {
    accepted: "accettata",
    in_progress: "in lavorazione",
    ready: "pronta",
    collected: "ritirata",
    archived: "archiviata",
  };
  return labels[status] ?? status;
}
