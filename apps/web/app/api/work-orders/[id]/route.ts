import { requireDashboardRequest } from "../../../../lib/dashboard/auth";
import { getWorkOrderDetail } from "../../../../lib/dashboard/read";
import { AppError, getErrorMessage } from "../../../../lib/errors";

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }): Promise<Response> {
  try {
    requireDashboardRequest(request);
    const { id } = await params;
    const data = await getWorkOrderDetail(id);
    return Response.json({ ok: true, data });
  } catch (error) {
    const status = error instanceof AppError ? error.statusCode : 500;
    return Response.json({ ok: false, error: getErrorMessage(error) }, { status });
  }
}
