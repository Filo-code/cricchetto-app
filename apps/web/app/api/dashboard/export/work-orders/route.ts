import { isPlatformSession } from "../../../../../lib/admin/platform-auth";
import { csvHeader, csvRow, todayIso } from "../../../../../lib/dashboard/export-helpers";
import { verifyDashboardSessionForApi } from "../../../../../lib/dashboard/session-api";
import { AppError, getErrorMessage } from "../../../../../lib/errors";
import { supabaseServer } from "../../../../../lib/supabase-server";

export async function GET(): Promise<Response> {
  try {
    const session = await verifyDashboardSessionForApi();
    if (!session) return Response.json({ ok: false, error: "Non autenticato" }, { status: 401 });

    const { data: workshop, error: wsError } = await supabaseServer
      .from("workshops")
      .select("id,status")
      .eq("id", session.workshopId)
      .maybeSingle();
    if (wsError || !workshop) return Response.json({ ok: false, error: "Officina non trovata" }, { status: 404 });
    if ((workshop.status === "suspended" || workshop.status === "closed") && !isPlatformSession(session)) {
      return Response.json({ ok: false, error: "Account sospeso" }, { status: 403 });
    }

    const { data, error } = await supabaseServer
      .from("work_orders")
      .select("id,public_code,plate_normalized,vehicle_model_snapshot,customer_name_snapshot,status,reported_issue,kilometers,ready_at,collected_at,archived_at,created_at,updated_at")
      .eq("workshop_id", workshop.id)
      .order("created_at", { ascending: true });

    if (error) throw new Error(`Failed to read work orders: ${error.message}`);

    const columns = ["ID", "Codice", "Targa", "Modello veicolo", "Cliente", "Stato", "Problema segnalato", "Km", "Pronto il", "Ritirato il", "Archiviato il", "Creato il", "Aggiornato il"];
    const rows = (data ?? []).map((row) => csvRow([
      row.id,
      row.public_code,
      row.plate_normalized,
      row.vehicle_model_snapshot ?? "",
      row.customer_name_snapshot ?? "",
      row.status,
      row.reported_issue ?? "",
      row.kilometers != null ? String(row.kilometers) : "",
      row.ready_at ?? "",
      row.collected_at ?? "",
      row.archived_at ?? "",
      row.created_at,
      row.updated_at,
    ]));

    const csv = [csvHeader(columns), ...rows].join("\n");

    return new Response(csv, {
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="cricchetto-schede-${todayIso()}.csv"`,
      },
    });
  } catch (error) {
    const status = error instanceof AppError ? error.statusCode : 500;
    return Response.json({ ok: false, error: getErrorMessage(error) }, { status });
  }
}
