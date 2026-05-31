"use client";

import Link from "next/link";
import { useActionState } from "react";
import { Button } from "../../components/ui/button";
import { Input } from "../../components/ui/input";
import { registerWorkshopAction, type RegisterActionState } from "./actions";

const initialState: RegisterActionState = { ok: false, message: "" };

const labelClass = "mb-1.5 block text-[11px] font-mono font-medium uppercase tracking-[0.15em] text-zinc-500";

export default function RegisterPage() {
  const [state, formAction, pending] = useActionState(registerWorkshopAction, initialState);

  return (
    <div className="relative flex min-h-screen items-center justify-center overflow-hidden bg-[#07080a] px-4 py-12">
      {/* Ambient orbs */}
      <div className="pointer-events-none absolute inset-0 overflow-hidden">
        <div className="absolute -top-40 left-1/2 h-80 w-80 -translate-x-1/2 rounded-full bg-accent/10 blur-[120px]" />
        <div className="absolute bottom-0 right-0 h-64 w-64 rounded-full bg-accent/5 blur-[100px]" />
      </div>

      <div className="relative w-full max-w-md">
        {/* Top accent line */}
        <div className="mb-6 h-px w-full bg-gradient-to-r from-transparent via-accent/40 to-transparent" />

        <div className="rounded-2xl border border-white/[0.08] bg-white/[0.03] p-8 shadow-2xl backdrop-blur-sm">
          {/* Brand */}
          <div className="mb-8 text-center">
            <p className="text-[10px] font-mono uppercase tracking-[0.25em] text-zinc-600">Filò · Cricchetto</p>
            <h1 className="mt-2 text-lg font-semibold text-zinc-100">Crea il tuo account</h1>
            <p className="mt-1 text-xs text-zinc-500">7 giorni di prova gratuita, nessuna carta richiesta.</p>
          </div>

          <form action={formAction} className="space-y-4">
            <div>
              <label className={labelClass}>Nome officina</label>
              <Input name="workshopName" type="text" required autoComplete="organization" maxLength={100} />
            </div>

            <div>
              <label className={labelClass}>Nome titolare</label>
              <Input name="ownerName" type="text" required autoComplete="name" maxLength={100} />
            </div>

            <div>
              <label className={labelClass}>Email</label>
              <Input name="email" type="email" required autoComplete="email" />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className={labelClass}>Password</label>
                <Input name="password" type="password" required autoComplete="new-password" minLength={8} />
              </div>
              <div>
                <label className={labelClass}>Conferma password</label>
                <Input name="confirmPassword" type="password" required autoComplete="new-password" minLength={8} />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className={labelClass}>Telefono <span className="normal-case text-zinc-700">(opz.)</span></label>
                <Input name="phone" type="tel" autoComplete="tel" />
              </div>
              <div>
                <label className={labelClass}>P. IVA <span className="normal-case text-zinc-700">(opz.)</span></label>
                <Input name="vatNumber" type="text" />
              </div>
            </div>

            {state.message && (
              <p className="rounded-xl border border-red-500/20 bg-red-500/10 px-4 py-3 text-sm text-red-300">
                {state.message}
              </p>
            )}

            <Button type="submit" variant="primary" className="mt-2 w-full justify-center" disabled={pending}>
              {pending ? "Registrazione in corso…" : "Crea account"}
            </Button>
          </form>

          <p className="mt-6 text-center text-xs text-zinc-600">
            Hai già un account?{" "}
            <Link href="/login" className="text-zinc-400 transition-colors hover:text-zinc-200">
              Accedi
            </Link>
          </p>
        </div>
      </div>
    </div>
  );
}
