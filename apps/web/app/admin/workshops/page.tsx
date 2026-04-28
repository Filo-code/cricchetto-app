import { DashboardHeader } from "../../../components/dashboard/dashboard-header";
import { DashboardShell } from "../../../components/dashboard/dashboard-shell";
import { CreateWorkshopForm } from "../../../components/dashboard/create-workshop-form";
import { WorkshopListTable } from "../../../components/dashboard/workshop-list-table";
import { listWorkshopsForAdmin } from "../../../lib/admin/workshops";
import { requirePlatformOwnerSession } from "../../../lib/admin/platform-auth";
import { getPlatformWorkshopId } from "../../../lib/admin/platform-workshop";

export const dynamic = "force-dynamic";

export default async function AdminWorkshopsPage() {
  // Defense-in-depth: guard here in addition to layout.
  await requirePlatformOwnerSession();

  const platformWorkshopId = getPlatformWorkshopId();
  let workshops: Awaited<ReturnType<typeof listWorkshopsForAdmin>> = [];
  try {
    workshops = await listWorkshopsForAdmin();
  } catch {
    // Non-fatal: list renders empty with an error note
  }

  return (
    <DashboardShell>
      <DashboardHeader
        title="Gestione officine"
        subtitle="Provisioning e gestione degli account officina clienti Filò."
      />
      <div className="space-y-8 max-w-2xl">
        <section>
          <h2 className="mb-4 text-[11px] font-mono uppercase tracking-[0.15em] text-zinc-500">
            Nuova officina
          </h2>
          <CreateWorkshopForm />
        </section>

        <section>
          <h2 className="mb-4 text-[11px] font-mono uppercase tracking-[0.15em] text-zinc-500">
            Officine registrate ({workshops.length})
          </h2>
          <WorkshopListTable workshops={workshops} platformWorkshopId={platformWorkshopId} />
        </section>
      </div>
    </DashboardShell>
  );
}
