import { DashboardShell } from "../../../components/dashboard/dashboard-shell";

export default function VehiclesLoading() {
  return (
    <DashboardShell>
      <div className="h-32 animate-pulse rounded-2xl bg-white/[0.05]" />
      <div className="mt-5 h-16 animate-pulse rounded-2xl bg-white/[0.05]" />
      <div className="mt-5 h-96 animate-pulse rounded-2xl bg-white/[0.05]" />
      <p className="mt-6 text-sm text-zinc-500">Caricamento storico auto...</p>
    </DashboardShell>
  );
}
