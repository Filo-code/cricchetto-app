import type { WorkshopFullSettings } from "../../lib/dashboard/read";
import type { WorkshopDocumentTemplate } from "../../lib/dashboard/document-templates";

type CheckStatus = "Completo" | "Mancante" | "Non configurato";

interface ChecklistItem {
  label: string;
  status: CheckStatus;
  note?: string;
}

function statusColor(s: CheckStatus): string {
  if (s === "Completo") return "text-emerald-400";
  if (s === "Mancante") return "text-amber-400";
  return "text-zinc-500";
}

function statusDot(s: CheckStatus): string {
  if (s === "Completo") return "bg-emerald-400";
  if (s === "Mancante") return "bg-amber-400";
  return "bg-zinc-600";
}

function CheckRow({ item }: { item: ChecklistItem }) {
  return (
    <div className="flex items-start gap-3 py-2 border-b border-white/[0.04] last:border-0">
      <span className={`mt-1.5 h-2 w-2 rounded-full shrink-0 ${statusDot(item.status)}`} />
      <div className="flex-1 min-w-0">
        <p className="text-[12px] text-zinc-300">{item.label}</p>
        {item.note && <p className="text-[10px] text-zinc-600">{item.note}</p>}
      </div>
      <span className={`text-[10px] font-mono shrink-0 ${statusColor(item.status)}`}>{item.status}</span>
    </div>
  );
}

export function WorkshopReadinessChecklist({
  settings,
  templates,
  hasWhatsapp,
}: {
  settings: WorkshopFullSettings;
  templates: WorkshopDocumentTemplate[];
  hasWhatsapp: boolean;
}) {
  const hasLogo = Boolean(settings.logoUrl);
  const hasFiscal = Boolean(settings.ragioneSociale) && Boolean(settings.partitaIva);
  const hasLegal = Boolean(settings.condizioniAccettazione);
  const hasFooter = Boolean(settings.footerDocumenti);
  const hasTemplates = templates.length > 0;

  const items: ChecklistItem[] = [
    {
      label: "Logo officina",
      status: hasLogo ? "Completo" : "Mancante",
    },
    {
      label: "Dati fiscali (ragione sociale + P.IVA)",
      status: hasFiscal ? "Completo" : "Mancante",
    },
    {
      label: "Testo legale accettazione",
      status: hasLegal ? "Completo" : "Mancante",
    },
    {
      label: "Footer documenti",
      status: hasFooter ? "Completo" : "Mancante",
    },
    {
      label: "Template PDF documenti",
      status: hasTemplates ? "Completo" : "Mancante",
    },
    {
      label: "Canale WhatsApp",
      status: hasWhatsapp ? "Completo" : "Non configurato",
      note: hasWhatsapp ? undefined : "Configurabile tramite l'amministratore Filò.",
    },
    {
      label: "Canale Telegram",
      status: "Non configurato" as CheckStatus,
      note: "Solo uso interno/test amministratore — non è un canale clienti.",
    },
  ];

  const completedCount = items.filter((i) => i.status === "Completo").length;

  return (
    <div className="rounded-2xl border border-white/10 bg-white/[0.02] p-5 space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-[11px] font-mono uppercase tracking-[0.15em] text-zinc-500">Configurazione officina</h3>
        <span className="text-[10px] font-mono text-zinc-500">{completedCount}/{items.length}</span>
      </div>
      <div>
        {items.map((item) => (
          <CheckRow key={item.label} item={item} />
        ))}
      </div>
      {!hasWhatsapp && (
        <p className="text-[10px] text-zinc-600 border-t border-white/[0.04] pt-3">
          La dashboard funziona anche senza WhatsApp. Le funzioni di messaggistica automatica richiedono un canale configurato.
        </p>
      )}
    </div>
  );
}
