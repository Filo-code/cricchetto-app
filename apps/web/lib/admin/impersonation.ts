import "server-only";

import { cookies } from "next/headers";
import { isPlatformSession } from "./platform-session";
import { writePlatformAuditEvent } from "./platform-audit";
import { signPayload, COOKIE_NAME, type DashboardSessionPayload } from "../dashboard/session-core";

const SESSION_TTL_SECONDS = 12 * 60 * 60;

/**
 * Starts an impersonation session for the given workshop.
 * Preserves the platform owner's identity (sub, email, workshopId) and
 * adds impersonatingWorkshopId so all data queries scope to the target workshop.
 * Logs the action to the platform audit log.
 */
export async function startImpersonation(
  targetWorkshopId: string,
  actorSession: DashboardSessionPayload,
): Promise<void> {
  if (!isPlatformSession(actorSession)) {
    throw new Error("Only platform owners can impersonate workshops");
  }

  const payload: DashboardSessionPayload = {
    ...actorSession,
    impersonatingWorkshopId: targetWorkshopId,
    impersonatedBy: actorSession.email,
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

  await writePlatformAuditEvent({
    eventType: "workshop.impersonate",
    actorEmail: actorSession.email,
    targetWorkshopId,
  });
}
