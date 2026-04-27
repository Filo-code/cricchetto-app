"use server";

import { requirePlatformOwnerSession } from "../../../lib/admin/platform-auth";
import { provisionWorkshop, type ProvisionResult } from "../../../lib/admin/provisioning";
import { setWorkshopStatus } from "../../../lib/admin/workshops";
import { generatePasswordResetToken } from "../../../lib/dashboard/users";

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
  try {
    await setWorkshopStatus(workshopId, "suspended");
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
  try {
    await setWorkshopStatus(workshopId, "closed", reason);
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
  try {
    await setWorkshopStatus(workshopId, "active");
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

function text(formData: FormData, key: string): string {
  const val = formData.get(key);
  return typeof val === "string" ? val.trim() : "";
}
