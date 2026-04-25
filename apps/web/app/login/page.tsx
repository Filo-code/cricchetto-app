"use client";

import { useActionState } from "react";
import { Button } from "../../components/ui/button";
import { Input } from "../../components/ui/input";
import { loginAction, type LoginActionState } from "./actions";

const initialState: LoginActionState = { ok: false, message: "" };

export default function LoginPage() {
  const [state, formAction] = useActionState(loginAction, initialState);

  return (
    <main className="relative flex min-h-screen items-center justify-center overflow-hidden px-4 py-10">
      {/* Filò-style ambient accent orb */}
      <div className="pointer-events-none absolute inset-0" aria-hidden>
        <div className="absolute left-1/2 top-1/2 h-[500px] w-[500px] -translate-x-1/2 -translate-y-1/2 rounded-full bg-accent/[0.05] blur-[120px]" />
        <div className="absolute left-[35%] top-[25%] h-[200px] w-[200px] rounded-full bg-accent/[0.03] blur-[70px]" />
      </div>

      {/* Top accent line — matches dashboard shell */}
      <div className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-accent/40 to-transparent" aria-hidden />

      <div className="relative z-10 w-full max-w-sm">
        <div className="glass-panel rounded-2xl p-7 sm:p-8">
          {/* Brand lockup */}
          <div className="mb-8 text-center">
            <div className="mb-4 inline-flex items-center justify-center rounded-2xl border border-white/[0.06] bg-white/[0.02] p-4">
              <img
                src="/brand/criccheto-logo-symbol.svg"
                alt="Cricchetto"
                className="h-16 w-auto mix-blend-screen"
                width={388}
                height={189}
              />
            </div>
            <p className="mt-2 text-[10px] font-mono tracking-[0.2em] uppercase text-zinc-600">
              by Filò · Dashboard officina
            </p>
          </div>

          <form action={formAction} className="space-y-4">
            <label className="block">
              <span className="mb-2 block text-[12px] font-mono font-medium uppercase tracking-[0.15em] text-zinc-500">Email / utente</span>
              <Input name="email" type="text" autoComplete="username" required />
            </label>
            <label className="block">
              <span className="mb-2 block text-[12px] font-mono font-medium uppercase tracking-[0.15em] text-zinc-500">Password</span>
              <Input name="password" type="password" autoComplete="current-password" required />
            </label>

            {state.message ? (
              <p className="rounded-xl border border-danger/20 bg-danger-soft px-4 py-3 text-sm text-red-200">
                {state.message}
              </p>
            ) : null}

            <Button type="submit" variant="primary" className="mt-2 w-full justify-center">
              Accedi
            </Button>
          </form>
        </div>

        {/* Footer branding */}
        <p className="mt-6 text-center text-[10px] font-mono tracking-[0.15em] uppercase text-zinc-700">
          Powered by Filò
        </p>
      </div>
    </main>
  );
}
