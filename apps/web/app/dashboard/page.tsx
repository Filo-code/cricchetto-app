import { CalendarClock, CheckCircle2, ClipboardList } from "lucide-react";
import { ActivityTimeline } from "../../components/dashboard/activity-timeline";
import { DashboardHeader } from "../../components/dashboard/dashboard-header";
import { DashboardShell } from "../../components/dashboard/dashboard-shell";
import { KpiCard } from "../../components/dashboard/kpi-card";
import { NewWorkOrderDialog } from "../../components/dashboard/new-work-order-dialog";
import { PlateSearch } from "../../components/dashboard/plate-search";
import { RevisionCard } from "../../components/dashboard/revision-card";
import { WorkOrderListCard } from "../../components/dashboard/work-order-list-card";
import { dashboardGet } from "../../lib/dashboard/api-client";
import type { DashboardOverview } from "../../lib/dashboard/types";

export const dynamic = "force-dynamic";

export default async function DashboardPage() {
  const overview = await dashboardGet<DashboardOverview>("/api/dashboard/overview");

  return (
    <DashboardShell>
      <DashboardHeader
        title={overview.workshop.name}
        subtitle="Vista operativa targa-prima · aggiornata adesso"
        logoUrl={overview.workshop.logoUrl}
      />

      {/* Plate search — strumento centrale del meccanico */}
      <div className="mb-6">
        <PlateSearch />
      </div>

      {/* KPI strip — 4 metriche reali, nessun duplicato */}
      <div className="mb-8 grid grid-cols-2 gap-4 lg:grid-cols-4">
        <KpiCard
          label="Schede attive"
          value={overview.counts.active}
          icon={ClipboardList}
          tone="accent"
          hint="Aperte in officina"
          href="/dashboard/work-orders?filter=active"
        />
        <KpiCard
          label="Pronte al ritiro"
          value={overview.counts.ready}
          icon={CheckCircle2}
          tone="success"
          hint="In attesa del cliente"
          href="/dashboard/work-orders?filter=ready"
        />
        <KpiCard
          label="Accettate"
          value={overview.counts.accepted}
          icon={ClipboardList}
          tone="info"
          href="/dashboard/work-orders?filter=accepted"
        />
        <KpiCard
          label="Revisioni scadute"
          value={overview.counts.overdueRevisions}
          icon={CalendarClock}
          tone="warning"
          href="/dashboard/revisions"
        />
      </div>

      {/* Cockpit layout: schede attive | sidebar */}
      <div className="grid gap-5 xl:grid-cols-[1.3fr,0.7fr]">
        <WorkOrderListCard
          title="Schede attive"
          eyebrow="Tutte"
          workOrders={overview.activeWorkOrders}
          emptyTitle="Nessuna scheda attiva"
          action={<NewWorkOrderDialog />}
        />

        <div className="space-y-5">
          <RevisionCard revisions={overview.upcomingRevisions} />
          <ActivityTimeline activity={overview.recentActivity} />
        </div>
      </div>
    </DashboardShell>
  );
}
