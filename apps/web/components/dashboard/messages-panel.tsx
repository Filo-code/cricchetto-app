import type { DashboardMessageLog } from "../../lib/dashboard/read";

const STATUS_LABELS: Record<string, string> = {
  queued: "In coda",
  sending: "Invio in corso",
  accepted: "Accettato",
  delivered: "Consegnato",
  failed: "Errore",
  skipped: "Saltato",
};

const STATUS_COLORS: Record<string, string> = {
  queued: "text-zinc-400",
  sending: "text-amber-400",
  accepted: "text-emerald-400",
  delivered: "text-emerald-400",
  failed: "text-red-400",
  skipped: "text-zinc-500",
};

export function MessagesPanel({ logs }: { logs: DashboardMessageLog[] }) {
  if (logs.length === 0) {
    return (
      <div className="rounded-2xl border border-white/10 bg-white/[0.02] p-5">
        <h3 className="text-[11px] font-mono uppercase tracking-[0.15em] text-zinc-500">Messaggi e documenti inviati</h3>
        <p className="mt-3 text-[11px] text-zinc-600">Nessun messaggio inviato per questa scheda.</p>
      </div>
    );
  }

  return (
    <div className="rounded-2xl border border-white/10 bg-white/[0.02] p-5 space-y-4">
      <h3 className="text-[11px] font-mono uppercase tracking-[0.15em] text-zinc-500">
        Messaggi e documenti inviati ({logs.length})
      </h3>
      <div className="space-y-2">
        {logs.map((log) => {
          const statusColor = STATUS_COLORS[log.providerStatus ?? ""] ?? "text-zinc-400";
          const statusLabel = STATUS_LABELS[log.providerStatus ?? ""] ?? log.providerStatus ?? "—";
          return (
            <div key={log.id} className="rounded-xl border border-white/[0.06] bg-black/20 px-4 py-3 space-y-1">
              <div className="flex items-center justify-between gap-2">
                <span className="text-[11px] font-mono text-zinc-400 uppercase">{log.channel}</span>
                <span className={`text-[11px] font-mono ${statusColor}`}>{statusLabel}</span>
              </div>
              {log.recipientIdentifier && (
                <p className="text-[10px] text-zinc-600">
                  Destinatario: <span className="text-zinc-400">{log.recipientIdentifier}</span>
                </p>
              )}
              {log.errorMessage && (
                <p className="text-[10px] text-red-400">Errore: {log.errorMessage}</p>
              )}
              {log.relatedDocumentId && (
                <p className="text-[10px] text-zinc-600">Documento allegato</p>
              )}
              {log.relatedReminderId && (
                <p className="text-[10px] text-zinc-600">Promemoria</p>
              )}
              <p className="text-[10px] text-zinc-700">
                {new Date(log.createdAt).toLocaleString("it-IT")}
              </p>
            </div>
          );
        })}
      </div>
      <p className="text-[10px] text-zinc-700">
        Il reinvio manuale non è disponibile in questa versione. I messaggi sono gestiti automaticamente via n8n.
      </p>
    </div>
  );
}
