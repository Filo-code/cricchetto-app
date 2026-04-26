import { AppError, getErrorMessage } from "../../../../../lib/errors";
import { requireDashboardRequest } from "../../../../../lib/dashboard/auth";
import { getWorkshopSettings } from "../../../../../lib/dashboard/read";
import { readWorkshopDocumentTemplates, type WorkshopDocumentTemplate } from "../../../../../lib/dashboard/document-templates";

type TemplatesResponse = { ok: true; data: WorkshopDocumentTemplate[] } | { ok: false; error: string };

export async function GET(request: Request): Promise<Response> {
  try {
    requireDashboardRequest(request);
    const settings = await getWorkshopSettings();
    const templates = await readWorkshopDocumentTemplates(settings.id);
    return Response.json({ ok: true, data: templates } satisfies TemplatesResponse);
  } catch (error) {
    const status = error instanceof AppError ? error.statusCode : 500;
    console.error("[dashboard-settings-document-templates-get]", { message: getErrorMessage(error), status });
    return Response.json({ ok: false, error: "Template non disponibili." } satisfies TemplatesResponse, { status });
  }
}
