import { requireDashboardRequest } from "../../../../../lib/dashboard/auth";
import { readDashboardWorkshop, readWorkshopChannelStatus } from "../../../../../lib/dashboard/read";
import { getErrorMessage } from "../../../../../lib/errors";

export async function GET(request: Request): Promise<Response> {
  try {
    requireDashboardRequest(request);
    const workshop = await readDashboardWorkshop();
    const channelStatus = await readWorkshopChannelStatus(workshop.id);
    return Response.json({ ok: true, data: channelStatus });
  } catch (error) {
    return Response.json({ ok: false, error: getErrorMessage(error) }, { status: 500 });
  }
}
