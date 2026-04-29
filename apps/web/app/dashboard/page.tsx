import { AlertTriangle, CalendarClock, CarFront, CheckCircle2, ClipboardList, Clock } from "lucide-react";
import { ActivityTimeline } from "../../components/dashboard/activity-timeline";
import { DashboardHeader } from "../../components/dashboard/dashboard-header";
import { DashboardShell } from "../../components/dashboard/dashboard-shell";
import { KpiCard } from "../../components/dashboard/kpi-card";
import { NewWorkOrderDialog } from "../../components/dashboard/new-work-order-dialog";
import { PlateSearch } from "../../components/dashboard/plate-search";
import { RevisionCard } from "../../components/dashboard/revision-card";
import { WorkOrderListCard } from "../../components/dashboard/work-order-list-card";
import { dashboardGet } from "../../lib/dashboard/api-client";
import Link from "next/link";
import type { DashboardOverview } from "../../lib/dashboard/types";
import type { LucideIcon } from "lucide-react";

type TodayTone = "neutral" | "success" | "info" | "warning";

function TodayStat({ icon: Icon, label, value, tone = "neutral", href }: {
  icon: LucideIcon;
  label: string;
  value: number;
  tone?: TodayTone;
  href?: string;
}) {
  const toneClass: Record<TodayTone, string> = {
    neutral: "text-zinc-400",
    success: "text-emerald-400",
    info: "text-sky-400",
    warning: "text-amber-400",
  };
  const content = (
    <div className="flex items-center gap-3">
      <Icon className={`h-4 w-4 shrink-0 ${toneClass[tone]}`} />
      <div>
        <p className={`text-lg font-semibold tabular-nums leading-none ${toneClass[tone]}`}>{value}</p>
        <p className="mt-0.5 text-[11px] text-zinc-600">{label}</p>
      </div>
    </div>
  );
  return href
    ? <Link href={href} className="transition-opacity hover:opacity-80">{content}</Link>
    : content;
}

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

      {/* Oggi — operational snapshot */}
      <div className="mb-6 rounded-2xl border border-white/[0.06] bg-white/[0.02] px-5 py-4">
        <p className="mb-3 text-[10px] font-mono font-medium uppercase tracking-[0.2em] text-zinc-500">Oggi</p>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <TodayStat icon={CarFront} label="Auto entrate" value={overview.todayCounts.enteredToday} />
          <TodayStat icon={CheckCircle2} label="Pronte oggi" value={overview.todayCounts.readyToday} tone="success" />
          <TodayStat icon={Clock} label="Attesa ritiro" value={overview.todayCounts.awaitingPickup} tone="info" href="/dashboard/work-orders?filter=ready" />
          <TodayStat icon={AlertTriangle} label="Ferme >3 gg" value={overview.todayCounts.staleWorkOrders} tone={overview.todayCounts.staleWorkOrders > 0 ? "warning" : "neutral"} />
        </div>
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
        <div className="space-y-4">
          <NewWorkOrderDialog />
          <WorkOrderListCard
            title="Schede attive"
            eyebrow="Tutte"
            workOrders={overview.activeWorkOrders}
            emptyTitle="Nessuna scheda attiva"
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
