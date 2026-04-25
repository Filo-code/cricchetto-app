"use client";

import { LockKeyhole } from "lucide-react";
import { useSearchParams } from "next/navigation";
import { Suspense, useActionState } from "react";
import { Button } from "../../components/ui/button";
import { Input } from "../../components/ui/input";
import { setPasswordAction, type SetPasswordActionState } from "./actions";

const initialState: SetPasswordActionState = { ok: false, message: "" };

function SetPasswordForm() {
  const searchParams = useSearchParams();
  const token = searchParams.get("token") ?? "";
  const [state, formAction] = useActionState(setPasswordAction, initialState);

  if (!token) {
    return (
      <p className="rounded-xl border border-danger/25 bg-danger-soft px-4 py-3 text-sm text-red-200">
        Link non valido. Richiedi un nuovo link all'amministratore.
      </p>
    );
  }

  return (
    <form action={formAction} className="space-y-4">
      <input type="hidden" name="token" value={token} />
      <label className="block">
        <span className="mb-2 block text-[13px] font-medium tracking-wide text-zinc-300">Nuova password</span>
        <Input name="password" type="password" autoComplete="new-password" minLength={8} required />
      </label>
      <label className="block">
        <span className="mb-2 block text-[13px] font-medium tracking-wide text-zinc-300">Conferma password</span>
        <Input name="confirm" type="password" autoComplete="new-password" minLength={8} required />
      </label>

      {state.message ? (
        <p
          className={
            state.ok
              ? "rounded-xl border border-success/25 bg-success-soft px-4 py-3 text-sm text-emerald-200"
              : "rounded-xl border border-danger/25 bg-danger-soft px-4 py-3 text-sm text-red-200"
          }
        >
          {state.message}
        </p>
      ) : null}

      <Button type="submit" variant="primary" className="w-full justify-center">
        Imposta password
      </Button>
    </form>
  );
}

export default function SetPasswordPage() {
  return (
    <main className="flex min-h-screen items-center justify-center px-4 py-10">
      <div className="glass-panel w-full max-w-sm rounded-2xl p-6">
        <div className="mb-6 flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl border border-accent/25 bg-accent/[0.08] text-accent">
            <LockKeyhole className="h-5 w-5" />
          </div>
          <div>
            <p className="text-sm font-semibold text-zinc-50">Cricchetto</p>
            <p className="text-xs text-zinc-500">Imposta password</p>
          </div>
        </div>
        <Suspense fallback={null}>
          <SetPasswordForm />
        </Suspense>
      </div>
    </main>
  );
}
