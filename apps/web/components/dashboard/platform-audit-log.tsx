import type { PlatformAuditEvent } from "../../lib/admin/platform-audit";

const EVENT_LABELS: Record<string, string> = {
  "workshop.create": "Officina creata",
  "workshop.update": "Officina modificata",
  "workshop.suspend": "Officina sospesa",
  "workshop.close": "Officina chiusa",
  "workshop.reactivate": "Officina riattivata",
  "user.reset_link": "Link reset password generato",
  "demo.reset": "Reset dati demo",
  "demo.populate": "Popolamento demo",
};

const EVENT_COLORS: Record<string, string> = {
  "workshop.create": "text-emerald-400",
  "workshop.reactivate": "text-emerald-400",
  "workshop.suspend": "text-amber-400",
  "workshop.close": "text-red-400",
  "demo.reset": "text-red-400",
};

function workshopName(
  event: PlatformAuditEvent,
  nameById: Map<string, string>,
): string | null {
  if (!event.targetWorkshopId) return null;
  return nameById.get(event.targetWorkshopId) ?? event.targetWorkshopId.slice(0, 8);
}

export function PlatformAuditLog({
  events,
  workshopNameById,
}: {
  events: PlatformAuditEvent[];
  workshopNameById: Map<string, string>;
}) {
  if (events.length === 0) {
    return <p className="text-sm text-zinc-500">Nessuna azione registrata.</p>;
  }

  return (
    <div className="divide-y divide-white/[0.06] rounded-2xl border border-white/10 bg-white/[0.02]">
      {events.map((event) => {
        const target = workshopName(event, workshopNameById);
        return (
          <div key={event.id} className="flex items-start justify-between gap-4 px-4 py-3">
            <div className="min-w-0">
              <p className={`text-[12px] font-medium ${EVENT_COLORS[event.eventType] ?? "text-zinc-300"}`}>
                {EVENT_LABELS[event.eventType] ?? event.eventType}
              </p>
              <p className="text-[10px] text-zinc-500">
                {event.actorEmail}
                {target && <span className="text-zinc-600"> · {target}</span>}
              </p>
            </div>
            <span className="shrink-0 text-[10px] font-mono text-zinc-600">
              {new Date(event.createdAt).toLocaleString("it-IT")}
            </span>
          </div>
        );
      })}
    </div>
  );
}
