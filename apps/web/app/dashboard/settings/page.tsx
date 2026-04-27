import { DashboardHeader } from "../../../components/dashboard/dashboard-header";
import { DashboardShell } from "../../../components/dashboard/dashboard-shell";
import { WorkshopDisplayNameForm } from "../../../components/dashboard/workshop-display-name-form";
import { WorkshopLogoForm } from "../../../components/dashboard/workshop-logo-form";
import { WorkshopFiscalForm } from "../../../components/dashboard/workshop-fiscal-form";
import { WorkshopLegalForm } from "../../../components/dashboard/workshop-legal-form";
import { WorkshopDocumentTemplatesForm } from "../../../components/dashboard/workshop-document-templates-form";
import { WorkshopReadinessChecklist } from "../../../components/dashboard/workshop-readiness-checklist";
import { dashboardGet } from "../../../lib/dashboard/api-client";
import type { WorkshopFullSettings } from "../../../lib/dashboard/read";
import type { WorkshopDocumentTemplate } from "../../../lib/dashboard/document-templates";

export const dynamic = "force-dynamic";

export default async function SettingsPage() {
  const [settings, templates, channelStatus] = await Promise.all([
    dashboardGet<WorkshopFullSettings>("/api/dashboard/settings"),
    dashboardGet<WorkshopDocumentTemplate[]>("/api/dashboard/settings/document-templates"),
    dashboardGet<{ hasWhatsapp: boolean }>("/api/dashboard/settings/channels").catch(() => ({ hasWhatsapp: false })),
  ]);

  return (
    <DashboardShell>
      <DashboardHeader
        title="Impostazioni officina"
        subtitle="Personalizza i dati dell'officina visibili in dashboard e nei documenti generati."
      />
      <div className="max-w-2xl space-y-5">
        <WorkshopReadinessChecklist
          settings={settings}
          templates={templates}
          hasWhatsapp={channelStatus.hasWhatsapp}
        />

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

        <WorkshopDocumentTemplatesForm templates={templates} />
      </div>
    </DashboardShell>
  );
}
