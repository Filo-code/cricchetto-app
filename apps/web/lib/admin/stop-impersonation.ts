import "server-only";

import { cookies } from "next/headers";
import { isPlatformSession } from "./platform-session";
import { writePlatformAuditEvent } from "./platform-audit";
import { signPayload, COOKIE_NAME, type DashboardSessionPayload } from "../dashboard/session-core";

const SESSION_TTL_SECONDS = 12 * 60 * 60;

/**
 * Ends an active impersonation session.
 * Restores the platform owner's session without impersonation context.
 * Logs the action to the platform audit log.
 */
export async function stopImpersonation(session: DashboardSessionPayload): Promise<void> {
  if (!isPlatformSession(session)) {
    return;
  }

  const { impersonatingWorkshopId, impersonatedBy, ...rest } = session;

  const payload: DashboardSessionPayload = {
    ...rest,
    expiresAt: Math.floor(Date.now() / 1000) + SESSION_TTL_SECONDS,
  };

  const token = signPayload(payload);
  const cookieStore = await cookies();
  cookieStore.set(COOKIE_NAME, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: SESSION_TTL_SECONDS,
  });

  if (impersonatingWorkshopId) {
    await writePlatformAuditEvent({
      eventType: "workshop.impersonation_end",
      actorEmail: session.email,
      targetWorkshopId: impersonatingWorkshopId,
    });
  }
}
