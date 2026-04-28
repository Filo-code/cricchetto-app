import "server-only";

import type { DashboardSessionPayload } from "../dashboard/session-core";
import { isPlatformOwnerEmail } from "./platform-owner-emails";

// Platform owner: env-only session + email in allowlist.
// A DB workshop_users row NEVER qualifies, even if email matches.
export function isPlatformSession(session: DashboardSessionPayload): boolean {
  return session.sub === "env" && isPlatformOwnerEmail(session.email);
}
