import type { ReactNode } from "react";
import { DashboardHeader } from "../../../components/dashboard/dashboard-header";
import { DashboardShell } from "../../../components/dashboard/dashboard-shell";
import { WorkshopDisplayNameForm } from "../../../components/dashboard/workshop-display-name-form";
import { WorkshopLogoForm } from "../../../components/dashboard/workshop-logo-form";
import { WorkshopFiscalForm } from "../../../components/dashboard/workshop-fiscal-form";
import { WorkshopLegalForm } from "../../../components/dashboard/workshop-legal-form";
import { WorkshopDocumentTemplatesForm } from "../../../components/dashboard/workshop-document-templates-form";
import { WorkshopReadinessChecklist } from "../../../components/dashboard/workshop-readiness-checklist";
import { WorkshopLaborRateForm } from "../../../components/dashboard/workshop-labor-rate-form";
import { WorkshopStaffForm } from "../../../components/dashboard/workshop-staff-form";
import { WorkshopImportForm } from "../../../components/dashboard/workshop-import-form";
import { WorkshopExportButtons } from "../../../components/dashboard/workshop-export-buttons";
import { dashboardGet } from "../../../lib/dashboard/api-client";
import type { WorkshopFullSettings } from "../../../lib/dashboard/read";
import type { WorkshopDocumentTemplate } from "../../../lib/dashboard/document-templates";
import type { StaffMember } from "../../../lib/staff";

export const dynamic = "force-dynamic";

function SettingsSection({ heading, description, children }: { heading: string; description?: string; children: ReactNode }) {
  return (
    <div className="space-y-3">
      <div className="border-b border-white/[0.06] pb-3">
        <p className="text-[10px] font-mono font-medium uppercase tracking-[0.2em] text-zinc-500">{heading}</p>
        {description ? <p className="mt-1 text-xs leading-relaxed text-zinc-600">{description}</p> : null}
      </div>
      <div className="space-y-4">{children}</div>
    </div>
  );
}

export default async function SettingsPage() {
  const [settings, templates, channelStatus, staffMembers] = await Promise.all([
    dashboardGet<WorkshopFullSettings>("/api/dashboard/settings"),
    dashboardGet<WorkshopDocumentTemplate[]>("/api/dashboard/settings/document-templates"),
    dashboardGet<{ hasWhatsapp: boolean }>("/api/dashboard/settings/channels").catch(() => ({ hasWhatsapp: false })),
    dashboardGet<StaffMember[]>("/api/dashboard/settings/staff").catch(() => [] as StaffMember[]),
  ]);

  return (
    <DashboardShell>
      <DashboardHeader
        title="Impostazioni officina"
        subtitle="Configura dati, canali, documenti e operatività dell'officina."
      />
      <div className="max-w-2xl space-y-8">

        <SettingsSection heading="Stato configurazione">
          <WorkshopReadinessChecklist
            settings={settings}
            templates={templates}
            hasWhatsapp={channelStatus.hasWhatsapp}
          />
        </SettingsSection>

        <SettingsSection
          heading="Dati officina"
          description="Nome visualizzato, logo e dati fiscali usati nei documenti generati."
        >
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
        </SettingsSection>

        <SettingsSection
          heading="Operatività"
          description="Tariffe e configurazione operativa dell'officina."
        >
          <WorkshopLaborRateForm hourlyRate={settings.hourlyRate} />
        </SettingsSection>

        <SettingsSection
          heading="Canali e staff"
          description="Staff autorizzato ai comandi WhatsApp."
        >
          <WorkshopStaffForm staffMembers={staffMembers} />
        </SettingsSection>

        <SettingsSection
          heading="Documenti e testi legali"
          description="Testi contrattuali e template PDF per accettazione, preventivo e riepilogo."
        >
          <WorkshopLegalForm
            condizioniAccettazione={settings.condizioniAccettazione}
            condizioniPreventivo={settings.condizioniPreventivo}
            footerDocumenti={settings.footerDocumenti}
          />
          <WorkshopDocumentTemplatesForm templates={templates} />
        </SettingsSection>

        <SettingsSection
          heading="Importazione dati"
          description="Importa clienti e veicoli da un vecchio gestionale tramite CSV."
        >
          <WorkshopImportForm />
        </SettingsSection>

        <SettingsSection
          heading="Esportazione dati"
          description="Scarica i dati della tua officina in formato CSV."
        >
          <WorkshopExportButtons />
        </SettingsSection>

      </div>
    </DashboardShell>
  );
}
