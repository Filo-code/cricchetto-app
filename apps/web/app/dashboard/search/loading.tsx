import { DashboardShell } from "../../../components/dashboard/dashboard-shell";

export default function DashboardSearchLoading() {
  return (
    <DashboardShell>
      <div className="h-28 animate-pulse rounded-2xl bg-white/[0.05]" />
      <div className="mt-5 h-80 animate-pulse rounded-2xl bg-white/[0.05]" />
      <p className="mt-6 text-sm text-zinc-500">Ricerca in corso...</p>
    </DashboardShell>
  );
}
