import { ArrowUpRight, History } from "lucide-react";
import Link from "next/link";
import type { DashboardWorkOrderSummary } from "../../lib/dashboard/types";
import { formatCurrency, formatDateTime } from "../../lib/dashboard/formatters";
import { Card, CardHeader } from "../ui/card";
import { EmptyState } from "./empty-state";
import { WorkOrderStatusBadge } from "./work-order-status-badge";

export function VehicleHistoryPanel({ workOrders }: { workOrders: DashboardWorkOrderSummary[] }) {
  return (
    <Card>
      <CardHeader title="Storico schede" eyebrow={workOrders.length > 0 ? `${workOrders.length}` : undefined} />
      <div className="space-y-3">
        {workOrders.length > 0 ? (
          workOrders.map((workOrder) => (
            <Link
              key={workOrder.id}
              href={`/dashboard/work-orders/${workOrder.id}`}
              className="group flex flex-col gap-3 rounded-2xl border border-white/10 bg-white/[0.03] p-4 transition-all duration-200 ease-out-quint hover:-translate-y-[1px] hover:border-accent/30 hover:bg-white/[0.05] sm:flex-row sm:items-center sm:justify-between"
            >
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <p className="font-mono text-sm font-semibold tracking-wide text-zinc-50">{workOrder.publicCode}</p>
                  <WorkOrderStatusBadge status={workOrder.status} />
                </div>
                <p className="mt-1 line-clamp-1 text-sm text-zinc-500">{workOrder.reportedIssue}</p>
              </div>
              <div className="flex shrink-0 items-center gap-4 text-sm text-zinc-400">
                <span className="tabular-nums text-zinc-300">{formatCurrency(workOrder.totals.grandTotal)}</span>
                <span className="tabular-nums text-zinc-600">{formatDateTime(workOrder.createdAt)}</span>
                <ArrowUpRight className="h-4 w-4 text-zinc-600 transition-all group-hover:-translate-y-0.5 group-hover:translate-x-0.5 group-hover:text-accent" />
              </div>
            </Link>
          ))
        ) : (
          <EmptyState title="Nessuna scheda storica" icon={History}>
            Non risultano lavorazioni salvate per questa targa.
          </EmptyState>
        )}
      </div>
    </Card>
  );
}
