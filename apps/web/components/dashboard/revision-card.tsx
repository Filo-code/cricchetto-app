import { ExternalLink } from "lucide-react";
import Link from "next/link";
import type { DashboardRevision } from "../../lib/dashboard/types";
import { formatDate } from "../../lib/dashboard/formatters";
import { Card, CardHeader } from "../ui/card";
import { EmptyState } from "./empty-state";

export function RevisionCard({ revisions }: { revisions: DashboardRevision[] }) {
  const today = new Date().toISOString().slice(0, 10);
  return (
    <Card>
      <CardHeader title="Revisioni in scadenza" eyebrow="Prossimi 30 giorni" />
      <div>
        {revisions.length > 0 ? (
          revisions.map((revision) => {
            const overdue = revision.revisionDueDate < today;
            return (
              <Link
                key={revision.vehicleId}
                href={`/dashboard/vehicles/${revision.plate}`}
                className="group flex items-center gap-3 border-b border-white/[0.04] py-2.5 last:border-0 transition-colors hover:bg-white/[0.02] -mx-1 px-1 rounded-lg"
              >
                {/* Dot indicator: red if overdue, amber if upcoming */}
                <span
                  className={`h-[5px] w-[5px] shrink-0 rounded-full ${overdue ? "bg-red-400" : "bg-amber-400"}`}
                  aria-hidden
                />
                {/* Plate — mono, prominent */}
                <span className="flex-1 min-w-0 font-mono text-[10.5px] font-semibold tracking-[0.06em] text-zinc-300 truncate">
                  {revision.plate}
                  {revision.customerName ? (
                    <span className="ml-2 font-sans font-normal text-zinc-600">{revision.customerName}</span>
                  ) : null}
                </span>
                {/* Date */}
                <span className={`shrink-0 text-[10px] tabular-nums ${overdue ? "text-red-400/80" : "text-zinc-600"}`}>
                  scad. {formatDate(revision.revisionDueDate)}
                </span>
                <ExternalLink className="h-3 w-3 shrink-0 text-zinc-700 opacity-0 transition-opacity group-hover:opacity-100 group-hover:text-accent" />
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
