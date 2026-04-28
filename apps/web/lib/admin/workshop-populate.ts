import "server-only";

import { supabaseServer } from "../supabase-server";
import { createDashboardWorkOrder } from "../work-orders";

export interface DemoPopulateCounts {
  created: number;
  skipped: string[];
  items_created: number;
}

interface DemoPart {
  description: string;
  quantity: number;
  unit_price: number;
}

interface DemoRecord {
  plate: string;
  firstName: string;
  lastName: string;
  phone: string;
  vehicleModel: string;
  reportedIssue: string;
  kilometers: number;
  targetStatus: "accepted" | "in_progress" | "ready";
  parts: DemoPart[];
  laborHours: number;
  note: string;
}

const DEMO_RECORDS: DemoRecord[] = [
  {
    plate: "AB472CD",
    firstName: "Marco",
    lastName: "Bianchi",
    phone: "+39331000001",
    vehicleModel: "Fiat Panda 1.2",
    reportedIssue: "Tagliando periodico 60.000 km",
    kilometers: 60000,
    targetStatus: "in_progress",
    parts: [
      { description: "Olio motore 5W30", quantity: 1, unit_price: 28.0 },
      { description: "Filtro olio", quantity: 1, unit_price: 8.5 },
      { description: "Filtro aria", quantity: 1, unit_price: 12.0 },
    ],
    laborHours: 1.5,
    note: "Cliente preferisce olio sintetico full.",
  },
  {
    plate: "MI839LK",
    firstName: "Laura",
    lastName: "Conti",
    phone: "+39331000002",
    vehicleModel: "Volkswagen Golf",
    reportedIssue: "Rumore in frenata e controllo pastiglie",
    kilometers: 45000,
    targetStatus: "ready",
    parts: [
      { description: "Pastiglie freno anteriori", quantity: 1, unit_price: 42.0 },
      { description: "Pulizia pinze", quantity: 1, unit_price: 15.0 },
    ],
    laborHours: 2,
    note: "Verificate anche le posteriori — OK, non sostituire.",
  },
  {
    plate: "TO261EF",
    firstName: "Davide",
    lastName: "Romano",
    phone: "+39331000003",
    vehicleModel: "BMW Serie 1",
    reportedIssue: "Diagnosi spia ABS accesa",
    kilometers: 82000,
    targetStatus: "in_progress",
    parts: [{ description: "Diagnosi elettronica", quantity: 1, unit_price: 35.0 }],
    laborHours: 1,
    note: "Sensore ABS anteriore sinistro probabilmente guasto.",
  },
  {
    plate: "RM714VX",
    firstName: "Giulia",
    lastName: "Ferri",
    phone: "+39331000004",
    vehicleModel: "Ford Fiesta",
    reportedIssue: "Revisione e controllo generale",
    kilometers: 29000,
    targetStatus: "accepted",
    parts: [
      { description: "Controllo livelli", quantity: 1, unit_price: 0 },
      { description: "Controllo luci", quantity: 1, unit_price: 0 },
    ],
    laborHours: 1,
    note: "Tutto OK. Revisione scade il mese prossimo.",
  },
  {
    plate: "BS908NP",
    firstName: "Andrea",
    lastName: "Gallo",
    phone: "+39331000005",
    vehicleModel: "Audi A3 Sportback",
    reportedIssue: "Batteria scarica e controllo alternatore",
    kilometers: 68000,
    targetStatus: "ready",
    parts: [{ description: "Batteria 70Ah", quantity: 1, unit_price: 95.0 }],
    laborHours: 1,
    note: "Alternatore OK. Solo batteria sostituita.",
  },
];

export async function populateDemoWorkshopData(workshopId: string): Promise<DemoPopulateCounts> {
  const { data: settings, error: settingsError } = await (supabaseServer as any)
    .from("workshop_settings")
    .select("hourly_rate")
    .eq("workshop_id", workshopId)
    .single();

  if (settingsError || !settings) {
    throw new Error("Impossibile leggere le impostazioni officina demo.");
  }

  const hourlyRate = Number(settings.hourly_rate);

  const demoPlatePlates = DEMO_RECORDS.map((r) => r.plate);
  const { data: existingVehicles } = await (supabaseServer as any)
    .from("vehicles")
    .select("plate_normalized")
    .eq("workshop_id", workshopId)
    .in("plate_normalized", demoPlatePlates);

  const existingPlates = new Set<string>(
    ((existingVehicles as Array<{ plate_normalized: string }>) ?? []).map((v) => v.plate_normalized),
  );

  let created = 0;
  let items_created = 0;
  const skipped: string[] = [];

  for (const record of DEMO_RECORDS) {
    if (existingPlates.has(record.plate)) {
      skipped.push(record.plate);
      continue;
    }

    const { workOrderId } = await createDashboardWorkOrder({
      workshopId,
      plate: record.plate,
      vehicleModel: record.vehicleModel,
      reportedIssue: record.reportedIssue,
      kilometers: record.kilometers,
      customerFirstName: record.firstName,
      customerLastName: record.lastName,
      customerPhone: record.phone,
      actorRef: "demo-seed",
    });

    created++;

    for (const part of record.parts) {
      const { error: partError } = await (supabaseServer as any)
        .from("work_order_items")
        .insert({
          workshop_id: workshopId,
          work_order_id: workOrderId,
          item_type: "part",
          description: part.description,
          quantity: part.quantity,
          unit_price: part.unit_price,
          source: "dashboard",
          created_by: "demo-seed",
        });
      if (partError) {
        throw new Error(`Errore ricambio "${part.description}" (${record.plate}): ${partError.message}`);
      }
      items_created++;
    }

    if (record.laborHours > 0) {
      const { error: laborError } = await (supabaseServer as any)
        .from("work_order_items")
        .insert({
          workshop_id: workshopId,
          work_order_id: workOrderId,
          item_type: "labor",
          description: "Manodopera",
          quantity: record.laborHours,
          unit_price: hourlyRate,
          source: "dashboard",
          created_by: "demo-seed",
        });
      if (laborError) {
        throw new Error(`Errore manodopera (${record.plate}): ${laborError.message}`);
      }
      items_created++;
    }

    if (record.note) {
      const { error: noteError } = await (supabaseServer as any)
        .from("work_order_notes")
        .insert({
          workshop_id: workshopId,
          work_order_id: workOrderId,
          note: record.note,
          source: "dashboard",
          created_by: "demo-seed",
        });
      if (noteError) {
        throw new Error(`Errore nota (${record.plate}): ${noteError.message}`);
      }
    }

    if (record.targetStatus !== "accepted") {
      const update: Record<string, unknown> = { status: record.targetStatus };
      if (record.targetStatus === "ready") {
        update.ready_at = new Date().toISOString();
      }
      const { error: statusError } = await (supabaseServer as any)
        .from("work_orders")
        .update(update)
        .eq("workshop_id", workshopId)
        .eq("id", workOrderId);
      if (statusError) {
        throw new Error(`Errore aggiornamento stato (${record.plate}): ${statusError.message}`);
      }
    }
  }

  return { created, skipped, items_created };
}
