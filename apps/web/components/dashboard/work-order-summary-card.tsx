import { ArrowUpRight, UserRound } from "lucide-react";
import Link from "next/link";
import type { DashboardWorkOrderSummary } from "../../lib/dashboard/types";
import { formatCurrency, formatDateTime } from "../../lib/dashboard/formatters";
import { WorkOrderStatusBadge } from "./work-order-status-badge";

export function WorkOrderSummaryCard({ workOrder }: { workOrder: DashboardWorkOrderSummary }) {
  return (
    <Link
      href={`/dashboard/work-orders/${workOrder.id}`}
      className="group relative block overflow-hidden rounded-xl border border-white/[0.06] bg-white/[0.015] p-3.5 transition-all duration-300 ease-out-quint hover:-translate-y-[1px] hover:border-accent/25 hover:bg-white/[0.03] hover:shadow-[0_8px_24px_-12px_rgba(214,179,106,0.20)] focus-visible:border-accent/35 focus-visible:outline-none"
    >
      <div className="pointer-events-none absolute -right-8 -top-8 h-24 w-24 rounded-full bg-accent/[0.05] opacity-0 blur-2xl transition-opacity duration-500 group-hover:opacity-100" aria-hidden />

      {/* Targa + badge + arrow */}
      <div className="relative flex items-start justify-between gap-3">
        <div className="flex min-w-0 flex-wrap items-center gap-2">
          <p className="text-[1.1rem] font-bold tracking-tight text-zinc-50">{workOrder.plate}</p>
          <WorkOrderStatusBadge status={workOrder.status} />
        </div>
        <ArrowUpRight className="mt-0.5 h-4 w-4 shrink-0 text-zinc-700 transition-all duration-300 group-hover:-translate-y-0.5 group-hover:translate-x-0.5 group-hover:text-accent" />
      </div>

      {/* Public code */}
      <p className="relative mt-0.5 text-[9.5px] font-mono tracking-wide text-zinc-600">{workOrder.publicCode}</p>

      {/* Reported issue — single line */}
      <p className="relative mt-2 line-clamp-1 text-[13px] leading-5 text-zinc-400">{workOrder.reportedIssue}</p>

      {/* Meta: customer left · amount right · date far right */}
      <div className="relative mt-2.5 flex items-center justify-between gap-3 text-[11.5px]">
        <div className="flex min-w-0 items-center gap-1.5 text-zinc-600">
          <UserRound className="h-3 w-3 shrink-0" />
          <span className="truncate">{workOrder.customerName ?? "—"}</span>
        </div>
        <div className="flex shrink-0 items-center gap-3">
          <span className="font-mono text-zinc-300 tabular-nums">{formatCurrency(workOrder.totals.grandTotal)}</span>
          <span className="tabular-nums text-zinc-700">{formatDateTime(workOrder.updatedAt)}</span>
        </div>
      </div>
    </Link>
  );
}
