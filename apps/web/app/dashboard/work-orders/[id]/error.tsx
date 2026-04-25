"use client";

import { DashboardShell } from "../../../../components/dashboard/dashboard-shell";
import { ButtonLink } from "../../../../components/ui/button";

export default function WorkOrderError() {
  return (
    <DashboardShell>
      <div className="glass-panel rounded-2xl p-8">
        <p className="text-sm font-medium uppercase tracking-[0.18em] text-red-200">Errore</p>
        <h1 className="mt-3 text-3xl font-semibold text-zinc-50">Scheda non disponibile</h1>
        <p className="mt-2 text-sm text-zinc-400">La scheda richiesta non esiste oppure il backend non ha risposto.</p>
        <ButtonLink href="/dashboard" className="mt-6">
          Torna al cruscotto
        </ButtonLink>
      </div>
    </DashboardShell>
  );
}
