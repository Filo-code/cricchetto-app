"use server";

import { requirePlatformOwnerSession } from "../../../lib/admin/platform-auth";
import { provisionWorkshop, type ProvisionResult } from "../../../lib/admin/provisioning";

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

function text(formData: FormData, key: string): string {
  const val = formData.get(key);
  return typeof val === "string" ? val.trim() : "";
}
