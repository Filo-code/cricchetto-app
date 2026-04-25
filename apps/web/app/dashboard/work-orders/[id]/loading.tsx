import { DashboardShell } from "../../../../components/dashboard/dashboard-shell";

export default function WorkOrderLoading() {
  return (
    <DashboardShell>
      <div className="h-32 animate-pulse rounded-2xl bg-white/[0.05]" />
      <div className="mt-5 grid gap-5 lg:grid-cols-2">
        <div className="h-80 animate-pulse rounded-2xl bg-white/[0.05]" />
        <div className="h-80 animate-pulse rounded-2xl bg-white/[0.05]" />
      </div>
      <p className="mt-6 text-sm text-zinc-500">Caricamento scheda...</p>
    </DashboardShell>
  );
}
