import { AppError, getErrorMessage } from "../../../../../lib/errors";
import { processNormalizedInbound } from "../../../../../lib/messages";
import { whatsappProvider } from "../../../../../lib/providers/whatsapp";

// Deprecated fallback ingress. Production channel ingress is n8n -> /api/internal/messages/process-inbound.
export async function POST(request: Request): Promise<Response> {
  try {
    const rawBody = await request.text();
    await whatsappProvider.verifyInboundSignature(request, rawBody);
    const inbound = whatsappProvider.normalizeInboundPayload(rawBody ? JSON.parse(rawBody) : {});
    const result = await processNormalizedInbound(inbound);
    return Response.json({ ...result, deprecatedIngress: true });
  } catch (error) {
    console.error("[webhooks.whatsapp.inbound] request_failed", {
      errorMessage: getErrorMessage(error),
      errorStack: error instanceof Error ? error.stack : undefined,
    });
    const status = error instanceof AppError ? error.statusCode : 500;
    const publicError = error instanceof AppError ? error.publicMessage || error.message : "Richiesta non valida.";
    return Response.json({ ok: false, error: publicError }, { status });
  }
}
