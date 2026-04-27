import { DashboardHeader } from "../../../components/dashboard/dashboard-header";
import { DashboardShell } from "../../../components/dashboard/dashboard-shell";
import { CreateWorkshopForm } from "../../../components/dashboard/create-workshop-form";

export const dynamic = "force-dynamic";

export default function AdminWorkshopsPage() {
  return (
    <DashboardShell>
      <DashboardHeader
        title="Provisioning clienti"
        subtitle="Crea un nuovo account officina per un cliente Filò."
      />
      <div className="max-w-xl">
        <CreateWorkshopForm />
      </div>
    </DashboardShell>
  );
}
