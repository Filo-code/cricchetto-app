import "server-only";

import { createHmac, timingSafeEqual } from "node:crypto";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { timingSafeEqualString } from "../crypto";
import { readDashboardWorkshop } from "./read";
import { findWorkshopUserByEmail, verifyPassword } from "./users";

const COOKIE_NAME = "cricchetto_dashboard_session";
const SESSION_TTL_SECONDS = 12 * 60 * 60;

export interface DashboardSessionPayload {
  sub: string;            // UUID for DB users, "env" for legacy env-var user
  email: string;
  role: "owner" | "staff";
  workshopId: string;
  expiresAt: number;
}

export async function requireDashboardSession(): Promise<DashboardSessionPayload> {
  const cookieStore = await cookies();
  const session = verifyDashboardSession(cookieStore.get(COOKIE_NAME)?.value);
  if (!session) {
    redirect("/login");
  }

  const workshop = await readDashboardWorkshop();
  if (session.workshopId !== workshop.id) {
    redirect("/login");
  }

  return session;
}

export async function authenticateDashboardUser(input: { email: string; password: string }): Promise<void> {
  const workshop = await readDashboardWorkshop();
  let payload: DashboardSessionPayload | null = null;

  // 1. Try DB user
  const dbUser = await findWorkshopUserByEmail(input.email).catch(() => null);
  if (dbUser) {
    if (dbUser.workshopId !== workshop.id) {
      throw new Error("Credenziali non valide.");
    }
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
      workshopId: workshop.id,
      expiresAt: Math.floor(Date.now() / 1000) + SESSION_TTL_SECONDS,
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
      payload = {
        sub: "env",
        email: expectedUsername,
        role: "owner",
        workshopId: workshop.id,
        expiresAt: Math.floor(Date.now() / 1000) + SESSION_TTL_SECONDS,
      };
    }
  }

  if (!payload) {
    throw new Error("Credenziali non valide.");
  }

  const cookieStore = await cookies();
  cookieStore.set(COOKIE_NAME, signPayload(payload), {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: SESSION_TTL_SECONDS,
  });
}

export async function clearDashboardSession(): Promise<void> {
  const cookieStore = await cookies();
  cookieStore.set(COOKIE_NAME, "", {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 0,
  });
}

function verifyDashboardSession(value: string | undefined): DashboardSessionPayload | null {
  if (!value) return null;

  const [encodedPayload, signature] = value.split(".");
  if (!encodedPayload || !signature) return null;

  const expectedSignature = hmac(encodedPayload);
  if (!safeEqual(signature, expectedSignature)) return null;

  let parsed: Partial<DashboardSessionPayload>;
  try {
    parsed = JSON.parse(Buffer.from(encodedPayload, "base64url").toString("utf8")) as Partial<DashboardSessionPayload>;
  } catch {
    return null;
  }

  if (
    typeof parsed.sub !== "string"
    || typeof parsed.email !== "string"
    || (parsed.role !== "owner" && parsed.role !== "staff")
    || typeof parsed.workshopId !== "string"
    || typeof parsed.expiresAt !== "number"
    || parsed.expiresAt <= Math.floor(Date.now() / 1000)
  ) {
    return null;
  }

  return parsed as DashboardSessionPayload;
}

function signPayload(payload: DashboardSessionPayload): string {
  const encodedPayload = Buffer.from(JSON.stringify(payload), "utf8").toString("base64url");
  return `${encodedPayload}.${hmac(encodedPayload)}`;
}

function hmac(value: string): string {
  const secret = process.env.Criccheto_DASHBOARD_SESSION_SECRET
    ?? process.env.Criccheto_DASHBOARD_API_SECRET
    ?? process.env.Criccheto_INTERNAL_API_SECRET;
  if (!secret) {
    throw new Error("Criccheto_DASHBOARD_SESSION_SECRET or Criccheto_INTERNAL_API_SECRET is required");
  }
  return createHmac("sha256", secret).update(value).digest("base64url");
}

function safeEqual(left: string, right: string): boolean {
  const leftBuffer = Buffer.from(left);
  const rightBuffer = Buffer.from(right);
  if (leftBuffer.length !== rightBuffer.length) return false;
  return timingSafeEqual(leftBuffer, rightBuffer);
}
