import "server-only";

import { redirect } from "next/navigation";
import { requireDashboardSession, type DashboardSessionPayload } from "../dashboard/session";

// NOTE: workshop_users.role = 'owner' means owner of a specific client workshop.
// It is NOT equivalent to platform owner (Filò admin).
// Platform ownership is determined solely by Cricchetto_PLATFORM_OWNER_EMAILS.

// Module-level: parsed once at startup, reused on every check.
const PLATFORM_OWNER_EMAILS: ReadonlySet<string> = new Set(
  (process.env.Cricchetto_PLATFORM_OWNER_EMAILS ?? "")
    .split(",")
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean),
);

export function getPlatformOwnerEmails(): ReadonlySet<string> {
  return PLATFORM_OWNER_EMAILS;
}

export function isPlatformOwnerEmail(email: string): boolean {
  return PLATFORM_OWNER_EMAILS.has(email.toLowerCase());
}

// Platform owner: env-only session + email in allowlist.
// A DB workshop_users row NEVER qualifies, even if email matches.
export function isPlatformSession(session: DashboardSessionPayload): boolean {
  return session.sub === "env" && isPlatformOwnerEmail(session.email);
}

export async function requirePlatformOwnerSession(): Promise<DashboardSessionPayload> {
  const session = await requireDashboardSession();

  if (PLATFORM_OWNER_EMAILS.size === 0) {
    console.warn("[platform-auth] Cricchetto_PLATFORM_OWNER_EMAILS not set, admin access blocked");
    redirect("/dashboard");
  }

  if (!isPlatformSession(session)) {
    redirect("/dashboard");
  }

  return session;
}

// Returns the protected platform workshop ID (never allow suspend/close).
// Checks multiple env var aliases for backwards compatibility.
export function getPlatformWorkshopId(): string | null {
  return (
    process.env.Cricchetto_PLATFORM_WORKSHOP_ID?.trim() ||
    process.env.Cricchetto_DASHBOARD_WORKSHOP_ID?.trim() ||
    process.env.Cricchetto_WORKSHOP_ID?.trim() ||
    null
  );
}
