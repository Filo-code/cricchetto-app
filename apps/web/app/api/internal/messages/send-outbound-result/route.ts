import { AppError, getErrorMessage } from "../../../../../lib/errors";
import { requireInternalRequest } from "../../../../../lib/internal-auth";
import { markOutboundSending, recordOutboundResult } from "../../../../../lib/outbound";
import { finalizeReminderDeliveryForMessageLog } from "../../../../../lib/reminders";

export async function POST(request: Request): Promise<Response> {
  try {
    requireInternalRequest(request);
    const body = await request.json().catch(() => {
      throw new AppError("Malformed JSON", { statusCode: 400, parseStatus: "malformed" });
    });
    if (
      !body
      || typeof body !== "object"
      || Array.isArray(body)
      || typeof body.messageLogId !== "string"
      || !body.messageLogId
      || typeof body.providerStatus !== "string"
      || !body.providerStatus
    ) {
      throw new AppError("messageLogId and providerStatus are required", { statusCode: 400, parseStatus: "validation_failed" });
    }
    if (!["sending", "accepted", "failed"].includes(body.providerStatus)) {
      throw new AppError("Unsupported providerStatus for n8n result", { statusCode: 400, parseStatus: "validation_failed" });
    }
    if (body.providerStatus === "accepted" && (typeof body.providerMessageId !== "string" || !body.providerMessageId)) {
      throw new AppError("providerMessageId is required for accepted status", { statusCode: 400, parseStatus: "validation_failed" });
    }
    if (body.providerStatus === "failed" && (typeof body.errorMessage !== "string" || !body.errorMessage)) {
      throw new AppError("errorMessage is required for failed status", { statusCode: 400, parseStatus: "validation_failed" });
    }
    if (body.providerStatus === "sending") {
      await markOutboundSending(body.messageLogId);
    } else {
      await recordOutboundResult({
        messageLogId: body.messageLogId,
        providerStatus: body.providerStatus,
        providerMessageId: body.providerMessageId,
        errorMessage: body.errorMessage,
      });
      await finalizeReminderDeliveryForMessageLog({
        messageLogId: body.messageLogId,
        providerStatus: body.providerStatus,
        errorMessage: body.errorMessage,
      });
    }
    return Response.json({ ok: true });
  } catch (error) {
    const status = error instanceof AppError ? error.statusCode : 500;
    return Response.json({ ok: false, error: getErrorMessage(error) }, { status });
  }
}
