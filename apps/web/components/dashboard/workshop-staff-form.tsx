"use client";

import { useRouter } from "next/navigation";
import { useActionState, useEffect, useRef } from "react";
import {
  addWorkshopStaffMemberAction,
  deactivateWorkshopStaffMemberAction,
  type DashboardActionState,
} from "../../lib/dashboard/actions";
import { Card, CardHeader } from "../ui/card";
import { Input } from "../ui/input";
import { FormSubmitButton } from "./form-submit-button";
import type { StaffMember } from "../../lib/staff";

const initialState: DashboardActionState = { ok: false, message: "" };

export function WorkshopStaffForm({ staffMembers }: { staffMembers: StaffMember[] }) {
  const [addState, addAction] = useActionState(addWorkshopStaffMemberAction, initialState);
  const [deactivateState, deactivateAction] = useActionState(deactivateWorkshopStaffMemberAction, initialState);
  const router = useRouter();
  const addFormRef = useRef<HTMLFormElement>(null);

  useEffect(() => {
    if (addState.ok) {
      router.refresh();
      addFormRef.current?.reset();
    }
  }, [addState.ok, addState.stamp, router]);

  useEffect(() => {
    if (deactivateState.ok) router.refresh();
  }, [deactivateState.ok, deactivateState.stamp, router]);

  const activeMembers = staffMembers.filter((m) => m.isActive);
  const inactiveMembers = staffMembers.filter((m) => !m.isActive);

  return (
    <Card>
      <CardHeader title="Staff autorizzato" eyebrow="WhatsApp" />
      <div className="space-y-6">
        {staffMembers.length === 0 ? (
          <p className="text-sm text-zinc-400">
            Nessun membro autorizzato. Aggiungi un numero per abilitare i comandi WhatsApp.
          </p>
        ) : (
          <div className="space-y-2">
            {activeMembers.map((member) => (
              <div
                key={member.id}
                className="flex items-center justify-between rounded-xl border border-zinc-800 px-4 py-3"
              >
                <div>
                  <p className="text-sm font-medium text-zinc-100">{member.displayName}</p>
                  <p className="text-xs text-zinc-400">
                    {member.phone} · {member.role === "owner" ? "Titolare" : "Staff"}
                  </p>
                </div>
                <form action={deactivateAction}>
                  <input type="hidden" name="staffId" value={member.id} />
                  <FormSubmitButton
                    label="Disattiva"
                    pendingLabel="..."
                    className="h-auto min-w-0 bg-zinc-700 px-3 py-1.5 text-xs text-zinc-200 hover:bg-zinc-600"
                  />
                </form>
              </div>
            ))}

            {inactiveMembers.length > 0 && (
              <div className="mt-3 space-y-2">
                <p className="text-[11px] font-semibold uppercase tracking-widest text-zinc-600">
                  Disattivati
                </p>
                {inactiveMembers.map((member) => (
                  <div
                    key={member.id}
                    className="flex items-center justify-between rounded-xl border border-zinc-800/40 px-4 py-3 opacity-40"
                  >
                    <div>
                      <p className="text-sm text-zinc-400">{member.displayName}</p>
                      <p className="text-xs text-zinc-500">
                        {member.phone} · {member.role === "owner" ? "Titolare" : "Staff"}
                      </p>
                    </div>
                    <span className="text-xs text-zinc-600">disattivato</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {deactivateState.message && !deactivateState.ok ? (
          <p className="rounded-xl border border-danger/25 bg-danger-soft px-4 py-3 text-sm text-red-200 animate-fade-in">
            {deactivateState.message}
          </p>
        ) : null}

        <div className="border-t border-zinc-800 pt-5">
          <p className="mb-4 text-[13px] font-medium tracking-wide text-zinc-300">Aggiungi membro</p>
          <form ref={addFormRef} action={addAction} className="space-y-4">
            <div className="grid gap-3 sm:grid-cols-2">
              <label className="block">
                <span className="mb-1.5 block text-xs text-zinc-400">Nome</span>
                <Input name="displayName" type="text" placeholder="Mario Rossi" required />
              </label>
              <label className="block">
                <span className="mb-1.5 block text-xs text-zinc-400">Numero WhatsApp</span>
                <Input name="phone" type="tel" placeholder="+39 348 123 4567" required />
              </label>
            </div>
            <label className="block">
              <span className="mb-1.5 block text-xs text-zinc-400">Ruolo</span>
              <select
                name="role"
                defaultValue="staff"
                className="w-full rounded-lg border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm text-zinc-100 focus:border-zinc-500 focus:outline-none"
              >
                <option value="staff">Staff</option>
                <option value="owner">Titolare</option>
              </select>
            </label>
            {addState.message ? (
              <p
                className={
                  addState.ok
                    ? "rounded-xl border border-success/25 bg-success-soft px-4 py-3 text-sm text-emerald-200 animate-fade-in"
                    : "rounded-xl border border-danger/25 bg-danger-soft px-4 py-3 text-sm text-red-200 animate-fade-in"
                }
              >
                {addState.message}
              </p>
            ) : null}
            <div className="flex justify-end">
              <FormSubmitButton
                label="Aggiungi"
                pendingLabel="Aggiunta..."
                className="min-w-40"
              />
            </div>
          </form>
        </div>
      </div>
    </Card>
  );
}
