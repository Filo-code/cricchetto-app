import { AppError, getErrorMessage } from "../../../../../lib/errors";
import { requireInternalRequest } from "../../../../../lib/internal-auth";
import { queueDueReminderMessages } from "../../../../../lib/reminders";
import { REMINDER_TYPES } from "../../../../../lib/types";

export async function POST(request: Request): Promise<Response> {
  try {
    requireInternalRequest(request);
    const body = await readOptionalJsonObject(request);
    if (Array.isArray(body)) {
      throw new AppError("Invalid reminder run payload", { statusCode: 400, parseStatus: "validation_failed" });
    }
    const limit = body.limit;
    const reminderTypes = body.reminderTypes;
    if (limit !== undefined && (!Number.isInteger(limit) || (limit as number) < 1 || (limit as number) > 50)) {
      throw new AppError("limit must be an integer between 1 and 50", { statusCode: 400, parseStatus: "validation_failed" });
    }
    if (reminderTypes && !Array.isArray(reminderTypes)) {
      throw new AppError("reminderTypes must be an array", { statusCode: 400, parseStatus: "validation_failed" });
    }
    if (Array.isArray(reminderTypes) && reminderTypes.some((value: unknown) => typeof value !== "string" || !REMINDER_TYPES.includes(value as (typeof REMINDER_TYPES)[number]))) {
      throw new AppError("reminderTypes contains unsupported values", { statusCode: 400, parseStatus: "validation_failed" });
    }
    const result = await queueDueReminderMessages({
      limit: (limit as number | undefined) ?? 20,
      reminderTypes: reminderTypes as (typeof REMINDER_TYPES)[number][] | undefined,
    });
    return Response.json({ ok: true, ...result });
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
    throw new AppError("Invalid reminder run payload", { statusCode: 400, parseStatus: "validation_failed" });
  }

  return parsed as Record<string, unknown>;
}
