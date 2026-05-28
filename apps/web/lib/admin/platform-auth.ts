import "server-only";

import { redirect } from "next/navigation";
import { requireDashboardSession, type DashboardSessionPayload } from "../dashboard/session";
import { getPlatformOwnerEmails } from "./platform-owner-emails";
import { isPlatformSession } from "./platform-session";

export async function requirePlatformOwnerSession(): Promise<DashboardSessionPayload> {
  const session = await requireDashboardSession();

  if (getPlatformOwnerEmails().size === 0) {
    console.warn("[platform-auth] Cricchetto_PLATFORM_OWNER_EMAILS not set, admin access blocked");
    redirect("/dashboard");
  }

  // Must be env session AND email in allowlist. DB users are never platform admins.
  if (!isPlatformSession(session)) {
    redirect("/dashboard");
  }

  return session;
}
