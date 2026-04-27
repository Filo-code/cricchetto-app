"use client";

import { useActionState } from "react";
import { Button } from "../ui/button";
import { Input } from "../ui/input";
import { createWorkshopAction, type CreateWorkshopActionState } from "../../app/admin/workshops/actions";

const initialState: CreateWorkshopActionState = { ok: false, message: "" };

export function CreateWorkshopForm() {
  const [state, formAction] = useActionState(createWorkshopAction, initialState);

  if (state.ok && state.result) {
    return (
      <div className="space-y-4 rounded-2xl border border-white/10 bg-white/[0.03] p-6">
        <p className="text-sm font-medium text-emerald-300">Officina creata con successo.</p>
        <div className="space-y-2">
          <p className="text-[11px] font-mono uppercase tracking-[0.15em] text-zinc-500">
            Link invito (valido 72 ore)
          </p>
          <div className="flex items-start gap-2">
            <code className="flex-1 rounded-xl border border-white/10 bg-black/30 px-3 py-2 text-[11px] text-zinc-300 break-all">
              {state.result.inviteLink}
            </code>
            <Button
              type="button"
              variant="ghost"
              className="shrink-0"
              onClick={() => navigator.clipboard?.writeText(state.result!.inviteLink)}
            >
              Copia
            </Button>
          </div>
          <p className="text-[11px] text-zinc-600">
            Scade: {new Date(state.result.expiresAt).toLocaleString("it-IT")}
          </p>
          <p className="text-[11px] text-amber-500/80">
            Apri il link in una finestra anonima o invialo direttamente al cliente. Il link serve solo per impostare la password del nuovo account.
          </p>
        </div>
        <Button
          type="button"
          variant="ghost"
          onClick={() => window.location.reload()}
        >
          Crea altra officina
        </Button>
      </div>
    );
  }

  return (
    <form action={formAction} className="glass-panel space-y-4 rounded-2xl p-6">
      <label className="block">
        <span className="mb-2 block text-[12px] font-mono font-medium uppercase tracking-[0.15em] text-zinc-500">
          Nome officina *
        </span>
        <Input name="workshopName" type="text" required />
      </label>

      <label className="block">
        <span className="mb-2 block text-[12px] font-mono font-medium uppercase tracking-[0.15em] text-zinc-500">
          Email titolare *
        </span>
        <Input name="ownerEmail" type="email" autoComplete="off" required />
      </label>

      <label className="block">
        <span className="mb-2 block text-[12px] font-mono font-medium uppercase tracking-[0.15em] text-zinc-500">
          Nome titolare
        </span>
        <Input name="ownerName" type="text" autoComplete="off" />
      </label>

      <label className="block">
        <span className="mb-2 block text-[12px] font-mono font-medium uppercase tracking-[0.15em] text-zinc-500">
          Città
        </span>
        <Input name="city" type="text" />
      </label>

      <label className="block">
        <span className="mb-2 block text-[12px] font-mono font-medium uppercase tracking-[0.15em] text-zinc-500">
          Fuso orario
        </span>
        <Input name="timezone" type="text" defaultValue="Europe/Rome" />
      </label>

      {state.message && !state.ok ? (
        <p className="rounded-xl border border-danger/20 bg-danger-soft px-4 py-3 text-sm text-red-200">
          {state.message}
        </p>
      ) : null}

      <Button type="submit" variant="primary" className="w-full justify-center">
        Crea cliente
      </Button>
    </form>
  );
}
