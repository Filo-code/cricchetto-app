import { supabaseServer } from "../supabase-server";
import { normalizePlate } from "../plates";
import { mergeByKey } from "./query-utils";
import { rankSuggestions } from "../search/fuzzy-search";
import {
  readDashboardWorkshop,
  readTotalsByWorkOrderIds,
  readRevisionByVehicleIds,
  toWorkOrderSummary,
  ACTIVE_STATUSES,
  WO_SELECT_COLS,
} from "./read-core";
import { readSearchVehicles } from "./read-vehicles";
import type { WorkOrderStatus } from "../types";
import type { DashboardSearchResult, DashboardWorkOrderSummary, SearchSuggestion } from "./types";

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

  return { query: cleanQuery, vehicles, activeWorkOrders, historyWorkOrders };
}

export async function readDashboardSearchSuggestions(query: string): Promise<SearchSuggestion[]> {
  const workshop = await readDashboardWorkshop();
  const clean = query.trim().replace(/\s+/g, " ");
  if (clean.length < 2) return [];

  const [vehicles, orders] = await Promise.all([
    readSearchVehicles(workshop.id, clean),
    readActiveSuggestionOrders(workshop.id, clean),
  ]);

  const activePlates = new Set(orders.map((o) => o.plate));

  const vehicleSuggestions: SearchSuggestion[] = vehicles
    .filter((v) => !activePlates.has(v.plate))
    .map((v) => ({ kind: "vehicle" as const, ...v, score: 0 }));

  const orderSuggestions: SearchSuggestion[] = orders.map((o) => ({
    kind: "work_order" as const,
    workOrderId: o.id,
    publicCode: o.publicCode,
    plate: o.plate,
    customerName: o.customerName,
    vehicleModel: o.vehicleModel,
    status: o.status,
    score: 0,
  }));

  const all = [...vehicleSuggestions, ...orderSuggestions];

  const ranked = rankSuggestions(
    clean,
    all,
    (s) => [
      s.plate,
      s.customerName ?? "",
      s.kind === "vehicle" ? (s.model ?? "") : (s.vehicleModel ?? ""),
      s.kind === "work_order" ? s.publicCode : "",
    ],
  );

  return ranked.slice(0, 8);
}

async function readSearchWorkOrders(workshopId: string, query: string, activeOnly: boolean): Promise<DashboardWorkOrderSummary[]> {
  const plateQuery = normalizePlate(query).replace(/[%_]/g, "");
  const nameQuery = query.replace(/[%_]/g, "");

  const fetchWorkOrders = (column: "plate_normalized" | "customer_name_snapshot", value: string) => async () => {
    let request = supabaseServer
      .from("work_orders")
      .select(WO_SELECT_COLS)
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
    return data ?? [];
  };

  const rowsById = await mergeByKey(
    [
      plateQuery.length >= 2 ? fetchWorkOrders("plate_normalized", plateQuery) : null,
      nameQuery.length >= 2 ? fetchWorkOrders("customer_name_snapshot", nameQuery) : null,
    ].filter((q): q is () => Promise<any[]> => q !== null),
    (row) => row.id as string,
  );

  const rows = [...rowsById.values()]
    .sort((a, b) => String(b.updated_at).localeCompare(String(a.updated_at)))
    .slice(0, activeOnly ? 8 : 12);
  const totalsById = await readTotalsByWorkOrderIds(workshopId, rows.map((r) => r.id));
  const revisionsByVehicle = await readRevisionByVehicleIds(workshopId, rows.map((r) => r.vehicle_id));
  return rows.map((r) => toWorkOrderSummary(r, totalsById.get(r.id), revisionsByVehicle.get(r.vehicle_id) ?? null));
}

interface SuggestionOrder {
  id: string;
  publicCode: string;
  plate: string;
  customerName: string | null;
  vehicleModel: string | null;
  status: WorkOrderStatus;
}

async function readActiveSuggestionOrders(workshopId: string, query: string): Promise<SuggestionOrder[]> {
  const plateQuery = normalizePlate(query).replace(/[%_]/g, "");
  const nameQuery = query.replace(/[%_]/g, "");

  const WO_SELECT = "id,public_code,plate_normalized,customer_name_snapshot,vehicle_model_snapshot,status";

  const byPlate = plateQuery.length >= 2
    ? supabaseServer.from("work_orders").select(WO_SELECT).eq("workshop_id", workshopId).in("status", ACTIVE_STATUSES).ilike("plate_normalized", `%${plateQuery}%`).limit(6)
    : null;

  const byName = nameQuery.length >= 2
    ? supabaseServer.from("work_orders").select(WO_SELECT).eq("workshop_id", workshopId).in("status", ACTIVE_STATUSES).ilike("customer_name_snapshot", `%${nameQuery}%`).limit(6)
    : null;

  const byModel = nameQuery.length >= 2
    ? supabaseServer.from("work_orders").select(WO_SELECT).eq("workshop_id", workshopId).in("status", ACTIVE_STATUSES).ilike("vehicle_model_snapshot", `%${nameQuery}%`).limit(6)
    : null;

  const fetches = [byPlate, byName, byModel].filter((q): q is NonNullable<typeof q> => q !== null);
  if (fetches.length === 0) return [];

  const results = await Promise.all(fetches);
  const rowsById = new Map<string, SuggestionOrder>();
  for (const { data } of results) {
    for (const row of (data ?? []) as any[]) {
      rowsById.set(row.id, {
        id: row.id,
        publicCode: row.public_code,
        plate: row.plate_normalized,
        customerName: row.customer_name_snapshot ?? null,
        vehicleModel: row.vehicle_model_snapshot ?? null,
        status: row.status as WorkOrderStatus,
      });
    }
  }

  return [...rowsById.values()].slice(0, 8);
}
