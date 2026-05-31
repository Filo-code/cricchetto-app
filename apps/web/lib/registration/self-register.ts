import "server-only";

import { supabaseServer } from "../supabase-server";
import { hashPassword, createWorkshopUser, type WorkshopUser } from "../dashboard/users";

export interface SelfRegisterInput {
  workshopName: string;
  ownerName: string;
  email: string;
  password: string;
  phone?: string;
  vatNumber?: string;
}

export interface SelfRegisterResult {
  workshopId: string;
  user: WorkshopUser;
}

const GENERIC_ERROR = "Errore durante la registrazione. Riprova.";
const EMAIL_DUPLICATE_ERROR = "Email già registrata.";

/**
 * Creates a new workshop with owner user via self-service registration.
 *
 * Write order (safe rollback sequence, no orphan users possible):
 *   1. hashPassword()                — before any DB write
 *   2. INSERT workshops              — trial defaults applied by DB (migration 0023)
 *   3. INSERT workshop_settings      — on failure: rollback (DELETE workshop CASCADE)
 *   4. INSERT workshop_profiles      — best-effort, skip on error, no rollback
 *   5. createWorkshopUser()          — with passwordHash, last write; on failure: rollback
 *
 * Error messages: only known user-facing strings propagate. Internal DB messages
 * are swallowed and replaced with GENERIC_ERROR to prevent information leakage.
 */
export async function selfRegisterWorkshop(input: SelfRegisterInput): Promise<SelfRegisterResult> {
  // Hash password before touching DB — never a NULL hash on the registration path.
  const passwordHash = await hashPassword(input.password);

  // Step 1: create workshop.
  const { data: workshopData, error: workshopError } = await supabaseServer
    .from("workshops")
    .insert({ name: input.workshopName.trim(), timezone: "Europe/Rome" })
    .select("id")
    .single();

  if (workshopError || !workshopData) {
    console.error("[self-register] workshops insert failed:", workshopError?.message);
    throw new Error(GENERIC_ERROR);
  }

  const workshopId = workshopData.id as string;

  const rollback = async (step: string) => {
    const { error: rbError } = await supabaseServer
      .from("workshops")
      .delete()
      .eq("id", workshopId);
    if (rbError) {
      console.error(`[self-register] rollback after ${step} failed — orphan workshopId=${workshopId}:`, rbError.message);
    }
  };

  // Step 2: create settings.
  const { error: settingsError } = await supabaseServer
    .from("workshop_settings")
    .insert({ workshop_id: workshopId, hourly_rate: 0 });

  if (settingsError) {
    console.error("[self-register] workshop_settings insert failed:", settingsError.message);
    await rollback("settings");
    throw new Error(GENERIC_ERROR);
  }

  // Step 3: create profile (best-effort — table may not exist in all envs).
  const profileRow: Record<string, unknown> = { workshop_id: workshopId };
  if (input.phone) profileRow.telefono = input.phone;
  if (input.vatNumber) profileRow.partita_iva = input.vatNumber;
  const { error: profileError } = await (supabaseServer as any)
    .from("workshop_profiles")
    .insert(profileRow);
  if (profileError) {
    console.warn("[self-register] workshop_profiles insert skipped:", profileError.message);
    // No rollback — profile is optional, workshop is usable without it.
  }

  // Step 4: create owner user with password hash — always the last write.
  let user: WorkshopUser;
  try {
    user = await createWorkshopUser({
      workshopId,
      email: input.email,
      displayName: input.ownerName.trim(),
      role: "owner",
      passwordHash,
    });
  } catch (err) {
    await rollback("user creation");
    const msg = err instanceof Error ? err.message : "";
    // Pass through only the known user-facing duplicate email message.
    if (msg === EMAIL_DUPLICATE_ERROR) throw err;
    console.error("[self-register] createWorkshopUser failed:", msg);
    throw new Error(GENERIC_ERROR);
  }

  console.log(`[self-register] registered workshopId=${workshopId} userId=${user.id}`);

  return { workshopId, user };
}
