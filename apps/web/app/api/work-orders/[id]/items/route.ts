import { requireDashboardRequest } from "../../../../../lib/dashboard/auth";
import { readWorkOrderForMutation } from "../../../../../lib/dashboard/read";
import { AppError, getErrorMessage } from "../../../../../lib/errors";
import { addLabor, addPart } from "../../../../../lib/work-orders";

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }): Promise<Response> {
  try {
    requireDashboardRequest(request);
    const { id } = await params;
    const body = await request.json().catch(() => {
      throw new AppError("Malformed JSON", { statusCode: 400, parseStatus: "malformed" });
    });
    const target = await readWorkOrderForMutation(id);
    const actorRef = body?.actorRef ?? "dashboard";

    if (body?.itemType === "labor") {
      if (typeof body.hours !== "number" || body.hours <= 0) {
        throw new AppError("hours must be a positive number", { statusCode: 400, parseStatus: "validation_failed" });
      }
      const result = await addLabor(target.workshopId, target.plate, body.hours, actorRef, "dashboard");
      return Response.json({ ok: true, data: result });
    }

    if (body?.itemType === "part") {
      if (typeof body.description !== "string" || !body.description.trim()) {
        throw new AppError("description is required", { statusCode: 400, parseStatus: "validation_failed" });
      }
      if (typeof body.quantity !== "number" || body.quantity <= 0) {
        throw new AppError("quantity must be a positive number", { statusCode: 400, parseStatus: "validation_failed" });
      }
      if (typeof body.unitPrice !== "number" || body.unitPrice < 0) {
        throw new AppError("unitPrice must be a non-negative number", { statusCode: 400, parseStatus: "validation_failed" });
      }
      const result = await addPart({
        workshopId: target.workshopId,
        plate: target.plate,
        description: body.description.trim(),
        quantity: body.quantity,
        unitPrice: body.unitPrice,
        actorRef,
        source: "dashboard",
      });
      return Response.json({ ok: true, data: result });
    }

    throw new AppError("itemType must be labor or part", { statusCode: 400, parseStatus: "validation_failed" });
  } catch (error) {
    const status = error instanceof AppError ? error.statusCode : 500;
    return Response.json({ ok: false, error: getErrorMessage(error) }, { status });
  }
}
