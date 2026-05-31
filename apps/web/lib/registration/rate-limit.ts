import "server-only";

import { createHash } from "node:crypto";
import { supabaseServer } from "../supabase-server";

const MAX_ATTEMPTS = 5;
const WINDOW_MS = 24 * 60 * 60 * 1000;

function hashIp(rawIp: string): string {
  return createHash("sha256").update(rawIp.trim()).digest("hex");
}

/**
 * Records a registration attempt and enforces the rate limit.
 *
 * Order of operations (race-condition-safe):
 *   1. INSERT the attempt row first (always recorded, including blocked ones)
 *   2. COUNT attempts in window (including the one just inserted)
 *   3. If count > MAX or count query fails → throw (fail closed)
 *
 * Inserting before counting means concurrent requests both record and
 * both count each other's rows — no bypass via parallel racing.
 */
export async function checkRegistrationRateLimit(rawIp: string): Promise<void> {
  const ipHash = hashIp(rawIp);
  const windowStart = new Date(Date.now() - WINDOW_MS).toISOString();

  // Step 1: record attempt unconditionally (blocked attempts are also recorded).
  const { error: insertError } = await (supabaseServer as any)
    .from("registration_attempts")
    .insert({ ip_hash: ipHash });

  if (insertError) {
    console.error("[registration-rate-limit] insert failed:", insertError.message);
    // Fail closed: if we can't record the attempt, deny registration.
    throw new Error("Servizio temporaneamente non disponibile. Riprova tra qualche minuto.");
  }

  // Step 2: count all attempts in the 24h window (includes the row just inserted).
  const { count, error: countError } = await (supabaseServer as any)
    .from("registration_attempts")
    .select("id", { count: "exact", head: true })
    .eq("ip_hash", ipHash)
    .gte("attempted_at", windowStart);

  if (countError) {
    // Fail closed: can't verify limit → deny.
    console.error("[registration-rate-limit] count query failed:", countError.message);
    throw new Error("Servizio temporaneamente non disponibile. Riprova tra qualche minuto.");
  }

  // Step 3: enforce limit. Count includes current attempt, so > MAX blocks the (MAX+1)th.
  if ((count ?? 0) > MAX_ATTEMPTS) {
    throw new Error("Troppi tentativi di registrazione. Riprova tra 24 ore.");
  }
}
