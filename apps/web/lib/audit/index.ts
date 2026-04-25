import { supabaseServer } from "../supabase-server";

export interface AuditEventInput {
  workshopId: string;
  workOrderId?: string;
  eventType: string;
  actorType: "mechanic" | "dashboard_user" | "system";
  actorRef?: string;
  before?: Record<string, unknown>;
  after?: Record<string, unknown>;
}

export async function writeAuditEvent(input: AuditEventInput): Promise<void> {
  const { error } = await supabaseServer.from("work_order_audit_events").insert({
    workshop_id: input.workshopId,
    work_order_id: input.workOrderId ?? null,
    event_type: input.eventType,
    actor_type: input.actorType,
    actor_ref: input.actorRef ?? null,
    before: input.before ?? {},
    after: input.after ?? {},
  });

  if (error) {
    throw new Error(`Failed to write audit event: ${error.message}`);
  }
}
