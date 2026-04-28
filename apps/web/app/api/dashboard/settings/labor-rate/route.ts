import { AppError, getErrorMessage } from "../../../../../lib/errors";
import { requireDashboardRequest } from "../../../../../lib/dashboard/auth";
import { getWorkshopSettings } from "../../../../../lib/dashboard/read";
import { supabaseServer } from "../../../../../lib/supabase-server";

type UpdateResponse = { ok: true; data: { hourlyRate: number } } | { ok: false; error: string };

const MAX_HOURLY_RATE = 1000;

export async function PATCH(request: Request): Promise<Response> {
  try {
    requireDashboardRequest(request);
    const settings = await getWorkshopSettings();

    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return Response.json({ ok: false, error: "Corpo della richiesta non valido." } satisfies UpdateResponse, { status: 400 });
    }

    const raw = (body as Record<string, unknown>).hourlyRate;
    const hourlyRate = typeof raw === "number"
      ? raw
      : typeof raw === "string"
        ? Number(raw.replace(",", "."))
        : NaN;

    if (!Number.isFinite(hourlyRate) || hourlyRate < 0) {
      return Response.json({ ok: false, error: "Inserisci una tariffa oraria valida (valore non negativo)." } satisfies UpdateResponse, { status: 400 });
    }

    if (hourlyRate > MAX_HOURLY_RATE) {
      return Response.json({ ok: false, error: `La tariffa oraria non può superare ${MAX_HOURLY_RATE} €/ora.` } satisfies UpdateResponse, { status: 400 });
    }

    const { error } = await supabaseServer
      .from("workshop_settings")
      .update({ hourly_rate: hourlyRate } as Record<string, unknown>)
      .eq("workshop_id", settings.id);

    if (error) throw new Error(`Failed to update hourly_rate: ${error.message}`);

    return Response.json({ ok: true, data: { hourlyRate } } satisfies UpdateResponse);
  } catch (error) {
    const status = error instanceof AppError ? error.statusCode : 500;
    console.error("[dashboard-settings-labor-rate-patch]", { message: getErrorMessage(error), status });
    return Response.json({ ok: false, error: "Aggiornamento non riuscito." } satisfies UpdateResponse, { status });
  }
}
