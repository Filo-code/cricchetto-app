import { ArrowUpRight, Car, CarFront, Search } from "lucide-react";
import Link from "next/link";
import { DashboardHeader } from "../../../components/dashboard/dashboard-header";
import { DashboardShell } from "../../../components/dashboard/dashboard-shell";
import { EmptyState } from "../../../components/dashboard/empty-state";
import { Badge } from "../../../components/ui/badge";
import { ButtonLink } from "../../../components/ui/button";
import { Card, CardHeader } from "../../../components/ui/card";
import { dashboardGet } from "../../../lib/dashboard/api-client";
import { formatDate, statusLabel } from "../../../lib/dashboard/formatters";
import type { DashboardSearchVehicle } from "../../../lib/dashboard/types";

export const dynamic = "force-dynamic";

export default async function VehiclesIndexPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string }>;
}) {
  const { q } = await searchParams;
  const query = (q ?? "").trim();
  const vehicles = await dashboardGet<DashboardSearchVehicle[]>(
    `/api/dashboard/vehicles?q=${encodeURIComponent(query)}`,
  );

  return (
    <DashboardShell>
      <DashboardHeader
        title="Storico auto"
        subtitle="Cerca una targa o un cliente e apri lo storico del veicolo."
      />

      <form
        method="GET"
        action="/dashboard/vehicles"
        className="glass-panel mb-6 rounded-2xl p-5 sm:p-6"
      >
        <div className="mb-4 flex flex-col gap-1">
          <label
            htmlFor="vehicles-search-q"
            className="block text-sm font-semibold tracking-tight text-zinc-100"
          >
            Cerca veicolo
          </label>
          <p className="text-xs text-zinc-500">Targa o nome cliente.</p>
        </div>
        <div className="flex flex-col gap-3 sm:flex-row">
          <div className="relative flex-1">
            <Search
              className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-500"
              aria-hidden
            />
            <input
              id="vehicles-search-q"
              name="q"
              defaultValue={query}
              placeholder="Es. AB123CD o Mario Rossi"
              autoComplete="off"
              className="h-12 w-full rounded-xl border border-white/10 bg-white/[0.05] pl-11 pr-4 text-base text-zinc-50 outline-none transition-all duration-200 placeholder:text-zinc-600 hover:border-white/20 hover:bg-white/[0.07] focus:border-accent/60 focus:bg-white/[0.07] focus:ring-4 focus:ring-accent/10 focus:shadow-[0_0_0_1px_rgba(214,179,106,0.35)]"
            />
          </div>
          <button
            type="submit"
            className="inline-flex h-12 items-center justify-center gap-2 rounded-xl border border-accent/50 bg-gradient-to-b from-accent to-accent-500 px-6 text-sm font-medium tracking-tight text-zinc-950 shadow-[0_6px_20px_-6px_rgba(214,179,106,0.55),inset_0_1px_0_rgba(255,255,255,0.3)] transition-all duration-200 hover:brightness-105 sm:w-36"
          >
            <Search className="h-4 w-4" />
            Cerca
          </button>
        </div>
      </form>

      <Card>
        <CardHeader
          title={query ? `Risultati per "${query}"` : "Veicoli recenti"}
          eyebrow={vehicles.length > 0 ? `${vehicles.length} veicoli` : undefined}
        />
        <div className="space-y-3">
          {vehicles.length > 0 ? (
            vehicles.map((vehicle) => (
              <Link
                key={vehicle.vehicleId}
                href={`/dashboard/vehicles/${encodeURIComponent(vehicle.plate)}`}
                className="flex flex-col gap-3 rounded-2xl border border-white/10 bg-white/[0.04] p-4 transition hover:border-accent/35 hover:bg-white/[0.07] sm:flex-row sm:items-center sm:justify-between"
              >
                <div>
                  <div className="flex flex-wrap items-center gap-2">
                    <CarFront className="h-4 w-4 text-accent" />
                    <p className="font-semibold text-zinc-50">{vehicle.plate}</p>
                    {vehicle.activeWorkOrderStatus ? (
                      <Badge tone="green">Scheda aperta</Badge>
                    ) : (
                      <Badge tone="neutral">Solo storico</Badge>
                    )}
                  </div>
                  <p className="mt-1 text-sm text-zinc-500">
                    {vehicle.model ?? "Modello non indicato"}
                    {vehicle.customerName ? ` · ${vehicle.customerName}` : ""}
                    {vehicle.revisionDueDate
                      ? ` · Revisione ${formatDate(vehicle.revisionDueDate)}`
                      : ""}
                  </p>
                </div>
                <div className="flex shrink-0 items-center gap-3 text-sm text-zinc-400">
                  {vehicle.activeWorkOrderStatus
                    ? statusLabel(vehicle.activeWorkOrderStatus)
                    : "Apri storico"}
                  <ArrowUpRight className="h-4 w-4 text-zinc-600" />
                </div>
              </Link>
            ))
          ) : query ? (
            <EmptyState title="Nessun veicolo trovato" icon={Car}>
              Nessuna targa o cliente corrisponde a questa ricerca.
            </EmptyState>
          ) : (
            <EmptyState title="Nessun veicolo registrato" icon={Car}>
              I veicoli compariranno qui man mano che vengono registrati nel sistema.
            </EmptyState>
          )}
        </div>
      </Card>

      <div className="mt-6 flex justify-start">
        <ButtonLink href="/dashboard" variant="ghost">
          Torna al cruscotto
        </ButtonLink>
      </div>
    </DashboardShell>
  );
}
