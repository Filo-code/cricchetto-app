import { Buffer } from "node:buffer";
import { AppError } from "../errors";
import { supabaseServer } from "../supabase-server";
import type { CommandExecutionResult, DocumentType } from "../types";
import { renderDocumentFromTemplate, readWorkshopProfileForDocument } from "./template-renderer";

const DOCUMENT_OUTBOUND_URL_TTL_SECONDS = Number(process.env.Cricchetto_DOCUMENT_OUTBOUND_URL_TTL ?? "86400");
const DOCUMENT_GENERATION_STALE_MINUTES = Number(process.env.Cricchetto_DOCUMENT_GENERATION_STALE_MINUTES ?? "15");
const ACTIVE_DOCUMENT_STATUSES = ["pending", "generating"] as const;
const READY_DOCUMENT_STATUSES = new Set(["ready", "generated"]);

const DOCUMENT_TYPE_LABELS: Record<DocumentType, string> = {
  intake_acceptance: "accettazione",
  estimate: "preventivo",
  final_summary: "riepilogo finale",
};

export interface DocumentRequestInput {
  workshopId: string;
  workOrderId: string;
  documentType: DocumentType;
  createdBy: string;
}

export interface ProcessedDocumentResult {
  id: string;
  status: "ready" | "failed";
  document_type: string;
  work_order_id: string;
  version: number;
  storage_bucket?: string;
  storage_path?: string;
  filename?: string;
  errorMessage?: string;
}

export async function resolveWorkOrderByPlate(workshopId: string, plate: string): Promise<{ id: string; public_code: string; plate_normalized: string; status: string } | null> {
  const { data, error } = await supabaseServer
    .from("work_orders")
    .select("id,public_code,plate_normalized,status,created_at")
    .eq("workshop_id", workshopId)
    .eq("plate_normalized", plate)
    .order("created_at", { ascending: false })
    .limit(1);

  if (error) {
    throw new Error(`Failed to resolve work order for document send: ${error.message}`);
  }

  return data?.[0] ?? null;
}

export async function buildSendDocumentCommandResult(input: {
  workshopId: string;
  plate: string;
  documentType: DocumentType;
  actorRef: string;
  recipientIdentifier: string;
  providerMessageId: string;
}): Promise<CommandExecutionResult> {
  const workOrder = await resolveWorkOrderByPlate(input.workshopId, input.plate);
  if (!workOrder) {
    throw new AppError("Work order not found", {
      parseStatus: "not_found",
      publicMessage: `Nessuna scheda trovata per ${input.plate}.`,
    });
  }

  await reconcileStaleDocuments({
    workshopId: input.workshopId,
    workOrderId: workOrder.id,
  });
  const latest = await readLatestDocument(input.workshopId, workOrder.id, input.documentType);
  const label = DOCUMENT_TYPE_LABELS[input.documentType];
  const idempotencyKey = `outbound:send-document:${workOrder.id}:${input.documentType}:${input.providerMessageId}`;

  const attachmentContext = { kind: "work_order" as const, id: workOrder.id };

  if (!latest) {
    return {
      parseStatus: "not_found",
      relatedWorkOrderId: workOrder.id,
      attachmentContext,
      replies: [{
        recipientIdentifier: input.recipientIdentifier,
        text: `Nessun ${label} disponibile per ${workOrder.plate_normalized}.\nGenera prima il documento.`,
        idempotencyKey,
      }],
    };
  }

  if (latest.status === "pending" || latest.status === "generating") {
    return {
      parseStatus: "processed",
      relatedWorkOrderId: workOrder.id,
      attachmentContext,
      replies: [{
        recipientIdentifier: input.recipientIdentifier,
        text: `${capitalize(label)} per ${workOrder.plate_normalized} in preparazione.\nRiprova tra poco.`,
        idempotencyKey,
        relatedDocumentId: latest.id,
      }],
    };
  }

  if (latest.status === "failed" || latest.status === "void") {
    return {
      parseStatus: "validation_failed",
      relatedWorkOrderId: workOrder.id,
      attachmentContext,
      replies: [{
        recipientIdentifier: input.recipientIdentifier,
        text: `${capitalize(label)} per ${workOrder.plate_normalized} non disponibile.\nContatta assistenza.`,
        idempotencyKey,
        relatedDocumentId: latest.id,
      }],
    };
  }

  if (!READY_DOCUMENT_STATUSES.has(latest.status) || !latest.storage_bucket || !latest.storage_path) {
    throw new AppError("Document storage metadata missing", {
      statusCode: 500,
      parseStatus: "error",
      publicMessage: "Documento non disponibile. Riprova tra poco.",
    });
  }

  const signedUrl = await createSignedDocumentUrl(latest.storage_bucket, latest.storage_path);
  const text = [
    `${capitalize(label)} v${latest.version} per ${workOrder.plate_normalized}`,
    `Codice: ${workOrder.public_code}`,
    `Apri PDF: ${signedUrl}`,
    `Link valido ${formatUrlTtl()}.`,
  ].join("\n");

  return {
    parseStatus: "processed",
    relatedWorkOrderId: workOrder.id,
    attachmentContext,
    replies: [{
      recipientIdentifier: input.recipientIdentifier,
      text,
      idempotencyKey,
      relatedDocumentId: latest.id,
      relatedWorkOrderId: workOrder.id,
    }],
  };
}

async function readLatestDocument(workshopId: string, workOrderId: string, documentType: DocumentType): Promise<{
  id: string;
  status: string;
  version: number;
  storage_bucket: string | null;
  storage_path: string | null;
  filename: string | null;
} | null> {
  const { data, error } = await supabaseServer
    .from("documents")
    .select("id,status,version,storage_bucket,storage_path,filename")
    .eq("workshop_id", workshopId)
    .eq("work_order_id", workOrderId)
    .eq("document_type", documentType)
    .order("version", { ascending: false })
    .limit(1);

  if (error) {
    throw new Error(`Failed to read latest document: ${error.message}`);
  }

  return data?.[0] ?? null;
}

async function createSignedDocumentUrl(bucket: string, path: string): Promise<string> {
  const ttl = Number.isFinite(DOCUMENT_OUTBOUND_URL_TTL_SECONDS) && DOCUMENT_OUTBOUND_URL_TTL_SECONDS > 0
    ? Math.min(DOCUMENT_OUTBOUND_URL_TTL_SECONDS, 7 * 24 * 3600)
    : 86400;
  const { data, error } = await supabaseServer.storage.from(bucket).createSignedUrl(path, ttl);
  if (error || !data?.signedUrl) {
    throw new AppError(`Failed to sign document URL: ${error?.message ?? "unknown"}`, {
      statusCode: 502,
      parseStatus: "error",
      publicMessage: "Documento non disponibile. Riprova tra poco.",
    });
  }
  return data.signedUrl;
}

function formatUrlTtl(): string {
  const hours = Math.max(1, Math.round(DOCUMENT_OUTBOUND_URL_TTL_SECONDS / 3600));
  return hours === 1 ? "1 ora" : `${hours} ore`;
}

function capitalize(value: string): string {
  return value.length === 0 ? value : value[0].toUpperCase() + value.slice(1);
}

export async function enqueueDocumentGeneration(input: DocumentRequestInput): Promise<void> {
  await reconcileStaleDocuments({
    workshopId: input.workshopId,
    workOrderId: input.workOrderId,
  });

  const { data: existing, error: readError } = await supabaseServer
    .from("documents")
    .select("version,status")
    .eq("workshop_id", input.workshopId)
    .eq("work_order_id", input.workOrderId)
    .eq("document_type", input.documentType)
    .order("version", { ascending: false })
    .limit(1);

  if (readError) {
    throw new Error(`Failed to read document versions: ${readError.message}`);
  }

  const latest = existing?.[0];
  if (latest && ACTIVE_DOCUMENT_STATUSES.includes(latest.status as (typeof ACTIVE_DOCUMENT_STATUSES)[number])) {
    return;
  }

  const version = ((existing?.[0]?.version as number | undefined) ?? 0) + 1;
  const { error } = await supabaseServer.from("documents").insert({
    workshop_id: input.workshopId,
    work_order_id: input.workOrderId,
    document_type: input.documentType,
    version,
    status: "pending",
    created_by: input.createdBy,
  });

  if (error) {
    throw new Error(`Failed to enqueue document generation: ${error.message}`);
  }
}

export async function requestDocument(workshopId: string, input: Omit<DocumentRequestInput, "workshopId">): Promise<void> {
  await enqueueDocumentGeneration({ workshopId, ...input });
  processPendingDocuments(1).catch((err: unknown) => {
    console.warn("[documents.requestDocument] eager_process_failed", {
      workshopId,
      workOrderId: input.workOrderId,
      documentType: input.documentType,
      errorMessage: err instanceof Error ? err.message : String(err),
    });
  });
}

export async function processPendingDocuments(limit = 10): Promise<{
  claimed: number;
  processed: number;
  failed: number;
  documents: ProcessedDocumentResult[];
}> {
  await reconcileStaleDocuments();
  const claimed = await claimPendingDocuments(limit);
  const documents: ProcessedDocumentResult[] = [];
  let processed = 0;
  let failed = 0;

  for (const document of claimed) {
    const result = await generateAndStoreDocument(document);
    documents.push(result);
    if (result.status === "ready") {
      processed += 1;
    } else {
      failed += 1;
    }
  }

  return {
    claimed: claimed.length,
    processed,
    failed,
    documents,
  };
}

export async function reconcileStaleDocuments(input: {
  workshopId?: string;
  workOrderId?: string;
} = {}): Promise<number> {
  const staleMinutes = Number.isFinite(DOCUMENT_GENERATION_STALE_MINUTES) && DOCUMENT_GENERATION_STALE_MINUTES > 0
    ? DOCUMENT_GENERATION_STALE_MINUTES
    : 15;
  const staleBefore = new Date(Date.now() - staleMinutes * 60 * 1000).toISOString();
  let query = supabaseServer
    .from("documents")
    .select("id,metadata")
    .in("status", [...ACTIVE_DOCUMENT_STATUSES])
    .lt("updated_at", staleBefore)
    .limit(50);

  if (input.workshopId) {
    query = query.eq("workshop_id", input.workshopId);
  }
  if (input.workOrderId) {
    query = query.eq("work_order_id", input.workOrderId);
  }

  const { data, error } = await query;

  if (error) {
    throw new Error(`Failed to read stale active documents: ${error.message}`);
  }

  const staleRows = data ?? [];
  for (const row of staleRows) {
    const metadata = row.metadata && typeof row.metadata === "object" && !Array.isArray(row.metadata)
      ? row.metadata as Record<string, unknown>
      : {};
    const { error: updateError } = await supabaseServer
      .from("documents")
      .update({
        status: "failed",
        metadata: {
          ...metadata,
          error_message: `Document generation timed out after ${staleMinutes} minutes`,
          failed_at: new Date().toISOString(),
          failed_by: "document_stale_guard",
        },
      })
      .eq("id", row.id)
      .in("status", [...ACTIVE_DOCUMENT_STATUSES]);

    if (updateError) {
      throw new Error(`Failed to fail stale active document: ${updateError.message}`);
    }
  }

  return staleRows.length;
}

async function claimPendingDocuments(limit = 10): Promise<any[]> {
  const { data, error } = await supabaseServer
    .from("documents")
    .select("id,workshop_id,status,document_type,work_order_id,version")
    .eq("status", "pending")
    .order("created_at", { ascending: true })
    .limit(limit);

  if (error) {
    throw new Error(`Failed to read pending documents: ${error.message}`);
  }

  const claimed = [];
  for (const document of data ?? []) {
    const { data: claimedDocument, error: updateError } = await supabaseServer
      .from("documents")
      .update({ status: "generating" })
      .eq("id", document.id)
      .eq("status", "pending")
      .select("id,workshop_id,status,document_type,work_order_id,version")
      .maybeSingle();
    if (updateError) {
      throw new Error(`Failed to claim document: ${updateError.message}`);
    }
    if (claimedDocument) {
      claimed.push(claimedDocument);
    }
  }

  return claimed;
}

async function generateAndStoreDocument(document: any): Promise<ProcessedDocumentResult> {
  try {
    const [workOrder, workshopProfile] = await Promise.all([
      readWorkOrder(document.workshop_id, document.work_order_id),
      readWorkshopProfileForDocument(document.workshop_id),
    ]);
    const includeOperationalDetail = document.document_type === "estimate" || document.document_type === "final_summary";
    const items = includeOperationalDetail
      ? await readWorkOrderItems(document.workshop_id, document.work_order_id)
      : [];
    const notes = includeOperationalDetail
      ? await readWorkOrderNotes(document.workshop_id, document.work_order_id)
      : [];
    const filename = `${document.document_type}_v${document.version}_${workOrder.public_code}.pdf`;
    const storageBucket = process.env.Cricchetto_DOCUMENTS_BUCKET || "documents";
    const storagePath = `${document.workshop_id}/${document.work_order_id}/${filename}`;

    let pdf: Buffer;
    let generatedBy = "backend_placeholder_pdf";
    let templateMetadata: Record<string, unknown> = {};

    try {
      const templateResult = await renderDocumentFromTemplate({
        workshopId: document.workshop_id,
        documentType: document.document_type as DocumentType,
        workOrder,
        workshopProfile,
        items,
        notes,
      });
      if (templateResult) {
        pdf = templateResult.bytes;
        generatedBy = "template_renderer";
        templateMetadata = { template_path: templateResult.templatePath };
      } else {
        pdf = generateMinimalPdf(document, workOrder, { items, notes, workshopName: workshopProfile.name });
      }
    } catch (templateError) {
      const tMsg = templateError instanceof Error ? templateError.message : String(templateError);
      console.warn("[document-worker] Template rendering failed, using fallback PDF:", tMsg);
      templateMetadata = { template_error: tMsg, template_failed_at: new Date().toISOString() };
      pdf = generateMinimalPdf(document, workOrder, { items, notes, workshopName: workshopProfile.name });
    }

    const { error: uploadError } = await supabaseServer.storage
      .from(storageBucket)
      .upload(storagePath, pdf, {
        contentType: "application/pdf",
        upsert: true,
      });

    if (uploadError) {
      throw new Error(uploadError.message);
    }

    const generatedAt = new Date().toISOString();
    const { error: updateError } = await supabaseServer
      .from("documents")
      .update({
        status: "ready",
        storage_bucket: storageBucket,
        storage_path: storagePath,
        filename,
        generated_at: generatedAt,
        metadata: {
          generated_by: generatedBy,
          generated_at: generatedAt,
          ...templateMetadata,
        },
      })
      .eq("id", document.id)
      .eq("status", "generating");

    if (updateError) {
      throw new Error(updateError.message);
    }

    return {
      id: document.id,
      status: "ready",
      document_type: document.document_type,
      work_order_id: document.work_order_id,
      version: document.version,
      storage_bucket: storageBucket,
      storage_path: storagePath,
      filename,
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    await markDocumentFailed(document, errorMessage);
    return {
      id: document.id,
      status: "failed",
      document_type: document.document_type,
      work_order_id: document.work_order_id,
      version: document.version,
      errorMessage,
    };
  }
}

async function readWorkOrder(workshopId: string, workOrderId: string): Promise<any> {
  const { data, error } = await supabaseServer
    .from("work_orders")
    .select("id,workshop_id,public_code,plate_normalized,status,reported_issue,kilometers,customer_name_snapshot,customer_phone_snapshot,vehicle_model_snapshot,created_at,ready_at,collected_at")
    .eq("workshop_id", workshopId)
    .eq("id", workOrderId)
    .single();

  if (error) {
    throw new Error(`Failed to read work order for document: ${error.message}`);
  }

  return data;
}


async function readWorkOrderItems(workshopId: string, workOrderId: string): Promise<Array<{ item_type: string; description: string; quantity: number; unit_price: number; row_total: number }>> {
  const { data, error } = await supabaseServer
    .from("work_order_items")
    .select("item_type,description,quantity,unit_price,created_at")
    .eq("workshop_id", workshopId)
    .eq("work_order_id", workOrderId)
    .is("voided_at", null)
    .order("created_at", { ascending: true });

  if (error) {
    throw new Error(`Failed to read work order items for document: ${error.message}`);
  }

  return (data ?? []).map((row) => {
    const quantity = Number(row.quantity);
    const unitPrice = Number(row.unit_price);
    return {
      item_type: row.item_type,
      description: row.description,
      quantity,
      unit_price: unitPrice,
      row_total: quantity * unitPrice,
    };
  });
}

async function readWorkOrderNotes(workshopId: string, workOrderId: string): Promise<Array<{ note: string; created_at: string }>> {
  const { data, error } = await supabaseServer
    .from("work_order_notes")
    .select("note,created_at")
    .eq("workshop_id", workshopId)
    .eq("work_order_id", workOrderId)
    .is("voided_at", null)
    .order("created_at", { ascending: true })
    .limit(20);

  if (error) {
    throw new Error(`Failed to read work order notes for document: ${error.message}`);
  }

  return data ?? [];
}

async function markDocumentFailed(document: any, errorMessage: string): Promise<void> {
  const { error } = await supabaseServer
    .from("documents")
    .update({
      status: "failed",
      metadata: {
        generated_by: "backend_placeholder_pdf",
        error_message: errorMessage,
        failed_at: new Date().toISOString(),
      },
    })
    .eq("id", document.id);

  if (error) {
    throw new Error(`Failed to mark document failed: ${error.message}`);
  }
}

function generateMinimalPdf(
  document: any,
  workOrder: any,
  detail: {
    items: Array<{ item_type: string; description: string; quantity: number; unit_price: number; row_total: number }>;
    notes: Array<{ note: string; created_at: string }>;
    workshopName: string;
  },
): Buffer {
  const title = documentTitle(document.document_type);
  const lines: string[] = [
    detail.workshopName,
    "Powered by Filo",
    title,
    `Codice: ${workOrder.public_code}`,
    `Targa: ${workOrder.plate_normalized}`,
    `Stato: ${workOrder.status}`,
    `Cliente: ${workOrder.customer_name_snapshot ?? "non disponibile"}`,
    `Telefono: ${workOrder.customer_phone_snapshot ?? "non disponibile"}`,
    `Veicolo: ${workOrder.vehicle_model_snapshot ?? "non disponibile"}`,
    `Problema: ${workOrder.reported_issue ?? "non disponibile"}`,
    `Km: ${workOrder.kilometers ?? "non disponibili"}`,
  ];

  if (document.document_type === "estimate" || document.document_type === "final_summary") {
    const parts = detail.items.filter((item) => item.item_type === "part");
    const labor = detail.items.filter((item) => item.item_type === "labor");
    const partsTotal = parts.reduce((sum, item) => sum + item.row_total, 0);
    const laborTotal = labor.reduce((sum, item) => sum + item.row_total, 0);
    const grandTotal = partsTotal + laborTotal;

    lines.push("");
    lines.push("Ricambi:");
    if (parts.length === 0) {
      lines.push("  nessun ricambio registrato");
    } else {
      parts.forEach((item) => {
        lines.push(`  ${formatItemLine(item)}`);
      });
    }
    lines.push("");
    lines.push("Manodopera:");
    if (labor.length === 0) {
      lines.push("  nessuna manodopera registrata");
    } else {
      labor.forEach((item) => {
        lines.push(`  ${formatItemLine(item)}`);
      });
    }
    lines.push("");
    lines.push(`Totale ricambi: ${formatAmount(partsTotal)}`);
    lines.push(`Totale manodopera: ${formatAmount(laborTotal)}`);
    lines.push(`Totale: ${formatAmount(grandTotal)}`);

    if (detail.notes.length > 0) {
      lines.push("");
      lines.push("Note:");
      detail.notes.forEach((entry) => {
        lines.push(`  ${entry.note}`);
      });
    }

    if (document.document_type === "final_summary") {
      if (workOrder.ready_at) {
        lines.push(`Pronta il: ${workOrder.ready_at}`);
      }
      if (workOrder.collected_at) {
        lines.push(`Ritirata il: ${workOrder.collected_at}`);
      }
    }
  }

  lines.push("");
  lines.push(`Documento: ${document.document_type} v${document.version}`);
  lines.push(`Generato: ${new Date().toISOString()}`);
  const content = buildPdfTextStream(lines);
  const objects = [
    "<< /Type /Catalog /Pages 2 0 R >>",
    "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
    "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>",
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
    `<< /Length ${Buffer.byteLength(content, "utf8")} >>\nstream\n${content}\nendstream`,
  ];

  let pdf = "%PDF-1.4\n";
  const offsets = [0];
  objects.forEach((object, index) => {
    offsets.push(Buffer.byteLength(pdf, "utf8"));
    pdf += `${index + 1} 0 obj\n${object}\nendobj\n`;
  });
  const xrefOffset = Buffer.byteLength(pdf, "utf8");
  pdf += `xref\n0 ${objects.length + 1}\n`;
  pdf += "0000000000 65535 f \n";
  offsets.slice(1).forEach((offset) => {
    pdf += `${String(offset).padStart(10, "0")} 00000 n \n`;
  });
  pdf += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF\n`;

  return Buffer.from(pdf, "utf8");
}

function buildPdfTextStream(lines: string[]): string {
  const commands = ["BT", "/F1 12 Tf", "50 790 Td"];
  lines.forEach((line, index) => {
    if (index > 0) {
      commands.push("0 -20 Td");
    }
    commands.push(`(${escapePdfText(line)}) Tj`);
  });
  commands.push("ET");
  return commands.join("\n");
}

function escapePdfText(value: string): string {
  return value
    .replace(/[àáâãäå]/g, "a")
    .replace(/[èéêë]/g, "e")
    .replace(/[ìíîï]/g, "i")
    .replace(/[òóôõö]/g, "o")
    .replace(/[ùúûü]/g, "u")
    .replace(/[ýÿ]/g, "y")
    .replace(/[ÀÁÂÃÄÅ]/g, "A")
    .replace(/[ÈÉÊË]/g, "E")
    .replace(/[ÌÍÎÏ]/g, "I")
    .replace(/[ÒÓÔÕÖ]/g, "O")
    .replace(/[ÙÚÛÜ]/g, "U")
    .replace(/[Ý]/g, "Y")
    .replace(/ç/g, "c")
    .replace(/Ç/g, "C")
    .replace(/ñ/g, "n")
    .replace(/Ñ/g, "N")
    .normalize("NFKD")
    .replace(/[^\x20-\x7E]/g, "")
    .replace(/\\/g, "\\\\")
    .replace(/\(/g, "\\(")
    .replace(/\)/g, "\\)");
}

function formatAmount(value: number): string {
  return `EUR ${value.toFixed(2).replace(".", ",")}`;
}

function formatItemLine(item: { description: string; quantity: number; unit_price: number; row_total: number }): string {
  const qty = item.quantity.toFixed(2).replace(".", ",");
  const price = item.unit_price.toFixed(2).replace(".", ",");
  return `${item.description} - ${qty} x ${price} = ${formatAmount(item.row_total)}`;
}

function documentTitle(documentType: string): string {
  const titles: Record<string, string> = {
    intake_acceptance: "Accettazione veicolo",
    estimate: "Preventivo",
    final_summary: "Riepilogo finale",
  };
  return titles[documentType] ?? documentType;
}
