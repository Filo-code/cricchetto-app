import { AppError, getErrorMessage } from "../../../../../lib/errors";
import { requireInternalRequest } from "../../../../../lib/internal-auth";
import { recoverStuckOutbound } from "../../../../../lib/outbound";
import { finalizeReminderDeliveryForMessageLog, recoverStuckSendingReminders } from "../../../../../lib/reminders";

export async function POST(request: Request): Promise<Response> {
  try {
    requireInternalRequest(request);
    const body = await readOptionalJsonObject(request);
    if (Array.isArray(body)) {
      throw new AppError("Invalid outbound recovery payload", { statusCode: 400, parseStatus: "validation_failed" });
    }

    const limit = body.limit;
    if (limit !== undefined && (!Number.isInteger(limit) || (limit as number) < 1 || (limit as number) > 50)) {
      throw new AppError("limit must be an integer between 1 and 50", { statusCode: 400, parseStatus: "validation_failed" });
    }

    const outbound = await recoverStuckOutbound((limit as number | undefined) ?? 20);
    for (const messageLogId of outbound.failedMessageLogIds) {
      await finalizeReminderDeliveryForMessageLog({
        messageLogId,
        providerStatus: "failed",
        errorMessage: "Outbound dispatch recovery exhausted",
      });
    }
    const reminders = await recoverStuckSendingReminders((limit as number | undefined) ?? 20);

    return Response.json({
      ok: true,
      scanned: outbound.scanned,
      recovered: outbound.recovered,
      failed: outbound.failed,
      remindersRecovered: reminders.recovered,
      queued: outbound.queued,
    });
  } catch (error) {
    const status = error instanceof AppError ? error.statusCode : 500;
    return Response.json({ ok: false, error: getErrorMessage(error) }, { status });
  }
}

async function readOptionalJsonObject(request: Request): Promise<Record<string, unknown>> {
  const rawBody = await request.text();
  if (!rawBody.trim()) {
    return {};
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(rawBody);
  } catch {
    throw new AppError("Malformed JSON", { statusCode: 400, parseStatus: "malformed" });
  }

  if (!parsed || typeof parsed !== "object") {
    throw new AppError("Invalid outbound recovery payload", { statusCode: 400, parseStatus: "validation_failed" });
  }

  return parsed as Record<string, unknown>;
}

