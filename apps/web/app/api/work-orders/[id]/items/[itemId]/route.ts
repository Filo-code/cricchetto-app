import { writeAuditEvent } from "../../../../../../lib/audit";
import { requireDashboardRequest } from "../../../../../../lib/dashboard/auth";
import { readWorkOrderForMutation } from "../../../../../../lib/dashboard/read";
import { AppError, getErrorMessage } from "../../../../../../lib/errors";
import { supabaseServer } from "../../../../../../lib/supabase-server";

const MUTABLE_STATUSES = new Set(["accepted", "in_progress", "ready"]);

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string; itemId: string }> },
): Promise<Response> {
  try {
    requireDashboardRequest(request);
    const { id, itemId } = await params;
    const body = await request.json().catch(() => ({})) as { actorRef?: unknown };
    const actorRef = typeof body.actorRef === "string" ? body.actorRef : "dashboard";

    const target = await readWorkOrderForMutation(id);
    if (!MUTABLE_STATUSES.has(target.status)) {
      throw new AppError("Work order is read-only", { statusCode: 409, parseStatus: "conflict" });
    }

    const { data: item, error: readError } = await supabaseServer
      .from("work_order_items")
      .select("id,description,item_type,quantity,unit_price")
      .eq("workshop_id", target.workshopId)
      .eq("work_order_id", id)
      .eq("id", itemId)
      .is("voided_at", null)
      .maybeSingle();

    if (readError) throw new Error(`Failed to read item: ${readError.message}`);
    if (!item) throw new AppError("Item not found", { statusCode: 404, parseStatus: "not_found" });

    const { error: voidError } = await supabaseServer
      .from("work_order_items")
      .update({ voided_at: new Date().toISOString(), void_reason: "dashboard_remove", updated_by: actorRef })
      .eq("workshop_id", target.workshopId)
      .eq("id", itemId);

    if (voidError) throw new Error(`Failed to void item: ${voidError.message}`);

    await writeAuditEvent({
      workshopId: target.workshopId,
      workOrderId: id,
      eventType: "item_voided",
      actorType: "dashboard_user",
      actorRef,
      before: { item_id: item.id, item_type: item.item_type, description: item.description },
      after: { voided: true },
    });

    return Response.json({ ok: true, data: { itemId } });
  } catch (error) {
    const status = error instanceof AppError ? error.statusCode : 500;
    return Response.json({ ok: false, error: getErrorMessage(error) }, { status });
  }
}
