import { redirect } from "next/navigation";
import Link from "next/link";
import { requireDashboardSession } from "../../../lib/dashboard/session";
import { getWorkshopSubscription } from "../../../lib/subscription";
import { getEffectiveWorkshopId } from "../../../lib/dashboard/session-core";

// Reads subscription status from DB only — no Stripe calls.
// If webhook already processed: status = "active" → redirect to dashboard.
// If webhook not yet processed: show pending state (webhook typically arrives within seconds).
export default async function SubscribeSuccessPage() {
  let session;
  try {
    session = await requireDashboardSession();
  } catch {
    redirect("/login");
  }

  const workshopId = getEffectiveWorkshopId(session);
  const sub = await getWorkshopSubscription(workshopId);

  if (sub.subscriptionStatus === "active") {
    redirect("/dashboard");
  }

  return (
    <div className="relative flex min-h-screen items-center justify-center overflow-hidden bg-[#07080a] px-4">
      <div className="pointer-events-none absolute inset-0 overflow-hidden">
        <div className="absolute -top-40 left-1/2 h-80 w-80 -translate-x-1/2 rounded-full bg-emerald-500/10 blur-[120px]" />
      </div>

      <div className="relative w-full max-w-md text-center">
        <div className="mb-6 h-px w-full bg-gradient-to-r from-transparent via-emerald-500/40 to-transparent" />

        <div className="rounded-2xl border border-white/[0.08] bg-white/[0.02] p-10">
          <div className="mb-4 text-4xl">✓</div>
          <h1 className="text-xl font-semibold text-zinc-100">Pagamento ricevuto</h1>
          <p className="mt-3 text-sm text-zinc-400">
            Attivazione abbonamento in corso. Solitamente richiede meno di 10 secondi.
          </p>
          <p className="mt-2 text-xs text-zinc-600">
            Riceverai una conferma via email da Stripe.
          </p>

          <Link
            href="/dashboard"
            className="mt-8 inline-flex items-center justify-center rounded-xl bg-accent px-6 py-3 text-sm font-medium text-white shadow-lg shadow-accent/20 transition-opacity hover:opacity-90"
          >
            Vai alla dashboard →
          </Link>
        </div>
      </div>

    </div>
  );
}
