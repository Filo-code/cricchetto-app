import { AppError } from "../errors";
import { assertValidPlate } from "../plates";
import { supabaseServer } from "../supabase-server";
import {
  readDashboardWorkshop,
  readCustomersByIds,
  readActiveWorkOrdersByPlates,
  ACTIVE_STATUSES,
} from "./read-core";
import { readWorkOrderHistoryByPlate } from "./read-work-orders";
import type { WorkOrderStatus } from "../types";
import type { DashboardSearchVehicle, DashboardVehicleDetail } from "./types";

export async function readVehicleForMutation(id: string): Promise<{ workshopId: string; vehicleId: string }> {
  const workshop = await readDashboardWorkshop();
  const { data, error } = await supabaseServer
    .from("vehicles")
    .select("id,workshop_id")
    .eq("workshop_id", workshop.id)
    .eq("id", id)
    .maybeSingle();

  if (error) throw new Error(`Failed to read vehicle: ${error.message}`);
  if (!data) throw new AppError("Vehicle not found", { statusCode: 404, parseStatus: "not_found" });
  return { workshopId: data.workshop_id, vehicleId: data.id };
}

export async function listVehicles(query: string): Promise<DashboardSearchVehicle[]> {
  const workshop = await readDashboardWorkshop();
  const cleanQuery = query.trim().replace(/\s+/g, " ");
  if (cleanQuery.length >= 2) {
    return readSearchVehicles(workshop.id, cleanQuery);
  }
  return readRecentVehiclesList(workshop.id, 50);
}

export async function getVehicleDetailByPlate(inputPlate: string): Promise<DashboardVehicleDetail> {
  const plate = assertValidPlate(inputPlate);
  const workshop = await readDashboardWorkshop();
  const { data: vehicle, error } = await supabaseServer
    .from("vehicles")
    .select("id,workshop_id,customer_id,plate,plate_normalized,model,revision_due_date,revision_reminder_enabled,revision_reminder_channel,revision_appointment_date,revision_appointment_time,row_version,created_at,updated_at")
    .eq("workshop_id", workshop.id)
    .eq("plate_normalized", plate)
    .maybeSingle();

  if (error) throw new Error(`Failed to read vehicle: ${error.message}`);
  if (!vehicle) throw new AppError("Vehicle not found", { statusCode: 404, parseStatus: "not_found" });

  const [customer, workOrders, revisionEvents] = await Promise.all([
    readCustomer(workshop.id, vehicle.customer_id),
    readWorkOrderHistoryByPlate(workshop.id, vehicle.plate_normalized),
    readRevisionEvents(workshop.id, vehicle.id),
  ]);

  const activeWorkOrder = workOrders.find((wo) => ACTIVE_STATUSES.includes(wo.status)) ?? null;

  return {
    vehicle: {
      id: vehicle.id,
      plate: vehicle.plate_normalized,
      model: vehicle.model,
      revisionDueDate: vehicle.revision_due_date,
      revisionReminderEnabled: vehicle.revision_reminder_enabled,
      revisionReminderChannel: (vehicle as any).revision_reminder_channel ?? null,
      revisionAppointmentDate: vehicle.revision_appointment_date,
      revisionAppointmentTime: vehicle.revision_appointment_time,
      rowVersion: Number(vehicle.row_version),
      customerName: customer?.name ?? null,
      customerPhone: customer?.phone ?? customer?.phone_normalized ?? null,
      createdAt: vehicle.created_at,
      updatedAt: vehicle.updated_at,
    },
    activeWorkOrder,
    workOrders,
    revisionEvents,
  };
}

export async function readSearchVehicles(workshopId: string, query: string): Promise<DashboardSearchVehicle[]> {
  const { normalizePlate } = await import("../plates");
  const { mergeByKey } = await import("./query-utils");

  const plateQuery = normalizePlate(query).replace(/[%_]/g, "");
  const nameQuery = query.replace(/[%_]/g, "");

  const vehiclesById = await mergeByKey(
    [
      plateQuery.length >= 2
        ? async () => {
            const { data, error } = await supabaseServer
              .from("vehicles")
              .select("id,customer_id,plate_normalized,model,revision_due_date,updated_at")
              .eq("workshop_id", workshopId)
              .ilike("plate_normalized", `%${plateQuery}%`)
              .order("updated_at", { ascending: false })
              .limit(8);
            if (error) throw new Error(`Failed to search vehicles by plate: ${error.message}`);
            return data ?? [];
          }
        : null,
      nameQuery.length >= 2
        ? async () => {
            const { data: customers, error: customerError } = await supabaseServer
              .from("customers")
              .select("id,name")
              .eq("workshop_id", workshopId)
              .ilike("name", `%${nameQuery}%`)
              .order("updated_at", { ascending: false })
              .limit(12);
            if (customerError) throw new Error(`Failed to search customers: ${customerError.message}`);
            const customerIds = (customers ?? []).map((c) => c.id);
            if (customerIds.length === 0) return [];
            const { data, error } = await supabaseServer
              .from("vehicles")
              .select("id,customer_id,plate_normalized,model,revision_due_date,updated_at")
              .eq("workshop_id", workshopId)
              .in("customer_id", customerIds)
              .order("updated_at", { ascending: false })
              .limit(12);
            if (error) throw new Error(`Failed to search vehicles by customer: ${error.message}`);
            return data ?? [];
          }
        : null,
      nameQuery.length >= 2
        ? async () => {
            const { data, error } = await supabaseServer
              .from("vehicles")
              .select("id,customer_id,plate_normalized,model,revision_due_date,updated_at")
              .eq("workshop_id", workshopId)
              .ilike("model", `%${nameQuery}%`)
              .order("updated_at", { ascending: false })
              .limit(8);
            if (error) throw new Error(`Failed to search vehicles by model: ${error.message}`);
            return data ?? [];
          }
        : null,
    ].filter((q): q is () => Promise<any[]> => q !== null),
    (row) => row.id as string,
  );

  const vehicles = [...vehiclesById.values()].slice(0, 12);
  const [customersById, activeByPlate] = await Promise.all([
    readCustomersByIds(workshopId, vehicles.map((v) => v.customer_id).filter(Boolean) as string[]),
    readActiveWorkOrdersByPlates(workshopId, vehicles.map((v) => v.plate_normalized)),
  ]);

  return vehicles.map((vehicle) => {
    const active = activeByPlate.get(vehicle.plate_normalized) ?? null;
    return {
      vehicleId: vehicle.id,
      plate: vehicle.plate_normalized,
      model: vehicle.model,
      customerName: vehicle.customer_id ? customersById.get(vehicle.customer_id)?.name ?? null : null,
      revisionDueDate: vehicle.revision_due_date,
      activeWorkOrderId: active?.id ?? null,
      activeWorkOrderStatus: (active?.status as WorkOrderStatus | undefined) ?? null,
    };
  });
}

async function readRecentVehiclesList(workshopId: string, limit: number): Promise<DashboardSearchVehicle[]> {
  const { data, error } = await supabaseServer
    .from("vehicles")
    .select("id,customer_id,plate_normalized,model,revision_due_date,updated_at")
    .eq("workshop_id", workshopId)
    .order("updated_at", { ascending: false })
    .limit(limit);

  if (error) throw new Error(`Failed to list vehicles: ${error.message}`);
  const rows = data ?? [];
  const [customersById, activeByPlate] = await Promise.all([
    readCustomersByIds(workshopId, rows.map((v) => v.customer_id).filter(Boolean) as string[]),
    readActiveWorkOrdersByPlates(workshopId, rows.map((v) => v.plate_normalized)),
  ]);
  return rows.map((vehicle) => {
    const active = activeByPlate.get(vehicle.plate_normalized) ?? null;
    return {
      vehicleId: vehicle.id,
      plate: vehicle.plate_normalized,
      model: vehicle.model,
      customerName: vehicle.customer_id ? customersById.get(vehicle.customer_id)?.name ?? null : null,
      revisionDueDate: vehicle.revision_due_date,
      activeWorkOrderId: active?.id ?? null,
      activeWorkOrderStatus: (active?.status as WorkOrderStatus | undefined) ?? null,
    };
  });
}

async function readCustomer(workshopId: string, customerId: string | null): Promise<{ name: string; phone: string | null; phone_normalized: string | null } | null> {
  if (!customerId) return null;
  const { data, error } = await supabaseServer
    .from("customers")
    .select("name,phone,phone_normalized")
    .eq("workshop_id", workshopId)
    .eq("id", customerId)
    .maybeSingle();

  if (error) throw new Error(`Failed to read customer: ${error.message}`);
  return data ?? null;
}

async function readRevisionEvents(workshopId: string, vehicleId: string): Promise<DashboardVehicleDetail["revisionEvents"]> {
  const { data, error } = await supabaseServer
    .from("vehicle_revision_events")
    .select("id,previous_revision_due_date,new_revision_due_date,source,created_by,created_at")
    .eq("workshop_id", workshopId)
    .eq("vehicle_id", vehicleId)
    .order("created_at", { ascending: false })
    .limit(20);

  if (error) throw new Error(`Failed to read revision events: ${error.message}`);
  return (data ?? []).map((row) => ({
    id: row.id,
    previousRevisionDueDate: row.previous_revision_due_date,
    newRevisionDueDate: row.new_revision_due_date,
    source: row.source,
    createdBy: row.created_by,
    createdAt: row.created_at,
  }));
}
