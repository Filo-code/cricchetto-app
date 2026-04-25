import type { DocumentType } from "../types";

export type ParsedCommand =
  | { kind: "NUOVA"; plate: string }
  | { kind: "STATO"; plate: string }
  | { kind: "NOTA"; plate: string; text: string }
  | { kind: "RICAMBIO"; plate: string; description: string; quantity: number; unitPrice: number }
  | { kind: "MANODOPERA"; plate: string; hours: number }
  | { kind: "CHIUDI"; plate: string }
  | { kind: "RITIRATA"; plate: string }
  | { kind: "REVISIONE_LOOKUP"; plate: string }
  | { kind: "REVISIONE_UPDATE"; plate: string; revisionDueDate: string }
  | { kind: "REVISIONIINSCADENZA" }
  | { kind: "CERCA"; query: string }
  | { kind: "INVIA_DOCUMENTO"; plate: string; documentType: DocumentType }
  | { kind: "COMANDO" };
