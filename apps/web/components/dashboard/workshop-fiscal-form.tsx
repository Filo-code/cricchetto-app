"use client";

import { useRouter } from "next/navigation";
import { useActionState, useEffect } from "react";
import type { ReactNode } from "react";
import { updateWorkshopProfileAction, type DashboardActionState } from "../../lib/dashboard/actions";
import type { WorkshopFullSettings } from "../../lib/dashboard/read";
import { Card, CardHeader } from "../ui/card";
import { Input } from "../ui/input";
import { FormSubmitButton } from "./form-submit-button";

const initialState: DashboardActionState = { ok: false, message: "" };

type FiscalProps = Pick<WorkshopFullSettings, "ragioneSociale" | "partitaIva" | "codiceFiscale" | "indirizzo" | "citta" | "cap" | "provincia" | "telefono" | "email" | "pec" | "sdi">;

export function WorkshopFiscalForm(props: FiscalProps) {
  const [state, formAction] = useActionState(updateWorkshopProfileAction, initialState);
  const router = useRouter();

  useEffect(() => {
    if (state.ok) router.refresh();
  }, [state.ok, state.stamp, router]);

  return (
    <Card>
      <CardHeader title="Dati fiscali" eyebrow="Profilo officina" />
      <form action={formAction} className="space-y-5">
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Ragione sociale" className="sm:col-span-2">
            <Input name="ragioneSociale" defaultValue={props.ragioneSociale ?? ""} placeholder="Officina Rossi S.r.l." autoComplete="off" />
          </Field>
          <Field label="Partita IVA">
            <Input name="partitaIva" defaultValue={props.partitaIva ?? ""} placeholder="IT01234567890" autoComplete="off" />
          </Field>
          <Field label="Codice fiscale">
            <Input name="codiceFiscale" defaultValue={props.codiceFiscale ?? ""} placeholder="RSSMRC80A01H501Z" autoComplete="off" />
          </Field>
          <Field label="Indirizzo" className="sm:col-span-2">
            <Input name="indirizzo" defaultValue={props.indirizzo ?? ""} placeholder="Via Roma 1" autoComplete="off" />
          </Field>
          <Field label="Città">
            <Input name="citta" defaultValue={props.citta ?? ""} placeholder="Milano" autoComplete="off" />
          </Field>
          <Field label="CAP">
            <Input name="cap" defaultValue={props.cap ?? ""} placeholder="20100" autoComplete="off" />
          </Field>
          <Field label="Provincia">
            <Input name="provincia" defaultValue={props.provincia ?? ""} placeholder="MI" autoComplete="off" />
          </Field>
          <Field label="Telefono">
            <Input name="telefono" defaultValue={props.telefono ?? ""} placeholder="+39 02 1234567" autoComplete="off" />
          </Field>
          <Field label="Email">
            <Input name="email" type="email" defaultValue={props.email ?? ""} placeholder="info@officina.it" autoComplete="off" />
          </Field>
          <Field label="PEC">
            <Input name="pec" type="email" defaultValue={props.pec ?? ""} placeholder="officina@pec.it" autoComplete="off" />
          </Field>
          <Field label="Codice SDI">
            <Input name="sdi" defaultValue={props.sdi ?? ""} placeholder="0000000" autoComplete="off" />
          </Field>
        </div>
        {state.message ? (
          <p className={state.ok
            ? "rounded-xl border border-success/25 bg-success-soft px-4 py-3 text-sm text-emerald-200 animate-fade-in"
            : "rounded-xl border border-danger/25 bg-danger-soft px-4 py-3 text-sm text-red-200 animate-fade-in"
          }>
            {state.message}
          </p>
        ) : null}
        <div className="flex justify-end">
          <FormSubmitButton label="Salva dati fiscali" pendingLabel="Salvataggio..." className="min-w-44" />
        </div>
      </form>
    </Card>
  );
}

function Field({ label, children, className }: { label: string; children: ReactNode; className?: string }) {
  return (
    <label className={`block${className ? ` ${className}` : ""}`}>
      <span className="mb-2 block text-[13px] font-medium tracking-wide text-zinc-300">{label}</span>
      {children}
    </label>
  );
}
