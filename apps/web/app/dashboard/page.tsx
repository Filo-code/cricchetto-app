import { CalendarClock, CheckCircle2, ClipboardList, Wrench } from "lucide-react";
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
        subtitle="Vista operativa targa-prima per schede attive, consegne pronte, revisioni e attività recenti."
      />

      <div className="grid gap-5 lg:grid-cols-[1.1fr,0.9fr]">
        <div className="space-y-4">
          <div className="flex justify-end">
            <NewWorkOrderDialog />
          </div>
          <PlateSearch />
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <KpiCard label="Schede attive" value={overview.counts.active} icon={ClipboardList} tone="accent" hint="Aperte in officina" href="/dashboard/work-orders?filter=active" />
          <KpiCard label="Pronte al ritiro" value={overview.counts.ready} icon={CheckCircle2} tone="success" hint="In attesa del cliente" href="/dashboard/work-orders?filter=ready" />
        </div>
      </div>

      <div className="mt-5 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <KpiCard label="Accettate" value={overview.counts.accepted} icon={ClipboardList} tone="info" href="/dashboard/work-orders?filter=accepted" />
        <KpiCard label="In lavorazione" value={overview.counts.inProgress} icon={Wrench} tone="accent" href="/dashboard/work-orders?filter=in_progress" />
        <KpiCard label="Pronte" value={overview.counts.ready} icon={CheckCircle2} tone="success" href="/dashboard/work-orders?filter=ready" />
        <KpiCard label="Revisioni scadute" value={overview.counts.overdueRevisions} icon={CalendarClock} tone="warning" href="/dashboard/revisions" />
      </div>

      <div className="mt-8 grid gap-5 xl:grid-cols-[1.2fr,0.8fr]">
        <div className="space-y-5">
          <WorkOrderListCard
            title="Schede attive"
            eyebrow="Tutte"
            workOrders={overview.activeWorkOrders}
            emptyTitle="Nessuna scheda attiva"
          />
          <WorkOrderListCard
            title="In lavorazione"
            eyebrow="Operative"
            workOrders={overview.inProgressWorkOrders}
            emptyTitle="Nessuna scheda in lavorazione"
          />
          <WorkOrderListCard
            title="Pronte per il ritiro"
            eyebrow="Consegna"
            workOrders={overview.readyWorkOrders}
            emptyTitle="Nessuna scheda pronta"
          />
        </div>
        <div className="space-y-5">
          <RevisionCard revisions={overview.upcomingRevisions} />
          <ActivityTimeline activity={overview.recentActivity} />
        </div>
      </div>
    </DashboardShell>
  );
}
