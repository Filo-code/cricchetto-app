import { requireDashboardSession } from "../../lib/dashboard/session";
import { getEffectiveWorkshopId } from "../../lib/dashboard/session-core";
import { ImpersonationBanner } from "../../components/dashboard/impersonation-banner";
import { TrialBanner } from "../../components/dashboard/trial-banner";
import { supabaseServer } from "../../lib/supabase-server";

async function resolveWorkshopName(workshopId: string): Promise<string> {
  const { data } = await supabaseServer
    .from("workshops")
    .select("name,display_name")
    .eq("id", workshopId)
    .maybeSingle();
  return (data as any)?.display_name ?? (data as any)?.name ?? workshopId;
}

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const session = await requireDashboardSession();

  let impersonationBanner: React.ReactNode = null;
  if (session.impersonatingWorkshopId) {
    const workshopName = await resolveWorkshopName(session.impersonatingWorkshopId);
    impersonationBanner = (
      <ImpersonationBanner
        workshopName={workshopName}
        actorEmail={session.impersonatedBy ?? session.email}
      />
    );
  }

  const workshopId = getEffectiveWorkshopId(session);

  return (
    <>
      {impersonationBanner}
      <TrialBanner workshopId={workshopId} />
      {children}
    </>
  );
}
