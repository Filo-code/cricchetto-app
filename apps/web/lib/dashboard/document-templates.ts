import { Buffer } from "node:buffer";
import { supabaseServer } from "../supabase-server";

const TEMPLATES_BUCKET = process.env.Criccheto_DOCUMENT_TEMPLATES_BUCKET || "document-templates";
const MAX_TEMPLATE_BYTES = 5 * 1024 * 1024;
const VALID_DOCUMENT_TYPES = new Set(["intake_acceptance", "estimate", "final_summary"]);

export type DocumentTemplateType = "intake_acceptance" | "estimate" | "final_summary";

export interface WorkshopDocumentTemplate {
  id: string;
  workshopId: string;
  documentType: DocumentTemplateType;
  filename: string;
  storageBucket: string;
  storagePath: string;
  mimeType: string;
  sizeBytes: number;
  isActive: boolean;
  createdBy: string | null;
  createdAt: string;
  updatedAt: string;
}

function rowToTemplate(row: any): WorkshopDocumentTemplate {
  return {
    id: row.id,
    workshopId: row.workshop_id,
    documentType: row.document_type,
    filename: row.filename,
    storageBucket: row.storage_bucket,
    storagePath: row.storage_path,
    mimeType: row.mime_type,
    sizeBytes: Number(row.size_bytes),
    isActive: row.is_active,
    createdBy: row.created_by ?? null,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export async function readWorkshopDocumentTemplates(workshopId: string): Promise<WorkshopDocumentTemplate[]> {
  const { data, error } = await (supabaseServer as any)
    .from("workshop_document_templates")
    .select("id,workshop_id,document_type,filename,storage_bucket,storage_path,mime_type,size_bytes,is_active,created_by,created_at,updated_at")
    .eq("workshop_id", workshopId)
    .eq("is_active", true)
    .order("created_at", { ascending: false });

  if (error) throw new Error(`Failed to read document templates: ${error.message}`);
  return (data ?? []).map(rowToTemplate);
}

export async function uploadWorkshopDocumentTemplate(input: {
  workshopId: string;
  documentType: string;
  file: File;
  actorRef?: string;
}): Promise<WorkshopDocumentTemplate> {
  const { workshopId, documentType, file, actorRef } = input;

  if (!VALID_DOCUMENT_TYPES.has(documentType)) {
    throw new Error(`Tipo documento non valido: ${documentType}`);
  }
  if (file.type !== "application/pdf") {
    throw new Error("Il template deve essere un file PDF.");
  }
  if (file.size <= 0) {
    throw new Error("File vuoto.");
  }
  if (file.size > MAX_TEMPLATE_BYTES) {
    throw new Error("Il template non può superare i 5 MB.");
  }

  const storagePath = `${workshopId}/templates/${documentType}/template-${Date.now()}.pdf`;
  const bytes = Buffer.from(await file.arrayBuffer());

  const { error: uploadError } = await supabaseServer.storage
    .from(TEMPLATES_BUCKET)
    .upload(storagePath, bytes, { contentType: "application/pdf", upsert: false });

  if (uploadError) throw new Error(`Upload template fallito: ${uploadError.message}`);

  // Soft-deactivate previous active template for same workshop + document_type
  await (supabaseServer as any)
    .from("workshop_document_templates")
    .update({ is_active: false })
    .eq("workshop_id", workshopId)
    .eq("document_type", documentType)
    .eq("is_active", true);

  const { data: inserted, error: insertError } = await (supabaseServer as any)
    .from("workshop_document_templates")
    .insert({
      workshop_id: workshopId,
      document_type: documentType,
      filename: file.name,
      storage_bucket: TEMPLATES_BUCKET,
      storage_path: storagePath,
      mime_type: "application/pdf",
      size_bytes: file.size,
      is_active: true,
      created_by: actorRef ?? null,
    })
    .select("id,workshop_id,document_type,filename,storage_bucket,storage_path,mime_type,size_bytes,is_active,created_by,created_at,updated_at")
    .single();

  if (insertError) throw new Error(`Salvataggio template fallito: ${insertError.message}`);
  return rowToTemplate(inserted);
}

export async function deactivateWorkshopDocumentTemplate(input: {
  workshopId: string;
  templateId: string;
}): Promise<void> {
  const { workshopId, templateId } = input;
  const { error } = await (supabaseServer as any)
    .from("workshop_document_templates")
    .update({ is_active: false })
    .eq("id", templateId)
    .eq("workshop_id", workshopId)
    .eq("is_active", true);

  if (error) throw new Error(`Disattivazione template fallita: ${error.message}`);
}
