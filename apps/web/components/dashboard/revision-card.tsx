import { CalendarClock, ExternalLink } from "lucide-react";
import Link from "next/link";
import type { DashboardRevision } from "../../lib/dashboard/types";
import { formatDate, statusLabel } from "../../lib/dashboard/formatters";
import { Badge } from "../ui/badge";
import { Card, CardHeader } from "../ui/card";
import { EmptyState } from "./empty-state";

export function RevisionCard({ revisions }: { revisions: DashboardRevision[] }) {
  const today = new Date().toISOString().slice(0, 10);
  return (
    <Card>
      <CardHeader title="Revisioni in scadenza" eyebrow="Prossimi 30 giorni" />
      <div className="space-y-2.5">
        {revisions.length > 0 ? (
          revisions.map((revision) => {
            const overdue = revision.revisionDueDate < today;
            const appointment = revision.revisionAppointmentDate
              ? `Appuntamento ${formatDate(revision.revisionAppointmentDate)}${revision.revisionAppointmentTime ? ` ${revision.revisionAppointmentTime.slice(0, 5)}` : ""}`
              : null;

            return (
              <Link
                key={revision.vehicleId}
                href={`/dashboard/vehicles/${revision.plate}`}
                className="group flex items-center justify-between gap-4 rounded-2xl border border-white/[0.07] bg-white/[0.02] p-4 transition-all duration-200 ease-out-quint hover:-translate-y-[1px] hover:border-accent/20 hover:bg-white/[0.035]"
              >
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="font-semibold tracking-tight text-zinc-50">{revision.plate}</p>
                    {overdue ? (
                      <Badge tone="red" dot>Scaduta</Badge>
                    ) : (
                      <Badge tone="amber" dot>In scadenza</Badge>
                    )}
                    {revision.activeWorkOrderStatus ? (
                      <Badge tone="neutral">{statusLabel(revision.activeWorkOrderStatus)}</Badge>
                    ) : null}
                    <Badge tone={revision.revisionReminderEnabled === false ? "neutral" : "blue"}>
                      {revision.revisionReminderEnabled === false ? "Promemoria off" : "Promemoria on"}
                    </Badge>
                  </div>
                  <p className="mt-1 truncate text-sm text-zinc-500">
                    {[revision.model ?? "Modello non indicato", revision.customerName ?? "Cliente non indicato", appointment]
                      .filter(Boolean)
                      .join(" · ")}
                  </p>
                </div>
                <div className="flex shrink-0 items-center gap-3 text-sm text-zinc-300">
                  <CalendarClock className={overdue ? "h-4 w-4 text-red-300" : "h-4 w-4 text-accent"} />
                  <span className="tabular-nums">{formatDate(revision.revisionDueDate)}</span>
                  <ExternalLink className="h-4 w-4 text-zinc-600 transition-colors group-hover:text-accent" />
                </div>
              </Link>
            );
          })
        ) : (
          <EmptyState title="Nessuna revisione imminente">Non risultano revisioni scadute o nei prossimi 30 giorni.</EmptyState>
        )}
      </div>
    </Card>
  );
}
