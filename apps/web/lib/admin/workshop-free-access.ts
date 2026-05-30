import "server-only";

import { supabaseServer } from "../supabase-server";
import { writePlatformAuditEvent } from "./platform-audit";

export interface AdminFreeAccessState {
  adminFreeAccess: boolean;
  adminFreeReason: string | null;
  adminFreeSetBy: string | null;
  adminFreeSetAt: string | null;
}

export async function getAdminFreeAccessState(workshopId: string): Promise<AdminFreeAccessState> {
  const { data, error } = await supabaseServer
    .from("workshops")
    .select("admin_free_access,admin_free_reason,admin_free_set_by,admin_free_set_at")
    .eq("id", workshopId)
    .single();

  if (error || !data) {
    throw new Error(`Failed to read admin free access state: ${error?.message ?? "not found"}`);
  }

  const row = data as {
    admin_free_access: boolean;
    admin_free_reason: string | null;
    admin_free_set_by: string | null;
    admin_free_set_at: string | null;
  };

  return {
    adminFreeAccess: row.admin_free_access,
    adminFreeReason: row.admin_free_reason,
    adminFreeSetBy: row.admin_free_set_by,
    adminFreeSetAt: row.admin_free_set_at,
  };
}

export async function setAdminFreeAccess(input: {
  workshopId: string;
  enabled: boolean;
  reason: string;
  actorEmail: string;
}): Promise<void> {
  const now = new Date().toISOString();

  const patch = input.enabled
    ? {
        admin_free_access: true,
        admin_free_reason: input.reason.trim(),
        admin_free_set_by: input.actorEmail,
        admin_free_set_at: now,
      }
    : {
        admin_free_access: false,
        admin_free_reason: input.reason.trim(),
        admin_free_set_by: input.actorEmail,
        admin_free_set_at: now,
      };

  const { error } = await supabaseServer
    .from("workshops")
    .update(patch)
    .eq("id", input.workshopId);

  if (error) {
    throw new Error(`Failed to set admin free access: ${error.message}`);
  }

  await writePlatformAuditEvent({
    eventType: input.enabled ? "workshop.free_access_enabled" : "workshop.free_access_disabled",
    actorEmail: input.actorEmail,
    targetWorkshopId: input.workshopId,
    details: {
      enabled: input.enabled,
      reason: input.reason.trim(),
      set_at: now,
    },
  });
}
