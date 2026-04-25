"use client";

import { AlertTriangle, RefreshCcw } from "lucide-react";
import { Button } from "../../components/ui/button";
import { DashboardShell } from "../../components/dashboard/dashboard-shell";

export default function DashboardError({ reset }: { error: Error; reset: () => void }) {
  return (
    <DashboardShell>
      <div className="glass-panel rounded-3xl p-8 sm:p-10 animate-fade-in-up">
        <div className="flex h-12 w-12 items-center justify-center rounded-2xl border border-danger/25 bg-danger-soft text-red-300 shadow-inner-hi">
          <AlertTriangle className="h-5 w-5" />
        </div>
        <p className="mt-5 text-[10.5px] font-semibold uppercase tracking-[0.2em] text-red-300/90">Errore</p>
        <h1 className="mt-2 text-3xl font-semibold tracking-tight text-zinc-50">Cruscotto non disponibile</h1>
        <p className="mt-3 max-w-xl text-sm leading-6 text-zinc-400">
          Non siamo riusciti a contattare il backend. Controlla la connessione e riprova. Se il problema persiste, verifica che il servizio applicativo sia attivo.
        </p>
        <Button className="mt-7" onClick={() => reset()}>
          <RefreshCcw className="h-4 w-4" />
          Riprova
        </Button>
      </div>
    </DashboardShell>
  );
}
