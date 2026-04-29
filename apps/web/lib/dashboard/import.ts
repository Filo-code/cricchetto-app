import { normalizePlate } from "../plates";
import { normalizeCustomerPhone } from "../phones";
import { supabaseServer } from "../supabase-server";

const MAX_ROWS = 500;
const PLATE_PATTERN = /^[A-Z0-9]{5,10}$/;
const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

export interface CsvImportPreviewResult {
  rows_total: number;
  valid_rows: number;
  invalid_rows: number;
  existing_vehicles: number;
  would_create_customers: number;
  would_create_vehicles: number;
  errors: Array<{ row: number; reason: string }>;
  csvText: string;
}

export interface CsvImportConfirmResult {
  created_customers: number;
  created_vehicles: number;
  skipped_existing: number;
  errors: Array<{ row: number; reason: string }>;
}

interface ParsedRow {
  rowIndex: number;
  plate: string;
  customerName: string;
  customerPhone: string | null;
  vehicleModel: string;
  revisionDueDate: string | null;
}

export async function previewCsvImport(csvText: string, workshopId: string): Promise<CsvImportPreviewResult> {
  const { rows, errors } = parseCsvRows(csvText);

  const plates = rows.map((r) => r.plate);
  const existingPlates = plates.length > 0 ? await checkExistingVehicles(workshopId, plates) : new Set<string>();

  const existingCount = rows.filter((r) => existingPlates.has(r.plate)).length;
  const newRows = rows.filter((r) => !existingPlates.has(r.plate));

  const uniquePhones = new Set<string>();
  let noPhoneCount = 0;
  for (const row of newRows) {
    if (row.customerPhone) {
      uniquePhones.add(row.customerPhone);
    } else {
      noPhoneCount++;
    }
  }

  const existingPhones = uniquePhones.size > 0
    ? await checkExistingCustomers(workshopId, [...uniquePhones])
    : new Set<string>();

  const newCustomers = (uniquePhones.size - existingPhones.size) + noPhoneCount;

  return {
    rows_total: rows.length + errors.length,
    valid_rows: rows.length,
    invalid_rows: errors.length,
    existing_vehicles: existingCount,
    would_create_customers: Math.max(0, newCustomers),
    would_create_vehicles: rows.length - existingCount,
    errors,
    csvText,
  };
}

export async function confirmCsvImport(csvText: string, workshopId: string): Promise<CsvImportConfirmResult> {
  const { rows, errors } = parseCsvRows(csvText);

  let createdCustomers = 0;
  let createdVehicles = 0;
  let skippedExisting = 0;
  const confirmErrors: Array<{ row: number; reason: string }> = [...errors];

  for (const row of rows) {
    try {
      const result = await importSingleRow(workshopId, row);
      if (result.vehicleCreated) {
        createdVehicles++;
      } else {
        skippedExisting++;
      }
      if (result.customerCreated) {
        createdCustomers++;
      }
    } catch (err) {
      confirmErrors.push({
        row: row.rowIndex,
        reason: err instanceof Error ? err.message.slice(0, 100) : "Errore importazione",
      });
    }
  }

  return { created_customers: createdCustomers, created_vehicles: createdVehicles, skipped_existing: skippedExisting, errors: confirmErrors };
}

async function importSingleRow(workshopId: string, row: ParsedRow): Promise<{ vehicleCreated: boolean; customerCreated: boolean }> {
  const { data: existingVehicle } = await supabaseServer
    .from("vehicles")
    .select("id")
    .eq("workshop_id", workshopId)
    .eq("plate_normalized", row.plate)
    .maybeSingle();

  if (existingVehicle) {
    return { vehicleCreated: false, customerCreated: false };
  }

  let customerId: string | null = null;
  let customerCreated = false;

  if (row.customerPhone) {
    const { data: existingCustomer } = await supabaseServer
      .from("customers")
      .select("id")
      .eq("workshop_id", workshopId)
      .eq("phone_normalized", row.customerPhone)
      .maybeSingle();

    if (existingCustomer) {
      customerId = existingCustomer.id;
    } else {
      const { data: newCustomer, error: customerError } = await supabaseServer
        .from("customers")
        .insert({
          workshop_id: workshopId,
          name: row.customerName || "Cliente importato",
          phone: row.customerPhone,
          phone_normalized: row.customerPhone,
        })
        .select("id")
        .single();

      if (customerError) {
        if (customerError.code === "23505") {
          const { data: racedCustomer } = await supabaseServer
            .from("customers")
            .select("id")
            .eq("workshop_id", workshopId)
            .eq("phone_normalized", row.customerPhone)
            .maybeSingle();
          customerId = racedCustomer?.id ?? null;
        } else {
          throw new Error(`Cliente: ${customerError.message}`);
        }
      } else if (newCustomer) {
        customerId = newCustomer.id;
        customerCreated = true;
      }
    }
  } else if (row.customerName) {
    const { data: newCustomer, error: customerError } = await supabaseServer
      .from("customers")
      .insert({
        workshop_id: workshopId,
        name: row.customerName,
        phone: null,
        phone_normalized: null,
      })
      .select("id")
      .single();

    if (!customerError && newCustomer) {
      customerId = newCustomer.id;
      customerCreated = true;
    }
  }

  const vehicleInsert: Record<string, unknown> = {
    workshop_id: workshopId,
    plate: row.plate,
    plate_normalized: row.plate,
    model: row.vehicleModel || null,
    customer_id: customerId,
  };

  if (row.revisionDueDate) {
    vehicleInsert.revision_due_date = row.revisionDueDate;
  }

  const { error: vehicleError } = await supabaseServer.from("vehicles").insert(vehicleInsert);

  if (vehicleError) {
    if (vehicleError.code === "23505") {
      return { vehicleCreated: false, customerCreated };
    }
    throw new Error(`Veicolo: ${vehicleError.message}`);
  }

  return { vehicleCreated: true, customerCreated };
}

async function checkExistingVehicles(workshopId: string, plates: string[]): Promise<Set<string>> {
  const { data } = await supabaseServer
    .from("vehicles")
    .select("plate_normalized")
    .eq("workshop_id", workshopId)
    .in("plate_normalized", plates);
  return new Set((data ?? []).map((v: { plate_normalized: string }) => v.plate_normalized));
}

async function checkExistingCustomers(workshopId: string, phones: string[]): Promise<Set<string>> {
  const { data } = await supabaseServer
    .from("customers")
    .select("phone_normalized")
    .eq("workshop_id", workshopId)
    .in("phone_normalized", phones);
  return new Set(
    (data ?? [])
      .map((c: { phone_normalized: string | null }) => c.phone_normalized)
      .filter((p): p is string => Boolean(p)),
  );
}

function parseCsvRows(csvText: string): { rows: ParsedRow[]; errors: Array<{ row: number; reason: string }> } {
  const text = csvText.startsWith("﻿") ? csvText.slice(1) : csvText;
  const lines = text.split(/\r?\n/).filter((line) => line.trim());

  if (lines.length === 0) {
    return { rows: [], errors: [{ row: 0, reason: "File vuoto" }] };
  }

  const headerCols = parseCSVLine(lines[0].toLowerCase());
  const plateIdx = findColumnIndex(headerCols, ["plate", "targa"]);
  const customerNameIdx = findColumnIndex(headerCols, ["customer_name", "nome_cliente", "cliente", "nome"]);
  const customerPhoneIdx = findColumnIndex(headerCols, ["customer_phone", "telefono", "phone", "cel", "cellulare"]);
  const vehicleModelIdx = findColumnIndex(headerCols, ["vehicle_model", "modello", "model", "veicolo"]);
  const revisionDueDateIdx = findColumnIndex(headerCols, ["revision_due_date", "revisione", "scadenza_revisione"]);

  if (plateIdx < 0) {
    return { rows: [], errors: [{ row: 1, reason: "Colonna 'plate' o 'targa' non trovata nell'intestazione" }] };
  }

  const dataLines = lines.slice(1);
  if (dataLines.length > MAX_ROWS) {
    return {
      rows: [],
      errors: [{ row: 0, reason: `Troppe righe (${dataLines.length}). Massimo ${MAX_ROWS} per importazione.` }],
    };
  }

  const rows: ParsedRow[] = [];
  const errors: Array<{ row: number; reason: string }> = [];

  for (let i = 0; i < dataLines.length; i++) {
    const rowNum = i + 2;
    const line = dataLines[i].trim();
    if (!line) continue;

    const cols = parseCSVLine(line);

    const rawPlate = col(cols, plateIdx);
    if (!rawPlate) {
      errors.push({ row: rowNum, reason: "Targa mancante" });
      continue;
    }

    const plate = normalizePlate(rawPlate);
    if (!PLATE_PATTERN.test(plate)) {
      errors.push({ row: rowNum, reason: `Targa non valida: "${rawPlate}"` });
      continue;
    }

    const rawPhone = col(cols, customerPhoneIdx);
    const customerPhone = rawPhone ? normalizeCustomerPhone(rawPhone) : null;
    if (rawPhone && !customerPhone) {
      errors.push({ row: rowNum, reason: `Telefono non valido: "${rawPhone}"` });
      continue;
    }

    const rawRevDate = col(cols, revisionDueDateIdx);
    const revisionDueDate = rawRevDate && DATE_PATTERN.test(rawRevDate) ? rawRevDate : null;

    rows.push({
      rowIndex: rowNum,
      plate,
      customerName: col(cols, customerNameIdx),
      customerPhone,
      vehicleModel: col(cols, vehicleModelIdx),
      revisionDueDate,
    });
  }

  return { rows, errors };
}

function findColumnIndex(headers: string[], aliases: string[]): number {
  for (let i = 0; i < headers.length; i++) {
    const h = headers[i].trim().replace(/[^a-z0-9]/g, "_");
    if (aliases.some((alias) => h === alias || h.startsWith(alias))) {
      return i;
    }
  }
  return -1;
}

function col(cols: string[], idx: number): string {
  if (idx < 0 || idx >= cols.length) return "";
  return cols[idx].trim();
}

function parseCSVLine(line: string): string[] {
  const result: string[] = [];
  let current = "";
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const char = line[i];
    if (char === '"') {
      if (inQuotes && line[i + 1] === '"') {
        current += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (char === "," && !inQuotes) {
      result.push(current.trim());
      current = "";
    } else {
      current += char;
    }
  }
  result.push(current.trim());
  return result;
}
