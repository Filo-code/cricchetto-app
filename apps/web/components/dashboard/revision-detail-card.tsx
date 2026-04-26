"use client";

import { CalendarDays, CheckCircle2, TriangleAlert } from "lucide-react";
import { useRouter } from "next/navigation";
import { useActionState, useEffect } from "react";
import { updateWorkOrderRevisionAction, type DashboardActionState } from "../../lib/dashboard/actions";
import { formatDate } from "../../lib/dashboard/formatters";
import { Badge } from "../ui/badge";
import { Card, CardHeader } from "../ui/card";
import { Input } from "../ui/input";
import { FormSubmitButton } from "./form-submit-button";

const initialState: DashboardActionState = { ok: false, message: "" };

export function RevisionDetailCard({
  workOrderId,
  vehicleId,
  revisionDueDate,
  revisionReminderEnabled,
  revisionReminderChannel = null,
  revisionAppointmentDate,
  revisionAppointmentTime,
}: {
  workOrderId?: string | null;
  vehicleId: string;
  revisionDueDate: string | null;
  revisionReminderEnabled: boolean | null;
  revisionReminderChannel?: "whatsapp" | "telegram_test" | null;
  revisionAppointmentDate: string | null;
  revisionAppointmentTime: string | null;
}) {
  const [state, formAction] = useActionState(updateWorkOrderRevisionAction, initialState);
  const router = useRouter();
  const today = new Date().toISOString().slice(0, 10);
  const overdue = revisionDueDate ? revisionDueDate < today : false;
  const Icon = overdue ? TriangleAlert : CheckCircle2;

  useEffect(() => {
    if (state.ok) {
      router.refresh();
    }
  }, [router, state.ok, state.stamp]);

  return (
    <Card>
      <CardHeader title="Revisione" />
      <div className="flex items-center justify-between gap-4">
        <div>
          <p className="text-xs font-medium uppercase tracking-[0.16em] text-zinc-500">Scadenza registrata</p>
          <p className="mt-1.5 text-2xl font-semibold tracking-tight text-zinc-50 tabular-nums">{formatDate(revisionDueDate)}</p>
        </div>
        <div
          className={
            overdue
              ? "flex h-12 w-12 items-center justify-center rounded-2xl border border-red-400/25 bg-red-400/[0.08] text-red-300 shadow-[inset_0_1px_0_rgba(255,255,255,0.06)]"
              : "flex h-12 w-12 items-center justify-center rounded-2xl border border-accent/25 bg-accent/[0.08] text-accent shadow-[inset_0_1px_0_rgba(255,255,255,0.06)]"
          }
        >
          <CalendarDays className="h-5 w-5" />
        </div>
      </div>
      <div className="mt-5">
        {revisionDueDate ? (
          <div className="flex flex-wrap gap-2">
            <Badge tone={overdue ? "red" : "green"} dot pulse={overdue}>
              <Icon className="mr-1 h-3 w-3" />
              {overdue ? "Scaduta" : "Monitorata"}
            </Badge>
            <Badge tone={revisionReminderEnabled === false ? "neutral" : "blue"} dot>
              Promemoria {revisionReminderEnabled === false ? "off" : "on"}
            </Badge>
          </div>
        ) : (
          <Badge tone="amber" dot>Da completare</Badge>
        )}
      </div>

      <div className="mt-5 rounded-2xl border border-white/10 bg-white/[0.03] px-4 py-3">
        <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-zinc-500">Appuntamento revisione</p>
        <p className="mt-2 text-sm font-medium text-zinc-100">
          {revisionAppointmentDate
            ? `${formatDate(revisionAppointmentDate)}${revisionAppointmentTime ? ` alle ${revisionAppointmentTime.slice(0, 5)}` : ""}`
            : "Non programmato"}
        </p>
      </div>

      <form action={formAction} className="mt-5 rounded-2xl border border-white/10 bg-white/[0.03] p-4">
        <input type="hidden" name="workOrderId" value={workOrderId ?? ""} />
        <input type="hidden" name="vehicleId" value={vehicleId} />
        <div className="grid gap-4 sm:grid-cols-2">
          <label className="block">
            <span className="mb-2 block text-[13px] font-medium tracking-wide text-zinc-300">Scadenza revisione</span>
            <Input name="revisionDueDate" type="date" defaultValue={revisionDueDate ?? ""} required />
          </label>
          <label className="block">
            <span className="mb-2 block text-[13px] font-medium tracking-wide text-zinc-300">Promemoria automatico</span>
            <span className="flex h-12 items-center justify-between rounded-xl border border-white/10 bg-white/[0.04] px-4 text-sm text-zinc-200">
              <span>{revisionReminderEnabled === false ? "Disattivato" : "Attivo"}</span>
              <input
                name="revisionReminderEnabled"
                type="checkbox"
                defaultChecked={revisionReminderEnabled !== false}
                className="h-4 w-4 rounded border-white/20 bg-transparent text-accent focus:ring-accent/40"
              />
            </span>
          </label>
          <label className="block">
            <span className="mb-2 block text-[13px] font-medium tracking-wide text-zinc-300">Canale promemoria</span>
            <select
              name="revisionReminderChannel"
              defaultValue={revisionReminderChannel ?? "whatsapp"}
              className="h-12 w-full rounded-xl border border-white/10 bg-white/[0.04] px-4 text-sm text-zinc-200 focus:outline-none focus:ring-1 focus:ring-accent/40"
            >
              <option value="whatsapp">WhatsApp</option>
              <option value="telegram_test">Telegram (test)</option>
            </select>
          </label>
          <label className="block">
            <span className="mb-2 block text-[13px] font-medium tracking-wide text-zinc-300">Data appuntamento</span>
            <Input name="revisionAppointmentDate" type="date" defaultValue={revisionAppointmentDate ?? ""} />
          </label>
          <label className="block">
            <span className="mb-2 block text-[13px] font-medium tracking-wide text-zinc-300">Ora appuntamento</span>
            <Input name="revisionAppointmentTime" type="time" defaultValue={revisionAppointmentTime ? revisionAppointmentTime.slice(0, 5) : ""} />
          </label>
        </div>
        <div className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
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
          ) : (
            <p className="text-xs leading-5 text-zinc-500">La scadenza resta unica. Promemoria e appuntamento usano gli stessi dati veicolo condivisi da dashboard e messaggistica.</p>
          )}
          <FormSubmitButton label="Salva revisione" pendingLabel="Aggiornamento revisione..." className="sm:min-w-40" />
        </div>
      </form>
    </Card>
  );
}
