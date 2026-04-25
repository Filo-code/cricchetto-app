import { AppError } from "../errors";
import { reconcileStaleDocuments } from "../documents";
import { assertValidPlate, normalizePlate } from "../plates";
import { supabaseServer } from "../supabase-server";
import { addDays, getLocalDate } from "../time";
import type { DocumentStatus, WorkOrderStatus } from "../types";
import type {
  DashboardActivity,
  DashboardAttachment,
  DashboardDocument,
  DashboardItem,
  DashboardNote,
  DashboardOverview,
  DashboardRevision,
  DashboardSearchResult,
  DashboardSearchVehicle,
  DashboardTotals,
  DashboardVehicleDetail,
  DashboardWorkOrderDetail,
  DashboardWorkOrderSummary,
} from "./types";

const ACTIVE_STATUSES: WorkOrderStatus[] = ["accepted", "in_progress", "ready"];
const WORK_ORDER_FILTER_STATUSES: Record<string, WorkOrderStatus[]> = {
  active: ACTIVE_STATUSES,
  accepted: ["accepted"],
  in_progress: ["in_progress"],
  ready: ["ready"],
  collected: ["collected"],
  archived: ["archived"],
  closed: ["collected", "archived"],
};

interface DashboardRevisionState {
  dueDate: string | null;
  reminderEnabled: boolean | null;
  appointmentDate: string | null;
  appointmentTime: string | null;
}

export async function getDashboardOverview(): Promise<DashboardOverview> {
  const workshop = await readDashboardWorkshop();
  const [activeWorkOrders, inProgressWorkOrders, readyWorkOrders, recentActivity, upcomingRevisions] = await Promise.all([
    readWorkOrderSummaries(workshop.id, ACTIVE_STATUSES, 12),
    readWorkOrderSummaries(workshop.id, ["in_progress"], 8),
    readWorkOrderSummaries(workshop.id, ["ready"], 8),
    readRecentActivity(workshop.id, 10),
    readUpcomingRevisions(workshop.id, workshop.timezone, 12),
  ]);

  return {
    workshop,
    counts: {
      active: activeWorkOrders.length,
      accepted: activeWorkOrders.filter((workOrder) => workOrder.status === "accepted").length,
      inProgress: inProgressWorkOrders.length,
      ready: readyWorkOrders.length,
      overdueRevisions: countOverdue(upcomingRevisions, workshop.timezone),
    },
    activeWorkOrders,
    inProgressWorkOrders,
    readyWorkOrders,
    recentActivity,
    upcomingRevisions,
  };
}

export async function getOpenWorkOrders(): Promise<DashboardWorkOrderSummary[]> {
  const workshop = await readDashboardWorkshop();
  return readWorkOrderSummaries(workshop.id, ACTIVE_STATUSES, 50);
}

export async function getReadyWorkOrders(): Promise<DashboardWorkOrderSummary[]> {
  const workshop = await readDashboardWorkshop();
  return readWorkOrderSummaries(workshop.id, ["ready"], 50);
}

export async function getFilteredWorkOrders(filter: string): Promise<{ filter: string; workOrders: DashboardWorkOrderSummary[] }> {
  const normalized = filter in WORK_ORDER_FILTER_STATUSES ? filter : "active";
  const workshop = await readDashboardWorkshop();
  return {
    filter: normalized,
    workOrders: await readWorkOrderSummaries(workshop.id, WORK_ORDER_FILTER_STATUSES[normalized], 100),
  };
}

export async function getUpcomingRevisions(): Promise<DashboardRevision[]> {
  const workshop = await readDashboardWorkshop();
  return readUpcomingRevisions(workshop.id, workshop.timezone, 50);
}

export async function searchDashboard(query: string): Promise<DashboardSearchResult> {
  const workshop = await readDashboardWorkshop();
  const cleanQuery = query.trim().replace(/\s+/g, " ");
  if (cleanQuery.length < 2) {
    return { query: cleanQuery, vehicles: [], activeWorkOrders: [], historyWorkOrders: [] };
  }

  const [vehicles, activeWorkOrders, historyWorkOrders] = await Promise.all([
    readSearchVehicles(workshop.id, cleanQuery),
    readSearchWorkOrders(workshop.id, cleanQuery, true),
    readSearchWorkOrders(workshop.id, cleanQuery, false),
  ]);

  return {
    query: cleanQuery,
    vehicles,
    activeWorkOrders,
    historyWorkOrders,
  };
}

export async function getWorkOrderDetail(id: string): Promise<DashboardWorkOrderDetail> {
  const workshop = await readDashboardWorkshop();
  const { data: workOrder, error } = await supabaseServer
    .from("work_orders")
    .select("id,workshop_id,vehicle_id,customer_id,public_code,plate_snapshot,plate_normalized,vehicle_model_snapshot,customer_name_snapshot,customer_phone_snapshot,status,reported_issue,kilometers,intake_completed_at,ready_at,collected_at,archived_at,row_version,created_at,updated_at")
    .eq("workshop_id", workshop.id)
    .eq("id", id)
    .maybeSingle();

  if (error) throw new Error(`Failed to read work order: ${error.message}`);
  if (!workOrder) throw new AppError("Work order not found", { statusCode: 404, parseStatus: "not_found" });

  const [totalsById, revisionsByVehicle, notes, items, attachments, documents, auditActivity, revisionActivity] = await Promise.all([
    readTotalsByWorkOrderIds(workshop.id, [workOrder.id]),
    readRevisionByVehicleIds(workshop.id, [workOrder.vehicle_id]),
    readNotes(workshop.id, workOrder.id),
    readItems(workshop.id, workOrder.id),
    readAttachments(workshop.id, workOrder.id),
    readDocuments(workshop.id, workOrder.id),
    readRecentActivity(workshop.id, 30, workOrder.id),
    readRevisionActivity(workshop.id, workOrder.vehicle_id, {
      workOrderId: workOrder.id,
      publicCode: workOrder.public_code,
      plate: workOrder.plate_normalized,
    }, 10),
  ]);

  const summary = toWorkOrderSummary(workOrder, totalsById.get(workOrder.id), revisionsByVehicle.get(workOrder.vehicle_id) ?? null);
  const activity = [...auditActivity, ...revisionActivity]
    .sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)))
    .slice(0, 30);

  return {
    workOrder: {
      ...summary,
      rowVersion: Number(workOrder.row_version),
      intakeCompletedAt: workOrder.intake_completed_at,
      vehicleId: workOrder.vehicle_id,
      customerId: workOrder.customer_id,
    },
    notes,
    items,
    attachments,
    documents,
    activity,
  };
}

export async function getVehicleDetailByPlate(inputPlate: string): Promise<DashboardVehicleDetail> {
  const plate = assertValidPlate(inputPlate);
  const workshop = await readDashboardWorkshop();
  const { data: vehicle, error } = await supabaseServer
    .from("vehicles")
    .select("id,workshop_id,customer_id,plate,plate_normalized,model,revision_due_date,revision_reminder_enabled,revision_appointment_date,revision_appointment_time,row_version,created_at,updated_at")
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

  const activeWorkOrder = workOrders.find((workOrder) => ACTIVE_STATUSES.includes(workOrder.status)) ?? null;

  return {
    vehicle: {
      id: vehicle.id,
      plate: vehicle.plate_normalized,
      model: vehicle.model,
      revisionDueDate: vehicle.revision_due_date,
      revisionReminderEnabled: vehicle.revision_reminder_enabled,
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

export async function readWorkOrderForMutation(id: string): Promise<{ workshopId: string; plate: string; vehicleId: string; status: WorkOrderStatus }> {
  const workshop = await readDashboardWorkshop();
  const { data, error } = await supabaseServer
    .from("work_orders")
    .select("id,workshop_id,vehicle_id,plate_normalized,status")
    .eq("workshop_id", workshop.id)
    .eq("id", id)
    .maybeSingle();

  if (error) throw new Error(`Failed to read work order: ${error.message}`);
  if (!data) throw new AppError("Work order not found", { statusCode: 404, parseStatus: "not_found" });
  return { workshopId: data.workshop_id, plate: data.plate_normalized, vehicleId: data.vehicle_id, status: data.status as WorkOrderStatus };
}

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

export async function readDashboardWorkshop(): Promise<{ id: string; name: string; timezone: string }> {
  const configuredWorkshopId = process.env.Criccheto_DASHBOARD_WORKSHOP_ID ?? process.env.Criccheto_WORKSHOP_ID;
  let query = supabaseServer.from("workshops").select("id,name,display_name,timezone").order("created_at", { ascending: true }).limit(1);
  if (configuredWorkshopId) {
    query = supabaseServer.from("workshops").select("id,name,display_name,timezone").eq("id", configuredWorkshopId).limit(1);
  }

  const { data, error } = await query.maybeSingle();
  if (error) throw new Error(`Failed to read workshop: ${error.message}`);
  if (!data) throw new Error("No workshop configured for dashboard");
  return { id: data.id, name: (data as any).display_name ?? data.name, timezone: data.timezone };
}

async function readSearchVehicles(workshopId: string, query: string): Promise<DashboardSearchVehicle[]> {
  const plateQuery = normalizePlate(query).replace(/[%_]/g, "");
  const nameQuery = query.replace(/[%_]/g, "");
  const vehiclesById = new Map<string, any>();

  if (plateQuery.length >= 2) {
    const { data, error } = await supabaseServer
      .from("vehicles")
      .select("id,customer_id,plate_normalized,model,revision_due_date,updated_at")
      .eq("workshop_id", workshopId)
      .ilike("plate_normalized", `%${plateQuery}%`)
      .order("updated_at", { ascending: false })
      .limit(8);
    if (error) throw new Error(`Failed to search vehicles by plate: ${error.message}`);
    for (const row of data ?? []) vehiclesById.set(row.id, row);
  }

  if (nameQuery.length >= 2) {
    const { data: customers, error: customerError } = await supabaseServer
      .from("customers")
      .select("id,name")
      .eq("workshop_id", workshopId)
      .ilike("name", `%${nameQuery}%`)
      .order("updated_at", { ascending: false })
      .limit(12);
    if (customerError) throw new Error(`Failed to search customers: ${customerError.message}`);

    const customerIds = (customers ?? []).map((customer) => customer.id);
    if (customerIds.length > 0) {
      const { data, error } = await supabaseServer
        .from("vehicles")
        .select("id,customer_id,plate_normalized,model,revision_due_date,updated_at")
        .eq("workshop_id", workshopId)
        .in("customer_id", customerIds)
        .order("updated_at", { ascending: false })
        .limit(12);
      if (error) throw new Error(`Failed to search vehicles by customer: ${error.message}`);
      for (const row of data ?? []) vehiclesById.set(row.id, row);
    }
  }

  const vehicles = [...vehiclesById.values()].slice(0, 12);
  const [customersById, activeByPlate] = await Promise.all([
    readCustomersByIds(workshopId, vehicles.map((vehicle) => vehicle.customer_id).filter(Boolean) as string[]),
    readActiveWorkOrdersByPlates(workshopId, vehicles.map((vehicle) => vehicle.plate_normalized)),
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

async function readSearchWorkOrders(workshopId: string, query: string, activeOnly: boolean): Promise<DashboardWorkOrderSummary[]> {
  const plateQuery = normalizePlate(query).replace(/[%_]/g, "");
  const nameQuery = query.replace(/[%_]/g, "");
  const rowsById = new Map<string, any>();

  async function addRows(column: "plate_normalized" | "customer_name_snapshot", value: string): Promise<void> {
    let request = supabaseServer
      .from("work_orders")
      .select("id,workshop_id,vehicle_id,public_code,plate_snapshot,plate_normalized,vehicle_model_snapshot,customer_name_snapshot,customer_phone_snapshot,status,reported_issue,kilometers,ready_at,collected_at,created_at,updated_at")
      .eq("workshop_id", workshopId)
      .ilike(column, `%${value}%`)
      .order("updated_at", { ascending: false })
      .limit(10);

    if (activeOnly) {
      request = request.in("status", ACTIVE_STATUSES);
    } else {
      request = request.not("status", "in", `(${ACTIVE_STATUSES.join(",")})`);
    }

    const { data, error } = await request;
    if (error) throw new Error(`Failed to search work orders: ${error.message}`);
    for (const row of data ?? []) rowsById.set(row.id, row);
  }

  if (plateQuery.length >= 2) {
    await addRows("plate_normalized", plateQuery);
  }
  if (nameQuery.length >= 2) {
    await addRows("customer_name_snapshot", nameQuery);
  }

  const rows = [...rowsById.values()]
    .sort((a, b) => String(b.updated_at).localeCompare(String(a.updated_at)))
    .slice(0, activeOnly ? 8 : 12);
  const totalsById = await readTotalsByWorkOrderIds(workshopId, rows.map((row) => row.id));
  const revisionsByVehicle = await readRevisionByVehicleIds(workshopId, rows.map((row) => row.vehicle_id));
  return rows.map((row) => toWorkOrderSummary(row, totalsById.get(row.id), revisionsByVehicle.get(row.vehicle_id) ?? null));
}

async function readWorkOrderSummaries(workshopId: string, statuses: WorkOrderStatus[], limit: number): Promise<DashboardWorkOrderSummary[]> {
  const { data, error } = await supabaseServer
    .from("work_orders")
    .select("id,workshop_id,vehicle_id,public_code,plate_snapshot,plate_normalized,vehicle_model_snapshot,customer_name_snapshot,customer_phone_snapshot,status,reported_issue,kilometers,ready_at,collected_at,created_at,updated_at")
    .eq("workshop_id", workshopId)
    .in("status", statuses)
    .order("updated_at", { ascending: false })
    .limit(limit);

  if (error) throw new Error(`Failed to read work orders: ${error.message}`);

  const rows = data ?? [];
  const totalsById = await readTotalsByWorkOrderIds(workshopId, rows.map((row) => row.id));
  const revisionsByVehicle = await readRevisionByVehicleIds(workshopId, rows.map((row) => row.vehicle_id));
  return rows.map((row) => toWorkOrderSummary(row, totalsById.get(row.id), revisionsByVehicle.get(row.vehicle_id) ?? null));
}

async function readWorkOrderHistoryByPlate(workshopId: string, plate: string): Promise<DashboardWorkOrderSummary[]> {
  const { data, error } = await supabaseServer
    .from("work_orders")
    .select("id,workshop_id,vehicle_id,public_code,plate_snapshot,plate_normalized,vehicle_model_snapshot,customer_name_snapshot,customer_phone_snapshot,status,reported_issue,kilometers,ready_at,collected_at,created_at,updated_at")
    .eq("workshop_id", workshopId)
    .eq("plate_normalized", plate)
    .order("created_at", { ascending: false })
    .limit(50);

  if (error) throw new Error(`Failed to read vehicle work orders: ${error.message}`);

  const rows = data ?? [];
  const totalsById = await readTotalsByWorkOrderIds(workshopId, rows.map((row) => row.id));
  const revisionsByVehicle = await readRevisionByVehicleIds(workshopId, rows.map((row) => row.vehicle_id));
  return rows.map((row) => toWorkOrderSummary(row, totalsById.get(row.id), revisionsByVehicle.get(row.vehicle_id) ?? null));
}

async function readTotalsByWorkOrderIds(workshopId: string, ids: string[]): Promise<Map<string, DashboardTotals>> {
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

async function readRevisionByVehicleIds(workshopId: string, ids: string[]): Promise<Map<string, DashboardRevisionState>> {
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

async function readUpcomingRevisions(workshopId: string, timezone: string, limit: number): Promise<DashboardRevision[]> {
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
    readCustomersByIds(workshopId, rows.map((row) => row.customer_id).filter(Boolean) as string[]),
    readActiveWorkOrdersByPlates(workshopId, rows.map((row) => row.plate_normalized)),
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
        activeWorkOrderStatus: (active?.status as WorkOrderStatus | undefined) ?? null,
      };
    });
}

async function readRecentActivity(workshopId: string, limit: number, workOrderId?: string): Promise<DashboardActivity[]> {
  let query = supabaseServer
    .from("work_order_audit_events")
    .select("id,event_type,actor_type,actor_ref,work_order_id,created_at")
    .eq("workshop_id", workshopId)
    .order("created_at", { ascending: false })
    .limit(limit);

  if (workOrderId) {
    query = query.eq("work_order_id", workOrderId);
  }

  const { data, error } = await query;
  if (error) throw new Error(`Failed to read activity: ${error.message}`);

  const events = data ?? [];
  const workOrdersById = await readWorkOrderIdentityByIds(workshopId, events.map((event) => event.work_order_id).filter(Boolean) as string[]);
  return events.map((event) => {
    const workOrder = event.work_order_id ? workOrdersById.get(event.work_order_id) : null;
    return {
      id: event.id,
      eventType: event.event_type,
      actorType: event.actor_type,
      actorRef: event.actor_ref,
      createdAt: event.created_at,
      workOrderId: event.work_order_id,
      publicCode: workOrder?.public_code ?? null,
      plate: workOrder?.plate_normalized ?? null,
    };
  });
}

async function readRevisionActivity(
  workshopId: string,
  vehicleId: string,
  identity: { workOrderId: string; publicCode: string; plate: string },
  limit: number,
): Promise<DashboardActivity[]> {
  const { data, error } = await supabaseServer
    .from("vehicle_revision_events")
    .select("id,source,created_by,created_at")
    .eq("workshop_id", workshopId)
    .eq("vehicle_id", vehicleId)
    .order("created_at", { ascending: false })
    .limit(limit);

  if (error) throw new Error(`Failed to read revision activity: ${error.message}`);

  return (data ?? []).map((row) => ({
    id: `revision:${row.id}`,
    eventType: "revision_updated",
    actorType: row.source === "dashboard" ? "dashboard_user" : row.source,
    actorRef: row.created_by,
    createdAt: row.created_at,
    workOrderId: identity.workOrderId,
    publicCode: identity.publicCode,
    plate: identity.plate,
  }));
}

async function readNotes(workshopId: string, workOrderId: string): Promise<DashboardNote[]> {
  const { data, error } = await supabaseServer
    .from("work_order_notes")
    .select("id,note,source,created_by,created_at")
    .eq("workshop_id", workshopId)
    .eq("work_order_id", workOrderId)
    .is("voided_at", null)
    .order("created_at", { ascending: false });

  if (error) throw new Error(`Failed to read notes: ${error.message}`);
  return (data ?? []).map((row) => ({
    id: row.id,
    note: row.note,
    source: row.source,
    createdBy: row.created_by,
    createdAt: row.created_at,
  }));
}

async function readItems(workshopId: string, workOrderId: string): Promise<DashboardItem[]> {
  const { data, error } = await supabaseServer
    .from("work_order_items")
    .select("id,item_type,description,quantity,unit_price,source,created_by,created_at")
    .eq("workshop_id", workshopId)
    .eq("work_order_id", workOrderId)
    .is("voided_at", null)
    .order("created_at", { ascending: true });

  if (error) throw new Error(`Failed to read items: ${error.message}`);
  return (data ?? []).map((row) => {
    const quantity = Number(row.quantity);
    const unitPrice = Number(row.unit_price);
    return {
      id: row.id,
      itemType: row.item_type,
      description: row.description,
      quantity,
      unitPrice,
      rowTotal: quantity * unitPrice,
      source: row.source,
      createdBy: row.created_by,
      createdAt: row.created_at,
    };
  });
}

async function readDocuments(workshopId: string, workOrderId: string): Promise<DashboardDocument[]> {
  await reconcileStaleDocuments({ workshopId, workOrderId });
  const { data, error } = await supabaseServer
    .from("documents")
    .select("id,document_type,status,version,storage_bucket,storage_path,filename,generated_at,created_at,metadata")
    .eq("workshop_id", workshopId)
    .eq("work_order_id", workOrderId)
    .order("created_at", { ascending: false });

  if (error) throw new Error(`Failed to read documents: ${error.message}`);

  return Promise.all((data ?? []).map(async (row) => {
    let downloadUrl: string | null = null;
    const status = normalizeDashboardDocumentStatus(row.status);
    let statusMessage = documentStatusMessage(status, row.metadata);
    if (status === "ready" && row.storage_bucket && row.storage_path) {
      const { data: signed, error: signError } = await supabaseServer.storage.from(row.storage_bucket).createSignedUrl(row.storage_path, 300);
      downloadUrl = signed?.signedUrl ?? null;
      if (!downloadUrl && signError) {
        statusMessage = "PDF generato, ma link temporaneo non disponibile.";
      }
    }

    return {
      id: row.id,
      documentType: row.document_type,
      status,
      version: Number(row.version),
      filename: row.filename,
      generatedAt: row.generated_at,
      downloadUrl,
      statusMessage,
      createdAt: row.created_at,
    };
  }));
}

function documentStatusMessage(status: DocumentStatus, metadata: unknown): string | null {
  const value = metadata && typeof metadata === "object" && !Array.isArray(metadata)
    ? metadata as Record<string, unknown>
    : {};
  if (status === "failed") {
    return typeof value.error_message === "string" && value.error_message
      ? value.error_message
      : "Generazione fallita. Controlla il worker documenti.";
  }
  if (status === "pending") {
    return "In attesa del worker documenti.";
  }
  if (status === "generating") {
    return "Generazione in corso.";
  }
  return null;
}

async function readAttachments(workshopId: string, workOrderId: string): Promise<DashboardAttachment[]> {
  const { data, error } = await supabaseServer
    .from("attachments")
    .select("id,attachment_type,storage_bucket,storage_path,mime_type,filename,created_by,captured_at,created_at,metadata")
    .eq("workshop_id", workshopId)
    .eq("work_order_id", workOrderId)
    .order("created_at", { ascending: false });

  if (error) {
    throw new Error(`Failed to read attachments: ${error.message}`);
  }

  return Promise.all((data ?? []).map(async (row) => {
    const metadata = (row.metadata ?? {}) as Record<string, unknown>;
    const { data: signed } = await supabaseServer.storage.from(row.storage_bucket).createSignedUrl(row.storage_path, 300);
    const signedUrl = signed?.signedUrl ?? null;
    const mimeType = row.mime_type ?? null;
    return {
      id: row.id,
      attachmentType: row.attachment_type,
      filename: row.filename,
      mimeType,
      createdBy: row.created_by,
      createdAt: row.created_at,
      capturedAt: row.captured_at,
      fileSize: typeof metadata.fileSize === "number" ? metadata.fileSize : null,
      source: typeof metadata.source === "string" ? metadata.source : null,
      previewUrl: isPreviewableAttachment(row.attachment_type, mimeType) ? signedUrl : null,
      downloadUrl: signedUrl,
      transcriptionStatus: typeof metadata.transcriptionStatus === "string" ? metadata.transcriptionStatus : null,
    } satisfies DashboardAttachment;
  }));
}

function normalizeDashboardDocumentStatus(status: string): DocumentStatus {
  if (status === "generated") {
    return "ready";
  }
  if (status === "pending" || status === "generating" || status === "ready" || status === "failed" || status === "void") {
    return status;
  }
  return "failed";
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

async function readCustomersByIds(workshopId: string, customerIds: string[]): Promise<Map<string, { name: string }>> {
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

async function readActiveWorkOrdersByPlates(workshopId: string, plates: string[]): Promise<Map<string, { id: string; status: string }>> {
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

async function readWorkOrderIdentityByIds(workshopId: string, ids: string[]): Promise<Map<string, { public_code: string; plate_normalized: string }>> {
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

function toWorkOrderSummary(row: any, totals?: DashboardTotals, revisionState?: DashboardRevisionState | null): DashboardWorkOrderSummary {
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

function countOverdue(revisions: DashboardRevision[], timezone: string): number {
  const today = getLocalDate(timezone);
  return revisions.filter((revision) => revision.revisionDueDate < today).length;
}

function isPreviewableAttachment(type: DashboardAttachment["attachmentType"], mimeType: string | null): boolean {
  return type === "photo"
    || type === "audio"
    || Boolean(
      mimeType?.startsWith("image/")
      || mimeType?.startsWith("audio/")
      || mimeType?.startsWith("video/"),
    );
}
