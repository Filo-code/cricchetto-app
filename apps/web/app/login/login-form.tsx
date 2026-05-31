"use client";

import { MessageCircle } from "lucide-react";
import { Suspense, useActionState } from "react";
import { useSearchParams } from "next/navigation";
import { Button } from "../../components/ui/button";
import { Input } from "../../components/ui/input";
import { loginAction, type LoginActionState } from "./actions";
import Link from "next/link";

const initialState: LoginActionState = { ok: false, message: "" };

function LoginFormInner({ showForgotPassword }: { showForgotPassword: boolean }) {
  const [state, formAction] = useActionState(loginAction, initialState);
  const searchParams = useSearchParams();
  const setupDone = searchParams.get("setup") === "done";
  const accountSuspended = searchParams.get("account") === "suspended";

  return (
    <form action={formAction} className="space-y-4">
      {setupDone && (
        <p className="rounded-xl border border-success/25 bg-success-soft px-4 py-3 text-sm text-emerald-200">
          Password impostata. Accedi con le tue credenziali.
        </p>
      )}
      {accountSuspended && (
        <p className="rounded-xl border border-amber-500/25 bg-amber-500/10 px-4 py-3 text-sm text-amber-300">
          L&apos;account officina è sospeso o chiuso. Contatta l&apos;amministratore Filò per ulteriori informazioni.
        </p>
      )}
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

      {showForgotPassword && (
        <div className="text-center">
          <Link
            href="/forgot-password"
            className="text-xs text-zinc-600 transition-colors hover:text-zinc-400"
          >
            Password dimenticata?
          </Link>
        </div>
      )}

      <p className="text-center text-xs text-zinc-600">
        Non hai un account?{" "}
        <Link href="/register" className="text-zinc-400 transition-colors hover:text-zinc-200">
          Registrati
        </Link>
      </p>
    </form>
  );
}

export function LoginForm({ showForgotPassword = false }: { showForgotPassword?: boolean }) {
  return (
    <Suspense fallback={null}>
      <LoginFormInner showForgotPassword={showForgotPassword} />
    </Suspense>

  );
}

export function WhatsAppSupportButton({ number }: { number: string }) {
  const text = encodeURIComponent("Ciao Filò, ho bisogno di supporto per accedere a Cricchetto.");
  const href = `https://wa.me/${number.replace(/[^0-9]/g, "")}?text=${text}`;

  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className="mt-4 flex w-full items-center justify-center gap-2 rounded-xl border border-white/[0.06] bg-white/[0.02] px-4 py-3 text-sm text-zinc-400 transition-colors hover:border-white/[0.1] hover:text-zinc-300"
    >
      <MessageCircle className="h-4 w-4 shrink-0 text-green-500" />
      <span className="text-xs">
        <span className="block font-medium text-zinc-300">Serve aiuto?</span>
        <span className="text-zinc-500">Contatta Filò su WhatsApp</span>
      </span>
    </a>
  );
}
