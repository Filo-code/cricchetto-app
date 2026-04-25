"use client";

import { useActionState } from "react";
import { Button } from "../../components/ui/button";
import { Input } from "../../components/ui/input";
import { loginAction, type LoginActionState } from "./actions";

const initialState: LoginActionState = { ok: false, message: "" };

export default function LoginPage() {
  const [state, formAction] = useActionState(loginAction, initialState);

  return (
    <main className="flex min-h-screen items-center justify-center px-4 py-10">
      <div className="glass-panel w-full max-w-sm rounded-2xl p-7">
        <div className="mb-8 text-center">
          <img
            src="/brand/criccheto-logo-symbol.svg"
            alt="Cricchetto"
            className="mx-auto h-20 w-auto mix-blend-screen"
            width={388}
            height={189}
          />
          <p className="mt-3 text-[11px] font-medium uppercase tracking-[0.22em] text-zinc-600">
            by Filò · Dashboard
          </p>
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
