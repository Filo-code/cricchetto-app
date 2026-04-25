import Link from "next/link";
import { DashboardHeader } from "../../../components/dashboard/dashboard-header";
import { DashboardShell } from "../../../components/dashboard/dashboard-shell";
import { WorkOrderListCard } from "../../../components/dashboard/work-order-list-card";
import { dashboardGet } from "../../../lib/dashboard/api-client";
import type { DashboardWorkOrderSummary } from "../../../lib/dashboard/types";

export const dynamic = "force-dynamic";

const FILTER_LABELS: Record<string, { title: string; subtitle: string; emptyTitle: string }> = {
  active: {
    title: "Schede attive",
    subtitle: "Schede accettate, in lavorazione o pronte al ritiro.",
    emptyTitle: "Nessuna scheda attiva",
  },
  accepted: {
    title: "Schede accettate",
    subtitle: "Veicoli entrati ma non ancora segnati in lavorazione.",
    emptyTitle: "Nessuna scheda accettata",
  },
  in_progress: {
    title: "Schede in lavorazione",
    subtitle: "Veicoli con lavorazione operativa in corso.",
    emptyTitle: "Nessuna scheda in lavorazione",
  },
  ready: {
    title: "Schede pronte",
    subtitle: "Veicoli pronti e non ancora ritirati.",
    emptyTitle: "Nessuna scheda pronta",
  },
  collected: {
    title: "Schede ritirate",
    subtitle: "Veicoli consegnati al cliente.",
    emptyTitle: "Nessuna scheda ritirata",
  },
  archived: {
    title: "Schede archiviate",
    subtitle: "Storico archiviato.",
    emptyTitle: "Nessuna scheda archiviata",
  },
  closed: {
    title: "Schede chiuse",
    subtitle: "Veicoli ritirati o archiviati.",
    emptyTitle: "Nessuna scheda chiusa",
  },
};

const FILTER_ORDER = ["active", "accepted", "in_progress", "ready", "closed", "archived"] as const;

interface FilteredWorkOrdersResponse {
  filter: string;
  workOrders: DashboardWorkOrderSummary[];
}

export default async function DashboardWorkOrdersPage({ searchParams }: { searchParams: Promise<{ filter?: string }> }) {
  const { filter: rawFilter } = await searchParams;
  const data = await dashboardGet<FilteredWorkOrdersResponse>(`/api/dashboard/work-orders?filter=${encodeURIComponent(rawFilter ?? "active")}`);
  const labels = FILTER_LABELS[data.filter] ?? FILTER_LABELS.active;

  return (
    <DashboardShell>
      <DashboardHeader title={labels.title} subtitle={labels.subtitle} />
      <div className="mb-5 flex flex-wrap gap-2">
        {FILTER_ORDER.map((filter) => {
          const tab = FILTER_LABELS[filter];
          const active = data.filter === filter;
          return (
            <Link
              key={filter}
              href={`/dashboard/work-orders?filter=${encodeURIComponent(filter)}`}
              className={
                active
                  ? "inline-flex items-center rounded-xl border border-accent/40 bg-accent/15 px-4 py-2 text-sm font-medium text-accent"
                  : "inline-flex items-center rounded-xl border border-white/10 bg-white/[0.03] px-4 py-2 text-sm font-medium text-zinc-300 transition hover:border-white/20 hover:bg-white/[0.05]"
              }
            >
              {tab.title}
            </Link>
          );
        })}
      </div>
      <WorkOrderListCard
        title={labels.title}
        eyebrow="Lista"
        workOrders={data.workOrders}
        emptyTitle={labels.emptyTitle}
      />
    </DashboardShell>
  );
}
