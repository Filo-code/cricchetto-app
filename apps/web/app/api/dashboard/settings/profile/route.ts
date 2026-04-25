import { AppError, getErrorMessage } from "../../../../../lib/errors";
import { requireDashboardRequest } from "../../../../../lib/dashboard/auth";
import { getWorkshopSettings } from "../../../../../lib/dashboard/read";
import { supabaseServer } from "../../../../../lib/supabase-server";

type ProfileResponse = { ok: true; data: { updated: true } } | { ok: false; error: string };

const FISCAL_FIELDS = ["ragioneSociale", "partitaIva", "codiceFiscale", "indirizzo", "citta", "cap", "provincia", "telefono", "email", "pec", "sdi"] as const;
const FIELD_MAP: Record<string, string> = {
  ragioneSociale: "ragione_sociale",
  partitaIva: "partita_iva",
  codiceFiscale: "codice_fiscale",
  indirizzo: "indirizzo",
  citta: "citta",
  cap: "cap",
  provincia: "provincia",
  telefono: "telefono",
  email: "email",
  pec: "pec",
  sdi: "sdi",
};

export async function PATCH(request: Request): Promise<Response> {
  try {
    requireDashboardRequest(request);
    const settings = await getWorkshopSettings();

    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return Response.json({ ok: false, error: "Corpo della richiesta non valido." } satisfies ProfileResponse, { status: 400 });
    }

    const b = body as Record<string, unknown>;
    const upsertRow: Record<string, unknown> = { workshop_id: settings.id };

    for (const camel of FISCAL_FIELDS) {
      const snake = FIELD_MAP[camel];
      upsertRow[snake] = typeof b[camel] === "string" ? (b[camel] as string).trim() || null : null;
    }

    const { error } = await (supabaseServer as any)
      .from("workshop_profiles")
      .upsert(upsertRow, { onConflict: "workshop_id" });

    if (error) throw new Error(`Failed to upsert workshop_profiles: ${error.message}`);

    return Response.json({ ok: true, data: { updated: true } } satisfies ProfileResponse);
  } catch (error) {
    const status = error instanceof AppError ? error.statusCode : 500;
    console.error("[dashboard-settings-profile-patch]", { message: getErrorMessage(error), status });
    return Response.json({ ok: false, error: "Aggiornamento dati fiscali non riuscito." } satisfies ProfileResponse, { status });
  }
}
