import { supabaseServer } from "../supabase-server";
import { peekDashboardSession, getEffectiveWorkshopId } from "./session-core";
import type { WorkOrderStatus } from "../types";
import type { DashboardTotals, DashboardWorkOrderSummary } from "./types";

export const ACTIVE_STATUSES: WorkOrderStatus[] = ["accepted", "in_progress", "ready"];

export const WORK_ORDER_FILTER_STATUSES: Record<string, WorkOrderStatus[]> = {
  active: ACTIVE_STATUSES,
  accepted: ["accepted"],
  in_progress: ["in_progress"],
  ready: ["ready"],
  collected: ["collected"],
  archived: ["archived"],
  closed: ["collected", "archived"],
};

export interface DashboardRevisionState {
  dueDate: string | null;
  reminderEnabled: boolean | null;
  appointmentDate: string | null;
  appointmentTime: string | null;
}

export async function readDashboardWorkshop(): Promise<{ id: string; name: string; timezone: string; logoUrl: string | null; status: string }> {
  const session = await peekDashboardSession();
  const configuredWorkshopId = process.env.Cricchetto_DASHBOARD_WORKSHOP_ID ?? process.env.Cricchetto_WORKSHOP_ID;
  const workshopId = session ? getEffectiveWorkshopId(session) : configuredWorkshopId;

  if (!workshopId) {
    if (process.env.NODE_ENV === "production") {
      throw new Error("No workshop resolved from session or configuration — refusing first-by-date fallback in production");
    }
  }

  let query = supabaseServer.from("workshops").select("id,name,display_name,logo_url,timezone,status").order("created_at", { ascending: true }).limit(1);
  if (workshopId) {
    query = supabaseServer.from("workshops").select("id,name,display_name,logo_url,timezone,status").eq("id", workshopId).limit(1);
  }

  const { data, error } = await query.maybeSingle();
  if (error) throw new Error(`Failed to read workshop: ${error.message}`);
  if (!data) throw new Error("No workshop configured for dashboard");
  return {
    id: data.id,
    name: (data as any).display_name ?? data.name,
    timezone: data.timezone,
    logoUrl: (data as any).logo_url ?? null,
    status: (data as any).status ?? "active",
  };
}

export async function readTotalsByWorkOrderIds(workshopId: string, ids: string[]): Promise<Map<string, DashboardTotals>> {
  if (ids.length === 0) return new Map();
  const { data, error } = await supabaseServer
    .from("work_order_totals")
    .select("work_order_id,labor_total,parts_total,grand_total")
    .eq("workshop_id", workshopId)
    .in("work_order_id", ids);

  if (error) throw new Error(`Failed to read work order totals: ${error.message}`);

  return new Map((data ?? []).map((row) => [
    row.work_order_id,
    {
      laborTotal: Number(row.labor_total ?? 0),
      partsTotal: Number(row.parts_total ?? 0),
      grandTotal: Number(row.grand_total ?? 0),
    },
  ]));
}

export async function readRevisionByVehicleIds(workshopId: string, ids: string[]): Promise<Map<string, DashboardRevisionState>> {
  if (ids.length === 0) return new Map();
  const { data, error } = await supabaseServer
    .from("vehicles")
    .select("id,revision_due_date,revision_reminder_enabled,revision_appointment_date,revision_appointment_time")
    .eq("workshop_id", workshopId)
    .in("id", ids);

  if (error) throw new Error(`Failed to read vehicle revisions: ${error.message}`);
  return new Map((data ?? []).map((row) => [row.id, {
    dueDate: row.revision_due_date,
    reminderEnabled: row.revision_reminder_enabled,
    appointmentDate: row.revision_appointment_date,
    appointmentTime: row.revision_appointment_time,
  }]));
}

export async function readCustomersByIds(workshopId: string, customerIds: string[]): Promise<Map<string, { name: string }>> {
  const uniqueIds = [...new Set(customerIds)];
  if (uniqueIds.length === 0) return new Map();
  const { data, error } = await supabaseServer
    .from("customers")
    .select("id,name")
    .eq("workshop_id", workshopId)
    .in("id", uniqueIds);

  if (error) throw new Error(`Failed to read customers: ${error.message}`);
  return new Map((data ?? []).map((row) => [row.id, { name: row.name }]));
}

export async function readActiveWorkOrdersByPlates(workshopId: string, plates: string[]): Promise<Map<string, { id: string; status: string }>> {
  const uniquePlates = [...new Set(plates)];
  if (uniquePlates.length === 0) return new Map();
  const { data, error } = await supabaseServer
    .from("work_orders")
    .select("id,plate_normalized,status")
    .eq("workshop_id", workshopId)
    .in("plate_normalized", uniquePlates)
    .in("status", ACTIVE_STATUSES);

  if (error) throw new Error(`Failed to read active work orders: ${error.message}`);
  return new Map((data ?? []).map((row) => [row.plate_normalized, { id: row.id, status: row.status }]));
}

export async function readWorkOrderIdentityByIds(workshopId: string, ids: string[]): Promise<Map<string, { public_code: string; plate_normalized: string }>> {
  const uniqueIds = [...new Set(ids)];
  if (uniqueIds.length === 0) return new Map();
  const { data, error } = await supabaseServer
    .from("work_orders")
    .select("id,public_code,plate_normalized")
    .eq("workshop_id", workshopId)
    .in("id", uniqueIds);

  if (error) throw new Error(`Failed to read work order identity: ${error.message}`);
  return new Map((data ?? []).map((row) => [row.id, { public_code: row.public_code, plate_normalized: row.plate_normalized }]));
}

export function toWorkOrderSummary(row: any, totals?: DashboardTotals, revisionState?: DashboardRevisionState | null): DashboardWorkOrderSummary {
  return {
    id: row.id,
    publicCode: row.public_code,
    plate: row.plate_normalized,
    status: row.status,
    reportedIssue: row.reported_issue,
    vehicleModel: row.vehicle_model_snapshot,
    customerName: row.customer_name_snapshot,
    customerPhone: row.customer_phone_snapshot,
    kilometers: row.kilometers,
    revisionDueDate: revisionState?.dueDate ?? null,
    revisionReminderEnabled: revisionState?.reminderEnabled ?? null,
    revisionAppointmentDate: revisionState?.appointmentDate ?? null,
    revisionAppointmentTime: revisionState?.appointmentTime ?? null,
    readyAt: row.ready_at,
    collectedAt: row.collected_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    totals: totals ?? { laborTotal: 0, partsTotal: 0, grandTotal: 0 },
  };
}

export function countOverdue(revisions: { revisionDueDate: string }[], today: string): number {
  return revisions.filter((r) => r.revisionDueDate < today).length;
}

export function normalizeDashboardDocumentStatus(status: string): import("../types").DocumentStatus {
  if (status === "generated") return "ready";
  if (status === "pending" || status === "generating" || status === "ready" || status === "failed" || status === "void") {
    return status;
  }
  return "failed";
}

export function documentStatusMessage(status: import("../types").DocumentStatus, metadata: unknown): string | null {
  const value = metadata && typeof metadata === "object" && !Array.isArray(metadata)
    ? metadata as Record<string, unknown>
    : {};
  if (status === "failed") {
    return typeof value.error_message === "string" && value.error_message
      ? value.error_message
      : "Generazione fallita. Controlla il worker documenti.";
  }
  if (status === "pending") return "In attesa del worker documenti.";
  if (status === "generating") return "Generazione in corso.";
  return null;
}

export function isPreviewableAttachment(type: string, mimeType: string | null): boolean {
  return type === "photo"
    || type === "audio"
    || Boolean(
      mimeType?.startsWith("image/")
      || mimeType?.startsWith("audio/")
      || mimeType?.startsWith("video/"),
    );
}

export const WO_SELECT_COLS = "id,workshop_id,vehicle_id,public_code,plate_snapshot,plate_normalized,vehicle_model_snapshot,customer_name_snapshot,customer_phone_snapshot,status,reported_issue,kilometers,ready_at,collected_at,created_at,updated_at";
