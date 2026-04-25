"use client";

import { PackagePlus, Trash2, Wrench, X } from "lucide-react";
import { useRouter } from "next/navigation";
import { useActionState, useEffect, useRef, useState } from "react";
import type { ReactNode } from "react";
import { addWorkOrderLaborAction, addWorkOrderPartAction, voidWorkOrderItemAction, type DashboardActionState } from "../../lib/dashboard/actions";
import type { DashboardItem } from "../../lib/dashboard/types";
import { formatCurrency, itemTypeLabel } from "../../lib/dashboard/formatters";
import type { WorkOrderStatus } from "../../lib/types";
import { Badge } from "../ui/badge";
import { Button } from "../ui/button";
import { Card, CardHeader } from "../ui/card";
import { Input } from "../ui/input";
import { Table, Td, Th } from "../ui/table";
import { EmptyState } from "./empty-state";
import { FormSubmitButton } from "./form-submit-button";

const initialState: DashboardActionState = { ok: false, message: "" };
const MUTABLE_STATUSES: WorkOrderStatus[] = ["accepted", "in_progress", "ready"];

export function ItemsPanel({
  items,
  workOrderId,
  status,
}: {
  items: DashboardItem[];
  workOrderId: string;
  status: WorkOrderStatus;
}) {
  const [editor, setEditor] = useState<"part" | "labor" | null>(null);
  const [partState, partAction] = useActionState(addWorkOrderPartAction, initialState);
  const [laborState, laborAction] = useActionState(addWorkOrderLaborAction, initialState);
  const [voidState, voidAction] = useActionState(voidWorkOrderItemAction, initialState);
  const partFormRef = useRef<HTMLFormElement>(null);
  const laborFormRef = useRef<HTMLFormElement>(null);
  const router = useRouter();
  const canEdit = MUTABLE_STATUSES.includes(status);
  const total = items.reduce((acc, item) => acc + item.rowTotal, 0);

  useEffect(() => {
    if (partState.ok) {
      partFormRef.current?.reset();
      setEditor(null);
      router.refresh();
    }
  }, [partState.ok, partState.stamp, router]);

  useEffect(() => {
    if (laborState.ok) {
      laborFormRef.current?.reset();
      setEditor(null);
      router.refresh();
    }
  }, [laborState.ok, laborState.stamp, router]);

  useEffect(() => {
    if (voidState.ok) router.refresh();
  }, [voidState.ok, voidState.stamp, router]);

  return (
    <Card>
      <CardHeader
        title="Ricambi e manodopera"
        eyebrow={items.length > 0 ? `${items.length} voci - ${formatCurrency(total)}` : undefined}
        action={
          canEdit ? (
            <div className="flex flex-wrap gap-2">
              <Button type="button" variant={editor === "part" ? "primary" : "ghost"} onClick={() => setEditor(editor === "part" ? null : "part")}>
                <PackagePlus className="h-4 w-4" />
                Aggiungi ricambio
              </Button>
              <Button type="button" variant={editor === "labor" ? "primary" : "ghost"} onClick={() => setEditor(editor === "labor" ? null : "labor")}>
                <Wrench className="h-4 w-4" />
                Aggiungi manodopera
              </Button>
            </div>
          ) : null
        }
      />

      {editor === "part" ? (
        <form ref={partFormRef} action={partAction} className="mb-5 rounded-2xl border border-white/10 bg-white/[0.03] p-4">
          <input type="hidden" name="workOrderId" value={workOrderId} />
          <div className="mb-4 flex items-start justify-between gap-3">
            <div>
              <p className="text-sm font-medium text-zinc-100">Nuovo ricambio</p>
              <p className="mt-1 text-xs leading-5 text-zinc-500">Usa quantita e prezzo unitario. Il totale si aggiorna dalla stessa sorgente dati della scheda.</p>
            </div>
            <Button type="button" variant="ghost" className="h-9 w-9 px-0" onClick={() => setEditor(null)} aria-label="Chiudi form ricambio">
              <X className="h-4 w-4" />
            </Button>
          </div>
          <div className="grid gap-3 md:grid-cols-[1.6fr,0.7fr,0.8fr]">
            <Field label="Descrizione">
              <Input name="description" placeholder="Filtro olio, pastiglie freno..." required autoComplete="off" />
            </Field>
            <Field label="Quantita">
              <Input name="quantity" type="number" min="0.01" step="0.01" inputMode="decimal" placeholder="1" required />
            </Field>
            <Field label="Prezzo unitario">
              <Input name="unitPrice" type="number" min="0" step="0.01" inputMode="decimal" placeholder="0.00" required />
            </Field>
          </div>
          <div className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <FeedbackMessage state={partState} />
            <FormSubmitButton label="Salva ricambio" pendingLabel="Salvataggio ricambio..." className="sm:min-w-44" />
          </div>
        </form>
      ) : null}

      {editor === "labor" ? (
        <form ref={laborFormRef} action={laborAction} className="mb-5 rounded-2xl border border-white/10 bg-white/[0.03] p-4">
          <input type="hidden" name="workOrderId" value={workOrderId} />
          <div className="mb-4 flex items-start justify-between gap-3">
            <div>
              <p className="text-sm font-medium text-zinc-100">Nuova manodopera</p>
              <p className="mt-1 text-xs leading-5 text-zinc-500">La tariffa oraria resta quella della logica di officina gia usata dai comandi.</p>
            </div>
            <Button type="button" variant="ghost" className="h-9 w-9 px-0" onClick={() => setEditor(null)} aria-label="Chiudi form manodopera">
              <X className="h-4 w-4" />
            </Button>
          </div>
          <div className="grid gap-3 md:grid-cols-[0.8fr,1.2fr]">
            <Field label="Ore">
              <Input name="hours" type="number" min="0.1" step="0.1" inputMode="decimal" placeholder="1.5" required />
            </Field>
            <div className="rounded-2xl border border-white/10 bg-[#0b0f14] px-4 py-3 text-sm leading-6 text-zinc-500">
              La descrizione resta <span className="text-zinc-300">Manodopera</span> e il prezzo viene calcolato con la tariffa oraria configurata per l&apos;officina.
            </div>
          </div>
          <div className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <FeedbackMessage state={laborState} />
            <FormSubmitButton label="Salva manodopera" pendingLabel="Salvataggio manodopera..." className="sm:min-w-44" />
          </div>
        </form>
      ) : null}

      {items.length > 0 ? (
        <Table>
          <thead>
            <tr>
              <Th>Tipo</Th>
              <Th>Descrizione</Th>
              <Th>Quantita</Th>
              <Th>Prezzo</Th>
              <Th>Totale</Th>
              {canEdit ? <Th>{""}</Th> : null}
            </tr>
          </thead>
          <tbody>
            {items.map((item) => (
              <tr key={item.id} className="transition-colors">
                <Td>
                  <Badge tone={item.itemType === "labor" ? "blue" : "amber"}>{itemTypeLabel(item.itemType)}</Badge>
                </Td>
                <Td className="text-zinc-100">{item.description}</Td>
                <Td className="tabular-nums">{item.quantity.toLocaleString("it-IT")}</Td>
                <Td className="tabular-nums">{formatCurrency(item.unitPrice)}</Td>
                <Td className="font-medium text-zinc-50 tabular-nums">{formatCurrency(item.rowTotal)}</Td>
                {canEdit ? (
                  <Td>
                    <form action={voidAction}>
                      <input type="hidden" name="workOrderId" value={workOrderId} />
                      <input type="hidden" name="itemId" value={item.id} />
                      <button
                        type="submit"
                        className="flex h-7 w-7 items-center justify-center rounded-lg text-zinc-600 transition-colors hover:bg-danger-soft hover:text-red-300"
                        aria-label="Rimuovi voce"
                        onClick={(e) => { if (!confirm("Rimuovere questa voce dalla scheda?")) e.preventDefault(); }}
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </form>
                  </Td>
                ) : null}
              </tr>
            ))}
          </tbody>
        </Table>
      ) : (
        <EmptyState title="Nessuna voce inserita" icon={Wrench}>
          Ricambi e manodopera compariranno quando vengono registrati.
        </EmptyState>
      )}

      {voidState.message ? (
        <p className={voidState.ok ? "mt-4 rounded-xl border border-success/25 bg-success-soft px-3 py-2 text-sm text-emerald-200 animate-fade-in" : "mt-4 rounded-xl border border-danger/25 bg-danger-soft px-3 py-2 text-sm text-red-200 animate-fade-in"}>
          {voidState.message}
        </p>
      ) : null}
      {!canEdit ? (
        <p className="mt-5 rounded-2xl border border-white/10 bg-white/[0.03] px-4 py-3 text-sm leading-6 text-zinc-500">
          La scheda e in sola lettura. Ricambi e manodopera possono essere aggiunti solo finche la scheda resta operativa.
        </p>
      ) : null}
    </Card>
  );
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="block">
      <span className="mb-2 block text-[13px] font-medium tracking-wide text-zinc-300">{label}</span>
      {children}
    </label>
  );
}

function FeedbackMessage({ state }: { state: DashboardActionState }) {
  if (!state.message) {
    return <div />;
  }

  return (
    <p
      className={
        state.ok
          ? "rounded-xl border border-success/25 bg-success-soft px-4 py-3 text-sm text-emerald-200 animate-fade-in"
          : "rounded-xl border border-danger/25 bg-danger-soft px-4 py-3 text-sm text-red-200 animate-fade-in"
      }
    >
      {state.message}
    </p>
  );
}
