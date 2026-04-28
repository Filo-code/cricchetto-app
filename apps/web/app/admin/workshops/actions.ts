"use server";

import { revalidatePath } from "next/cache";
import { requirePlatformOwnerSession } from "../../../lib/admin/platform-auth";
import { provisionWorkshop, type ProvisionResult } from "../../../lib/admin/provisioning";
import { setWorkshopStatus, updateWorkshopForAdmin } from "../../../lib/admin/workshops";
import { generatePasswordResetToken } from "../../../lib/dashboard/users";
import { getPlatformWorkshopId } from "../../../lib/admin/platform-workshop";

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

function text(formData: FormData, key: string): string {
  const val = formData.get(key);
  return typeof val === "string" ? val.trim() : "";
}
