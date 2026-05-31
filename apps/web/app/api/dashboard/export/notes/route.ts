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
      .from("work_order_notes")
      .select("id,work_order_id,note,source,created_by,voided_at,created_at")
      .eq("workshop_id", workshop.id)
      .order("created_at", { ascending: true });

    if (error) throw new Error(`Failed to read notes: ${error.message}`);

    const columns = ["ID", "Scheda", "Nota", "Fonte", "Creato da", "Annullata il", "Creata il"];
    const rows = (data ?? []).map((row) => csvRow([
      row.id,
      row.work_order_id,
      row.note ?? "",
      row.source ?? "",
      row.created_by ?? "",
      row.voided_at ?? "",
      row.created_at,
    ]));

    const csv = [csvHeader(columns), ...rows].join("\n");

    return new Response(csv, {
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="cricchetto-note-${todayIso()}.csv"`,
      },
    });
  } catch (error) {
    const status = error instanceof AppError ? error.statusCode : 500;
    return Response.json({ ok: false, error: getErrorMessage(error) }, { status });
  }
}
