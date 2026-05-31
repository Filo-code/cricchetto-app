import "server-only";

import { supabaseServer } from "../supabase-server";
import { writePlatformAuditEvent } from "./platform-audit";

export interface AdminFreeAccessState {
  adminFreeAccess: boolean;
}

export async function getAdminFreeAccessState(workshopId: string): Promise<AdminFreeAccessState> {
  const { data, error } = await supabaseServer
    .from("workshops")
    .select("admin_free_access")
    .eq("id", workshopId)
    .single();

  if (error || !data) {
    throw new Error(`Failed to read admin free access state: ${error?.message ?? "not found"}`);
  }

  return {
    adminFreeAccess: (data as { admin_free_access: boolean }).admin_free_access,
  };
}

export async function setAdminFreeAccess(input: {
  workshopId: string;
  enabled: boolean;
  reason: string;
  actorEmail: string;
}): Promise<void> {
  const { error } = await supabaseServer
    .from("workshops")
    .update({ admin_free_access: input.enabled })
    .eq("id", input.workshopId);

  if (error) {
    throw new Error(`Failed to set admin free access: ${error.message}`);
  }

  // Audit trail: reason, actor, timestamp recorded in platform_audit_events only.
  await writePlatformAuditEvent({
    eventType: input.enabled ? "workshop.free_access_enabled" : "workshop.free_access_disabled",
    actorEmail: input.actorEmail,
    targetWorkshopId: input.workshopId,
    details: {
      enabled: input.enabled,
      reason: input.reason.trim(),
      set_at: new Date().toISOString(),
    },
  });
}
