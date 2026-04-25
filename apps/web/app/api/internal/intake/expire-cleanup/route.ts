import { AppError, getErrorMessage } from "../../../../../lib/errors";
import { requireInternalRequest } from "../../../../../lib/internal-auth";
import { cleanupExpiredIntakes } from "../../../../../lib/intake";

export async function POST(request: Request): Promise<Response> {
  try {
    requireInternalRequest(request);
    const expired = await cleanupExpiredIntakes();
    return Response.json({ ok: true, expired });
  } catch (error) {
    const status = error instanceof AppError ? error.statusCode : 500;
    return Response.json({ ok: false, error: getErrorMessage(error) }, { status });
  }
}
