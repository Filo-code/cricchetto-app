import "server-only";

import { createHmac, timingSafeEqual } from "node:crypto";
import { cookies } from "next/headers";
import type { DashboardSessionPayload } from "./session";
import { COOKIE_NAME } from "./session-core";

export async function verifyDashboardSessionForApi(): Promise<DashboardSessionPayload | null> {
  const cookieStore = await cookies();
  const value = cookieStore.get(COOKIE_NAME)?.value;
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

function hmac(value: string): string {
  const secret = process.env.Cricchetto_DASHBOARD_SESSION_SECRET
    ?? process.env.Cricchetto_DASHBOARD_API_SECRET
    ?? process.env.Cricchetto_INTERNAL_API_SECRET;
  if (!secret) throw new Error("Session secret not configured");
  return createHmac("sha256", secret).update(value).digest("base64url");
}

function safeEqual(left: string, right: string): boolean {
  const l = Buffer.from(left);
  const r = Buffer.from(right);
  if (l.length !== r.length) return false;
  return timingSafeEqual(l, r);
}
