import { AppError, getErrorMessage } from "../../../../../lib/errors";
import { requireDashboardRequest } from "../../../../../lib/dashboard/auth";
import { getWorkshopSettings } from "../../../../../lib/dashboard/read";
import { supabaseServer } from "../../../../../lib/supabase-server";

type LegalResponse = { ok: true; data: { updated: true } } | { ok: false; error: string };

const LEGAL_FIELDS = ["condizioniAccettazione", "condizioniPreventivo", "footerDocumenti"] as const;
const FIELD_MAP: Record<string, string> = {
  condizioniAccettazione: "condizioni_accettazione",
  condizioniPreventivo: "condizioni_preventivo",
  footerDocumenti: "footer_documenti",
};

export async function PATCH(request: Request): Promise<Response> {
  try {
    requireDashboardRequest(request);
    const settings = await getWorkshopSettings();

    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return Response.json({ ok: false, error: "Corpo della richiesta non valido." } satisfies LegalResponse, { status: 400 });
    }

    const b = body as Record<string, unknown>;
    const upsertRow: Record<string, unknown> = { workshop_id: settings.id };

    for (const camel of LEGAL_FIELDS) {
      const snake = FIELD_MAP[camel];
      upsertRow[snake] = typeof b[camel] === "string" ? (b[camel] as string).trim() || null : null;
    }

    const { error } = await (supabaseServer as any)
      .from("workshop_profiles")
      .upsert(upsertRow, { onConflict: "workshop_id" });

    if (error) throw new Error(`Failed to upsert workshop_profiles legal: ${error.message}`);

    return Response.json({ ok: true, data: { updated: true } } satisfies LegalResponse);
  } catch (error) {
    const status = error instanceof AppError ? error.statusCode : 500;
    console.error("[dashboard-settings-legal-patch]", { message: getErrorMessage(error), status });
    return Response.json({ ok: false, error: "Aggiornamento testi legali non riuscito." } satisfies LegalResponse, { status });
  }
}
