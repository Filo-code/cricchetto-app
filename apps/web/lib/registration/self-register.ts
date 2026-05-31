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

/**
 * Creates a new workshop with owner user via self-service registration.
 *
 * Order of writes (safe rollback sequence):
 *   1. hashPassword — before any DB write
 *   2. INSERT workshops
 *   3. INSERT workshop_settings
 *   4. INSERT workshop_profiles (best-effort)
 *   5. createWorkshopUser with passwordHash — last write
 *
 * On failure at steps 3-5: DELETE workshop (CASCADE removes settings + profiles).
 * User is always the last write, so no orphan users are possible.
 */
export async function selfRegisterWorkshop(input: SelfRegisterInput): Promise<SelfRegisterResult> {
  const passwordHash = await hashPassword(input.password);

  // Step 1: create workshop
  const { data: workshopData, error: workshopError } = await supabaseServer
    .from("workshops")
    .insert({ name: input.workshopName.trim(), timezone: "Europe/Rome" })
    .select("id")
    .single();

  if (workshopError || !workshopData) {
    throw new Error(`Errore durante la creazione dell'officina: ${workshopError?.message ?? "unknown"}`);
  }

  const workshopId = workshopData.id as string;

  const rollback = async () => {
    await supabaseServer.from("workshops").delete().eq("id", workshopId);
  };

  // Step 2: create settings
  const { error: settingsError } = await supabaseServer
    .from("workshop_settings")
    .insert({ workshop_id: workshopId, hourly_rate: 0 });

  if (settingsError) {
    await rollback();
    throw new Error(`Errore durante la configurazione: ${settingsError.message}`);
  }

  // Step 3: create profile (best-effort — skip if table not ready)
  const profileRow: Record<string, unknown> = { workshop_id: workshopId };
  if (input.phone?.trim()) profileRow.telefono = input.phone.trim();
  if (input.vatNumber?.trim()) profileRow.partita_iva = input.vatNumber.trim();
  const { error: profileError } = await (supabaseServer as any)
    .from("workshop_profiles")
    .insert(profileRow);
  if (profileError) {
    console.warn("[self-register] workshop_profiles insert skipped:", profileError.message);
  }

  // Step 4: create owner user with password hash — last write
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
    await rollback();
    throw err;
  }

  return { workshopId, user };
}
