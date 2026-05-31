import "server-only";

import { createHash } from "node:crypto";
import { supabaseServer } from "../supabase-server";

const MAX_ATTEMPTS = 5;
const WINDOW_MS = 24 * 60 * 60 * 1000;

function hashIp(rawIp: string): string {
  return createHash("sha256").update(rawIp.trim()).digest("hex");
}

/**
 * Checks the registration rate limit for the given IP and records the attempt.
 * Always records the attempt (including blocked ones) to prevent bypass.
 * Throws if the limit has been reached.
 */
export async function checkRegistrationRateLimit(rawIp: string): Promise<void> {
  const ipHash = hashIp(rawIp);
  const windowStart = new Date(Date.now() - WINDOW_MS).toISOString();

  const { count, error: countError } = await (supabaseServer as any)
    .from("registration_attempts")
    .select("id", { count: "exact", head: true })
    .eq("ip_hash", ipHash)
    .gte("attempted_at", windowStart);

  if (countError) {
    console.warn("[registration-rate-limit] count query failed:", countError.message);
  }

  // Record the attempt before checking — prevents bypass by racing past the limit check.
  const { error: insertError } = await (supabaseServer as any)
    .from("registration_attempts")
    .insert({ ip_hash: ipHash });

  if (insertError) {
    console.warn("[registration-rate-limit] insert failed:", insertError.message);
  }

  if ((count ?? 0) >= MAX_ATTEMPTS) {
    throw new Error("Troppi tentativi di registrazione. Riprova tra 24 ore.");
  }
}
