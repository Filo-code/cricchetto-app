import { requireDashboardRequest } from "../../../../lib/dashboard/auth";
import { getFilteredWorkOrders } from "../../../../lib/dashboard/read";
import { AppError, getErrorMessage } from "../../../../lib/errors";

export async function GET(request: Request): Promise<Response> {
  try {
    requireDashboardRequest(request);
    const url = new URL(request.url);
    const data = await getFilteredWorkOrders(url.searchParams.get("filter") ?? "active");
    return Response.json({ ok: true, data });
  } catch (error) {
    const status = error instanceof AppError ? error.statusCode : 500;
    return Response.json({ ok: false, error: getErrorMessage(error) }, { status });
  }
}
