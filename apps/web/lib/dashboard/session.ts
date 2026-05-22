import "server-only";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { timingSafeEqualString } from "../crypto";
import { isPlatformSession } from "../admin/platform-session";
import { readDashboardWorkshop } from "./read";
import { findWorkshopUserByEmail, findWorkshopUserById, verifyPassword } from "./users";
import {
  COOKIE_NAME,
  type DashboardSessionPayload,
  verifyDashboardSession,
  signPayload,
  peekDashboardSession,
} from "./session-core";

export type { DashboardSessionPayload };
export { peekDashboardSession };

const SESSION_TTL_SECONDS = 12 * 60 * 60;

export async function requireDashboardSession(): Promise<DashboardSessionPayload> {
  const cookieStore = await cookies();
  const session = verifyDashboardSession(cookieStore.get(COOKIE_NAME)?.value);
  if (!session) {
    redirect("/login");
  }

  // Verify the workshop still exists and check its status
  let workshop: Awaited<ReturnType<typeof readDashboardWorkshop>>;
  try {
    workshop = await readDashboardWorkshop();
  } catch {
    redirect("/login");
  }

  // Gate suspended/closed accounts. Platform owners bypass this check.
  if (
    (workshop.status === "suspended" || workshop.status === "closed")
    && !isPlatformSession(session)
  ) {
    redirect("/login?account=suspended");
  }

  // Validate session_version against DB to invalidate sessions after password change.
  // Skip for legacy env-var sessions (sub="env") which have no workshop_users row.
  if (session.sub !== "env") {
    const dbUser = await findWorkshopUserById(session.sub);
    if (!dbUser || !dbUser.isActive || dbUser.sessionVersion !== session.sessionVersion) {
      redirect("/login");
    }
  }

  return session;
}

export async function authenticateDashboardUser(input: { email: string; password: string }): Promise<void> {
  let payload: DashboardSessionPayload | null = null;

  // 1. Try DB user — resolve workshop from the user's own workshopId
  const dbUser = await findWorkshopUserByEmail(input.email).catch(() => null);
  if (dbUser) {
    if (!dbUser.passwordHash) {
      throw new Error("Password non ancora impostata. Usa il link di configurazione ricevuto via email.");
    }
    const ok = await verifyPassword(input.password, dbUser.passwordHash);
    if (!ok) {
      throw new Error("Credenziali non valide.");
    }
    payload = {
      sub: dbUser.id,
      email: dbUser.email,
      role: dbUser.role,
      workshopId: dbUser.workshopId,
      expiresAt: Math.floor(Date.now() / 1000) + SESSION_TTL_SECONDS,
      sessionVersion: dbUser.sessionVersion,
    };
  }

  // 2. Env-var fallback (legacy single-user mode)
  if (!payload) {
    const expectedUsername = process.env.Criccheto_DASHBOARD_USERNAME;
    const expectedPassword = process.env.Criccheto_DASHBOARD_PASSWORD;
    if (
      expectedUsername
      && expectedPassword
      && timingSafeEqualString(input.email.trim(), expectedUsername)
      && timingSafeEqualString(input.password, expectedPassword)
    ) {
      // No session yet — readDashboardWorkshop falls back to env-var or first workshop
      const workshop = await readDashboardWorkshop();
      payload = {
        sub: "env",
        email: expectedUsername,
        role: "owner",
        workshopId: workshop.id,
        expiresAt: Math.floor(Date.now() / 1000) + SESSION_TTL_SECONDS,
        sessionVersion: 0,
      };
    }
  }

  if (!payload) {
    throw new Error("Credenziali non valide.");
  }

  const cookieStore = await cookies();
  cookieStore.set(COOKIE_NAME, signPayload(payload), {
    httpOnly: true,
    sameSite: "strict",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: SESSION_TTL_SECONDS,
  });
}

export async function clearDashboardSession(): Promise<void> {
  const cookieStore = await cookies();
  cookieStore.set(COOKIE_NAME, "", {
    httpOnly: true,
    sameSite: "strict",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 0,
  });
}
