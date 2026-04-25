import { AppError, getErrorMessage } from "../../../../../lib/errors";
import { requireInternalRequest } from "../../../../../lib/internal-auth";
import { assertValidPlate } from "../../../../../lib/plates";
import { assertIsoDate } from "../../../../../lib/time";
import { updateRevisionByPlate } from "../../../../../lib/revisions";

export async function POST(request: Request): Promise<Response> {
  try {
    requireInternalRequest(request);
    const body = await request.json();
    const result = await updateRevisionByPlate({
      workshopId: body.workshopId,
      plate: assertValidPlate(body.plate),
      revisionDueDate: assertIsoDate(body.revisionDueDate),
      actorRef: body.actorRef ?? "n8n",
      source: body.source ?? "telegram_test",
      mechanicIdentifier: body.mechanicIdentifier,
    });
    return Response.json({ ok: true, result });
  } catch (error) {
    const status = error instanceof AppError ? error.statusCode : 500;
    return Response.json({ ok: false, error: getErrorMessage(error) }, { status });
  }
}
