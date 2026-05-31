"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { authenticateDashboardUser, clearDashboardSession, peekDashboardSession } from "../../lib/dashboard/session";
import { isPlatformSession } from "../../lib/admin/platform-session";
import { extractClientIp } from "../../lib/ip";

// In-memory rate limiter: 10 failed attempts per IP per 15 minutes.
// NOTE: resets per serverless instance — use Redis/Upstash for multi-instance deployments.
const loginAttempts = new Map<string, { count: number; resetAt: number }>();
const RATE_LIMIT_MAX = 10;
const RATE_LIMIT_WINDOW_MS = 15 * 60 * 1000;

function getRateLimitKey(headerStore: Awaited<ReturnType<typeof headers>>): string {
  return extractClientIp(headerStore);
}

function checkLoginRateLimit(key: string): void {
  const now = Date.now();
  const record = loginAttempts.get(key);
  if (!record || record.resetAt <= now) {
    loginAttempts.set(key, { count: 1, resetAt: now + RATE_LIMIT_WINDOW_MS });
    return;
  }
  record.count += 1;
  if (record.count > RATE_LIMIT_MAX) {
    throw new Error("Troppi tentativi di accesso. Riprova tra 15 minuti.");
  }
}

function clearLoginRateLimit(key: string): void {
  loginAttempts.delete(key);
}

export interface LoginActionState {
  ok: boolean;
  message: string;
}

export async function loginAction(_state: LoginActionState, formData: FormData): Promise<LoginActionState> {
  const headerStore = await headers();
  const rateLimitKey = getRateLimitKey(headerStore);

  try {
    checkLoginRateLimit(rateLimitKey);
    await authenticateDashboardUser({
      email: textValue(formData, "email"),
      password: textValue(formData, "password"),
    });
    clearLoginRateLimit(rateLimitKey);
  } catch (error) {
    return {
      ok: false,
      message: error instanceof Error ? error.message : "Accesso non riuscito.",
    };
  }

  const session = await peekDashboardSession();
  if (session && isPlatformSession(session)) {
    redirect("/admin/workshops");
  }
  redirect("/dashboard");
}

export async function logoutAction(): Promise<void> {
  await clearDashboardSession();
  redirect("/login");
}

function textValue(formData: FormData, key: string): string {
  const value = formData.get(key);
  return typeof value === "string" ? value : "";
}
