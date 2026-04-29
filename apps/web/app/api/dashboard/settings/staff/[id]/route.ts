import { AppError, getErrorMessage } from "../../../../../../lib/errors";
import { requireDashboardRequest } from "../../../../../../lib/dashboard/auth";
import { getWorkshopSettings } from "../../../../../../lib/dashboard/read";
import { deactivateWorkshopStaffMember } from "../../../../../../lib/staff";

type DeactivateResponse = { ok: true; data: { id: string; isActive: false } } | { ok: false; error: string };

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
): Promise<Response> {
  try {
    requireDashboardRequest(request);
    const settings = await getWorkshopSettings();
    const { id } = await params;

    if (!id) {
      return Response.json({ ok: false, error: "ID membro mancante." } satisfies DeactivateResponse, { status: 400 });
    }

    let body: Record<string, unknown> = {};
    try {
      body = (await request.json()) as Record<string, unknown>;
    } catch {
      // body stays empty — checked below
    }

    if (body.isActive !== false && body.action !== "deactivate") {
      return Response.json({ ok: false, error: "Azione non supportata." } satisfies DeactivateResponse, { status: 400 });
    }

    await deactivateWorkshopStaffMember(settings.id, id);
    return Response.json({ ok: true, data: { id, isActive: false } } satisfies DeactivateResponse);
  } catch (error) {
    const status = error instanceof AppError ? error.statusCode : 500;
    console.error("[dashboard-settings-staff-patch]", { message: getErrorMessage(error) });
    return Response.json({ ok: false, error: "Operazione non riuscita." } satisfies DeactivateResponse, { status });
  }
}
