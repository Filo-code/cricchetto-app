import "server-only";

import { createHmac, timingSafeEqual } from "node:crypto";
import { cookies } from "next/headers";

export const COOKIE_NAME = "cricchetto_dashboard_session";

export interface DashboardSessionPayload {
  sub: string;
  email: string;
  role: "owner" | "staff";
  workshopId: string;
  expiresAt: number;
  sessionVersion: number;
}

export function verifyDashboardSession(value: string | undefined): DashboardSessionPayload | null {
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
    || typeof parsed.sessionVersion !== "number"
  ) {
    return null;
  }

  return parsed as DashboardSessionPayload;
}

export function signPayload(payload: DashboardSessionPayload): string {
  const encodedPayload = Buffer.from(JSON.stringify(payload), "utf8").toString("base64url");
  return `${encodedPayload}.${hmac(encodedPayload)}`;
}

export async function peekDashboardSession(): Promise<DashboardSessionPayload | null> {
  const cookieStore = await cookies();
  return verifyDashboardSession(cookieStore.get(COOKIE_NAME)?.value);
}

function hmac(value: string): string {
  const secret = process.env.Cricchetto_DASHBOARD_SESSION_SECRET;
  if (!secret) {
    if (process.env.NODE_ENV === "production") {
      throw new Error("Cricchetto_DASHBOARD_SESSION_SECRET is required in production");
    }
    // Dev-only fallback — not allowed in production
    const devFallback = process.env.Cricchetto_DASHBOARD_API_SECRET ?? process.env.Cricchetto_INTERNAL_API_SECRET;
    if (!devFallback) {
      throw new Error("Cricchetto_DASHBOARD_SESSION_SECRET (or dev fallback Cricchetto_INTERNAL_API_SECRET) is required");
    }
    return createHmac("sha256", devFallback).update(value).digest("base64url");
  }
  return createHmac("sha256", secret).update(value).digest("base64url");
}

function safeEqual(left: string, right: string): boolean {
  const leftBuffer = Buffer.from(left);
  const rightBuffer = Buffer.from(right);
  if (leftBuffer.length !== rightBuffer.length) return false;
  return timingSafeEqual(leftBuffer, rightBuffer);
}
