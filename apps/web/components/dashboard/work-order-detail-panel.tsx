import { CarFront, Gauge, Hash, Phone, ReceiptText, UserRound } from "lucide-react";
import type { DashboardWorkOrderDetail } from "../../lib/dashboard/types";
import { formatCurrency, formatDate, formatDateTime } from "../../lib/dashboard/formatters";
import { Badge } from "../ui/badge";
import { Card, CardHeader } from "../ui/card";
import { WorkOrderStatusBadge } from "./work-order-status-badge";

export function WorkOrderDetailPanel({ detail }: { detail: DashboardWorkOrderDetail }) {
  const workOrder = detail.workOrder;
  return (
    <div className="grid gap-5 lg:grid-cols-[1.5fr,0.9fr]">
      <Card>
        <div className="flex flex-col gap-6 lg:flex-row lg:items-start lg:justify-between">
          <div className="min-w-0">
            <div className="mb-3 flex flex-wrap items-center gap-2">
              <Badge tone="amber" dot>
                <span className="font-mono text-[11px] tracking-wide">{workOrder.publicCode}</span>
              </Badge>
              <WorkOrderStatusBadge status={workOrder.status} />
            </div>
            <h2 className="text-[2.5rem] font-semibold leading-[1.05] tracking-tight text-zinc-50">
              {workOrder.plate}
            </h2>
            <p className="mt-3 max-w-3xl text-[15px] leading-7 text-zinc-300">{workOrder.reportedIssue}</p>
          </div>
          <div className="shrink-0 rounded-2xl border border-white/10 bg-gradient-to-br from-white/[0.05] to-white/[0.02] px-5 py-4 shadow-[inset_0_1px_0_rgba(255,255,255,0.04)]">
            <p className="text-xs font-medium uppercase tracking-[0.16em] text-zinc-500">Totale scheda</p>
            <p className="mt-1 text-3xl font-semibold tracking-tight text-zinc-50 tabular-nums">
              {formatCurrency(workOrder.totals.grandTotal)}
            </p>
          </div>
        </div>
        <div className="mt-8 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <Fact icon={UserRound} label="Cliente" value={workOrder.customerName ?? "Non indicato"} />
          <Fact icon={Phone} label="Telefono" value={workOrder.customerPhone ?? "Non indicato"} />
          <Fact icon={CarFront} label="Modello" value={workOrder.vehicleModel ?? "Non indicato"} />
          <Fact
            icon={Gauge}
            label="Chilometri"
            value={workOrder.kilometers ? workOrder.kilometers.toLocaleString("it-IT") : "Non indicati"}
          />
        </div>
      </Card>

      <Card>
        <CardHeader title="Dati operativi" />
        <div className="space-y-3">
          <FactLine icon={Hash} label="Codice pubblico" value={workOrder.publicCode} mono />
          <FactLine icon={ReceiptText} label="Manodopera" value={formatCurrency(workOrder.totals.laborTotal)} />
          <FactLine icon={ReceiptText} label="Ricambi" value={formatCurrency(workOrder.totals.partsTotal)} />
          <FactLine icon={ReceiptText} label="Accettazione" value={formatDateTime(workOrder.intakeCompletedAt)} />
          <FactLine icon={ReceiptText} label="Revisione" value={formatDate(workOrder.revisionDueDate)} />
        </div>
      </Card>
    </div>
  );
}

function Fact({ icon: Icon, label, value }: { icon: typeof UserRound; label: string; value: string }) {
  return (
    <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-4 transition-colors hover:border-white/20">
      <Icon className="mb-3 h-4 w-4 text-accent" />
      <p className="text-[10.5px] font-semibold uppercase tracking-[0.18em] text-zinc-500">{label}</p>
      <p className="mt-1 text-sm font-medium text-zinc-100 truncate">{value}</p>
    </div>
  );
}

function FactLine({
  icon: Icon,
  label,
  value,
  mono = false,
}: {
  icon: typeof Hash;
  label: string;
  value: string;
  mono?: boolean;
}) {
  return (
    <div className="flex items-center justify-between gap-4 border-b border-white/[0.05] pb-3 last:border-b-0 last:pb-0">
      <div className="flex items-center gap-3 text-sm text-zinc-500">
        <Icon className="h-4 w-4 text-zinc-600" />
        {label}
      </div>
      <p className={mono ? "text-right font-mono text-sm font-medium text-zinc-100" : "text-right text-sm font-medium text-zinc-100 tabular-nums"}>
        {value}
      </p>
    </div>
  );
}
