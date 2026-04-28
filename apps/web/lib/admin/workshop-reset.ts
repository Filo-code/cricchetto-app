import "server-only";

import { supabaseServer } from "../supabase-server";

export interface DemoResetCounts {
  attachments: number;
  message_logs: number;
  work_order_audit_events: number;
  work_order_notes: number;
  work_order_items: number;
  reminders: number;
  documents: number;
  intake_sessions: number;
  work_orders: number;
  work_order_number_sequences: number;
  vehicle_revision_events: number;
  vehicles: number;
  customers: number;
}

/**
 * Deletes all operational data for the given workshopId.
 * Executes in FK-safe order: leaf tables first, root entities last.
 * All 13 operational tables have a direct workshop_id column —
 * no join-based scoping is needed. Config tables (workshops,
 * workshop_users, workshop_settings, workshop_profiles,
 * workshop_channels, workshop_document_templates) are never touched.
 * Storage files are NOT deleted (P2 — not yet implemented).
 */
export async function resetPlatformWorkshopData(workshopId: string): Promise<DemoResetCounts> {
  async function del(table: string): Promise<number> {
    const { error, count } = await (supabaseServer as any)
      .from(table)
      .delete({ count: "exact" })
      .eq("workshop_id", workshopId);
    if (error) throw new Error(`Reset failed on "${table}": ${error.message}`);
    return typeof count === "number" ? count : 0;
  }

  // Step 1 — leaf tables (depend on work_orders, message_logs, intake_sessions)
  const attachments = await del("attachments");
  const message_logs = await del("message_logs");
  const work_order_audit_events = await del("work_order_audit_events");
  const work_order_notes = await del("work_order_notes");
  const work_order_items = await del("work_order_items");

  // Step 2 — mid-level (depend on work_orders + vehicles)
  const reminders = await del("reminders");
  const documents = await del("documents");
  const intake_sessions = await del("intake_sessions");

  // Step 3 — core entities (depend on vehicles + customers)
  const work_orders = await del("work_orders");
  const work_order_number_sequences = await del("work_order_number_sequences");

  // Step 4 — root entities
  const vehicle_revision_events = await del("vehicle_revision_events");
  const vehicles = await del("vehicles");
  const customers = await del("customers");

  return {
    attachments,
    message_logs,
    work_order_audit_events,
    work_order_notes,
    work_order_items,
    reminders,
    documents,
    intake_sessions,
    work_orders,
    work_order_number_sequences,
    vehicle_revision_events,
    vehicles,
    customers,
  };
}
