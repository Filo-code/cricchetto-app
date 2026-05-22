import "server-only";

import { createHash, randomBytes, scrypt as _scrypt, timingSafeEqual } from "node:crypto";
import { supabaseServer } from "../supabase-server";

function scryptAsync(password: string, salt: string, keylen: number, options: { N: number; r: number; p: number }): Promise<Buffer> {
  return new Promise((resolve, reject) =>
    _scrypt(password, salt, keylen, options, (err, key) => {
      if (err) reject(err);
      else resolve(key);
    }),
  );
}

const SCRYPT_N = 65536;
const SCRYPT_R = 8;
const SCRYPT_P = 1;
const KEY_LEN = 64;
const TOKEN_TTL_SECONDS = 24 * 60 * 60; // 24 h

export interface WorkshopUser {
  id: string;
  workshopId: string;
  email: string;
  displayName: string | null;
  passwordHash: string | null;
  role: "owner" | "staff";
  isActive: boolean;
  sessionVersion: number;
}

// ---------------------------------------------------------------------------
// Password hashing
// ---------------------------------------------------------------------------

export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(32).toString("hex");
  const derived = (await scryptAsync(password, salt, KEY_LEN, { N: SCRYPT_N, r: SCRYPT_R, p: SCRYPT_P })) as Buffer;
  return `scrypt:${SCRYPT_N}:${SCRYPT_R}:${SCRYPT_P}:${salt}:${derived.toString("hex")}`;
}

export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const parts = stored.split(":");
  if (parts.length !== 6 || parts[0] !== "scrypt") return false;
  const [, N, r, p, salt, hashHex] = parts;
  try {
    const derived = (await scryptAsync(password, salt, KEY_LEN, {
      N: Number(N),
      r: Number(r),
      p: Number(p),
    })) as Buffer;
    const stored_buf = Buffer.from(hashHex, "hex");
    if (derived.length !== stored_buf.length) return false;
    return timingSafeEqual(derived, stored_buf);
  } catch {
    return false;
  }
}

// ---------------------------------------------------------------------------
// User lookup
// ---------------------------------------------------------------------------

export async function findWorkshopUserByEmail(email: string): Promise<WorkshopUser | null> {
  const { data, error } = await supabaseServer
    .from("workshop_users")
    .select("id,workshop_id,email,display_name,password_hash,role,is_active,session_version")
    .eq("is_active", true)
    .eq("email", email.trim().toLowerCase())
    .maybeSingle();

  if (error) throw new Error(`Failed to look up user: ${error.message}`);
  if (!data) return null;

  return {
    id: data.id,
    workshopId: data.workshop_id,
    email: data.email,
    displayName: data.display_name ?? null,
    passwordHash: data.password_hash ?? null,
    role: data.role as "owner" | "staff",
    isActive: data.is_active,
    sessionVersion: (data as any).session_version ?? 0,
  };
}

export async function findWorkshopUserById(id: string): Promise<WorkshopUser | null> {
  const { data, error } = await supabaseServer
    .from("workshop_users")
    .select("id,workshop_id,email,display_name,password_hash,role,is_active,session_version")
    .eq("id", id)
    .maybeSingle();

  if (error) throw new Error(`Failed to look up user: ${error.message}`);
  if (!data) return null;

  return {
    id: data.id,
    workshopId: data.workshop_id,
    email: data.email,
    displayName: data.display_name ?? null,
    passwordHash: data.password_hash ?? null,
    role: data.role as "owner" | "staff",
    isActive: data.is_active,
    sessionVersion: (data as any).session_version ?? 0,
  };
}

// ---------------------------------------------------------------------------
// User creation (admin-only, no self-signup)
// ---------------------------------------------------------------------------

export async function createWorkshopUser(input: {
  workshopId: string;
  email: string;
  displayName?: string;
  role: "owner" | "staff";
}): Promise<WorkshopUser> {
  const { data, error } = await supabaseServer
    .from("workshop_users")
    .insert({
      workshop_id: input.workshopId,
      email: input.email.trim().toLowerCase(),
      display_name: input.displayName ?? null,
      role: input.role,
    })
    .select("id,workshop_id,email,display_name,password_hash,role,is_active")
    .single();

  if (error) {
    if (error.code === "23505") throw new Error("Email già registrata.");
    throw new Error(`Failed to create user: ${error.message}`);
  }

  return {
    id: data.id,
    workshopId: data.workshop_id,
    email: data.email,
    displayName: data.display_name ?? null,
    passwordHash: data.password_hash ?? null,
    role: data.role as "owner" | "staff",
    isActive: data.is_active,
  };
}

// ---------------------------------------------------------------------------
// Password set (used during setup and reset flow)
// ---------------------------------------------------------------------------

export async function setUserPassword(userId: string, password: string): Promise<void> {
  const hash = await hashPassword(password);
  const { error } = await supabaseServer
    .from("workshop_users")
    .update({ password_hash: hash })
    .eq("id", userId);

  if (error) throw new Error(`Failed to set password: ${error.message}`);
}

// ---------------------------------------------------------------------------
// Password reset tokens
// ---------------------------------------------------------------------------

function hashToken(raw: string): string {
  return createHash("sha256").update(raw).digest("hex");
}

export async function generatePasswordResetToken(userId: string): Promise<{ token: string; expiresAt: Date }> {
  const raw = randomBytes(32).toString("hex");
  const tokenHash = hashToken(raw);
  const expiresAt = new Date(Date.now() + TOKEN_TTL_SECONDS * 1000);

  const { error } = await supabaseServer
    .from("password_reset_tokens")
    .insert({ user_id: userId, token_hash: tokenHash, expires_at: expiresAt.toISOString() });

  if (error) throw new Error(`Failed to generate token: ${error.message}`);
  return { token: raw, expiresAt };
}

export async function consumePasswordResetToken(rawToken: string): Promise<WorkshopUser | null> {
  const tokenHash = hashToken(rawToken);

  // Single atomic UPDATE: only succeeds if token exists, unused, and not expired.
  // Eliminates TOCTOU race where two concurrent requests both pass a SELECT check.
  const { data, error } = await supabaseServer
    .from("password_reset_tokens")
    .update({ used_at: new Date().toISOString() })
    .eq("token_hash", tokenHash)
    .is("used_at", null)
    .gt("expires_at", new Date().toISOString())
    .select("user_id")
    .maybeSingle();

  if (error || !data) return null;

  return findWorkshopUserById(data.user_id);
}
