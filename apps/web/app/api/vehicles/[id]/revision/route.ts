import { requireDashboardRequest } from "../../../../../lib/dashboard/auth";
import { readVehicleForMutation } from "../../../../../lib/dashboard/read";
import { isPlatformSession } from "../../../../../lib/admin/platform-session";
import { AppError, getErrorMessage } from "../../../../../lib/errors";
import { updateRevisionDueDate } from "../../../../../lib/revisions";
import { assertIsoDate, assertIsoTime } from "../../../../../lib/time";
import { peekDashboardSession } from "../../../../../lib/dashboard/session-core";

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }): Promise<Response> {
  try {
    requireDashboardRequest(request);
    const { id } = await params;
    const body = await request.json().catch(() => {
      throw new AppError("Malformed JSON", { statusCode: 400, parseStatus: "malformed" });
    });
    if (!body || typeof body.revisionDueDate !== "string") {
      throw new AppError("revisionDueDate is required", { statusCode: 400, parseStatus: "validation_failed" });
    }
    if (body.revisionReminderEnabled !== undefined && typeof body.revisionReminderEnabled !== "boolean") {
      throw new AppError("revisionReminderEnabled must be a boolean", { statusCode: 400, parseStatus: "validation_failed" });
    }
    if (body.revisionReminderChannel !== undefined && body.revisionReminderChannel !== null && !["whatsapp", "telegram_test"].includes(body.revisionReminderChannel)) {
      throw new AppError("revisionReminderChannel must be whatsapp, telegram_test, or null", { statusCode: 400, parseStatus: "validation_failed" });
    }
    // telegram_test is internal/platform-admin only. Enforce here as defense in depth
    // regardless of caller (server action already rejects it for non-platform-owners).
    if (body.revisionReminderChannel === "telegram_test") {
      const session = await peekDashboardSession();
      if (!session || !isPlatformSession(session)) {
        throw new AppError("Canale non disponibile.", { statusCode: 403, parseStatus: "ignored" });
      }
    }
    if (body.revisionAppointmentDate !== undefined && body.revisionAppointmentDate !== null && typeof body.revisionAppointmentDate !== "string") {
      throw new AppError("revisionAppointmentDate must be a string or null", { statusCode: 400, parseStatus: "validation_failed" });
    }
    if (body.revisionAppointmentTime !== undefined && body.revisionAppointmentTime !== null && typeof body.revisionAppointmentTime !== "string") {
      throw new AppError("revisionAppointmentTime must be a string or null", { statusCode: 400, parseStatus: "validation_failed" });
    }
    if (Boolean(body.revisionAppointmentDate) !== Boolean(body.revisionAppointmentTime)) {
      throw new AppError("revision appointment requires both date and time", { statusCode: 400, parseStatus: "validation_failed" });
    }

    const target = await readVehicleForMutation(id);
    await updateRevisionDueDate({
      workshopId: target.workshopId,
      vehicleId: target.vehicleId,
      revisionDueDate: assertIsoDate(body.revisionDueDate),
      revisionReminderEnabled: body.revisionReminderEnabled,
      revisionReminderChannel: body.revisionReminderChannel ?? undefined,
      revisionAppointmentDate: body.revisionAppointmentDate ? assertIsoDate(body.revisionAppointmentDate) : null,
      revisionAppointmentTime: body.revisionAppointmentTime ? assertIsoTime(body.revisionAppointmentTime) : null,
      source: "dashboard",
      createdBy: body.actorRef ?? "dashboard",
      expectedRowVersion: body.expectedRowVersion,
    });
    return Response.json({ ok: true, data: { vehicleId: target.vehicleId } });
  } catch (error) {
    const status = error instanceof AppError ? error.statusCode : 500;
    return Response.json({ ok: false, error: getErrorMessage(error) }, { status });
  }
}
