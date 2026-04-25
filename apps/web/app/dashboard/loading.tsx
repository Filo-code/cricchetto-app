import { DashboardShell } from "../../components/dashboard/dashboard-shell";

export default function DashboardLoading() {
  return (
    <DashboardShell>
      <div className="space-y-8 animate-fade-in">
        <div className="skeleton h-28 w-full rounded-3xl" />
        <div className="grid gap-5 lg:grid-cols-[1.1fr,0.9fr]">
          <div className="space-y-4">
            <div className="flex justify-end">
              <div className="skeleton h-10 w-40 rounded-xl" />
            </div>
            <div className="skeleton h-14 w-full rounded-xl" />
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="skeleton h-32 rounded-2xl" />
            <div className="skeleton h-32 rounded-2xl" />
          </div>
        </div>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <div className="skeleton h-28 rounded-2xl" />
          <div className="skeleton h-28 rounded-2xl" />
          <div className="skeleton h-28 rounded-2xl" />
          <div className="skeleton h-28 rounded-2xl" />
        </div>
        <div className="grid gap-5 xl:grid-cols-[1.2fr,0.8fr]">
          <div className="space-y-5">
            <div className="skeleton h-56 rounded-2xl" />
            <div className="skeleton h-56 rounded-2xl" />
          </div>
          <div className="space-y-5">
            <div className="skeleton h-48 rounded-2xl" />
            <div className="skeleton h-48 rounded-2xl" />
          </div>
        </div>
      </div>
    </DashboardShell>
  );
}
