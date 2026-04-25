"use client";

import { useRouter } from "next/navigation";
import { useActionState, useEffect } from "react";
import { updateWorkshopDisplayNameAction, type DashboardActionState } from "../../lib/dashboard/actions";
import { Card, CardHeader } from "../ui/card";
import { Input } from "../ui/input";
import { FormSubmitButton } from "./form-submit-button";

const initialState: DashboardActionState = { ok: false, message: "" };

export function WorkshopDisplayNameForm({
  workshopName,
  displayName,
}: {
  workshopName: string;
  displayName: string | null;
}) {
  const [state, formAction] = useActionState(updateWorkshopDisplayNameAction, initialState);
  const router = useRouter();

  useEffect(() => {
    if (state.ok) router.refresh();
  }, [state.ok, state.stamp, router]);

  return (
    <Card>
      <CardHeader title="Informazioni officina" eyebrow="Identità" />
      <div className="mb-5 rounded-2xl border border-white/[0.06] bg-white/[0.02] px-4 py-3">
        <p className="text-[10.5px] font-semibold uppercase tracking-[0.18em] text-zinc-500">Nome di sistema</p>
        <p className="mt-1 font-mono text-sm text-zinc-300">{workshopName}</p>
      </div>
      <form action={formAction} className="space-y-4">
        <label className="block">
          <span className="mb-2 block text-[13px] font-medium tracking-wide text-zinc-300">Nome visualizzato</span>
          <Input
            name="displayName"
            defaultValue={displayName ?? workshopName}
            placeholder={workshopName}
            required
          />
          <p className="mt-2 text-xs text-zinc-500">
            Sovrascrive il nome di sistema nella dashboard e nelle intestazioni dei documenti.
          </p>
        </label>
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
        <div className="flex justify-end">
          <FormSubmitButton label="Salva modifiche" pendingLabel="Salvataggio..." className="min-w-40" />
        </div>
      </form>
    </Card>
  );
}
