import "server-only";

import { redirect } from "next/navigation";
import { requireDashboardSession, type DashboardSessionPayload } from "../dashboard/session";

// NOTE: workshop_users.role = 'owner' means owner of a specific client workshop.
// It is NOT equivalent to platform owner (Filò admin).
// Platform ownership is determined by Criccheto_PLATFORM_OWNER_EMAILS, not by role.

function getPlatformOwnerEmails(): Set<string> {
  const raw = process.env.Criccheto_PLATFORM_OWNER_EMAILS ?? "";
  return new Set(
    raw
      .split(",")
      .map((e) => e.trim().toLowerCase())
      .filter(Boolean),
  );
}

// Synchronous check — safe to call from server actions and server components.
export function isPlatformOwnerEmail(email: string): boolean {
  return getPlatformOwnerEmails().has(email.toLowerCase());
}

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
