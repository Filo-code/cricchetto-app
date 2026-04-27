import "server-only";

import { supabaseServer } from "../supabase-server";
import { createWorkshopUser, generatePasswordResetToken } from "../dashboard/users";

export interface ProvisionResult {
  workshopId: string;
  userId: string;
  inviteLink: string;
  expiresAt: Date;
}

export async function provisionWorkshop(input: {
  workshopName: string;
  ownerEmail: string;
  ownerName?: string;
  city?: string;
  timezone?: string;
}): Promise<ProvisionResult> {
  const timezone = input.timezone?.trim() || "Europe/Rome";
  let workshopId: string | null = null;

  try {
    // 1. Create workshop
    const { data: workshop, error: workshopErr } = await supabaseServer
      .from("workshops")
      .insert({ name: input.workshopName.trim(), timezone })
      .select("id")
      .single();
    if (workshopErr) throw new Error(`Impossibile creare officina: ${workshopErr.message}`);
    workshopId = workshop.id;

    // 2. Create workshop_settings with safe defaults
    const { error: settingsErr } = await supabaseServer
      .from("workshop_settings")
      .insert({ workshop_id: workshopId, hourly_rate: 0 });
    if (settingsErr) throw new Error(`Impossibile creare impostazioni officina: ${settingsErr.message}`);

    // 3. Create workshop_profiles row (best-effort: table may not be migrated on all envs)
    const profilePayload: Record<string, unknown> = { workshop_id: workshopId };
    if (input.city?.trim()) profilePayload.citta = input.city.trim();
    const { error: profileErr } = await supabaseServer.from("workshop_profiles").insert(profilePayload);
    if (profileErr) {
      console.warn("[provisioning] workshop_profiles insert skipped:", profileErr.message);
    }

    // 4. Create workshop_users (owner) — createWorkshopUser handles email uniqueness
    const user = await createWorkshopUser({
      workshopId: workshopId!,
      email: input.ownerEmail,
      displayName: input.ownerName,
      role: "owner",
    });

    // 5. Generate invite token (raw token returned to caller, sha256 hash stored in DB)
    const { token, expiresAt } = await generatePasswordResetToken(user.id);

    const rawBaseUrl = process.env.Criccheto_BACKEND_BASE_URL ?? "";
    if (!rawBaseUrl && process.env.NODE_ENV === "production") {
      throw new Error("Criccheto_BACKEND_BASE_URL è richiesto in produzione per generare i link di invito.");
    }
    const baseUrl = rawBaseUrl.replace(/\/$/, "");
    const inviteLink = `${baseUrl}/set-password?token=${encodeURIComponent(token)}`;

    console.info("[provisioning] workshop created", { workshopId, userEmail: input.ownerEmail });

    return { workshopId: workshopId!, userId: user.id, inviteLink, expiresAt };
  } catch (err) {
    // Best-effort rollback: cascade delete removes workshop_settings, profiles, users
    if (workshopId) {
      try {
        await supabaseServer.from("workshops").delete().eq("id", workshopId);
      } catch (rollbackErr) {
        console.error("[provisioning] rollback failed", rollbackErr);
      }
    }
    throw err;
  }
}
