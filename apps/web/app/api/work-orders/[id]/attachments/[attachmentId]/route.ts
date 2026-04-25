import { writeAuditEvent } from "../../../../../../lib/audit";
import { requireDashboardRequest } from "../../../../../../lib/dashboard/auth";
import { readWorkOrderForMutation } from "../../../../../../lib/dashboard/read";
import { AppError, getErrorMessage } from "../../../../../../lib/errors";
import { supabaseServer } from "../../../../../../lib/supabase-server";

const MUTABLE_STATUSES = new Set(["accepted", "in_progress", "ready"]);

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string; attachmentId: string }> },
): Promise<Response> {
  try {
    requireDashboardRequest(request);
    const { id, attachmentId } = await params;
    const body = await request.json().catch(() => ({})) as { actorRef?: unknown };
    const actorRef = typeof body.actorRef === "string" ? body.actorRef : "dashboard";

    const target = await readWorkOrderForMutation(id);
    if (!MUTABLE_STATUSES.has(target.status)) {
      throw new AppError("Work order is read-only", { statusCode: 409, parseStatus: "conflict" });
    }

    const { data: attachment, error: readError } = await supabaseServer
      .from("attachments")
      .select("id,attachment_type,filename")
      .eq("workshop_id", target.workshopId)
      .eq("work_order_id", id)
      .eq("id", attachmentId)
      .is("deleted_at", null)
      .maybeSingle();

    if (readError) throw new Error(`Failed to read attachment: ${readError.message}`);
    if (!attachment) throw new AppError("Attachment not found", { statusCode: 404, parseStatus: "not_found" });

    const { error: deleteError } = await supabaseServer
      .from("attachments")
      .update({ deleted_at: new Date().toISOString() })
      .eq("workshop_id", target.workshopId)
      .eq("id", attachmentId);

    if (deleteError) throw new Error(`Failed to soft-delete attachment: ${deleteError.message}`);

    await writeAuditEvent({
      workshopId: target.workshopId,
      workOrderId: id,
      eventType: "attachment_removed",
      actorType: "dashboard_user",
      actorRef,
      before: { attachment_id: attachment.id, attachment_type: attachment.attachment_type, filename: attachment.filename },
      after: { deleted: true },
    });

    return Response.json({ ok: true, data: { attachmentId } });
  } catch (error) {
    const status = error instanceof AppError ? error.statusCode : 500;
    return Response.json({ ok: false, error: getErrorMessage(error) }, { status });
  }
}
