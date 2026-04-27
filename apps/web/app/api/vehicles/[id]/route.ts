import { requireDashboardRequest } from "../../../../lib/dashboard/auth";
import { readDashboardWorkshop } from "../../../../lib/dashboard/read";
import { AppError, getErrorMessage } from "../../../../lib/errors";
import { supabaseServer } from "../../../../lib/supabase-server";
import { writeAuditEvent } from "../../../../lib/audit";
import { normalizePlate, assertValidPlate } from "../../../../lib/plates";

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }): Promise<Response> {
  try {
    requireDashboardRequest(request);
    const { id } = await params;

    const body = await request.json().catch(() => {
      throw new AppError("Malformed JSON", { statusCode: 400, parseStatus: "malformed" });
    });

    const workshop = await readDashboardWorkshop();

    // Scope: vehicle must belong to this workshop
    const { data: existing, error: readErr } = await supabaseServer
      .from("vehicles")
      .select("id,plate,plate_normalized,model")
      .eq("workshop_id", workshop.id)
      .eq("id", id)
      .maybeSingle();

    if (readErr) throw new Error(`Failed to read vehicle: ${readErr.message}`);
    if (!existing) throw new AppError("Vehicle not found", { statusCode: 404, parseStatus: "not_found" });

    const update: Record<string, unknown> = {};
    const before: Record<string, unknown> = {};
    const after: Record<string, unknown> = {};

    if (typeof body.model === "string") {
      const model = body.model.trim() || null;
      before.model = (existing as any).model ?? null;
      after.model = model;
      update.model = model;
    }

    if (typeof body.plate === "string") {
      const rawPlate = body.plate.trim();
      const plateNormalized = assertValidPlate(rawPlate);

      // Reject duplicate plate within same workshop (excluding this vehicle)
      const { data: duplicate } = await supabaseServer
        .from("vehicles")
        .select("id")
        .eq("workshop_id", workshop.id)
        .eq("plate_normalized", plateNormalized)
        .neq("id", id)
        .limit(1)
        .maybeSingle();

      if (duplicate) {
        throw new AppError("Targa già registrata per un altro veicolo in questa officina.", {
          statusCode: 409,
          parseStatus: "conflict",
        });
      }

      before.plate = (existing as any).plate ?? (existing as any).plate_normalized;
      before.plate_normalized = (existing as any).plate_normalized;
      after.plate = rawPlate;
      after.plate_normalized = plateNormalized;
      update.plate = rawPlate;
      update.plate_normalized = plateNormalized;
    }

    if (Object.keys(update).length === 0) {
      return Response.json({ ok: true, data: { vehicleId: id } });
    }

    update.updated_at = new Date().toISOString();

    const { error: updateErr } = await supabaseServer
      .from("vehicles")
      .update(update)
      .eq("workshop_id", workshop.id)
      .eq("id", id);

    if (updateErr) throw new Error(`Failed to update vehicle: ${updateErr.message}`);

    // If plate changed, update denormalized plate on work_orders for display consistency.
    // Existing PDFs are NOT regenerated — this only affects dashboard display.
    if (update.plate_normalized) {
      await supabaseServer
        .from("work_orders")
        .update({ plate_normalized: update.plate_normalized })
        .eq("workshop_id", workshop.id)
        .eq("vehicle_id", id);
    }

    await writeAuditEvent({
      workshopId: workshop.id,
      eventType: "vehicle_updated",
      actorType: "dashboard_user",
      actorRef: body.actorRef ?? "dashboard",
      before,
      after,
    }).catch(() => {/* non-fatal */});

    return Response.json({ ok: true, data: { vehicleId: id } });
  } catch (error) {
    const status = error instanceof AppError ? error.statusCode : 500;
    return Response.json({ ok: false, error: getErrorMessage(error) }, { status });
  }
}
