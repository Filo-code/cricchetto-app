import Stripe from "stripe";
import { cookies } from "next/headers";
import { verifyDashboardSession, COOKIE_NAME, getEffectiveWorkshopId } from "../../../../lib/dashboard/session-core";
import { getStripePriceId, PLAN_PRICES } from "../../../../lib/plan";
import type { PlanType } from "../../../../lib/subscription";

export async function POST(request: Request): Promise<Response> {
  const cookieStore = await cookies();
  const session = verifyDashboardSession(cookieStore.get(COOKIE_NAME)?.value);
  if (!session) {
    return Response.json({ ok: false, error: "Non autenticato" }, { status: 401 });
  }

  let body: { planType?: unknown };
  try {
    body = await request.json() as { planType?: unknown };
  } catch {
    return Response.json({ ok: false, error: "Payload non valido" }, { status: 400 });
  }

  const planType = body.planType;
  if (planType !== "basic" && planType !== "pro") {
    return Response.json({ ok: false, error: "Piano non valido. Usa 'basic' o 'pro'." }, { status: 400 });
  }

  const stripeKey = process.env.Cricchetto_STRIPE_SECRET_KEY;
  if (!stripeKey || stripeKey === "REPLACE_ME") {
    return Response.json({ ok: false, error: "Configurazione pagamento non completata." }, { status: 503 });
  }

  let priceId: string;
  try {
    priceId = getStripePriceId(planType as PlanType);
  } catch (err) {
    console.error("[create-checkout] price ID not configured:", err instanceof Error ? err.message : err);
    return Response.json({ ok: false, error: "Configurazione pagamento non completata." }, { status: 503 });
  }

  const workshopId = getEffectiveWorkshopId(session);
  const baseUrl = new URL(request.url).origin;

  try {
    const checkoutSession = await new Stripe(stripeKey).checkout.sessions.create({
      mode: "subscription",
      line_items: [{ price: priceId, quantity: 1 }],
      customer_email: session.email,
      metadata: {
        workshop_id: workshopId,
        plan_type: planType,
        stripe_price_id: priceId,
      },
      subscription_data: {
        metadata: { workshop_id: workshopId },
      },
      success_url: `${baseUrl}/subscribe/success?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${baseUrl}/subscribe`,
      allow_promotion_codes: true,
    });

    if (!checkoutSession.url) {
      throw new Error("Stripe non ha restituito un URL di checkout.");
    }

    return Response.json({ ok: true, url: checkoutSession.url });
  } catch (err) {
    console.error("[create-checkout] Stripe error:", err instanceof Error ? err.message : err);
    return Response.json({ ok: false, error: "Errore durante la creazione del pagamento. Riprova." }, { status: 500 });
  }
}
