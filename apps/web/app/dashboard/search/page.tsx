import { ArrowUpRight, CarFront, ClipboardList, UserRound } from "lucide-react";
import Link from "next/link";
import { DashboardHeader } from "../../../components/dashboard/dashboard-header";
import { DashboardShell } from "../../../components/dashboard/dashboard-shell";
import { EmptyState } from "../../../components/dashboard/empty-state";
import { PlateSearch } from "../../../components/dashboard/plate-search";
import { WorkOrderStatusBadge } from "../../../components/dashboard/work-order-status-badge";
import { WorkOrderSummaryCard } from "../../../components/dashboard/work-order-summary-card";
import { Badge } from "../../../components/ui/badge";
import { Card, CardHeader } from "../../../components/ui/card";
import { dashboardGet } from "../../../lib/dashboard/api-client";
import { formatDate, statusLabel } from "../../../lib/dashboard/formatters";
import type { DashboardSearchResult } from "../../../lib/dashboard/types";

export const dynamic = "force-dynamic";

export default async function DashboardSearchPage({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  const { q } = await searchParams;
  const query = (q ?? "").trim();
  const result = await dashboardGet<DashboardSearchResult>(`/api/dashboard/search?q=${encodeURIComponent(query)}`);
  const hasResults = result.vehicles.length > 0 || result.activeWorkOrders.length > 0 || result.historyWorkOrders.length > 0;

  return (
    <DashboardShell>
      <DashboardHeader
        title="Ricerca officina"
        subtitle="Cerca una targa, un nome cliente, un cognome o un nome completo."
      />
      <div className="mb-6">
        <PlateSearch />
      </div>

      <div className="space-y-5">
        {!query ? (
          <EmptyState title="Cerca una targa o un cliente">Inserisci almeno due caratteri per trovare veicoli, schede attive e storico.</EmptyState>
        ) : !hasResults ? (
          <EmptyState title="Nessun risultato">Non abbiamo trovato veicoli o schede collegate a questa ricerca.</EmptyState>
        ) : null}

        <Card>
          <CardHeader title="Veicoli e targhe" eyebrow={`${result.vehicles.length} risultati`} />
          <div className="space-y-3">
            {result.vehicles.length > 0 ? (
              result.vehicles.map((vehicle) => (
                <Link
                  key={vehicle.vehicleId}
                  href={`/dashboard/vehicles/${vehicle.plate}`}
                  className="flex flex-col gap-3 rounded-2xl border border-white/10 bg-white/[0.04] p-4 transition hover:border-accent/35 hover:bg-white/[0.07] sm:flex-row sm:items-center sm:justify-between"
                >
                  <div>
                    <div className="flex flex-wrap items-center gap-2">
                      <CarFront className="h-4 w-4 text-accent" />
                      <p className="font-semibold text-zinc-50">{vehicle.plate}</p>
                      {vehicle.activeWorkOrderStatus ? <Badge tone="green">Scheda aperta</Badge> : <Badge tone="neutral">Solo storico</Badge>}
                    </div>
                    <p className="mt-1 text-sm text-zinc-500">
                      {vehicle.model ?? "Modello non indicato"} - {vehicle.customerName ?? "Cliente non indicato"} - Revisione {formatDate(vehicle.revisionDueDate)}
                    </p>
                  </div>
                  <div className="flex items-center gap-3 text-sm text-zinc-400">
                    {vehicle.activeWorkOrderStatus ? statusLabel(vehicle.activeWorkOrderStatus) : "Apri veicolo"}
                    <ArrowUpRight className="h-4 w-4 text-zinc-600" />
                  </div>
                </Link>
              ))
            ) : (
              <EmptyState title="Nessun veicolo trovato">Nessuna targa collegata alla ricerca.</EmptyState>
            )}
          </div>
        </Card>

        <Card>
          <CardHeader title="Schede attive" eyebrow={`${result.activeWorkOrders.length} risultati`} />
          <div className="space-y-3">
            {result.activeWorkOrders.length > 0 ? (
              result.activeWorkOrders.map((workOrder) => <WorkOrderSummaryCard key={workOrder.id} workOrder={workOrder} />)
            ) : (
              <EmptyState title="Nessuna scheda aperta">Non risultano lavorazioni aperte per questa ricerca.</EmptyState>
            )}
          </div>
        </Card>

        <Card>
          <CardHeader title="Storico schede" eyebrow={`${result.historyWorkOrders.length} risultati`} />
          <div className="space-y-3">
            {result.historyWorkOrders.length > 0 ? (
              result.historyWorkOrders.map((workOrder) => (
                <Link
                  key={workOrder.id}
                  href={`/dashboard/work-orders/${workOrder.id}`}
                  className="flex flex-col gap-3 rounded-2xl border border-white/10 bg-white/[0.04] p-4 transition hover:border-accent/35 hover:bg-white/[0.07] sm:flex-row sm:items-center sm:justify-between"
                >
                  <div>
                    <div className="flex flex-wrap items-center gap-2">
                      <ClipboardList className="h-4 w-4 text-accent" />
                      <p className="font-semibold text-zinc-50">{workOrder.plate}</p>
                      <WorkOrderStatusBadge status={workOrder.status} />
                    </div>
                    <p className="mt-1 text-sm text-zinc-500">
                      <UserRound className="mr-1 inline h-3.5 w-3.5" />
                      {workOrder.customerName ?? "Cliente non indicato"} - {workOrder.publicCode}
                    </p>
                  </div>
                  <ArrowUpRight className="h-4 w-4 text-zinc-600" />
                </Link>
              ))
            ) : (
              <EmptyState title="Nessuno storico trovato">Non ci sono schede passate collegate alla ricerca.</EmptyState>
            )}
          </div>
        </Card>
      </div>
    </DashboardShell>
  );
}
