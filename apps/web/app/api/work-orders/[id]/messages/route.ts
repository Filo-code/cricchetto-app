import { requireDashboardRequest } from "../../../../../lib/dashboard/auth";
import { readWorkOrderMessageLogs } from "../../../../../lib/dashboard/read";
import { AppError, getErrorMessage } from "../../../../../lib/errors";

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }): Promise<Response> {
  try {
    requireDashboardRequest(request);
    const { id } = await params;
    const logs = await readWorkOrderMessageLogs(id);
    return Response.json({ ok: true, data: logs });
  } catch (error) {
    const status = error instanceof AppError ? error.statusCode : 500;
    return Response.json({ ok: false, error: getErrorMessage(error) }, { status });
  }
}
