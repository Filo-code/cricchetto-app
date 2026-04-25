import { requireDashboardRequest } from "../../../../../lib/dashboard/auth";
import { readWorkOrderForMutation } from "../../../../../lib/dashboard/read";
import { AppError, getErrorMessage } from "../../../../../lib/errors";
import { addNote } from "../../../../../lib/work-orders";

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }): Promise<Response> {
  try {
    requireDashboardRequest(request);
    const { id } = await params;
    const body = await request.json().catch(() => {
      throw new AppError("Malformed JSON", { statusCode: 400, parseStatus: "malformed" });
    });
    if (!body || typeof body.note !== "string" || !body.note.trim()) {
      throw new AppError("note is required", { statusCode: 400, parseStatus: "validation_failed" });
    }

    const target = await readWorkOrderForMutation(id);
    const result = await addNote(target.workshopId, target.plate, body.note.trim(), body.actorRef ?? "dashboard", "dashboard");
    return Response.json({ ok: true, data: result });
  } catch (error) {
    const status = error instanceof AppError ? error.statusCode : 500;
    return Response.json({ ok: false, error: getErrorMessage(error) }, { status });
  }
}
