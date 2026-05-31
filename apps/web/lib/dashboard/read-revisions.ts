import { supabaseServer } from "../supabase-server";
import { addDays, getLocalDate } from "../time";
import { readDashboardWorkshop, readCustomersByIds, readActiveWorkOrdersByPlates } from "./read-core";
import type { DashboardRevision } from "./types";

export async function getUpcomingRevisions(): Promise<DashboardRevision[]> {
  const workshop = await readDashboardWorkshop();
  return readUpcomingRevisions(workshop.id, workshop.timezone, 50);
}

export async function readUpcomingRevisions(workshopId: string, timezone: string, limit: number): Promise<DashboardRevision[]> {
  const today = getLocalDate(timezone);
  const end = addDays(today, 30);
  const { data: vehicles, error } = await supabaseServer
    .from("vehicles")
    .select("id,customer_id,plate_normalized,model,revision_due_date,revision_reminder_enabled,revision_appointment_date,revision_appointment_time")
    .eq("workshop_id", workshopId)
    .not("revision_due_date", "is", null)
    .lte("revision_due_date", end)
    .order("revision_due_date", { ascending: true })
    .limit(limit);

  if (error) throw new Error(`Failed to read upcoming revisions: ${error.message}`);

  const rows = vehicles ?? [];
  const [customersById, activeByPlate] = await Promise.all([
    readCustomersByIds(workshopId, rows.map((r) => r.customer_id).filter(Boolean) as string[]),
    readActiveWorkOrdersByPlates(workshopId, rows.map((r) => r.plate_normalized)),
  ]);

  return rows
    .sort((a, b) => {
      const aOverdue = a.revision_due_date < today ? 0 : 1;
      const bOverdue = b.revision_due_date < today ? 0 : 1;
      if (aOverdue !== bOverdue) return aOverdue - bOverdue;
      return a.revision_due_date.localeCompare(b.revision_due_date) || a.plate_normalized.localeCompare(b.plate_normalized);
    })
    .map((vehicle) => {
      const active = activeByPlate.get(vehicle.plate_normalized) ?? null;
      return {
        vehicleId: vehicle.id,
        plate: vehicle.plate_normalized,
        model: vehicle.model,
        customerName: vehicle.customer_id ? customersById.get(vehicle.customer_id)?.name ?? null : null,
        revisionDueDate: vehicle.revision_due_date,
        revisionReminderEnabled: vehicle.revision_reminder_enabled,
        revisionAppointmentDate: vehicle.revision_appointment_date,
        revisionAppointmentTime: vehicle.revision_appointment_time,
        activeWorkOrderId: active?.id ?? null,
        activeWorkOrderStatus: (active?.status as import("../types").WorkOrderStatus | undefined) ?? null,
      };
    });
}
