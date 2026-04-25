import { DashboardHeader } from "../../../components/dashboard/dashboard-header";
import { DashboardShell } from "../../../components/dashboard/dashboard-shell";
import { RevisionCard } from "../../../components/dashboard/revision-card";
import { dashboardGet } from "../../../lib/dashboard/api-client";
import type { DashboardRevision } from "../../../lib/dashboard/types";

export const dynamic = "force-dynamic";

export default async function DashboardRevisionsPage() {
  const revisions = await dashboardGet<DashboardRevision[]>("/api/revisions/upcoming");

  return (
    <DashboardShell>
      <DashboardHeader
        title="Revisioni"
        subtitle="Veicoli con revisione scaduta o in scadenza nei prossimi 30 giorni. Il promemoria automatico parte di default 30 giorni prima della scadenza."
      />
      <RevisionCard revisions={revisions} />
    </DashboardShell>
  );
}
