import { AppError, getErrorMessage } from "../../../../../lib/errors";
import { processNormalizedInbound } from "../../../../../lib/messages";
import { whatsappProvider } from "../../../../../lib/providers/whatsapp";
import { twilioProvider } from "../../../../../lib/providers/twilio";
import { supabaseServer } from "../../../../../lib/supabase-server";
import type { ProviderAdapter } from "../../../../../lib/providers/types";

const PROVIDER_REGISTRY: Record<string, ProviderAdapter> = {
  meta_whatsapp_cloud_api: whatsappProvider,
  twilio_whatsapp: twilioProvider,
};

// Deprecated fallback ingress. Production channel ingress is n8n -> /api/internal/messages/process-inbound.
// Kept for direct webhook delivery (e.g. Meta webhook verification challenge + Twilio fallback).
export async function POST(request: Request): Promise<Response> {
  try {
    const rawBody = await request.text();

    // Step 1: identify recipient to determine provider BEFORE signature verification.
    // For Meta: phone_number_id is in payload. For Twilio: "To" field (e.g. whatsapp:+39...).
    let recipientIdentifier: string | undefined;
    let detectedProvider = "meta_whatsapp_cloud_api";

    // Twilio sends application/x-www-form-urlencoded
    const contentType = request.headers.get("content-type") ?? "";
    if (contentType.includes("application/x-www-form-urlencoded")) {
      detectedProvider = "twilio_whatsapp";
      const params = new URLSearchParams(rawBody);
      recipientIdentifier = params.get("To")?.replace("whatsapp:", "") ?? undefined;
    } else {
      const parsed = rawBody ? JSON.parse(rawBody) : {};
      recipientIdentifier =
        parsed.recipient ??
        parsed.to ??
        parsed.entry?.[0]?.changes?.[0]?.value?.metadata?.phone_number_id ??
        process.env.Cricchetto_WHATSAPP_PHONE_NUMBER_ID;
    }

    // Step 2: load provider_config from DB for this recipient.
    let providerConfig: Record<string, unknown> = {};
    if (recipientIdentifier) {
      const { data } = await supabaseServer
        .from("workshop_channels")
        .select("provider,provider_config")
        .eq("channel", "whatsapp")
        .eq("recipient_identifier", recipientIdentifier)
        .eq("is_active", true)
        .maybeSingle();
      if (data) {
        detectedProvider = data.provider ?? detectedProvider;
        providerConfig = (data.provider_config as Record<string, unknown>) ?? {};
      }
    }

    // Step 3: select adapter based on provider.
    const adapter = PROVIDER_REGISTRY[detectedProvider] ?? whatsappProvider;

    // Step 4: verify signature with correct provider config.
    await adapter.verifyInboundSignature(request, rawBody, providerConfig);

    // Step 5: normalize and process.
    const parsed = contentType.includes("application/x-www-form-urlencoded")
      ? Object.fromEntries(new URLSearchParams(rawBody))
      : (rawBody ? JSON.parse(rawBody) : {});
    const inbound = adapter.normalizeInboundPayload(parsed, providerConfig);
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

// Meta webhook verification challenge (GET request).
export async function GET(request: Request): Promise<Response> {
  const { searchParams } = new URL(request.url);
  const mode = searchParams.get("hub.mode");
  const token = searchParams.get("hub.verify_token");
  const challenge = searchParams.get("hub.challenge");

  const verifyToken = process.env.Cricchetto_WHATSAPP_VERIFY_TOKEN;
  if (mode === "subscribe" && token === verifyToken && challenge) {
    return new Response(challenge, { status: 200 });
  }
  return new Response("Forbidden", { status: 403 });
}
