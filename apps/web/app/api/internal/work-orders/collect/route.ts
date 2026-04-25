import { AppError, getErrorMessage } from "../../../../../lib/errors";
import { requireInternalRequest } from "../../../../../lib/internal-auth";
import { assertValidPlate } from "../../../../../lib/plates";
import { markCollected } from "../../../../../lib/work-orders";

export async function POST(request: Request): Promise<Response> {
  try {
    requireInternalRequest(request);
    const body = await request.json();
    const result = await markCollected(body.workshopId, assertValidPlate(body.plate), body.actorRef ?? "n8n");
    return Response.json({ ok: true, result });
  } catch (error) {
    const status = error instanceof AppError ? error.statusCode : 500;
    return Response.json({ ok: false, error: getErrorMessage(error) }, { status });
  }
}
