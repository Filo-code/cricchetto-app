"use server";

import { revalidatePath } from "next/cache";
import { uploadDashboardAttachment } from "../attachments";
import { readWorkOrderForMutation } from "./read";
import { DashboardApiError, dashboardPost } from "./api-client";

export interface DashboardActionState {
  ok: boolean;
  message: string;
  workOrderId?: string;
  stamp?: number;
}

const INITIAL_ERROR = "Operazione non riuscita. Riprova tra poco.";
const MUTABLE_STATUSES = new Set(["accepted", "in_progress", "ready"]);
const KILOMETERS_MAX = 999999;
const KILOMETERS_INVALID_MESSAGE = `Km non validi. Inserisci un numero compreso tra 0 e ${KILOMETERS_MAX}.`;

function parseKilometers(raw: unknown): number | null {
  if (typeof raw !== "string") return null;
  const trimmed = raw.trim();
  if (!/^\d+$/.test(trimmed)) return null;
  const value = Number(trimmed);
  if (!Number.isInteger(value) || value < 0 || value > KILOMETERS_MAX) return null;
  return value;
}

export async function createWorkOrderAction(_state: DashboardActionState, formData: FormData): Promise<DashboardActionState> {
  const kilometers = parseKilometers(formData.get("kilometers"));
  if (kilometers === null) {
    return failureState(KILOMETERS_INVALID_MESSAGE);
  }

  try {
    const result = await dashboardPost<{ workOrderId: string; publicCode: string; plate: string }>("/api/work-orders/create", {
      plate: textValue(formData, "plate"),
      vehicleModel: textValue(formData, "vehicleModel"),
      reportedIssue: textValue(formData, "reportedIssue"),
      kilometers,
      customerFirstName: textValue(formData, "customerFirstName"),
      customerLastName: textValue(formData, "customerLastName"),
      customerPhone: textValue(formData, "customerPhone"),
      actorRef: "dashboard",
    });

    revalidatePath("/dashboard");
    return successState(`Scheda creata per ${result.plate} - ${result.publicCode}`, { workOrderId: result.workOrderId });
  } catch (error) {
    return errorState(error);
  }
}

export async function closeWorkOrderAction(_state: DashboardActionState, formData: FormData): Promise<DashboardActionState> {
  const id = textValue(formData, "workOrderId");
  try {
    await dashboardPost(`/api/work-orders/${encodeURIComponent(id)}/actions/close`, { actorRef: "dashboard" });
    revalidateWorkOrderPaths(id);
    return successState("Scheda chiusa: il veicolo e pronto per il ritiro.");
  } catch (error) {
    return errorState(error);
  }
}

export async function collectWorkOrderAction(_state: DashboardActionState, formData: FormData): Promise<DashboardActionState> {
  const id = textValue(formData, "workOrderId");
  try {
    await dashboardPost(`/api/work-orders/${encodeURIComponent(id)}/actions/collect`, { actorRef: "dashboard" });
    revalidateWorkOrderPaths(id);
    return successState("Veicolo ritirato: scheda chiusa e promemoria fermati.");
  } catch (error) {
    return errorState(error);
  }
}

export async function addWorkOrderNoteAction(_state: DashboardActionState, formData: FormData): Promise<DashboardActionState> {
  const id = textValue(formData, "workOrderId");
  const note = textValue(formData, "note");
  if (!note) {
    return failureState("Inserisci una nota prima di salvare.");
  }

  try {
    await dashboardPost(`/api/work-orders/${encodeURIComponent(id)}/notes`, {
      actorRef: "dashboard",
      note,
    });
    revalidateWorkOrderPaths(id);
    return successState("Nota salvata nella scheda.");
  } catch (error) {
    return errorState(error);
  }
}

export async function addWorkOrderPartAction(_state: DashboardActionState, formData: FormData): Promise<DashboardActionState> {
  const id = textValue(formData, "workOrderId");
  const description = textValue(formData, "description");
  const quantity = decimalValue(formData, "quantity");
  const unitPrice = decimalValue(formData, "unitPrice");

  if (!description) {
    return failureState("La descrizione del ricambio e obbligatoria.");
  }
  if (quantity === null || quantity <= 0) {
    return failureState("Inserisci una quantita valida maggiore di zero.");
  }
  if (unitPrice === null || unitPrice < 0) {
    return failureState("Inserisci un prezzo unitario valido.");
  }

  try {
    await dashboardPost(`/api/work-orders/${encodeURIComponent(id)}/items`, {
      actorRef: "dashboard",
      itemType: "part",
      description,
      quantity,
      unitPrice,
    });
    revalidateWorkOrderPaths(id);
    return successState("Ricambio aggiunto alla scheda.");
  } catch (error) {
    return errorState(error);
  }
}

export async function addWorkOrderLaborAction(_state: DashboardActionState, formData: FormData): Promise<DashboardActionState> {
  const id = textValue(formData, "workOrderId");
  const hours = decimalValue(formData, "hours");

  if (hours === null || hours <= 0) {
    return failureState("Inserisci ore di manodopera valide.");
  }

  try {
    await dashboardPost(`/api/work-orders/${encodeURIComponent(id)}/items`, {
      actorRef: "dashboard",
      itemType: "labor",
      hours,
    });
    revalidateWorkOrderPaths(id);
    return successState("Manodopera aggiunta alla scheda.");
  } catch (error) {
    return errorState(error);
  }
}

export async function updateWorkOrderRevisionAction(_state: DashboardActionState, formData: FormData): Promise<DashboardActionState> {
  const workOrderId = textValue(formData, "workOrderId");
  const vehicleId = textValue(formData, "vehicleId");
  const revisionDueDate = textValue(formData, "revisionDueDate");
  const revisionAppointmentDate = textValue(formData, "revisionAppointmentDate");
  const revisionAppointmentTime = textValue(formData, "revisionAppointmentTime");
  const revisionReminderEnabled = formData.get("revisionReminderEnabled") === "on";

  if (!revisionDueDate) {
    return failureState("Inserisci una data revisione valida.");
  }
  if ((revisionAppointmentDate && !revisionAppointmentTime) || (!revisionAppointmentDate && revisionAppointmentTime)) {
    return failureState("Per fissare l'appuntamento compila sia data sia ora.");
  }

  try {
    await dashboardPost(
      `/api/vehicles/${encodeURIComponent(vehicleId)}/revision`,
      {
        actorRef: "dashboard",
        revisionDueDate,
        revisionReminderEnabled,
        revisionAppointmentDate: revisionAppointmentDate || null,
        revisionAppointmentTime: revisionAppointmentTime || null,
      },
      "PATCH",
    );
    revalidateWorkOrderPaths(workOrderId || undefined);
    return successState("Revisione aggiornata.");
  } catch (error) {
    return errorState(error);
  }
}

export async function generateEstimateAction(_state: DashboardActionState, formData: FormData): Promise<DashboardActionState> {
  const id = textValue(formData, "workOrderId");
  if (!id) {
    return failureState("Scheda non valida.");
  }
  try {
    await dashboardPost(`/api/work-orders/${encodeURIComponent(id)}/actions/estimate`, { actorRef: "dashboard" });
    revalidateWorkOrderPaths(id);
    return successState("Preventivo in generazione. Disponibile a breve.");
  } catch (error) {
    return errorState(error);
  }
}

export async function voidWorkOrderItemAction(_state: DashboardActionState, formData: FormData): Promise<DashboardActionState> {
  const workOrderId = textValue(formData, "workOrderId");
  const itemId = textValue(formData, "itemId");
  if (!workOrderId || !itemId) return failureState("Voce non valida.");
  try {
    await dashboardPost(`/api/work-orders/${encodeURIComponent(workOrderId)}/items/${encodeURIComponent(itemId)}`, { actorRef: "dashboard" }, "DELETE");
    revalidateWorkOrderPaths(workOrderId);
    return successState("Voce rimossa dalla scheda.");
  } catch (error) {
    return errorState(error);
  }
}

export async function voidWorkOrderNoteAction(_state: DashboardActionState, formData: FormData): Promise<DashboardActionState> {
  const workOrderId = textValue(formData, "workOrderId");
  const noteId = textValue(formData, "noteId");
  if (!workOrderId || !noteId) return failureState("Nota non valida.");
  try {
    await dashboardPost(`/api/work-orders/${encodeURIComponent(workOrderId)}/notes/${encodeURIComponent(noteId)}`, { actorRef: "dashboard" }, "DELETE");
    revalidateWorkOrderPaths(workOrderId);
    return successState("Nota rimossa dalla scheda.");
  } catch (error) {
    return errorState(error);
  }
}

export async function removeAttachmentAction(_state: DashboardActionState, formData: FormData): Promise<DashboardActionState> {
  const workOrderId = textValue(formData, "workOrderId");
  const attachmentId = textValue(formData, "attachmentId");
  if (!workOrderId || !attachmentId) return failureState("Allegato non valido.");
  try {
    await dashboardPost(`/api/work-orders/${encodeURIComponent(workOrderId)}/attachments/${encodeURIComponent(attachmentId)}`, { actorRef: "dashboard" }, "DELETE");
    revalidateWorkOrderPaths(workOrderId);
    return successState("Allegato rimosso dalla scheda.");
  } catch (error) {
    return errorState(error);
  }
}

export async function uploadWorkOrderAttachmentAction(_state: DashboardActionState, formData: FormData): Promise<DashboardActionState> {
  const workOrderId = textValue(formData, "workOrderId");
  const file = formData.get("file");

  if (!(file instanceof File) || file.size <= 0) {
    return failureState("Seleziona un file da caricare.");
  }

  try {
    const target = await readWorkOrderForMutation(workOrderId);
    if (!MUTABLE_STATUSES.has(target.status)) {
      return failureState("La scheda e in sola lettura. Puoi solo consultare gli allegati esistenti.");
    }

    await uploadDashboardAttachment({
      workshopId: target.workshopId,
      workOrderId,
      actorRef: "dashboard",
      file,
    });
    revalidateWorkOrderPaths(workOrderId);
    return successState("Allegato caricato sulla scheda.");
  } catch (error) {
    return errorState(error);
  }
}

function textValue(formData: FormData, key: string): string {
  const value = formData.get(key);
  return typeof value === "string" ? value.trim() : "";
}

function decimalValue(formData: FormData, key: string): number | null {
  const raw = textValue(formData, key).replace(",", ".");
  if (!raw) return null;
  const value = Number(raw);
  return Number.isFinite(value) ? value : null;
}

function revalidateWorkOrderPaths(workOrderId?: string): void {
  revalidatePath("/dashboard");
  if (workOrderId) {
    revalidatePath(`/dashboard/work-orders/${workOrderId}`);
  }
}

function successState(message: string, extra?: Pick<DashboardActionState, "workOrderId">): DashboardActionState {
  return { ok: true, message, ...extra, stamp: Date.now() };
}

function failureState(message: string): DashboardActionState {
  return { ok: false, message, stamp: Date.now() };
}

function errorState(error: unknown): DashboardActionState {
  return failureState(actionErrorMessage(error));
}

function actionErrorMessage(error: unknown): string {
  if (error instanceof DashboardApiError && error.message) {
    return cleanErrorMessage(error.message);
  }
  if (error instanceof Error && error.message) {
    return cleanErrorMessage(error.message);
  }
  return INITIAL_ERROR;
}

function cleanErrorMessage(message: string): string {
  const value = message.trim();
  if (!value) return INITIAL_ERROR;
  if (/failed|error|exception|rpc|supabase|duplicate key/i.test(value)) {
    return "Operazione non completata. Controlla i dati e riprova.";
  }
  return value;
}
