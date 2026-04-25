import { AppError, getErrorMessage } from "../../../../lib/errors";
import { requireDashboardRequest } from "../../../../lib/dashboard/auth";
import { getWorkshopSettings, type WorkshopFullSettings } from "../../../../lib/dashboard/read";
import { supabaseServer } from "../../../../lib/supabase-server";

type SettingsResponse = { ok: true; data: WorkshopFullSettings } | { ok: false; error: string };
type UpdateResponse = { ok: true; data: { displayName: string } } | { ok: false; error: string };

export async function GET(request: Request): Promise<Response> {
  try {
    requireDashboardRequest(request);
    const settings = await getWorkshopSettings();
    return Response.json({ ok: true, data: settings } satisfies SettingsResponse);
  } catch (error) {
    const status = error instanceof AppError ? error.statusCode : 500;
    console.error("[dashboard-settings-get]", { message: getErrorMessage(error), status });
    return Response.json({ ok: false, error: "Impostazioni non disponibili." } satisfies SettingsResponse, { status });
  }
}

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

    const displayName = typeof (body as Record<string, unknown>).displayName === "string"
      ? ((body as Record<string, unknown>).displayName as string).trim()
      : "";

    if (!displayName) {
      return Response.json({ ok: false, error: "Il nome visualizzato non può essere vuoto." } satisfies UpdateResponse, { status: 400 });
    }

    const { error } = await supabaseServer
      .from("workshops")
      .update({ display_name: displayName } as Record<string, unknown>)
      .eq("id", settings.id);

    if (error) throw new Error(`Failed to update workshop display_name: ${error.message}`);

    return Response.json({ ok: true, data: { displayName } } satisfies UpdateResponse);
  } catch (error) {
    const status = error instanceof AppError ? error.statusCode : 500;
    console.error("[dashboard-settings-patch]", { message: getErrorMessage(error), status });
    return Response.json({ ok: false, error: "Aggiornamento non riuscito." } satisfies UpdateResponse, { status });
  }
}
