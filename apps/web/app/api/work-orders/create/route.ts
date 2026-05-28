import { requireDashboardRequest } from "../../../../lib/dashboard/auth";
import { readDashboardWorkshop } from "../../../../lib/dashboard/read";
import { AppError, getErrorMessage } from "../../../../lib/errors";
import { createDashboardWorkOrder } from "../../../../lib/work-orders";

export async function POST(request: Request): Promise<Response> {
  try {
    requireDashboardRequest(request);
    const body = await request.json().catch(() => {
      throw new AppError("Malformed JSON", { statusCode: 400, parseStatus: "malformed", publicMessage: "Richiesta non valida." });
    });
    if (!body || typeof body !== "object" || Array.isArray(body)) {
      throw new AppError("Invalid create work order payload", { statusCode: 400, parseStatus: "validation_failed", publicMessage: "Dati scheda non validi." });
    }

    const workshop = await readDashboardWorkshop();
    const kilometersRaw = typeof body.kilometers === "number" ? body.kilometers : Number(body.kilometers);
    if (!Number.isFinite(kilometersRaw)) {
      throw new AppError("Invalid kilometers value", { statusCode: 400, parseStatus: "validation_failed", publicMessage: "Chilometri non validi." });
    }
    const data = await createDashboardWorkOrder({
      workshopId: workshop.id,
      plate: body.plate,
      vehicleModel: body.vehicleModel,
      reportedIssue: body.reportedIssue,
      kilometers: kilometersRaw,
      customerFirstName: body.customerFirstName,
      customerLastName: body.customerLastName,
      customerPhone: body.customerPhone,
      actorRef: body.actorRef ?? "dashboard",
    });

    return Response.json({ ok: true, data });
  } catch (error) {
    console.error("[api.work-orders.create] create_failed", {
      parseStatus: error instanceof AppError ? error.parseStatus : "error",
      statusCode: error instanceof AppError ? error.statusCode : 500,
      publicMessage: error instanceof AppError ? error.publicMessage : undefined,
      errorMessage: getErrorMessage(error),
      errorStack: error instanceof Error ? error.stack : undefined,
    });
    const status = error instanceof AppError ? error.statusCode : 500;
    return Response.json({ ok: false, error: error instanceof AppError ? error.publicMessage : getErrorMessage(error) }, { status });
  }
}
