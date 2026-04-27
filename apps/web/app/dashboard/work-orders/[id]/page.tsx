import { ActivityTimeline } from "../../../../components/dashboard/activity-timeline";
import { AttachmentsPanel } from "../../../../components/dashboard/attachments-panel";
import { DashboardHeader } from "../../../../components/dashboard/dashboard-header";
import { DashboardShell } from "../../../../components/dashboard/dashboard-shell";
import { DocumentsPanel } from "../../../../components/dashboard/documents-panel";
import { ItemsPanel } from "../../../../components/dashboard/items-panel";
import { NotesPanel } from "../../../../components/dashboard/notes-panel";
import { RevisionDetailCard } from "../../../../components/dashboard/revision-detail-card";
import { WorkOrderDetailPanel } from "../../../../components/dashboard/work-order-detail-panel";
import { WorkOrderActions } from "../../../../components/dashboard/work-order-actions";
import { dashboardGet } from "../../../../lib/dashboard/api-client";
import { peekDashboardSession } from "../../../../lib/dashboard/session-core";
import { isPlatformOwnerEmail } from "../../../../lib/admin/platform-auth";
import type { DashboardWorkOrderDetail } from "../../../../lib/dashboard/types";

export const dynamic = "force-dynamic";

export default async function WorkOrderPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const [detail, session] = await Promise.all([
    dashboardGet<DashboardWorkOrderDetail>(`/api/work-orders/${id}`),
    peekDashboardSession(),
  ]);
  const showTelegramTest = session ? isPlatformOwnerEmail(session.email) : false;

  return (
    <DashboardShell>
      <DashboardHeader
        title={`Scheda ${detail.workOrder.plate}`}
        subtitle="Centro operativo della lavorazione: cliente, veicolo, note, ricambi, manodopera, documenti e storico eventi."
      />
      <div className="space-y-5">
        <WorkOrderDetailPanel detail={detail} />
        <div className="grid gap-5 xl:grid-cols-[1.2fr,0.8fr]">
          <div className="space-y-5">
            <ItemsPanel items={detail.items} workOrderId={detail.workOrder.id} status={detail.workOrder.status} />
            <NotesPanel notes={detail.notes} workOrderId={detail.workOrder.id} status={detail.workOrder.status} />
            <AttachmentsPanel attachments={detail.attachments} workOrderId={detail.workOrder.id} status={detail.workOrder.status} />
            <DocumentsPanel documents={detail.documents} workOrderId={detail.workOrder.id} status={detail.workOrder.status} />
          </div>
          <div className="space-y-5">
            <WorkOrderActions workOrderId={detail.workOrder.id} status={detail.workOrder.status} />
            <RevisionDetailCard
              workOrderId={detail.workOrder.id}
              vehicleId={detail.workOrder.vehicleId}
              revisionDueDate={detail.workOrder.revisionDueDate}
              revisionReminderEnabled={detail.workOrder.revisionReminderEnabled}
              revisionAppointmentDate={detail.workOrder.revisionAppointmentDate}
              revisionAppointmentTime={detail.workOrder.revisionAppointmentTime}
              showTelegramTest={showTelegramTest}
            />
            <ActivityTimeline activity={detail.activity} />
          </div>
        </div>
      </div>
    </DashboardShell>
  );
}
