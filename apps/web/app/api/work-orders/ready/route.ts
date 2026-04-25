import { requireDashboardRequest } from "../../../../lib/dashboard/auth";
import { getReadyWorkOrders } from "../../../../lib/dashboard/read";
import { AppError, getErrorMessage } from "../../../../lib/errors";

export async function GET(request: Request): Promise<Response> {
  try {
    requireDashboardRequest(request);
    const data = await getReadyWorkOrders();
    return Response.json({ ok: true, data });
  } catch (error) {
    const status = error instanceof AppError ? error.statusCode : 500;
    return Response.json({ ok: false, error: getErrorMessage(error) }, { status });
  }
}
