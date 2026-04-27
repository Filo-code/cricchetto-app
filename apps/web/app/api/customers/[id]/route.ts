import { requireDashboardRequest } from "../../../../lib/dashboard/auth";
import { readDashboardWorkshop } from "../../../../lib/dashboard/read";
import { AppError, getErrorMessage } from "../../../../lib/errors";
import { supabaseServer } from "../../../../lib/supabase-server";
import { writeAuditEvent } from "../../../../lib/audit";

function normalizePhone(raw: string): string {
  return raw.trim().replace(/[\s\-\(\)\.]/g, "");
}

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }): Promise<Response> {
  try {
    requireDashboardRequest(request);
    const { id } = await params;

    const body = await request.json().catch(() => {
      throw new AppError("Malformed JSON", { statusCode: 400, parseStatus: "malformed" });
    });

    const workshop = await readDashboardWorkshop();

    // Scope: customer must belong to this workshop
    const { data: existing, error: readErr } = await supabaseServer
      .from("customers")
      .select("id,name,phone,phone_normalized")
      .eq("workshop_id", workshop.id)
      .eq("id", id)
      .maybeSingle();

    if (readErr) throw new Error(`Failed to read customer: ${readErr.message}`);
    if (!existing) throw new AppError("Customer not found", { statusCode: 404, parseStatus: "not_found" });

    const update: Record<string, unknown> = {};
    const before: Record<string, unknown> = {};
    const after: Record<string, unknown> = {};

    if (typeof body.name === "string") {
      const name = body.name.trim();
      if (!name) throw new AppError("Il nome cliente non può essere vuoto.", { statusCode: 400, parseStatus: "validation_failed" });
      before.name = existing.name;
      after.name = name;
      update.name = name;
    }

    if (typeof body.phone === "string") {
      const phone = body.phone.trim();
      const phoneNormalized = phone ? normalizePhone(phone) : null;
      before.phone = existing.phone;
      after.phone = phone || null;
      after.phone_normalized = phoneNormalized;
      update.phone = phone || null;
      update.phone_normalized = phoneNormalized;
    }

    if (Object.keys(update).length === 0) {
      return Response.json({ ok: true, data: { customerId: id } });
    }

    update.updated_at = new Date().toISOString();

    const { error: updateErr } = await supabaseServer
      .from("customers")
      .update(update)
      .eq("workshop_id", workshop.id)
      .eq("id", id);

    if (updateErr) throw new Error(`Failed to update customer: ${updateErr.message}`);

    await writeAuditEvent({
      workshopId: workshop.id,
      eventType: "customer_updated",
      actorType: "dashboard_user",
      actorRef: body.actorRef ?? "dashboard",
      before,
      after,
    }).catch(() => {/* non-fatal */});

    return Response.json({ ok: true, data: { customerId: id } });
  } catch (error) {
    const status = error instanceof AppError ? error.statusCode : 500;
    return Response.json({ ok: false, error: getErrorMessage(error) }, { status });
  }
}
