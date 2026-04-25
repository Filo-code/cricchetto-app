import { AppError } from "../errors";
import { assertValidPlate } from "../plates";
import { normalizeCustomerPhone } from "../phones";
import { cancelRevisionReminders, scheduleRevisionReminders } from "../reminders";
import { supabaseServer } from "../supabase-server";
import { addDays, formatItalianDate, getLocalDate } from "../time";
import type { CommandExecutionResult, RecipientPolicy } from "../types";

export interface RevisionUpdateInput {
  workshopId: string;
  vehicleId: string;
  revisionDueDate: string;
  revisionReminderEnabled?: boolean;
  revisionAppointmentDate?: string | null;
  revisionAppointmentTime?: string | null;
  source: "whatsapp" | "telegram_test" | "dashboard" | "system";
  createdBy?: string;
  expectedRowVersion?: number;
}

export async function lookupRevision(workshopId: string, plate: string): Promise<CommandExecutionResult> {
  const vehicle = await findVehicleByPlate(workshopId, plate);
  if (!vehicle?.revision_due_date) {
    return reply(`${plate}\nRevisione non salvata.\nPer salvarla: REVISIONE ${plate} 2026-11-20`);
  }

  return reply([
    plate,
    `Revisione: ${formatItalianDate(vehicle.revision_due_date)}`,
    `Promemoria: ${vehicle.revision_reminder_enabled === false ? "disattivato" : "attivo"}`,
    vehicle.revision_appointment_date
      ? `Appuntamento: ${formatItalianDate(vehicle.revision_appointment_date)}${vehicle.revision_appointment_time ? ` ${String(vehicle.revision_appointment_time).slice(0, 5)}` : ""}`
      : null,
  ].filter(Boolean).join("\n"));
}

export async function updateRevisionByPlate(input: {
  workshopId: string;
  plate: string;
  revisionDueDate: string;
  actorRef: string;
  source: "whatsapp" | "telegram_test";
  mechanicIdentifier?: string;
}): Promise<CommandExecutionResult> {
  const vehicle = await findVehicleByPlate(input.workshopId, input.plate);
  if (!vehicle) {
    throw new AppError("Vehicle not found", {
      parseStatus: "not_found",
      publicMessage: `Nessun veicolo trovato per ${input.plate}.`,
    });
  }

  await updateRevisionDueDate({
    workshopId: input.workshopId,
    vehicleId: vehicle.id,
    revisionDueDate: input.revisionDueDate,
    source: input.source,
    createdBy: input.actorRef,
  });

  return reply(`Revisione aggiornata:\n${input.plate} - ${formatItalianDate(input.revisionDueDate)}\nPromemoria aggiornati.`);
}

export async function updateRevisionDueDate(input: RevisionUpdateInput): Promise<void> {
  const { data: vehicle, error: readError } = await supabaseServer
    .from("vehicles")
    .select("id,workshop_id,revision_due_date,revision_reminder_enabled,revision_appointment_date,revision_appointment_time,customer_id")
    .eq("workshop_id", input.workshopId)
    .eq("id", input.vehicleId)
    .single();

  if (readError) {
    throw new Error(`Failed to read vehicle: ${readError.message}`);
  }

  const nextReminderEnabled = input.revisionReminderEnabled ?? vehicle.revision_reminder_enabled ?? true;
  const nextAppointmentDate = input.revisionAppointmentDate === undefined
    ? vehicle.revision_appointment_date
    : input.revisionAppointmentDate;
  const nextAppointmentTime = input.revisionAppointmentTime === undefined
    ? vehicle.revision_appointment_time
    : input.revisionAppointmentTime;

  const { error: updateError } = await supabaseServer
    .from("vehicles")
    .update({
      revision_due_date: input.revisionDueDate,
      revision_last_updated_at: new Date().toISOString(),
      revision_reminder_enabled: nextReminderEnabled,
      revision_appointment_date: nextAppointmentDate,
      revision_appointment_time: nextAppointmentTime,
    })
    .eq("workshop_id", input.workshopId)
    .eq("id", input.vehicleId);

  if (updateError) {
    throw new Error(`Failed to update revision date: ${updateError.message}`);
  }

  const { error: eventError } = await supabaseServer.from("vehicle_revision_events").insert({
    workshop_id: input.workshopId,
    vehicle_id: input.vehicleId,
    previous_revision_due_date: vehicle.revision_due_date,
    new_revision_due_date: input.revisionDueDate,
    source: input.source,
    created_by: input.createdBy ?? null,
  });

  if (eventError) {
    throw new Error(`Failed to write revision event: ${eventError.message}`);
  }

  await cancelRevisionReminders(input.workshopId, input.vehicleId);
  const settings = await readSettings(input.workshopId);
  if (!settings.revision_reminders_enabled || nextReminderEnabled === false) {
    return;
  }

  const customerIdentifier = await readVehicleCustomerPhone(input.workshopId, vehicle.customer_id);

  await scheduleRevisionReminders({
    workshopId: input.workshopId,
    vehicleId: input.vehicleId,
    revisionDueDate: input.revisionDueDate,
    offsets: normalizeRevisionReminderOffsets(settings.revision_reminder_offsets_days),
    recipientPolicy: settings.revision_reminder_recipient_policy as RecipientPolicy,
    customerIdentifier,
  });
}

export async function listRevisionDue(workshopId: string): Promise<CommandExecutionResult> {
  const settings = await readWorkshop(workshopId);
  const today = getLocalDate(settings.timezone);
  const end = addDays(today, 30);

  const { data, error } = await supabaseServer
    .from("vehicles")
    .select("plate_normalized,revision_due_date")
    .eq("workshop_id", workshopId)
    .not("revision_due_date", "is", null)
    .lte("revision_due_date", end);

  if (error) {
    throw new Error(`Failed to read revisions: ${error.message}`);
  }

  const rows = (data ?? [])
    .filter((row: any) => row.revision_due_date < today || (row.revision_due_date >= today && row.revision_due_date <= end))
    .sort((a: any, b: any) => {
      const aOverdue = a.revision_due_date < today ? 0 : 1;
      const bOverdue = b.revision_due_date < today ? 0 : 1;
      if (aOverdue !== bOverdue) return aOverdue - bOverdue;
      if (a.revision_due_date !== b.revision_due_date) return a.revision_due_date.localeCompare(b.revision_due_date);
      return a.plate_normalized.localeCompare(b.plate_normalized);
    });

  if (rows.length === 0) {
    return reply("Nessuna revisione in scadenza nei prossimi 30 giorni.");
  }

  const lines = rows.slice(0, 10).map((row: any, index: number) => {
    const label = row.revision_due_date < today ? `scaduta ${formatItalianDate(row.revision_due_date)}` : formatItalianDate(row.revision_due_date);
    return `${index + 1}. ${row.plate_normalized} - ${label}`;
  });
  const remaining = rows.length > 10 ? `\nAltre: ${rows.length - 10}` : "";
  return reply(`Revisioni in scadenza:\n${lines.join("\n")}${remaining}`);
}

async function findVehicleByPlate(workshopId: string, plate: string): Promise<any | null> {
  const plateNormalized = assertValidPlate(plate);
  const { data, error } = await supabaseServer
    .from("vehicles")
    .select("*")
    .eq("workshop_id", workshopId)
    .eq("plate_normalized", plateNormalized)
    .maybeSingle();

  if (error) {
    throw new Error(`Failed to read vehicle: ${error.message}`);
  }

  return data;
}

async function readSettings(workshopId: string): Promise<any> {
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

async function readWorkshop(workshopId: string): Promise<any> {
  const { data, error } = await supabaseServer
    .from("workshops")
    .select("timezone")
    .eq("id", workshopId)
    .single();

  if (error) {
    throw new Error(`Failed to read workshop: ${error.message}`);
  }

  return data;
}

async function readVehicleCustomerPhone(workshopId: string, customerId: string | null): Promise<string | null> {
  if (!customerId) {
    return null;
  }

  const { data, error } = await supabaseServer
    .from("customers")
    .select("phone_normalized,phone")
    .eq("workshop_id", workshopId)
    .eq("id", customerId)
    .maybeSingle();

  if (error) {
    throw new Error(`Failed to read customer phone: ${error.message}`);
  }

  if (!data) {
    return null;
  }

  const candidate = data.phone_normalized ?? data.phone;
  return candidate ? normalizeCustomerPhone(candidate) : null;
}

function reply(text: string): CommandExecutionResult {
  return { parseStatus: "processed", replies: [{ recipientIdentifier: "", text, idempotencyKey: "" }] };
}

function normalizeRevisionReminderOffsets(value: unknown): number[] {
  if (!Array.isArray(value)) {
    return [30];
  }

  const normalized = value
    .map((entry) => Number(entry))
    .filter((entry) => Number.isInteger(entry) && entry > 0 && entry <= 365);

  return normalized.length > 0 ? normalized : [30];
}
