"use client";

import { useRouter } from "next/navigation";
import { useActionState, useEffect } from "react";
import { updateWorkshopLaborRateAction, type DashboardActionState } from "../../lib/dashboard/actions";
import { Card, CardHeader } from "../ui/card";
import { Input } from "../ui/input";
import { FormSubmitButton } from "./form-submit-button";

const initialState: DashboardActionState = { ok: false, message: "" };

export function WorkshopLaborRateForm({ hourlyRate }: { hourlyRate: number }) {
  const [state, formAction] = useActionState(updateWorkshopLaborRateAction, initialState);
  const router = useRouter();

  useEffect(() => {
    if (state.ok) router.refresh();
  }, [state.ok, state.stamp, router]);

  return (
    <Card>
      <CardHeader title="Tariffe" eyebrow="Manodopera" />
      <form action={formAction} className="space-y-4">
        <label className="block">
          <span className="mb-2 block text-[13px] font-medium tracking-wide text-zinc-300">Tariffa manodopera</span>
          <div className="relative">
            <Input
              name="hourlyRate"
              type="number"
              min="0"
              max="1000"
              step="0.01"
              inputMode="decimal"
              defaultValue={hourlyRate}
              placeholder="45.00"
              className="pr-16"
            />
            <span className="pointer-events-none absolute inset-y-0 right-4 flex items-center text-sm text-zinc-500">
              €/ora
            </span>
          </div>
          <p className="mt-2 text-xs text-zinc-500">
            Prezzo orario usato come riferimento per le righe di manodopera.
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
