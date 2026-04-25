import { Gauge, LogOut, Settings } from "lucide-react";
import { logoutAction } from "../../app/login/actions";
import { Button, ButtonLink } from "../ui/button";

export function DashboardHeader({ title, subtitle, logoUrl }: { title: string; subtitle: string; logoUrl?: string | null }) {
  return (
    <header className="mb-8 flex flex-col gap-5 border-b border-white/[0.06] pb-8 lg:flex-row lg:items-end lg:justify-between animate-fade-in-up">
      <div className="min-w-0">
        {/* Filò-style brand pill with operational status dot */}
        <div className="mb-4 inline-flex items-center gap-2.5 rounded-full border border-white/[0.07] bg-white/[0.025] px-3.5 py-1.5">
          {logoUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={logoUrl}
              alt="Logo officina"
              className="h-5 w-auto max-w-[80px] object-contain"
            />
          ) : (
            <img
              src="/brand/criccheto-logo-symbol.svg"
              alt="Cricchetto"
              className="h-5 w-auto mix-blend-screen"
              width={388}
              height={189}
            />
          )}
          <span className="h-3 w-px bg-white/[0.12]" aria-hidden />
          <span className="status-dot status-dot-pulse bg-accent animate-soft-pulse" aria-hidden />
          <span className="text-[10px] font-mono tracking-[0.15em] uppercase text-zinc-500">Officina · Attiva</span>
        </div>
        <h1 className="text-3xl font-bold tracking-tight text-zinc-50 sm:text-[2.5rem] sm:leading-[1.05]">
          {title}
        </h1>
        <p className="mt-3 max-w-3xl text-sm leading-6 text-zinc-500">{subtitle}</p>
      </div>
      <div className="flex flex-wrap gap-2">
        <ButtonLink href="/dashboard" aria-label="Torna al cruscotto" className="shrink-0">
          <Gauge className="h-4 w-4" />
          Cruscotto
        </ButtonLink>
        <ButtonLink href="/dashboard/settings" aria-label="Impostazioni officina" className="shrink-0">
          <Settings className="h-4 w-4" />
          Impostazioni
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
