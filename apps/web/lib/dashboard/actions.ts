"use server";

import { revalidatePath } from "next/cache";
import { uploadDashboardAttachment } from "../attachments";
import { readWorkOrderForMutation, getWorkshopSettings, uploadWorkshopLogo } from "./read";
import { uploadWorkshopDocumentTemplate, deactivateWorkshopDocumentTemplate } from "./document-templates";
import { DashboardApiError, dashboardPost } from "./api-client";
import { peekDashboardSession } from "./session-core";
import { isPlatformOwnerEmail } from "../admin/platform-auth";
import { previewCsvImport, confirmCsvImport } from "./import";

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
  const notifyCustomer = formData.get("notifyCustomer") === "on";
  try {
    await dashboardPost(`/api/work-orders/${encodeURIComponent(id)}/actions/close`, { actorRef: "dashboard", notifyCustomer });
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
  const revisionReminderEnabled = formData.get("revisionReminderEnabled") === "on";
  const rawChannel = textValue(formData, "revisionReminderChannel");

  // telegram_test is internal/platform-admin only — never a valid client customer channel.
  // Enforce server-side regardless of UI; UI hiding is an additional convenience only.
  if (rawChannel === "telegram_test") {
    const session = await peekDashboardSession();
    if (!session || !isPlatformOwnerEmail(session.email)) {
      return failureState("Canale non disponibile. Usa WhatsApp per i promemoria clienti.");
    }
  }

  const revisionReminderChannel = rawChannel === "whatsapp" || rawChannel === "telegram_test" ? rawChannel : null;

  if (!revisionDueDate) {
    return failureState("Inserisci una data revisione valida.");
  }

  try {
    await dashboardPost(
      `/api/vehicles/${encodeURIComponent(vehicleId)}/revision`,
      {
        actorRef: "dashboard",
        revisionDueDate,
        revisionReminderEnabled,
        revisionReminderChannel,
      },
      "PATCH",
    );
    revalidateWorkOrderPaths(workOrderId || undefined);
    return successState("Scadenza aggiornata.");
  } catch (error) {
    return errorState(error);
  }
}

export async function updateRevisionAppointmentAction(_state: DashboardActionState, formData: FormData): Promise<DashboardActionState> {
  const workOrderId = textValue(formData, "workOrderId");
  const vehicleId = textValue(formData, "vehicleId");
  const revisionAppointmentDate = textValue(formData, "revisionAppointmentDate");
  const revisionAppointmentTime = textValue(formData, "revisionAppointmentTime");

  if ((revisionAppointmentDate && !revisionAppointmentTime) || (!revisionAppointmentDate && revisionAppointmentTime)) {
    return failureState("Per fissare l'appuntamento compila sia data sia ora.");
  }

  try {
    await dashboardPost(
      `/api/vehicles/${encodeURIComponent(vehicleId)}/revision/appointment`,
      {
        actorRef: "dashboard",
        revisionAppointmentDate: revisionAppointmentDate || null,
        revisionAppointmentTime: revisionAppointmentTime || null,
      },
      "PATCH",
    );
    revalidateWorkOrderPaths(workOrderId || undefined);
    return successState("Appuntamento aggiornato.");
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

export async function updateWorkOrderItemAction(_state: DashboardActionState, formData: FormData): Promise<DashboardActionState> {
  const workOrderId = textValue(formData, "workOrderId");
  const itemId = textValue(formData, "itemId");
  const description = textValue(formData, "description");
  const quantity = decimalValue(formData, "quantity");
  const unitPrice = decimalValue(formData, "unitPrice");

  if (!workOrderId || !itemId) return failureState("Voce non valida.");
  if (!description) return failureState("La descrizione è obbligatoria.");
  if (quantity === null || quantity <= 0) return failureState("Inserisci una quantità valida maggiore di zero.");
  if (unitPrice === null || unitPrice < 0) return failureState("Inserisci un prezzo unitario valido.");

  try {
    await dashboardPost(
      `/api/work-orders/${encodeURIComponent(workOrderId)}/items/${encodeURIComponent(itemId)}`,
      { actorRef: "dashboard", description, quantity, unitPrice },
      "PATCH",
    );
    revalidateWorkOrderPaths(workOrderId);
    return successState("Voce aggiornata.");
  } catch (error) {
    return errorState(error);
  }
}

export async function updateWorkOrderNoteAction(_state: DashboardActionState, formData: FormData): Promise<DashboardActionState> {
  const workOrderId = textValue(formData, "workOrderId");
  const noteId = textValue(formData, "noteId");
  const note = textValue(formData, "note");

  if (!workOrderId || !noteId) return failureState("Nota non valida.");
  if (!note) return failureState("La nota non può essere vuota.");

  try {
    await dashboardPost(
      `/api/work-orders/${encodeURIComponent(workOrderId)}/notes/${encodeURIComponent(noteId)}`,
      { actorRef: "dashboard", note },
      "PATCH",
    );
    revalidateWorkOrderPaths(workOrderId);
    return successState("Nota aggiornata.");
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

export async function updateWorkshopLaborRateAction(_state: DashboardActionState, formData: FormData): Promise<DashboardActionState> {
  const raw = textValue(formData, "hourlyRate").replace(",", ".");
  const hourlyRate = raw ? Number(raw) : NaN;

  if (!Number.isFinite(hourlyRate) || hourlyRate < 0) {
    return failureState("Inserisci una tariffa oraria valida (valore non negativo).");
  }
  if (hourlyRate > 1000) {
    return failureState("La tariffa oraria non può superare 1000 €/ora.");
  }

  try {
    await dashboardPost("/api/dashboard/settings/labor-rate", { hourlyRate }, "PATCH");
    revalidatePath("/dashboard/settings");
    return successState("Tariffa manodopera aggiornata.");
  } catch (error) {
    return errorState(error);
  }
}

export async function updateWorkshopDisplayNameAction(_state: DashboardActionState, formData: FormData): Promise<DashboardActionState> {
  const displayName = textValue(formData, "displayName");
  if (!displayName) return failureState("Il nome visualizzato non può essere vuoto.");

  try {
    await dashboardPost("/api/dashboard/settings", { displayName }, "PATCH");
    revalidatePath("/dashboard");
    revalidatePath("/dashboard/settings");
    return successState("Nome aggiornato con successo.");
  } catch (error) {
    return errorState(error);
  }
}

export async function updateWorkshopProfileAction(_state: DashboardActionState, formData: FormData): Promise<DashboardActionState> {
  try {
    await dashboardPost("/api/dashboard/settings/profile", {
      ragioneSociale: textValue(formData, "ragioneSociale"),
      partitaIva: textValue(formData, "partitaIva"),
      codiceFiscale: textValue(formData, "codiceFiscale"),
      indirizzo: textValue(formData, "indirizzo"),
      citta: textValue(formData, "citta"),
      cap: textValue(formData, "cap"),
      provincia: textValue(formData, "provincia"),
      telefono: textValue(formData, "telefono"),
      email: textValue(formData, "email"),
      pec: textValue(formData, "pec"),
      sdi: textValue(formData, "sdi"),
    }, "PATCH");
    revalidatePath("/dashboard/settings");
    return successState("Dati fiscali aggiornati.");
  } catch (error) {
    return errorState(error);
  }
}

export async function updateWorkshopLegalAction(_state: DashboardActionState, formData: FormData): Promise<DashboardActionState> {
  try {
    await dashboardPost("/api/dashboard/settings/legal", {
      condizioniAccettazione: textValue(formData, "condizioniAccettazione"),
      condizioniPreventivo: textValue(formData, "condizioniPreventivo"),
      footerDocumenti: textValue(formData, "footerDocumenti"),
    }, "PATCH");
    revalidatePath("/dashboard/settings");
    return successState("Testi legali aggiornati.");
  } catch (error) {
    return errorState(error);
  }
}

export async function uploadWorkshopLogoAction(_state: DashboardActionState, formData: FormData): Promise<DashboardActionState> {
  const file = formData.get("logo");

  if (!(file instanceof File) || file.size <= 0) {
    return failureState("Seleziona un file immagine.");
  }

  const allowedTypes = ["image/jpeg", "image/jpg", "image/png", "image/webp", "image/svg+xml"];
  if (!allowedTypes.includes(file.type)) {
    return failureState("Formato non supportato. Usa JPG, PNG, WebP o SVG.");
  }

  if (file.size > 2 * 1024 * 1024) {
    return failureState("Il logo non può superare i 2 MB.");
  }

  try {
    const settings = await getWorkshopSettings();
    await uploadWorkshopLogo(settings.id, file);
    revalidatePath("/dashboard/settings");
    return successState("Logo aggiornato con successo.");
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

export async function uploadWorkshopDocumentTemplateAction(_state: DashboardActionState, formData: FormData): Promise<DashboardActionState> {
  const documentType = textValue(formData, "documentType");
  const file = formData.get("file");

  if (!documentType) return failureState("Tipo documento mancante.");
  if (!(file instanceof File) || file.size <= 0) return failureState("Seleziona un file PDF.");
  if (file.type !== "application/pdf") return failureState("Il template deve essere un file PDF.");
  if (file.size > 5 * 1024 * 1024) return failureState("Il template non può superare i 5 MB.");

  try {
    const settings = await getWorkshopSettings();
    await uploadWorkshopDocumentTemplate({ workshopId: settings.id, documentType, file, actorRef: "dashboard" });
    revalidatePath("/dashboard/settings");
    return successState("Template caricato. Verrà usato per i prossimi PDF generati.");
  } catch (error) {
    return errorState(error);
  }
}

export async function deactivateWorkshopDocumentTemplateAction(_state: DashboardActionState, formData: FormData): Promise<DashboardActionState> {
  const templateId = textValue(formData, "templateId");
  if (!templateId) return failureState("Template non valido.");

  try {
    const settings = await getWorkshopSettings();
    await deactivateWorkshopDocumentTemplate({ workshopId: settings.id, templateId });
    revalidatePath("/dashboard/settings");
    return successState("Template disattivato.");
  } catch (error) {
    return errorState(error);
  }
}

export async function addWorkshopStaffMemberAction(_state: DashboardActionState, formData: FormData): Promise<DashboardActionState> {
  const displayName = textValue(formData, "displayName");
  const phone = textValue(formData, "phone");
  const role = textValue(formData, "role") || "staff";

  if (!displayName) return failureState("Il nome è obbligatorio.");
  if (!phone) return failureState("Il numero WhatsApp è obbligatorio.");

  try {
    await dashboardPost("/api/dashboard/settings/staff", { displayName, phone, role });
    revalidatePath("/dashboard/settings");
    return successState("Membro dello staff aggiunto.");
  } catch (error) {
    return errorState(error);
  }
}

export async function deactivateWorkshopStaffMemberAction(_state: DashboardActionState, formData: FormData): Promise<DashboardActionState> {
  const staffId = textValue(formData, "staffId");
  if (!staffId) return failureState("ID membro non valido.");
  try {
    await dashboardPost(`/api/dashboard/settings/staff/${encodeURIComponent(staffId)}`, { action: "deactivate" }, "PATCH");
    revalidatePath("/dashboard/settings");
    return successState("Membro disattivato.");
  } catch (error) {
    return errorState(error);
  }
}

export async function updateCustomerAction(_state: DashboardActionState, formData: FormData): Promise<DashboardActionState> {
  const customerId = textValue(formData, "customerId");
  const workOrderId = textValue(formData, "workOrderId");
  if (!customerId) return failureState("Cliente non valido.");

  const name = textValue(formData, "name");
  const phone = textValue(formData, "phone");

  if (!name) return failureState("Il nome cliente non può essere vuoto.");

  try {
    await dashboardPost(`/api/customers/${encodeURIComponent(customerId)}`, {
      actorRef: "dashboard",
      name,
      phone,
    }, "PATCH");
    revalidateWorkOrderPaths(workOrderId || undefined);
    return successState("Dati cliente aggiornati.");
  } catch (error) {
    return errorState(error);
  }
}

export async function updateVehicleAction(_state: DashboardActionState, formData: FormData): Promise<DashboardActionState> {
  const vehicleId = textValue(formData, "vehicleId");
  const workOrderId = textValue(formData, "workOrderId");
  if (!vehicleId) return failureState("Veicolo non valido.");

  const model = textValue(formData, "model");
  const plate = textValue(formData, "plate");

  if (plate && plate.length < 5) return failureState("Targa non valida.");

  try {
    const body: Record<string, string> = { actorRef: "dashboard" };
    if (model !== undefined) body.model = model;
    if (plate) body.plate = plate;

    await dashboardPost(`/api/vehicles/${encodeURIComponent(vehicleId)}`, body, "PATCH");
    revalidateWorkOrderPaths(workOrderId || undefined);
    revalidatePath("/dashboard");
    return successState("Dati veicolo aggiornati.");
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

export interface ImportPreviewState {
  ok: boolean;
  stamp?: number;
  rows_total?: number;
  valid_rows?: number;
  invalid_rows?: number;
  existing_vehicles?: number;
  would_create_customers?: number;
  would_create_vehicles?: number;
  errors?: Array<{ row: number; reason: string }>;
  csvText?: string;
  message?: string;
}

export interface ImportConfirmState {
  ok: boolean;
  stamp?: number;
  created_customers?: number;
  created_vehicles?: number;
  skipped_existing?: number;
  errors?: Array<{ row: number; reason: string }>;
  message?: string;
}

export async function previewCsvImportAction(_state: ImportPreviewState, formData: FormData): Promise<ImportPreviewState> {
  const file = formData.get("csvFile");
  if (!(file instanceof File) || file.size <= 0) {
    return { ok: false, message: "Seleziona un file CSV.", stamp: Date.now() };
  }
  if (file.size > 512 * 1024) {
    return { ok: false, message: "File troppo grande. Massimo 512 KB.", stamp: Date.now() };
  }
  try {
    const settings = await getWorkshopSettings();
    const csvText = await file.text();
    const result = await previewCsvImport(csvText, settings.id);
    return { ok: true, ...result, stamp: Date.now() };
  } catch (error) {
    return { ok: false, message: actionErrorMessage(error), stamp: Date.now() };
  }
}

export async function confirmCsvImportAction(_state: ImportConfirmState, formData: FormData): Promise<ImportConfirmState> {
  const confirmText = (formData.get("confirmText") as string | null)?.trim();
  if (confirmText !== "IMPORTA DATI") {
    return { ok: false, message: "Testo di conferma non corretto. Digita esattamente: IMPORTA DATI", stamp: Date.now() };
  }
  const csvText = (formData.get("csvText") as string | null) ?? "";
  if (!csvText.trim()) {
    return { ok: false, message: "Dati CSV non trovati. Ripeti l'analisi.", stamp: Date.now() };
  }
  try {
    const settings = await getWorkshopSettings();
    const result = await confirmCsvImport(csvText, settings.id);
    revalidatePath("/dashboard");
    revalidatePath("/dashboard/vehicles");
    revalidatePath("/dashboard/search");
    revalidatePath("/dashboard/settings");
    return { ok: true, ...result, stamp: Date.now() };
  } catch (error) {
    return { ok: false, message: actionErrorMessage(error), stamp: Date.now() };
  }
}
