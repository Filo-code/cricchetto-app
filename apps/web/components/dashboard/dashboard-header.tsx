import { Gauge, LogOut, Wrench } from "lucide-react";
import { logoutAction } from "../../app/login/actions";
import { Button, ButtonLink } from "../ui/button";

export function DashboardHeader({ title, subtitle }: { title: string; subtitle: string }) {
  return (
    <header className="mb-8 flex flex-col gap-5 border-b border-white/[0.08] pb-8 lg:flex-row lg:items-end lg:justify-between animate-fade-in-up">
      <div className="min-w-0">
        <div className="mb-4 inline-flex items-center gap-2 rounded-full border border-accent/25 bg-accent/[0.08] px-3 py-1.5 text-[11px] font-semibold uppercase tracking-[0.22em] text-accent shadow-[inset_0_1px_0_rgba(255,255,255,0.06)]">
          <Wrench className="h-3.5 w-3.5" />
          Cricchetto
        </div>
        <h1 className="text-3xl font-semibold tracking-tight text-zinc-50 sm:text-[2.5rem] sm:leading-[1.1]">
          {title}
        </h1>
        <p className="mt-3 max-w-3xl text-sm leading-6 text-zinc-400">{subtitle}</p>
      </div>
      <div className="flex flex-wrap gap-2">
        <ButtonLink href="/dashboard" aria-label="Torna al cruscotto" className="shrink-0">
          <Gauge className="h-4 w-4" />
          Cruscotto
        </ButtonLink>
        <form action={logoutAction}>
          <Button type="submit" aria-label="Esci dalla dashboard" className="shrink-0">
            <LogOut className="h-4 w-4" />
            Esci
          </Button>
        </form>
      </div>
    </header>
  );
}
