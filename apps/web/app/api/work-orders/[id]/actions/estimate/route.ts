import { requireDashboardRequest } from "../../../../../../lib/dashboard/auth";
import { readWorkOrderForMutation } from "../../../../../../lib/dashboard/read";
import { AppError, getErrorMessage } from "../../../../../../lib/errors";
import { generateEstimateDocument } from "../../../../../../lib/work-orders";

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }): Promise<Response> {
  try {
    requireDashboardRequest(request);
    const { id } = await params;
    const body = await request.json().catch(() => ({}));
    const target = await readWorkOrderForMutation(id);
    const result = await generateEstimateDocument({
      workshopId: target.workshopId,
      workOrderId: id,
      actorRef: body.actorRef ?? "dashboard",
      actorType: "dashboard_user",
    });
    return Response.json({ ok: true, data: result });
  } catch (error) {
    const status = error instanceof AppError ? error.statusCode : 500;
    return Response.json({ ok: false, error: error instanceof AppError ? error.publicMessage : getErrorMessage(error) }, { status });
  }
}
