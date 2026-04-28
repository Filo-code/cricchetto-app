"use client";

import { ClipboardPlus, Plus, X } from "lucide-react";
import { useRouter } from "next/navigation";
import { useActionState, useEffect, useRef, useState, type ReactNode } from "react";
import { createWorkOrderAction, type DashboardActionState } from "../../lib/dashboard/actions";
import { Button } from "../ui/button";
import { Input } from "../ui/input";
import { Textarea } from "../ui/textarea";
import { FormSubmitButton } from "./form-submit-button";

const initialState: DashboardActionState = { ok: false, message: "" };

export function NewWorkOrderDialog() {
  const [open, setOpen] = useState(false);
  const [state, formAction] = useActionState(createWorkOrderAction, initialState);
  const router = useRouter();
  const panelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (state.ok && state.workOrderId) {
      router.push(`/dashboard/work-orders/${state.workOrderId}`);
      router.refresh();
    }
  }, [router, state.ok, state.workOrderId]);

  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    document.addEventListener("keydown", onKey);
    panelRef.current?.scrollIntoView({ behavior: "smooth", block: "nearest" });
    return () => {
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  if (!open) {
    return (
      <Button type="button" variant="primary" onClick={() => setOpen(true)}>
        <Plus className="h-4 w-4" />
        Nuova scheda
      </Button>
    );
  }

  return (
    <div
      ref={panelRef}
      className="glass-panel rounded-3xl p-5 sm:p-7 animate-fade-in shadow-glass-hover"
    >
      <div className="mb-7 flex items-start justify-between gap-4">
        <div className="flex gap-4">
          <div className="hidden h-12 w-12 shrink-0 items-center justify-center rounded-2xl border border-accent/20 bg-accent/10 text-accent sm:flex shadow-inner-hi">
            <ClipboardPlus className="h-5 w-5" />
          </div>
          <div>
            <p className="text-[10.5px] font-semibold uppercase tracking-[0.2em] text-accent/80">Accettazione officina</p>
            <h2 className="mt-2 text-2xl font-semibold tracking-tight text-zinc-50">Apri nuova scheda</h2>
            <p className="mt-2 text-sm leading-6 text-zinc-500">Inserisci i dati essenziali. La scheda viene creata come accettata.</p>
          </div>
        </div>
        <Button type="button" variant="ghost" className="h-10 w-10 px-0" onClick={() => setOpen(false)} aria-label="Chiudi">
          <X className="h-4 w-4" />
        </Button>
      </div>

      <form action={formAction} className="space-y-5">
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Targa" helper="Senza spazi o trattini.">
            <Input name="plate" placeholder="AB123CD" required autoComplete="off" spellCheck={false} />
          </Field>
          <Field label="Auto">
            <Input name="vehicleModel" placeholder="Fiat Panda 1.2" required autoComplete="off" />
          </Field>
          <Field label="Nome cliente">
            <Input name="customerFirstName" placeholder="Mario" required autoComplete="given-name" />
          </Field>
          <Field label="Cognome cliente">
            <Input name="customerLastName" placeholder="Rossi" required autoComplete="family-name" />
          </Field>
          <Field label="Telefono">
            <Input name="customerPhone" placeholder="+39 333 123 4567" required autoComplete="tel" />
          </Field>
          <Field label="Km" helper="Solo cifre. Massimo 999999.">
            <Input name="kilometers" placeholder="120000" required inputMode="numeric" pattern="[0-9]{1,6}" maxLength={6} autoComplete="off" />
          </Field>
        </div>

        <Field label="Problema segnalato" helper="Sintesi breve, utile per iniziare la lavorazione.">
          <Textarea name="reportedIssue" placeholder="Rumore avantreno, controllo freni" required />
        </Field>

        {state.message ? (
          <p
            className={
              state.ok
                ? "rounded-xl border border-success/25 bg-success-soft px-4 py-3 text-sm text-emerald-200 animate-fade-in"
                : "rounded-xl border border-danger/25 bg-danger-soft px-4 py-3 text-sm text-red-200 animate-fade-in"
            }
          >
            {state.message}
          </p>
        ) : null}

        <div className="flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
          <Button type="button" variant="ghost" onClick={() => setOpen(false)}>
            Annulla
          </Button>
          <FormSubmitButton label="Apri scheda" pendingLabel="Apertura scheda..." className="sm:min-w-44" />
        </div>
      </form>
    </div>
  );
}

function Field({ label, helper, children }: { label: string; helper?: string; children: ReactNode }) {
  return (
    <label className="block">
      <span className="mb-2 block text-[13px] font-medium tracking-wide text-zinc-300">{label}</span>
      {children}
      {helper ? <span className="mt-2 block text-xs leading-5 text-zinc-600">{helper}</span> : null}
    </label>
  );
}
