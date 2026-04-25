import type { AttachmentType, DocumentStatus, DocumentType, WorkOrderStatus } from "../types";

export function formatCurrency(value: number): string {
  return new Intl.NumberFormat("it-IT", {
    style: "currency",
    currency: "EUR",
  }).format(value);
}

export function formatDate(value: string | null | undefined): string {
  if (!value) return "Non impostata";
  return new Intl.DateTimeFormat("it-IT", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  }).format(new Date(`${value.slice(0, 10)}T00:00:00.000Z`));
}

export function formatDateTime(value: string | null | undefined): string {
  if (!value) return "Non disponibile";
  return new Intl.DateTimeFormat("it-IT", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));
}

export function statusLabel(status: WorkOrderStatus): string {
  const labels: Record<WorkOrderStatus, string> = {
    accepted: "Accettata",
    in_progress: "In lavorazione",
    ready: "Pronta al ritiro",
    collected: "Ritirata",
    archived: "Archiviata",
  };
  return labels[status];
}

export function documentTypeLabel(type: DocumentType): string {
  const labels: Record<DocumentType, string> = {
    intake_acceptance: "Accettazione",
    estimate: "Preventivo",
    final_summary: "Riepilogo finale",
  };
  return labels[type];
}

export function documentStatusLabel(status: DocumentStatus): string {
  const labels: Record<DocumentStatus, string> = {
    pending: "In coda",
    generating: "In generazione",
    ready: "Pronto",
    failed: "Errore",
    void: "Annullato",
  };
  return labels[status];
}

export function activityLabel(eventType: string): string {
  const labels: Record<string, string> = {
    intake_completed: "Accettazione completata",
    work_order_created: "Scheda creata",
    note_created: "Nota aggiunta",
    item_created: "Voce aggiunta",
    attachment_added: "Allegato aggiunto",
    status_changed: "Stato aggiornato",
    revision_updated: "Revisione aggiornata",
    document_requested: "Documento richiesto",
    document_generated: "Documento generato",
  };
  return labels[eventType] ?? eventType.replaceAll("_", " ");
}

export function itemTypeLabel(type: "labor" | "part"): string {
  return type === "labor" ? "Manodopera" : "Ricambio";
}

export function attachmentTypeLabel(type: AttachmentType): string {
  const labels: Record<AttachmentType, string> = {
    photo: "Immagine",
    document: "Documento",
    audio: "Audio",
    other: "File",
  };
  return labels[type];
}
