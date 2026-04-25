"use client";

import { LockKeyhole } from "lucide-react";
import { useActionState } from "react";
import { Button } from "../../components/ui/button";
import { Input } from "../../components/ui/input";
import { loginAction, type LoginActionState } from "./actions";

const initialState: LoginActionState = { ok: false, message: "" };

export default function LoginPage() {
  const [state, formAction] = useActionState(loginAction, initialState);

  return (
    <main className="flex min-h-screen items-center justify-center px-4 py-10">
      <div className="glass-panel w-full max-w-sm rounded-2xl p-6">
        <div className="mb-6 flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl border border-accent/25 bg-accent/[0.08] text-accent">
            <LockKeyhole className="h-5 w-5" />
          </div>
          <div>
            <p className="text-sm font-semibold text-zinc-50">Cricchetto</p>
            <p className="text-xs text-zinc-500">Accesso dashboard</p>
          </div>
        </div>

        <form action={formAction} className="space-y-4">
          <label className="block">
            <span className="mb-2 block text-[13px] font-medium tracking-wide text-zinc-300">Email / utente</span>
            <Input name="email" type="text" autoComplete="username" required />
          </label>
          <label className="block">
            <span className="mb-2 block text-[13px] font-medium tracking-wide text-zinc-300">Password</span>
            <Input name="password" type="password" autoComplete="current-password" required />
          </label>

          {state.message ? (
            <p className="rounded-xl border border-danger/25 bg-danger-soft px-4 py-3 text-sm text-red-200">
              {state.message}
            </p>
          ) : null}

          <Button type="submit" variant="primary" className="w-full justify-center">
            Entra
          </Button>
        </form>
      </div>
    </main>
  );
}
