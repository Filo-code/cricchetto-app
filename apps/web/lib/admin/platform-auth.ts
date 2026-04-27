import "server-only";

import { redirect } from "next/navigation";
import { requireDashboardSession, type DashboardSessionPayload } from "../dashboard/session";
import { getPlatformOwnerEmails, isPlatformOwnerEmail } from "./platform-owner-emails";

export { isPlatformOwnerEmail };

export async function requirePlatformOwnerSession(): Promise<DashboardSessionPayload> {
  const session = await requireDashboardSession();

  const platformOwnerEmails = getPlatformOwnerEmails();

  if (platformOwnerEmails.size === 0) {
    // Env var not configured — fail closed, never open
    console.warn("[platform-auth] Criccheto_PLATFORM_OWNER_EMAILS not set, admin access blocked");
    redirect("/dashboard");
  }

  if (!platformOwnerEmails.has(session.email.toLowerCase())) {
    redirect("/dashboard");
  }

  return session;
}
