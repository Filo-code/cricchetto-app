import { requireDashboardRequest } from "../../../../../../lib/dashboard/auth";
import { readVehicleForMutation } from "../../../../../../lib/dashboard/read";
import { AppError, getErrorMessage } from "../../../../../../lib/errors";
import { updateRevisionAppointment } from "../../../../../../lib/revisions";
import { assertIsoDate, assertIsoTime } from "../../../../../../lib/time";

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }): Promise<Response> {
  try {
    requireDashboardRequest(request);
    const { id } = await params;
    const body = await request.json().catch(() => {
      throw new AppError("Malformed JSON", { statusCode: 400, parseStatus: "malformed" });
    });
    if (body.revisionAppointmentDate !== undefined && body.revisionAppointmentDate !== null && typeof body.revisionAppointmentDate !== "string") {
      throw new AppError("revisionAppointmentDate must be a string or null", { statusCode: 400, parseStatus: "validation_failed" });
    }
    if (body.revisionAppointmentTime !== undefined && body.revisionAppointmentTime !== null && typeof body.revisionAppointmentTime !== "string") {
      throw new AppError("revisionAppointmentTime must be a string or null", { statusCode: 400, parseStatus: "validation_failed" });
    }
    if (Boolean(body.revisionAppointmentDate) !== Boolean(body.revisionAppointmentTime)) {
      throw new AppError("revision appointment requires both date and time, or neither", { statusCode: 400, parseStatus: "validation_failed" });
    }

    const target = await readVehicleForMutation(id);
    await updateRevisionAppointment({
      workshopId: target.workshopId,
      vehicleId: target.vehicleId,
      revisionAppointmentDate: body.revisionAppointmentDate ? assertIsoDate(body.revisionAppointmentDate) : null,
      revisionAppointmentTime: body.revisionAppointmentTime ? assertIsoTime(body.revisionAppointmentTime) : null,
      createdBy: body.actorRef ?? "dashboard",
    });
    return Response.json({ ok: true, data: { vehicleId: target.vehicleId } });
  } catch (error) {
    const status = error instanceof AppError ? error.statusCode : 500;
    return Response.json({ ok: false, error: getErrorMessage(error) }, { status });
  }
}
