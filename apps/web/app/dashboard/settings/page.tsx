import { FileText, Image, Lock, Receipt } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { DashboardHeader } from "../../../components/dashboard/dashboard-header";
import { DashboardShell } from "../../../components/dashboard/dashboard-shell";
import { WorkshopDisplayNameForm } from "../../../components/dashboard/workshop-display-name-form";
import { dashboardGet } from "../../../lib/dashboard/api-client";

export const dynamic = "force-dynamic";

interface WorkshopSettings {
  id: string;
  name: string;
  displayName: string | null;
  timezone: string;
}

export default async function SettingsPage() {
  const settings = await dashboardGet<WorkshopSettings>("/api/dashboard/settings");

  return (
    <DashboardShell>
      <DashboardHeader
        title="Impostazioni officina"
        subtitle="Personalizza i dati dell'officina visibili in dashboard e nei documenti generati."
      />
      <div className="max-w-2xl space-y-5">
        <WorkshopDisplayNameForm workshopName={settings.name} displayName={settings.displayName} />

        <section className="pointer-events-none select-none opacity-50">
          <div className="glass-panel rounded-2xl p-5 sm:p-6">
            <div className="mb-5">
              <p className="mb-1.5 text-[10.5px] font-semibold uppercase tracking-[0.22em] text-accent/80">Prossimamente</p>
              <h2 className="text-lg font-semibold tracking-tight text-zinc-50">Funzioni future</h2>
              <p className="mt-1 text-sm text-zinc-500">Queste sezioni saranno disponibili in un aggiornamento futuro.</p>
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <FutureItem icon={Image} label="Logo officina" desc="Carica il logo da mostrare nei documenti generati." />
              <FutureItem icon={Receipt} label="Dati fiscali" desc="Partita IVA, ragione sociale, indirizzo fiscale." />
              <FutureItem icon={FileText} label="Template documenti" desc="Personalizza intestazione e piè di pagina dei PDF." />
              <FutureItem icon={Lock} label="Condizioni accettazione" desc="Testo legale allegato a preventivi e accettazioni." />
            </div>
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
