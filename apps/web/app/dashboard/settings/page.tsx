import { FileText } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { DashboardHeader } from "../../../components/dashboard/dashboard-header";
import { DashboardShell } from "../../../components/dashboard/dashboard-shell";
import { WorkshopDisplayNameForm } from "../../../components/dashboard/workshop-display-name-form";
import { WorkshopLogoForm } from "../../../components/dashboard/workshop-logo-form";
import { WorkshopFiscalForm } from "../../../components/dashboard/workshop-fiscal-form";
import { WorkshopLegalForm } from "../../../components/dashboard/workshop-legal-form";
import { dashboardGet } from "../../../lib/dashboard/api-client";
import type { WorkshopFullSettings } from "../../../lib/dashboard/read";

export const dynamic = "force-dynamic";

export default async function SettingsPage() {
  const settings = await dashboardGet<WorkshopFullSettings>("/api/dashboard/settings");

  return (
    <DashboardShell>
      <DashboardHeader
        title="Impostazioni officina"
        subtitle="Personalizza i dati dell'officina visibili in dashboard e nei documenti generati."
      />
      <div className="max-w-2xl space-y-5">
        <WorkshopDisplayNameForm workshopName={settings.name} displayName={settings.displayName} />

        <WorkshopLogoForm logoUrl={settings.logoUrl} />

        <WorkshopFiscalForm
          ragioneSociale={settings.ragioneSociale}
          partitaIva={settings.partitaIva}
          codiceFiscale={settings.codiceFiscale}
          indirizzo={settings.indirizzo}
          citta={settings.citta}
          cap={settings.cap}
          provincia={settings.provincia}
          telefono={settings.telefono}
          email={settings.email}
          pec={settings.pec}
          sdi={settings.sdi}
        />

        <WorkshopLegalForm
          condizioniAccettazione={settings.condizioniAccettazione}
          condizioniPreventivo={settings.condizioniPreventivo}
          footerDocumenti={settings.footerDocumenti}
        />

        <section className="pointer-events-none select-none opacity-40">
          <div className="glass-panel rounded-2xl p-5 sm:p-6">
            <div className="mb-4">
              <p className="mb-1.5 text-[10px] font-mono font-medium uppercase tracking-[0.2em] text-zinc-500">Prossimamente</p>
              <h2 className="text-lg font-semibold tracking-tight text-zinc-50">Template documenti</h2>
              <p className="mt-1 text-sm text-zinc-500">Personalizzazione avanzata dell&apos;intestazione e del layout dei PDF.</p>
            </div>
            <FutureItem icon={FileText} label="Template documenti" desc="Intestazione, layout e stile dei PDF generati dall'officina." />
          </div>
        </section>
      </div>
    </DashboardShell>
  );
}

function FutureItem({ icon: Icon, label, desc }: { icon: LucideIcon; label: string; desc: string }) {
  return (
    <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-4">
      <Icon className="mb-3 h-4 w-4 text-accent" />
      <p className="text-sm font-medium text-zinc-200">{label}</p>
      <p className="mt-1 text-xs text-zinc-500">{desc}</p>
    </div>
  );
}
