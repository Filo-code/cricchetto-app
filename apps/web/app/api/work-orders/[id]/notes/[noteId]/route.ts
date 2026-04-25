import { writeAuditEvent } from "../../../../../../lib/audit";
import { requireDashboardRequest } from "../../../../../../lib/dashboard/auth";
import { readWorkOrderForMutation } from "../../../../../../lib/dashboard/read";
import { AppError, getErrorMessage } from "../../../../../../lib/errors";
import { supabaseServer } from "../../../../../../lib/supabase-server";

const MUTABLE_STATUSES = new Set(["accepted", "in_progress", "ready"]);

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string; noteId: string }> },
): Promise<Response> {
  try {
    requireDashboardRequest(request);
    const { id, noteId } = await params;
    const body = await request.json().catch(() => {
      throw new AppError("Malformed JSON", { statusCode: 400, parseStatus: "malformed" });
    });
    const actorRef = typeof body.actorRef === "string" ? body.actorRef : "dashboard";

    const target = await readWorkOrderForMutation(id);
    if (!MUTABLE_STATUSES.has(target.status)) {
      throw new AppError("Work order is read-only", { statusCode: 409, parseStatus: "conflict" });
    }

    if (typeof body.note !== "string" || !body.note.trim()) {
      throw new AppError("note is required", { statusCode: 400, parseStatus: "validation_failed" });
    }

    const { data: note, error: readError } = await supabaseServer
      .from("work_order_notes")
      .select("id,note")
      .eq("workshop_id", target.workshopId)
      .eq("work_order_id", id)
      .eq("id", noteId)
      .is("voided_at", null)
      .maybeSingle();

    if (readError) throw new Error(`Failed to read note: ${readError.message}`);
    if (!note) throw new AppError("Note not found", { statusCode: 404, parseStatus: "not_found" });

    const { error: updateError } = await supabaseServer
      .from("work_order_notes")
      .update({
        note: body.note.trim(),
        updated_by: actorRef,
      })
      .eq("workshop_id", target.workshopId)
      .eq("id", noteId)
      .is("voided_at", null);

    if (updateError) throw new Error(`Failed to update note: ${updateError.message}`);

    await writeAuditEvent({
      workshopId: target.workshopId,
      workOrderId: id,
      eventType: "note_updated",
      actorType: "dashboard_user",
      actorRef,
      before: { note_id: note.id, note: String(note.note) },
      after: { note: body.note.trim() },
    });

    return Response.json({ ok: true, data: { noteId } });
  } catch (error) {
    const status = error instanceof AppError ? error.statusCode : 500;
    return Response.json({ ok: false, error: getErrorMessage(error) }, { status });
  }
}

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string; noteId: string }> },
): Promise<Response> {
  try {
    requireDashboardRequest(request);
    const { id, noteId } = await params;
    const body = await request.json().catch(() => ({})) as { actorRef?: unknown };
    const actorRef = typeof body.actorRef === "string" ? body.actorRef : "dashboard";

    const target = await readWorkOrderForMutation(id);
    if (!MUTABLE_STATUSES.has(target.status)) {
      throw new AppError("Work order is read-only", { statusCode: 409, parseStatus: "conflict" });
    }

    const { data: note, error: readError } = await supabaseServer
      .from("work_order_notes")
      .select("id,note")
      .eq("workshop_id", target.workshopId)
      .eq("work_order_id", id)
      .eq("id", noteId)
      .is("voided_at", null)
      .maybeSingle();

    if (readError) throw new Error(`Failed to read note: ${readError.message}`);
    if (!note) throw new AppError("Note not found", { statusCode: 404, parseStatus: "not_found" });

    const { error: voidError } = await supabaseServer
      .from("work_order_notes")
      .update({ voided_at: new Date().toISOString(), void_reason: "dashboard_remove", updated_by: actorRef })
      .eq("workshop_id", target.workshopId)
      .eq("id", noteId);

    if (voidError) throw new Error(`Failed to void note: ${voidError.message}`);

    await writeAuditEvent({
      workshopId: target.workshopId,
      workOrderId: id,
      eventType: "note_voided",
      actorType: "dashboard_user",
      actorRef,
      before: { note_id: note.id, note_preview: String(note.note).slice(0, 80) },
      after: { voided: true },
    });

    return Response.json({ ok: true, data: { noteId } });
  } catch (error) {
    const status = error instanceof AppError ? error.statusCode : 500;
    return Response.json({ ok: false, error: getErrorMessage(error) }, { status });
  }
}
