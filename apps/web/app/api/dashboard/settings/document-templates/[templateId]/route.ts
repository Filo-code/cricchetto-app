import { AppError, getErrorMessage } from "../../../../../../lib/errors";
import { requireDashboardRequest } from "../../../../../../lib/dashboard/auth";
import { getWorkshopSettings } from "../../../../../../lib/dashboard/read";
import { deactivateWorkshopDocumentTemplate } from "../../../../../../lib/dashboard/document-templates";

type DeactivateResponse = { ok: true; data: { deactivated: true } } | { ok: false; error: string };

export async function DELETE(request: Request, { params }: { params: Promise<{ templateId: string }> }): Promise<Response> {
  try {
    requireDashboardRequest(request);
    const settings = await getWorkshopSettings();
    const { templateId } = await params;

    if (!templateId) {
      return Response.json({ ok: false, error: "Template ID mancante." } satisfies DeactivateResponse, { status: 400 });
    }

    await deactivateWorkshopDocumentTemplate({ workshopId: settings.id, templateId });
    return Response.json({ ok: true, data: { deactivated: true } } satisfies DeactivateResponse);
  } catch (error) {
    const status = error instanceof AppError ? error.statusCode : 500;
    console.error("[dashboard-settings-document-templates-delete]", { message: getErrorMessage(error), status });
    return Response.json({ ok: false, error: "Disattivazione non riuscita." } satisfies DeactivateResponse, { status });
  }
}
