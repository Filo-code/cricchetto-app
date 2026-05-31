import { AppError } from "../errors";
import { reconcileStaleDocuments } from "../documents";
import { supabaseServer } from "../supabase-server";
import {
  readDashboardWorkshop,
  readTotalsByWorkOrderIds,
  readRevisionByVehicleIds,
  readWorkOrderIdentityByIds,
  toWorkOrderSummary,
  normalizeDashboardDocumentStatus,
  documentStatusMessage,
  isPreviewableAttachment,
  ACTIVE_STATUSES,
  WORK_ORDER_FILTER_STATUSES,
  WO_SELECT_COLS,
} from "./read-core";
import type { WorkOrderStatus } from "../types";
import type {
  DashboardActivity,
  DashboardAttachment,
  DashboardDocument,
  DashboardItem,
  DashboardNote,
  DashboardWorkOrderDetail,
  DashboardWorkOrderSummary,
} from "./types";

export { ACTIVE_STATUSES, WORK_ORDER_FILTER_STATUSES };

export async function readWorkOrderSummaries(workshopId: string, statuses: WorkOrderStatus[], limit: number): Promise<DashboardWorkOrderSummary[]> {
  const { data, error } = await supabaseServer
    .from("work_orders")
    .select(WO_SELECT_COLS)
    .eq("workshop_id", workshopId)
    .in("status", statuses)
    .order("updated_at", { ascending: false })
    .limit(limit);

  if (error) throw new Error(`Failed to read work orders: ${error.message}`);

  const rows = data ?? [];
  const totalsById = await readTotalsByWorkOrderIds(workshopId, rows.map((r) => r.id));
  const revisionsByVehicle = await readRevisionByVehicleIds(workshopId, rows.map((r) => r.vehicle_id));
  return rows.map((r) => toWorkOrderSummary(r, totalsById.get(r.id), revisionsByVehicle.get(r.vehicle_id) ?? null));
}

export async function readWorkOrderHistoryByPlate(workshopId: string, plate: string): Promise<DashboardWorkOrderSummary[]> {
  const { data, error } = await supabaseServer
    .from("work_orders")
    .select(WO_SELECT_COLS)
    .eq("workshop_id", workshopId)
    .eq("plate_normalized", plate)
    .order("created_at", { ascending: false })
    .limit(50);

  if (error) throw new Error(`Failed to read vehicle work orders: ${error.message}`);

  const rows = data ?? [];
  const totalsById = await readTotalsByWorkOrderIds(workshopId, rows.map((r) => r.id));
  const revisionsByVehicle = await readRevisionByVehicleIds(workshopId, rows.map((r) => r.vehicle_id));
  return rows.map((r) => toWorkOrderSummary(r, totalsById.get(r.id), revisionsByVehicle.get(r.vehicle_id) ?? null));
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

export interface DashboardMessageLog {
  id: string;
  channel: string;
  provider: string;
  providerStatus: string | null;
  providerMessageId: string | null;
  recipientIdentifier: string | null;
  errorMessage: string | null;
  relatedDocumentId: string | null;
  relatedReminderId: string | null;
  createdAt: string;
}

export interface DashboardCustomerVehicleData {
  customerId: string | null;
  customerName: string | null;
  customerPhone: string | null;
  vehicleId: string;
  vehiclePlate: string;
  vehicleModel: string | null;
}

export async function readWorkOrderMessageLogs(workOrderId: string): Promise<DashboardMessageLog[]> {
  const workshop = await readDashboardWorkshop();
  const { data, error } = await supabaseServer
    .from("message_logs")
    .select("id,channel,provider,provider_status,provider_message_id,recipient_identifier,error_message,related_document_id,related_reminder_id,created_at")
    .eq("workshop_id", workshop.id)
    .eq("direction", "outbound")
    .eq("related_work_order_id", workOrderId)
    .order("created_at", { ascending: false })
    .limit(50);

  if (error) throw new Error(`Failed to read message logs: ${error.message}`);
  return (data ?? []).map((row) => ({
    id: row.id,
    channel: row.channel,
    provider: row.provider,
    providerStatus: row.provider_status ?? null,
    providerMessageId: row.provider_message_id ?? null,
    recipientIdentifier: row.recipient_identifier ?? null,
    errorMessage: row.error_message ?? null,
    relatedDocumentId: row.related_document_id ?? null,
    relatedReminderId: row.related_reminder_id ?? null,
    createdAt: row.created_at,
  }));
}

export async function readCustomerAndVehicleForEdit(workOrderId: string): Promise<DashboardCustomerVehicleData> {
  const workshop = await readDashboardWorkshop();
  const { data: wo, error: woErr } = await supabaseServer
    .from("work_orders")
    .select("vehicle_id,customer_id")
    .eq("workshop_id", workshop.id)
    .eq("id", workOrderId)
    .maybeSingle();

  if (woErr) throw new Error(`Failed to read work order: ${woErr.message}`);
  if (!wo) throw new AppError("Work order not found", { statusCode: 404, parseStatus: "not_found" });

  const { data: vehicle, error: vErr } = await supabaseServer
    .from("vehicles")
    .select("id,plate,plate_normalized,model")
    .eq("workshop_id", workshop.id)
    .eq("id", wo.vehicle_id)
    .maybeSingle();

  if (vErr) throw new Error(`Failed to read vehicle: ${vErr.message}`);
  if (!vehicle) throw new AppError("Vehicle not found", { statusCode: 404, parseStatus: "not_found" });

  let customerName: string | null = null;
  let customerPhone: string | null = null;
  if (wo.customer_id) {
    const { data: customer } = await supabaseServer
      .from("customers")
      .select("name,phone")
      .eq("workshop_id", workshop.id)
      .eq("id", wo.customer_id)
      .maybeSingle();
    if (customer) {
      customerName = customer.name;
      customerPhone = customer.phone ?? null;
    }
  }

  return {
    customerId: wo.customer_id ?? null,
    customerName,
    customerPhone,
    vehicleId: vehicle.id,
    vehiclePlate: (vehicle as any).plate ?? (vehicle as any).plate_normalized,
    vehicleModel: vehicle.model ?? null,
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

export async function readRecentActivity(workshopId: string, limit: number, workOrderId?: string): Promise<DashboardActivity[]> {
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
  const workOrdersById = await readWorkOrderIdentityByIds(workshopId, events.map((e) => e.work_order_id).filter(Boolean) as string[]);
  return events.map((event) => {
    const wo = event.work_order_id ? workOrdersById.get(event.work_order_id) : null;
    return {
      id: event.id,
      eventType: event.event_type,
      actorType: event.actor_type,
      actorRef: event.actor_ref,
      createdAt: event.created_at,
      workOrderId: event.work_order_id,
      publicCode: wo?.public_code ?? null,
      plate: wo?.plate_normalized ?? null,
    };
  });
}

export async function readRevisionActivity(
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

async function readAttachments(workshopId: string, workOrderId: string): Promise<DashboardAttachment[]> {
  const { data, error } = await supabaseServer
    .from("attachments")
    .select("id,attachment_type,storage_bucket,storage_path,mime_type,filename,created_by,captured_at,created_at,metadata")
    .eq("workshop_id", workshopId)
    .eq("work_order_id", workOrderId)
    .is("deleted_at", null)
    .order("created_at", { ascending: false });

  if (error) throw new Error(`Failed to read attachments: ${error.message}`);

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
