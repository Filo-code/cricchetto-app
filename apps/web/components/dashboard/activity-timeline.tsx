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
        <ol className="relative space-y-3 before:absolute before:left-[11px] before:top-1 before:bottom-1 before:w-px before:bg-gradient-to-b before:from-white/10 before:via-white/[0.04] before:to-transparent">
          {activity.map((event) => {
            const Icon = EVENT_ICONS[event.eventType] ?? Activity;
            return (
              <li key={event.id} className="relative grid grid-cols-[auto,1fr] gap-3">
                <div className="relative z-10 mt-0.5 flex h-6 w-6 items-center justify-center rounded-full border border-white/[0.07] bg-[#060809] text-accent shadow-[inset_0_1px_0_rgba(255,255,255,0.04)]">
                  <Icon className="h-3 w-3" />
                </div>
                <div className="min-w-0 pb-0.5">
                  <div className="flex flex-wrap items-start justify-between gap-x-2 gap-y-0.5">
                    <p className="text-[12.5px] font-medium leading-snug text-zinc-200">{activityLabel(event.eventType)}</p>
                    <p className="shrink-0 text-[10px] text-zinc-700 tabular-nums">{formatDateTime(event.createdAt)}</p>
                  </div>
                  {event.plate ? (
                    <Link
                      href={`/dashboard/work-orders/${event.workOrderId}`}
                      className="text-[11px] text-zinc-500 transition-colors hover:text-accent"
                    >
                      {event.plate}
                      <span className="ml-1 font-mono text-[10px] text-zinc-600">{event.publicCode}</span>
                    </Link>
                  ) : (
                    <p className="text-[11px] text-zinc-700">—</p>
                  )}
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
