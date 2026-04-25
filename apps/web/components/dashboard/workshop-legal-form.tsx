"use client";

import { useRouter } from "next/navigation";
import { useActionState, useEffect } from "react";
import { updateWorkshopLegalAction, type DashboardActionState } from "../../lib/dashboard/actions";
import type { WorkshopFullSettings } from "../../lib/dashboard/read";
import { Card, CardHeader } from "../ui/card";
import { Textarea } from "../ui/textarea";
import { FormSubmitButton } from "./form-submit-button";

const initialState: DashboardActionState = { ok: false, message: "" };

type LegalProps = Pick<WorkshopFullSettings, "condizioniAccettazione" | "condizioniPreventivo" | "footerDocumenti">;

export function WorkshopLegalForm(props: LegalProps) {
  const [state, formAction] = useActionState(updateWorkshopLegalAction, initialState);
  const router = useRouter();

  useEffect(() => {
    if (state.ok) router.refresh();
  }, [state.ok, state.stamp, router]);

  return (
    <Card>
      <CardHeader title="Condizioni e testi legali" eyebrow="Documenti" />
      <form action={formAction} className="space-y-5">
        <label className="block">
          <span className="mb-2 block text-[13px] font-medium tracking-wide text-zinc-300">Condizioni di accettazione</span>
          <Textarea
            name="condizioniAccettazione"
            defaultValue={props.condizioniAccettazione ?? ""}
            placeholder="Testo allegato ai moduli di accettazione e preventivi..."
            className="min-h-28"
          />
          <p className="mt-2 text-xs text-zinc-500">Appare nel corpo dei preventivi e delle accettazioni generate.</p>
        </label>
        <label className="block">
          <span className="mb-2 block text-[13px] font-medium tracking-wide text-zinc-300">Condizioni preventivo</span>
          <Textarea
            name="condizioniPreventivo"
            defaultValue={props.condizioniPreventivo ?? ""}
            placeholder="Validità del preventivo, esclusioni di responsabilità..."
            className="min-h-28"
          />
        </label>
        <label className="block">
          <span className="mb-2 block text-[13px] font-medium tracking-wide text-zinc-300">Footer documenti</span>
          <Textarea
            name="footerDocumenti"
            defaultValue={props.footerDocumenti ?? ""}
            placeholder="Testo a piè di pagina di tutti i PDF generati..."
            className="min-h-20"
          />
          <p className="mt-2 text-xs text-zinc-500">Appare in fondo a ogni documento PDF generato dall&apos;officina.</p>
        </label>
        {state.message ? (
          <p className={state.ok
            ? "rounded-xl border border-success/25 bg-success-soft px-4 py-3 text-sm text-emerald-200 animate-fade-in"
            : "rounded-xl border border-danger/25 bg-danger-soft px-4 py-3 text-sm text-red-200 animate-fade-in"
          }>
            {state.message}
          </p>
        ) : null}
        <div className="flex justify-end">
          <FormSubmitButton label="Salva testi legali" pendingLabel="Salvataggio..." className="min-w-44" />
        </div>
      </form>
    </Card>
  );
}
