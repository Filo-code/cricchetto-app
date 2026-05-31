import "server-only";

import { supabaseServer } from "../supabase-server";

export type PlatformAuditEventType =
  | "workshop.create"
  | "workshop.update"
  | "workshop.suspend"
  | "workshop.close"
  | "workshop.reactivate"
  | "workshop.free_access_enabled"
  | "workshop.free_access_disabled"
  | "workshop.impersonate"
  | "workshop.impersonation_end"
  | "workshop.trial_reset"
  | "workshop.subscription_force_transition"
  | "user.reset_link"
  | "demo.reset"
  | "demo.populate";

export interface PlatformAuditInput {
  eventType: PlatformAuditEventType;
  actorEmail: string;
  targetWorkshopId?: string | null;
  targetUserId?: string | null;
  details?: Record<string, unknown>;
}

export interface PlatformAuditEvent {
  id: string;
  eventType: string;
  actorEmail: string;
  targetWorkshopId: string | null;
  targetUserId: string | null;
  details: Record<string, unknown>;
  createdAt: string;
}

/**
 * Best-effort audit write. Never throws — auditing must not break the action it records.
 * Table may not be migrated on all envs (0022); insert errors are logged and swallowed.
 */
export async function writePlatformAuditEvent(input: PlatformAuditInput): Promise<void> {
  try {
    const { error } = await (supabaseServer as any).from("platform_audit_events").insert({
      event_type: input.eventType,
      actor_email: input.actorEmail,
      target_workshop_id: input.targetWorkshopId ?? null,
      target_user_id: input.targetUserId ?? null,
      details: input.details ?? {},
    });
    if (error) {
      console.warn("[platform-audit] insert skipped:", error.message);
    }
  } catch (err) {
    console.warn("[platform-audit] insert failed:", err instanceof Error ? err.message : err);
  }
}

export async function listPlatformAuditEvents(limit = 25): Promise<PlatformAuditEvent[]> {
  const { data, error } = await (supabaseServer as any)
    .from("platform_audit_events")
    .select("id,event_type,actor_email,target_workshop_id,target_user_id,details,created_at")
    .order("created_at", { ascending: false })
    .limit(limit);

  if (error) throw new Error(`Failed to list platform audit events: ${error.message}`);

  return ((data ?? []) as any[]).map((r) => ({
    id: r.id,
    eventType: r.event_type,
    actorEmail: r.actor_email,
    targetWorkshopId: r.target_workshop_id ?? null,
    targetUserId: r.target_user_id ?? null,
    details: (r.details ?? {}) as Record<string, unknown>,
    createdAt: r.created_at,
  }));
}
