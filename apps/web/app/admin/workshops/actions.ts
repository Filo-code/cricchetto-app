"use server";

import { revalidatePath } from "next/cache";
import { requirePlatformOwnerSession } from "../../../lib/admin/platform-auth";
import { provisionWorkshop, type ProvisionResult } from "../../../lib/admin/provisioning";
import { setWorkshopStatus, updateWorkshopForAdmin } from "../../../lib/admin/workshops";
import { generatePasswordResetToken } from "../../../lib/dashboard/users";
import { getPlatformWorkshopId } from "../../../lib/admin/platform-workshop";
import { resetPlatformWorkshopData, type DemoResetCounts } from "../../../lib/admin/workshop-reset";
import { populateDemoWorkshopData, type DemoPopulateCounts } from "../../../lib/admin/workshop-populate";

export interface CreateWorkshopActionState {
  ok: boolean;
  message: string;
  result?: ProvisionResult;
  stamp?: number;
}

export async function createWorkshopAction(
  _state: CreateWorkshopActionState,
  formData: FormData,
): Promise<CreateWorkshopActionState> {
  // Defense-in-depth: re-verify platform owner in the action itself.
  // workshop_users.role = 'owner' is client-scoped and is NOT sufficient here.
  try {
    await requirePlatformOwnerSession();
  } catch {
    return { ok: false, message: "Accesso negato.", stamp: Date.now() };
  }

  const workshopName = text(formData, "workshopName");
  const ownerEmail = text(formData, "ownerEmail");
  const ownerName = text(formData, "ownerName") || undefined;
  const city = text(formData, "city") || undefined;
  const timezone = text(formData, "timezone") || "Europe/Rome";

  if (!workshopName) {
    return { ok: false, message: "Il nome dell'officina è obbligatorio.", stamp: Date.now() };
  }
  if (!ownerEmail || !ownerEmail.includes("@")) {
    return { ok: false, message: "Email titolare non valida.", stamp: Date.now() };
  }

  try {
    const result = await provisionWorkshop({ workshopName, ownerEmail, ownerName, city, timezone });
    return { ok: true, message: "Officina creata con successo.", result, stamp: Date.now() };
  } catch (err) {
    const raw = err instanceof Error ? err.message : "";
    const safe = /email già registrata|già registrata/i.test(raw)
      ? "Email già registrata. Usa un indirizzo diverso."
      : raw.startsWith("Impossibile") || raw.startsWith("Criccheto_BACKEND_BASE_URL")
        ? raw
        : "Errore durante la creazione. Verifica i dati e riprova.";
    return { ok: false, message: safe, stamp: Date.now() };
  }
}

export interface WorkshopStatusActionState {
  ok: boolean;
  message: string;
  stamp?: number;
}

export async function suspendWorkshopAction(
  _state: WorkshopStatusActionState,
  formData: FormData,
): Promise<WorkshopStatusActionState> {
  try {
    await requirePlatformOwnerSession();
  } catch {
    return { ok: false, message: "Accesso negato.", stamp: Date.now() };
  }
  const workshopId = text(formData, "workshopId");
  if (!workshopId) return { ok: false, message: "ID officina mancante.", stamp: Date.now() };
  const platformWorkshopId = getPlatformWorkshopId();
  if (platformWorkshopId && workshopId === platformWorkshopId) {
    return { ok: false, message: "L'officina piattaforma non può essere sospesa o chiusa.", stamp: Date.now() };
  }
  try {
    await setWorkshopStatus(workshopId, "suspended");
    revalidatePath("/admin/workshops");
    return { ok: true, message: "Officina sospesa.", stamp: Date.now() };
  } catch (err) {
    return { ok: false, message: err instanceof Error ? err.message : "Errore durante la sospensione.", stamp: Date.now() };
  }
}

export async function closeWorkshopAction(
  _state: WorkshopStatusActionState,
  formData: FormData,
): Promise<WorkshopStatusActionState> {
  try {
    await requirePlatformOwnerSession();
  } catch {
    return { ok: false, message: "Accesso negato.", stamp: Date.now() };
  }
  const workshopId = text(formData, "workshopId");
  const reason = text(formData, "reason") || undefined;
  if (!workshopId) return { ok: false, message: "ID officina mancante.", stamp: Date.now() };
  const platformWorkshopId = getPlatformWorkshopId();
  if (platformWorkshopId && workshopId === platformWorkshopId) {
    return { ok: false, message: "L'officina piattaforma non può essere sospesa o chiusa.", stamp: Date.now() };
  }
  try {
    await setWorkshopStatus(workshopId, "closed", reason);
    revalidatePath("/admin/workshops");
    return { ok: true, message: "Officina chiusa.", stamp: Date.now() };
  } catch (err) {
    return { ok: false, message: err instanceof Error ? err.message : "Errore durante la chiusura.", stamp: Date.now() };
  }
}

export async function reactivateWorkshopAction(
  _state: WorkshopStatusActionState,
  formData: FormData,
): Promise<WorkshopStatusActionState> {
  try {
    await requirePlatformOwnerSession();
  } catch {
    return { ok: false, message: "Accesso negato.", stamp: Date.now() };
  }
  const workshopId = text(formData, "workshopId");
  if (!workshopId) return { ok: false, message: "ID officina mancante.", stamp: Date.now() };
  // Reactivation of the platform workshop is allowed (no status restriction needed),
  // but keep it consistent: platform workshop cannot be suspended/closed, so
  // reactivation from those states should never occur. Allow it anyway as a safety valve.
  try {
    await setWorkshopStatus(workshopId, "active");
    revalidatePath("/admin/workshops");
    return { ok: true, message: "Officina riattivata.", stamp: Date.now() };
  } catch (err) {
    return { ok: false, message: err instanceof Error ? err.message : "Errore durante la riattivazione.", stamp: Date.now() };
  }
}

export interface ResetPasswordActionState {
  ok: boolean;
  message: string;
  resetLink?: string;
  stamp?: number;
}

export async function generateUserResetLinkAction(
  _state: ResetPasswordActionState,
  formData: FormData,
): Promise<ResetPasswordActionState> {
  try {
    await requirePlatformOwnerSession();
  } catch {
    return { ok: false, message: "Accesso negato.", stamp: Date.now() };
  }
  const userId = text(formData, "userId");
  if (!userId) return { ok: false, message: "ID utente mancante.", stamp: Date.now() };

  const rawBaseUrl = process.env.Criccheto_BACKEND_BASE_URL ?? "";
  if (!rawBaseUrl && process.env.NODE_ENV === "production") {
    return { ok: false, message: "Criccheto_BACKEND_BASE_URL è richiesto in produzione.", stamp: Date.now() };
  }

  try {
    const { token, expiresAt } = await generatePasswordResetToken(userId);
    const baseUrl = rawBaseUrl.replace(/\/$/, "");
    // Raw token returned to caller once. Never logged.
    const resetLink = `${baseUrl}/set-password?token=${encodeURIComponent(token)}`;
    return {
      ok: true,
      message: `Link generato. Valido fino a ${expiresAt.toLocaleString("it-IT")}.`,
      resetLink,
      stamp: Date.now(),
    };
  } catch (err) {
    return { ok: false, message: err instanceof Error ? err.message : "Errore nella generazione del link.", stamp: Date.now() };
  }
}

export interface UpdateWorkshopActionState {
  ok: boolean;
  message: string;
  stamp?: number;
}

export async function updateWorkshopAdminAction(
  _state: UpdateWorkshopActionState,
  formData: FormData,
): Promise<UpdateWorkshopActionState> {
  try {
    await requirePlatformOwnerSession();
  } catch {
    return { ok: false, message: "Accesso negato.", stamp: Date.now() };
  }

  const workshopId = text(formData, "workshopId");
  if (!workshopId) return { ok: false, message: "ID officina mancante.", stamp: Date.now() };

  const displayName = text(formData, "displayName") || null;
  const city = text(formData, "city");
  const timezone = text(formData, "timezone");
  const ownerDisplayName = text(formData, "ownerDisplayName");
  const ownerUserId = text(formData, "ownerUserId") || null;

  if (timezone && !/^[A-Za-z]/.test(timezone)) {
    return { ok: false, message: "Fuso orario non valido.", stamp: Date.now() };
  }

  try {
    await updateWorkshopForAdmin(workshopId, {
      displayName,
      city: city || null,
      timezone: timezone || null,
      ownerUserId,
      ownerDisplayName: ownerDisplayName || null,
    });
    revalidatePath("/admin/workshops");
    return { ok: true, message: "Officina aggiornata.", stamp: Date.now() };
  } catch (err) {
    return {
      ok: false,
      message: err instanceof Error ? err.message : "Errore durante l'aggiornamento.",
      stamp: Date.now(),
    };
  }
}

export interface DemoResetActionState {
  ok: boolean;
  message: string;
  counts?: DemoResetCounts;
  stamp?: number;
}

export async function resetDemoWorkshopAction(
  _state: DemoResetActionState,
  formData: FormData,
): Promise<DemoResetActionState> {
  // Defense-in-depth: platform owner only — never workshop DB users.
  try {
    await requirePlatformOwnerSession();
  } catch {
    return { ok: false, message: "Accesso negato.", stamp: Date.now() };
  }

  // Confirmation gate — must match exactly.
  const confirmation = text(formData, "confirmation");
  if (confirmation !== "RESET DEMO") {
    return {
      ok: false,
      message: "Stringa di conferma errata. Digita esattamente: RESET DEMO",
      stamp: Date.now(),
    };
  }

  // Resolve workshop ID server-side — never from client input.
  const platformWorkshopId = getPlatformWorkshopId();
  if (!platformWorkshopId) {
    return {
      ok: false,
      message: "Criccheto_PLATFORM_WORKSHOP_ID non configurato. Reset non disponibile.",
      stamp: Date.now(),
    };
  }

  try {
    const counts = await resetPlatformWorkshopData(platformWorkshopId);
    revalidatePath("/admin/workshops");
    revalidatePath("/dashboard");
    const totalRows = (Object.values(counts) as number[]).reduce((a, b) => a + b, 0);
    return {
      ok: true,
      message: `Reset completato. ${totalRows} righe eliminate.`,
      counts,
      stamp: Date.now(),
    };
  } catch (err) {
    return {
      ok: false,
      message: err instanceof Error ? err.message : "Errore durante il reset.",
      stamp: Date.now(),
    };
  }
}

export interface DemoPopulateActionState {
  ok: boolean;
  message: string;
  counts?: DemoPopulateCounts;
  stamp?: number;
}

export async function populateDemoWorkshopAction(
  _state: DemoPopulateActionState,
  formData: FormData,
): Promise<DemoPopulateActionState> {
  try {
    await requirePlatformOwnerSession();
  } catch {
    return { ok: false, message: "Accesso negato.", stamp: Date.now() };
  }

  const confirmation = text(formData, "confirmation");
  if (confirmation !== "POPOLA DEMO") {
    return {
      ok: false,
      message: "Stringa di conferma errata. Digita esattamente: POPOLA DEMO",
      stamp: Date.now(),
    };
  }

  // workshopId always from env — never from client.
  const platformWorkshopId = getPlatformWorkshopId();
  if (!platformWorkshopId) {
    return {
      ok: false,
      message: "Criccheto_PLATFORM_WORKSHOP_ID non configurato. Azione non disponibile.",
      stamp: Date.now(),
    };
  }

  try {
    const counts = await populateDemoWorkshopData(platformWorkshopId);
    revalidatePath("/admin/workshops");
    revalidatePath("/dashboard");
    revalidatePath("/dashboard/work-orders");
    revalidatePath("/dashboard/vehicles");

    if (counts.created === 0 && counts.skipped.length > 0) {
      return {
        ok: false,
        message: `Dati demo già presenti (${counts.skipped.join(", ")}). Esegui prima "Reset dati demo".`,
        counts,
        stamp: Date.now(),
      };
    }

    const skipNote = counts.skipped.length > 0 ? ` Saltate (già presenti): ${counts.skipped.join(", ")}.` : "";
    return {
      ok: true,
      message: `Demo popolato: ${counts.created} schede, ${counts.items_created} voci.${skipNote}`,
      counts,
      stamp: Date.now(),
    };
  } catch (err) {
    return {
      ok: false,
      message: err instanceof Error ? err.message : "Errore durante il popolamento demo.",
      stamp: Date.now(),
    };
  }
}

function text(formData: FormData, key: string): string {
  const val = formData.get(key);
  return typeof val === "string" ? val.trim() : "";
}
