import { ArrowUpRight, CalendarDays, Euro, UserRound } from "lucide-react";
import Link from "next/link";
import type { DashboardWorkOrderSummary } from "../../lib/dashboard/types";
import { formatCurrency, formatDate, formatDateTime } from "../../lib/dashboard/formatters";
import { WorkOrderStatusBadge } from "./work-order-status-badge";

export function WorkOrderSummaryCard({ workOrder }: { workOrder: DashboardWorkOrderSummary }) {
  return (
    <Link
      href={`/dashboard/work-orders/${workOrder.id}`}
      className="group relative block overflow-hidden rounded-2xl border border-white/10 bg-white/[0.03] p-4 transition-all duration-300 ease-out-quint hover:-translate-y-[1px] hover:border-accent/30 hover:bg-white/[0.05] hover:shadow-[0_12px_32px_-16px_rgba(214,179,106,0.28)] focus-visible:border-accent/40 focus-visible:outline-none"
    >
      <div className="pointer-events-none absolute -right-10 -top-10 h-32 w-32 rounded-full bg-accent/[0.06] opacity-0 blur-2xl transition-opacity duration-500 group-hover:opacity-100" aria-hidden />
      <div className="relative flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <p className="text-xl font-semibold tracking-tight text-zinc-50">{workOrder.plate}</p>
            <WorkOrderStatusBadge status={workOrder.status} />
          </div>
          <p className="mt-1 text-xs font-mono tracking-wide text-zinc-500">{workOrder.publicCode}</p>
        </div>
        <ArrowUpRight className="h-4 w-4 translate-x-0 text-zinc-600 transition-all duration-300 group-hover:-translate-y-0.5 group-hover:translate-x-0.5 group-hover:text-accent" />
      </div>

      <p className="relative mt-4 line-clamp-2 text-sm leading-6 text-zinc-300">{workOrder.reportedIssue}</p>

      <div className="relative mt-5 grid gap-3 text-[13px] text-zinc-500 sm:grid-cols-2">
        <div className="flex items-center gap-2">
          <UserRound className="h-3.5 w-3.5 shrink-0 text-zinc-600" />
          <span className="truncate">{workOrder.customerName ?? "Cliente non indicato"}</span>
        </div>
        <div className="flex items-center gap-2">
          <Euro className="h-3.5 w-3.5 shrink-0 text-zinc-600" />
          <span className="tabular-nums text-zinc-300">{formatCurrency(workOrder.totals.grandTotal)}</span>
        </div>
        <div className="flex items-center gap-2">
          <CalendarDays className="h-3.5 w-3.5 shrink-0 text-zinc-600" />
          <span className="tabular-nums">Revisione {formatDate(workOrder.revisionDueDate)}</span>
        </div>
        <div className="text-zinc-600 tabular-nums">Aggiornata {formatDateTime(workOrder.updatedAt)}</div>
      </div>
    </Link>
  );
}
