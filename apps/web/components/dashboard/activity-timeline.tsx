import { Activity, ClipboardCheck, FileImage, FileText, RefreshCcw, StickyNote, Wrench } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import Link from "next/link";
import type { DashboardActivity } from "../../lib/dashboard/types";
import { activityLabel, formatDateTime } from "../../lib/dashboard/formatters";
import { Card, CardHeader } from "../ui/card";
import { EmptyState } from "./empty-state";

const EVENT_ICONS: Record<string, LucideIcon> = {
  intake_completed: ClipboardCheck,
  work_order_created: ClipboardCheck,
  note_created: StickyNote,
  item_created: Wrench,
  attachment_added: FileImage,
  status_changed: RefreshCcw,
  revision_updated: RefreshCcw,
  document_requested: FileText,
  document_generated: FileText,
};

export function ActivityTimeline({ activity }: { activity: DashboardActivity[] }) {
  return (
    <Card>
      <CardHeader title="Attività recente" eyebrow="Registro" />
      {activity.length > 0 ? (
        <ol className="relative space-y-4 before:absolute before:left-[15px] before:top-1 before:bottom-1 before:w-px before:bg-gradient-to-b before:from-white/15 before:via-white/5 before:to-transparent">
          {activity.map((event) => {
            const Icon = EVENT_ICONS[event.eventType] ?? Activity;
            return (
              <li key={event.id} className="relative grid grid-cols-[auto,1fr] gap-3 pl-0">
                <div className="relative z-10 mt-0.5 flex h-8 w-8 items-center justify-center rounded-full border border-white/[0.08] bg-[#060809] text-accent shadow-[inset_0_1px_0_rgba(255,255,255,0.04)]">
                  <Icon className="h-3.5 w-3.5" />
                </div>
                <div className="min-w-0 pb-1">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <p className="text-sm font-medium text-zinc-100">{activityLabel(event.eventType)}</p>
                    <p className="text-xs text-zinc-600 tabular-nums">{formatDateTime(event.createdAt)}</p>
                  </div>
                  <p className="mt-1 text-sm text-zinc-500">
                    {event.plate ? (
                      <Link
                        href={`/dashboard/work-orders/${event.workOrderId}`}
                        className="text-zinc-300 transition-colors hover:text-accent"
                      >
                        {event.plate} · <span className="font-mono text-xs">{event.publicCode}</span>
                      </Link>
                    ) : (
                      "Scheda non collegata"
                    )}
                    {event.actorRef ? <span className="text-zinc-600"> · {event.actorRef}</span> : null}
                  </p>
                </div>
              </li>
            );
          })}
        </ol>
      ) : (
        <EmptyState title="Nessuna attività recente">Gli eventi operativi verranno mostrati qui.</EmptyState>
      )}
    </Card>
  );
}
