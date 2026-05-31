"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Button } from "../../components/ui/button";

const PLANS = [
  {
    type: "basic" as const,
    name: "Basic",
    price: "€79",
    period: "/mese",
    features: [
      "Schede di lavoro illimitate",
      "Clienti e veicoli",
      "Documenti PDF",
      "Accesso dashboard",
    ],
    accent: false,
  },
  {
    type: "pro" as const,
    name: "Pro",
    price: "€109",
    period: "/mese",
    features: [
      "Tutto di Basic",
      "Promemoria automatici WhatsApp",
      "Automazione revisioni",
      "Notifiche programmate",
    ],
    accent: true,
  },
];

export default function SubscribePage() {
  const router = useRouter();
  const [loading, setLoading] = useState<"basic" | "pro" | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function handleSubscribe(planType: "basic" | "pro") {
    setLoading(planType);
    setError(null);
    try {
      const res = await fetch("/api/stripe/create-checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ planType }),
      });
      const json = await res.json() as { ok: boolean; url?: string; error?: string };
      if (!json.ok || !json.url) {
        setError(json.error ?? "Errore imprevisto. Riprova.");
        return;
      }
      window.location.href = json.url;
    } catch {
      setError("Impossibile avviare il pagamento. Controlla la connessione e riprova.");
    } finally {
      setLoading(null);
    }
  }

  return (
    <div className="relative flex min-h-screen items-center justify-center overflow-hidden bg-[#07080a] px-4 py-16">
      {/* Ambient */}
      <div className="pointer-events-none absolute inset-0 overflow-hidden">
        <div className="absolute -top-40 left-1/2 h-80 w-80 -translate-x-1/2 rounded-full bg-accent/10 blur-[120px]" />
      </div>

      <div className="relative w-full max-w-2xl">
        <div className="mb-6 h-px w-full bg-gradient-to-r from-transparent via-accent/40 to-transparent" />

        <div className="mb-10 text-center">
          <p className="text-[10px] font-mono uppercase tracking-[0.25em] text-zinc-600">Filò · Cricchetto</p>
          <h1 className="mt-2 text-2xl font-semibold text-zinc-100">Scegli il tuo piano</h1>
          <p className="mt-2 text-sm text-zinc-500">
            Il tuo periodo di prova è scaduto. Scegli un piano per continuare.
          </p>
        </div>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          {PLANS.map((plan) => (
            <div
              key={plan.type}
              className={`rounded-2xl border p-6 ${
                plan.accent
                  ? "border-accent/30 bg-accent/[0.05]"
                  : "border-white/[0.08] bg-white/[0.02]"
              }`}
            >
              {plan.accent && (
                <p className="mb-3 text-[9px] font-mono uppercase tracking-[0.2em] text-accent">
                  Consigliato
                </p>
              )}
              <h2 className="text-lg font-semibold text-zinc-100">{plan.name}</h2>
              <p className="mt-1 text-3xl font-bold text-zinc-50">
                {plan.price}
                <span className="text-base font-normal text-zinc-500">{plan.period}</span>
              </p>

              <ul className="mt-5 space-y-2">
                {plan.features.map((f) => (
                  <li key={f} className="flex items-start gap-2 text-sm text-zinc-400">
                    <span className="mt-0.5 text-emerald-500">✓</span>
                    {f}
                  </li>
                ))}
              </ul>

              <Button
                type="button"
                variant={plan.accent ? "primary" : "ghost"}
                className="mt-6 w-full justify-center"
                disabled={loading !== null}
                onClick={() => handleSubscribe(plan.type)}
              >
                {loading === plan.type ? "Reindirizzamento…" : `Abbonati ${plan.name}`}
              </Button>
            </div>
          ))}
        </div>

        {error && (
          <p className="mt-4 rounded-xl border border-red-500/20 bg-red-500/10 px-4 py-3 text-center text-sm text-red-300">
            {error}
          </p>
        )}

        <p className="mt-8 text-center text-xs text-zinc-700">
          Pagamento sicuro tramite Stripe · Disdici in qualsiasi momento
        </p>

        <div className="mt-4 text-center">
          <button
            type="button"
            onClick={() => router.push("/login")}
            className="text-xs text-zinc-700 underline-offset-2 hover:text-zinc-500 hover:underline"
          >
            Torna al login
          </button>
        </div>
      </div>
    </div>
  );
}
