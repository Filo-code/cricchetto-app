import { requireDashboardRequest } from "../../../../../lib/dashboard/auth";
import { getVehicleDetailByPlate } from "../../../../../lib/dashboard/read";
import { AppError, getErrorMessage } from "../../../../../lib/errors";

export async function GET(request: Request, { params }: { params: Promise<{ plate: string }> }): Promise<Response> {
  try {
    requireDashboardRequest(request);
    const { plate } = await params;
    const data = await getVehicleDetailByPlate(decodeURIComponent(plate));
    return Response.json({ ok: true, data });
  } catch (error) {
    const status = error instanceof AppError ? error.statusCode : 500;
    return Response.json({ ok: false, error: getErrorMessage(error) }, { status });
  }
}
