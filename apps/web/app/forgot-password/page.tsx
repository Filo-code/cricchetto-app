"use client";

import { LockKeyhole } from "lucide-react";
import Link from "next/link";
import { useActionState } from "react";
import { Button } from "../../components/ui/button";
import { Input } from "../../components/ui/input";
import { forgotPasswordAction, type ForgotPasswordActionState } from "./actions";

const initialState: ForgotPasswordActionState = { ok: false, submitted: false };

export default function ForgotPasswordPage() {
  const [state, formAction] = useActionState(forgotPasswordAction, initialState);

  return (
    <main className="flex min-h-screen items-center justify-center px-4 py-10">
      <div className="w-full max-w-sm">
        <div className="glass-panel rounded-2xl p-6 sm:p-8">
          <div className="mb-6 flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl border border-accent/25 bg-accent/[0.08] text-accent">
              <LockKeyhole className="h-5 w-5" />
            </div>
            <div>
              <p className="text-sm font-semibold text-zinc-50">Cricchetto</p>
              <p className="text-xs text-zinc-500">Reimposta password</p>
            </div>
          </div>

          {state.submitted ? (
            <div className="space-y-4">
              <p className="rounded-xl border border-success/25 bg-success-soft px-4 py-3 text-sm text-emerald-200">
                Se l&apos;email è associata a un account attivo, riceverai un link per reimpostare la password.
              </p>
              <Link
                href="/login"
                className="block text-center text-xs text-zinc-600 transition-colors hover:text-zinc-400"
              >
                Torna al login
              </Link>
            </div>
          ) : (
            <form action={formAction} className="space-y-4">
              <p className="text-sm leading-relaxed text-zinc-400">
                Inserisci l&apos;email del tuo account. Se esiste, riceverai un link per reimpostare la password.
              </p>

              <label className="block">
                <span className="mb-2 block text-[12px] font-mono font-medium uppercase tracking-[0.15em] text-zinc-500">Email</span>
                <Input
                  name="email"
                  type="email"
                  autoComplete="email"
                  required
                  placeholder="email@esempio.it"
                />
              </label>

              <Button type="submit" variant="primary" className="w-full justify-center">
                Invia link di reset
              </Button>

              <div className="text-center">
                <Link
                  href="/login"
                  className="text-xs text-zinc-600 transition-colors hover:text-zinc-400"
                >
                  Torna al login
                </Link>
              </div>
            </form>
          )}
        </div>

        <p className="mt-6 text-center text-[10px] font-mono tracking-[0.15em] uppercase text-zinc-700">
          Powered by Filò
        </p>
      </div>
    </main>
  );
}
