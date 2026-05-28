import { PDFDocument } from "pdf-lib";
import { supabaseServer } from "../supabase-server";
import type { DocumentType } from "../types";

const TEMPLATES_BUCKET = process.env.Cricchetto_DOCUMENT_TEMPLATES_BUCKET || "document-templates";

export interface WorkshopProfile {
  name: string;
  displayName: string | null;
  partitaIva: string | null;
  codiceFiscale: string | null;
  indirizzo: string | null;
  citta: string | null;
  cap: string | null;
  provincia: string | null;
  telefono: string | null;
  email: string | null;
  condizioniAccettazione: string | null;
  condizioniPreventivo: string | null;
  footerDocumenti: string | null;
}

export interface TemplateDocumentContext {
  workshopId: string;
  documentType: DocumentType;
  workOrder: {
    public_code: string;
    plate_normalized: string;
    vehicle_model_snapshot: string | null;
    customer_name_snapshot: string | null;
    customer_phone_snapshot: string | null;
    reported_issue: string | null;
    kilometers: number | null;
    status: string;
  };
  workshopProfile: WorkshopProfile;
  items: Array<{
    item_type: string;
    description: string;
    quantity: number;
    unit_price: number;
    row_total: number;
  }>;
  notes: Array<{ note: string; created_at: string }>;
}

export interface TemplateRenderResult {
  bytes: Buffer;
  templatePath: string;
}

export async function readWorkshopProfileForDocument(workshopId: string): Promise<WorkshopProfile> {
  const { data: workshop, error: workshopError } = await supabaseServer
    .from("workshops")
    .select("name,display_name")
    .eq("id", workshopId)
    .single();

  if (workshopError) throw new Error(`Failed to read workshop for document: ${workshopError.message}`);

  const { data: profile } = await (supabaseServer as any)
    .from("workshop_profiles")
    .select("partita_iva,codice_fiscale,indirizzo,citta,cap,provincia,telefono,email,condizioni_accettazione,condizioni_preventivo,footer_documenti")
    .eq("workshop_id", workshopId)
    .maybeSingle();

  const p: Record<string, unknown> = (profile as Record<string, unknown> | null) ?? {};
  const displayName = typeof (workshop as any).display_name === "string" ? (workshop as any).display_name : null;

  return {
    name: displayName ?? workshop.name,
    displayName,
    partitaIva: typeof p.partita_iva === "string" ? p.partita_iva : null,
    codiceFiscale: typeof p.codice_fiscale === "string" ? p.codice_fiscale : null,
    indirizzo: typeof p.indirizzo === "string" ? p.indirizzo : null,
    citta: typeof p.citta === "string" ? p.citta : null,
    cap: typeof p.cap === "string" ? p.cap : null,
    provincia: typeof p.provincia === "string" ? p.provincia : null,
    telefono: typeof p.telefono === "string" ? p.telefono : null,
    email: typeof p.email === "string" ? p.email : null,
    condizioniAccettazione: typeof p.condizioni_accettazione === "string" ? p.condizioni_accettazione : null,
    condizioniPreventivo: typeof p.condizioni_preventivo === "string" ? p.condizioni_preventivo : null,
    footerDocumenti: typeof p.footer_documenti === "string" ? p.footer_documenti : null,
  };
}

async function findActiveTemplate(workshopId: string, documentType: DocumentType): Promise<{ storagePath: string } | null> {
  const { data, error } = await (supabaseServer as any)
    .from("workshop_document_templates")
    .select("storage_path")
    .eq("workshop_id", workshopId)
    .eq("document_type", documentType)
    .eq("is_active", true)
    .limit(1)
    .maybeSingle();

  if (error) throw new Error(`Failed to check for active document template: ${error.message}`);
  if (!data) return null;
  return { storagePath: data.storage_path };
}

async function downloadTemplatePdf(storagePath: string): Promise<Buffer> {
  const { data, error } = await supabaseServer.storage.from(TEMPLATES_BUCKET).download(storagePath);
  if (error || !data) throw new Error(`Template download failed: ${error?.message ?? "empty response"}`);
  return Buffer.from(await data.arrayBuffer());
}

function formatAmount(value: number): string {
  return `EUR ${value.toFixed(2).replace(".", ",")}`;
}

function formatItemLine(item: { description: string; quantity: number; unit_price: number; row_total: number }): string {
  return `${item.description} - ${item.quantity.toFixed(2).replace(".", ",")} x ${item.unit_price.toFixed(2).replace(".", ",")} = ${formatAmount(item.row_total)}`;
}

function buildFieldValues(ctx: TemplateDocumentContext): Record<string, string> {
  const wo = ctx.workOrder;
  const wp = ctx.workshopProfile;

  const parts = ctx.items.filter((i) => i.item_type === "part");
  const labor = ctx.items.filter((i) => i.item_type === "labor");
  const partsTotal = parts.reduce((sum, i) => sum + i.row_total, 0);
  const laborTotal = labor.reduce((sum, i) => sum + i.row_total, 0);
  const grandTotal = partsTotal + laborTotal;

  const allItemsText = [...parts, ...labor].map(formatItemLine).join("\n") || "Nessuna voce registrata";
  const partsText = parts.map(formatItemLine).join("\n") || "Nessun ricambio registrato";
  const laborText = labor.map(formatItemLine).join("\n") || "Nessuna manodopera registrata";

  const legalText =
    ctx.documentType === "intake_acceptance"
      ? (wp.condizioniAccettazione ?? "")
      : ctx.documentType === "estimate"
        ? (wp.condizioniPreventivo ?? "")
        : "";

  return {
    workshop_name: wp.displayName ?? wp.name,
    workshop_display_name: wp.displayName ?? wp.name,
    workshop_vat: wp.partitaIva ?? "",
    workshop_tax_code: wp.codiceFiscale ?? "",
    workshop_address: wp.indirizzo ?? "",
    workshop_city: wp.citta ?? "",
    workshop_postal_code: wp.cap ?? "",
    workshop_province: wp.provincia ?? "",
    workshop_phone: wp.telefono ?? "",
    workshop_email: wp.email ?? "",
    document_date: new Date().toLocaleDateString("it-IT"),
    document_type: ctx.documentType,
    public_code: wo.public_code ?? "",
    plate: wo.plate_normalized ?? "",
    vehicle_model: wo.vehicle_model_snapshot ?? "",
    customer_name: wo.customer_name_snapshot ?? "",
    customer_phone: wo.customer_phone_snapshot ?? "",
    kilometers: wo.kilometers != null ? String(wo.kilometers) : "",
    reported_issue: wo.reported_issue ?? "",
    status: wo.status ?? "",
    subtotal: formatAmount(partsTotal),
    total: formatAmount(grandTotal),
    legal_text: legalText,
    footer_text: wp.footerDocumenti ?? "",
    items_text: allItemsText,
    parts_text: partsText,
    labor_text: laborText,
  };
}

export async function renderDocumentFromTemplate(ctx: TemplateDocumentContext): Promise<TemplateRenderResult | null> {
  const template = await findActiveTemplate(ctx.workshopId, ctx.documentType);
  if (!template) return null;

  const templateBytes = await downloadTemplatePdf(template.storagePath);

  let pdfDoc: PDFDocument;
  try {
    pdfDoc = await PDFDocument.load(templateBytes);
  } catch (err) {
    throw new Error(`Template PDF could not be parsed: ${err instanceof Error ? err.message : String(err)}`);
  }

  const form = pdfDoc.getForm();
  const fields = form.getFields();

  if (fields.length === 0) {
    throw new Error("Template has no fillable AcroForm fields — not a fillable PDF");
  }

  const values = buildFieldValues(ctx);

  for (const field of fields) {
    const fieldName = field.getName();
    const value = values[fieldName];
    if (value === undefined) continue;
    try {
      form.getTextField(fieldName).setText(value);
    } catch {
      // not a text field (checkbox, radio, etc.); skip silently
    }
  }

  try {
    form.flatten();
  } catch (flattenErr) {
    console.warn(
      "[template-renderer] Could not flatten form fields, returning unflatted PDF:",
      flattenErr instanceof Error ? flattenErr.message : flattenErr,
    );
  }

  const outputBytes = Buffer.from(await pdfDoc.save());
  return { bytes: outputBytes, templatePath: template.storagePath };
}
