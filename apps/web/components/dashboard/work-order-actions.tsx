"use client";

import { CheckCircle2, PackageCheck, Zap } from "lucide-react";
import { useRouter } from "next/navigation";
import { useActionState, useEffect, type ReactNode } from "react";
import { closeWorkOrderAction, collectWorkOrderAction, type DashboardActionState } from "../../lib/dashboard/actions";
import type { WorkOrderStatus } from "../../lib/types";
import { FormSubmitButton } from "./form-submit-button";

const initialState: DashboardActionState = { ok: false, message: "" };

export function WorkOrderActions({ workOrderId, status }: { workOrderId: string; status: WorkOrderStatus }) {
  const [closeState, closeAction] = useActionState(closeWorkOrderAction, initialState);
  const [collectState, collectAction] = useActionState(collectWorkOrderAction, initialState);
  const router = useRouter();
  const canClose = status === "accepted" || status === "in_progress";
  const canCollect = status === "ready";

  useEffect(() => {
    if (closeState.ok || collectState.ok) {
      router.refresh();
    }
  }, [closeState.ok, closeState.stamp, collectState.ok, collectState.stamp, router]);

  return (
    <div className="glass-panel rounded-2xl p-5">
      <div className="mb-5 flex items-start gap-3">
        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-accent/20 bg-accent/10 text-accent">
          <Zap className="h-4 w-4" />
        </div>
        <div>
          <p className="text-[10px] font-mono font-medium uppercase tracking-[0.2em] text-zinc-500">Azioni</p>
          <h2 className="mt-1 text-lg font-semibold tracking-tight text-zinc-50">Stato operativo</h2>
          <p className="mt-2 text-sm leading-6 text-zinc-500">Usa queste azioni solo quando la lavorazione cambia davvero stato.</p>
        </div>
      </div>
      <div className="flex flex-col gap-4">
        <form
          action={closeAction}
          className={canClose ? "" : "opacity-50"}
          onSubmit={(event) => {
            if (canClose && !window.confirm("Confermi che il veicolo e pronto per il ritiro?")) {
              event.preventDefault();
            }
          }}
        >
          <input type="hidden" name="workOrderId" value={workOrderId} />
          {canClose && (
            <label className="mb-3 flex items-center justify-between rounded-xl border border-white/10 bg-white/[0.04] px-4 py-2.5 text-sm text-zinc-200">
              <span>Notifica cliente (WhatsApp)</span>
              <input
                name="notifyCustomer"
                type="checkbox"
                defaultChecked
                className="h-4 w-4 rounded border-white/20 bg-transparent text-accent focus:ring-accent/40"
              />
            </label>
          )}
          <FormSubmitButton
            label="Chiudi: pronta per il ritiro"
            pendingLabel="Chiusura scheda..."
            disabled={!canClose}
            variant={canClose ? "primary" : "ghost"}
            className="w-full"
          />
          <p className="mt-2 text-xs leading-5 text-zinc-600">
            {canClose ? "Imposta la scheda su pronta e avvia il riepilogo finale." : "Disponibile solo per schede accettate o in lavorazione."}
          </p>
        </form>
        <form
          action={collectAction}
          className={canCollect ? "" : "opacity-50"}
          onSubmit={(event) => {
            if (canCollect && !window.confirm("Confermi il ritiro del veicolo? Questa azione ferma i promemoria.")) {
              event.preventDefault();
            }
          }}
        >
          <input type="hidden" name="workOrderId" value={workOrderId} />
          <FormSubmitButton
            label="Conferma ritiro veicolo"
            pendingLabel="Conferma ritiro..."
            disabled={!canCollect}
            variant={canCollect ? "primary" : "ghost"}
            className="w-full"
          />
          <p className="mt-2 text-xs leading-5 text-zinc-600">
            {canCollect ? "Segna il veicolo ritirato e ferma i promemoria." : "Disponibile quando la scheda è pronta per il ritiro."}
          </p>
        </form>
      </div>
      <div className="mt-4 space-y-2 text-sm">
        {closeState.message ? (
          <ActionMessage ok={closeState.ok} icon={<CheckCircle2 className="h-4 w-4" />} message={closeState.message} />
        ) : null}
        {collectState.message ? (
          <ActionMessage ok={collectState.ok} icon={<PackageCheck className="h-4 w-4" />} message={collectState.message} />
        ) : null}
        {!canClose && !canCollect ? (
          <p className="rounded-xl border border-white/[0.06] bg-white/[0.02] px-3 py-2 text-zinc-500">Nessuna azione disponibile per lo stato attuale.</p>
        ) : null}
      </div>
    </div>
  );
}

function ActionMessage({ ok, icon, message }: { ok: boolean; icon: ReactNode; message: string }) {
  return (
    <p
      className={
        ok
          ? "flex items-center gap-2 rounded-xl border border-success/25 bg-success-soft px-3 py-2 text-emerald-200 animate-fade-in"
          : "flex items-center gap-2 rounded-xl border border-danger/25 bg-danger-soft px-3 py-2 text-red-200 animate-fade-in"
      }
    >
      {ok ? icon : null}
      {message}
    </p>
  );
}
