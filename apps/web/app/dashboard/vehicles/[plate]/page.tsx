import { CarFront, ClipboardList, Search, UserRound } from "lucide-react";
import { DashboardHeader } from "../../../../components/dashboard/dashboard-header";
import { DashboardShell } from "../../../../components/dashboard/dashboard-shell";
import { RevisionDetailCard } from "../../../../components/dashboard/revision-detail-card";
import { VehicleHistoryPanel } from "../../../../components/dashboard/vehicle-history-panel";
import { WorkOrderSummaryCard } from "../../../../components/dashboard/work-order-summary-card";
import { EmptyState } from "../../../../components/dashboard/empty-state";
import { KpiCard } from "../../../../components/dashboard/kpi-card";
import { ButtonLink } from "../../../../components/ui/button";
import { Card, CardHeader } from "../../../../components/ui/card";
import { dashboardGet } from "../../../../lib/dashboard/api-client";
import { peekDashboardSession } from "../../../../lib/dashboard/session-core";
import { isPlatformOwnerEmail } from "../../../../lib/admin/platform-owner-emails";
import type { DashboardVehicleDetail } from "../../../../lib/dashboard/types";

export const dynamic = "force-dynamic";

export default async function VehiclePage({ params }: { params: Promise<{ plate: string }> }) {
  const { plate } = await params;
  const normalizedPlate = decodeURIComponent(plate).trim().toUpperCase();
  const [detail, session] = await Promise.all([
    dashboardGet<DashboardVehicleDetail>(
      `/api/dashboard/plate/${encodeURIComponent(normalizedPlate)}`,
      { notFound: "return-null" },
    ),
    peekDashboardSession(),
  ]);
  const showTelegramTest = session ? isPlatformOwnerEmail(session.email) : false;

  if (!detail) {
    return <VehicleNotFound plate={normalizedPlate} />;
  }

  return (
    <DashboardShell>
      <DashboardHeader
        title={`Targa ${detail.vehicle.plate}`}
        subtitle="Storico veicolo, scheda attiva, cliente corrente e scadenza revisione."
      />

      <div className="grid gap-4 sm:grid-cols-3">
        <KpiCard label="Targa" value={detail.vehicle.plate} icon={CarFront} />
        <KpiCard label="Schede salvate" value={detail.workOrders.length} icon={ClipboardList} />
        <KpiCard label="Cliente" value={detail.vehicle.customerName ?? "Non indicato"} icon={UserRound} />
      </div>

      <div className="mt-6 grid gap-5 xl:grid-cols-[1.2fr,0.8fr]">
        <div className="space-y-5">
          <Card>
            <CardHeader title="Scheda attiva" />
            {detail.activeWorkOrder ? (
              <WorkOrderSummaryCard workOrder={detail.activeWorkOrder} />
            ) : (
              <EmptyState title="Nessuna scheda attiva">Per questa targa non risulta una lavorazione aperta.</EmptyState>
            )}
          </Card>
          <VehicleHistoryPanel workOrders={detail.workOrders} />
        </div>
        <div className="space-y-5">
          <Card>
            <CardHeader title="Veicolo e cliente" />
            <div className="space-y-4 text-sm">
              <InfoLine label="Modello" value={detail.vehicle.model ?? "Non indicato"} />
              <InfoLine label="Cliente" value={detail.vehicle.customerName ?? "Non indicato"} />
              <InfoLine label="Telefono" value={detail.vehicle.customerPhone ?? "Non indicato"} />
            </div>
          </Card>
          <RevisionDetailCard
            workOrderId={detail.activeWorkOrder?.id}
            vehicleId={detail.vehicle.id}
            revisionDueDate={detail.vehicle.revisionDueDate}
            revisionReminderEnabled={detail.vehicle.revisionReminderEnabled}
            revisionReminderChannel={detail.vehicle.revisionReminderChannel}
            revisionAppointmentDate={detail.vehicle.revisionAppointmentDate}
            revisionAppointmentTime={detail.vehicle.revisionAppointmentTime}
            showTelegramTest={showTelegramTest}
          />
        </div>
      </div>
    </DashboardShell>
  );
}

function VehicleNotFound({ plate }: { plate: string }) {
  return (
    <DashboardShell>
      <DashboardHeader
        title={`Targa ${plate}`}
        subtitle="La targa cercata non risulta ancora collegata a un veicolo salvato."
      />
      <Card className="mx-auto max-w-3xl">
        <div className="flex flex-col items-center text-center">
          <div className="mb-5 flex h-14 w-14 items-center justify-center rounded-2xl border border-white/10 bg-white/[0.05] text-accent">
            <Search className="h-6 w-6" />
          </div>
          <p className="text-sm font-medium uppercase tracking-[0.18em] text-accent/80">Nessun veicolo</p>
          <h2 className="mt-3 text-3xl font-semibold text-zinc-50">Targa non trovata</h2>
          <p className="mt-3 max-w-xl text-sm leading-6 text-zinc-400">
            Non esistono schede o dati veicolo per questa targa. Avvia una nuova accettazione dai canali messaggio oppure torna al cruscotto.
          </p>
          <ButtonLink href="/dashboard" variant="primary" className="mt-6">
            Torna al cruscotto
          </ButtonLink>
        </div>
      </Card>
    </DashboardShell>
  );
}

function InfoLine({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-4 border-b border-white/[0.06] pb-3 last:border-b-0 last:pb-0">
      <span className="text-zinc-500">{label}</span>
      <span className="text-right font-medium text-zinc-100">{value}</span>
    </div>
  );
}
