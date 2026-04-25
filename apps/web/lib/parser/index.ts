import { parsePositiveDecimal } from "../decimals";
import { AppError } from "../errors";
import { assertValidPlate } from "../plates";
import { assertIsoDate } from "../time";
import type { Channel, DocumentType } from "../types";
import type { ParsedCommand } from "./commands";
import { commandKeyword, splitCommandText } from "./normalize";

const DOCUMENT_KEYWORDS: Record<string, DocumentType> = {
  ACCETTAZIONE: "intake_acceptance",
  PREVENTIVO: "estimate",
  RIEPILOGO: "final_summary",
};

export type { ParsedCommand } from "./commands";

export interface ParseInput {
  channel: Channel;
  text: string;
}

export function parseCommand(input: ParseInput): ParsedCommand {
  const tokens = splitCommandText(input.text);
  const keyword = commandKeyword(tokens[0] ?? "");

  if (!keyword) {
    throw unknownCommand();
  }

  if (keyword === "COMANDO") {
    return { kind: "COMANDO" };
  }

  if (keyword === "REVISIONIINSCADENZA") {
    if (tokens.length !== 1) {
      throw malformed("REVISIONIINSCADENZA non richiede altri dati.");
    }

    return { kind: "REVISIONIINSCADENZA" };
  }

  if (keyword === "CERCA") {
    if (tokens.length < 2) {
      throw malformed("Formato ricerca non valido.\nUsa: RICERCA \"AB123CD\" oppure RICERCA \"Mario Rossi\"");
    }
    return { kind: "CERCA", query: tokens.slice(1).join(" ") };
  }

  if (keyword === "INVIA") {
    if (tokens.length !== 3) {
      throw malformed("Formato non valido.\nUsa: INVIA ACCETTAZIONE|PREVENTIVO|RIEPILOGO AB123CD");
    }
    const docKeyword = commandKeyword(tokens[1]);
    const documentType = DOCUMENT_KEYWORDS[docKeyword];
    if (!documentType) {
      throw malformed("Tipo documento non valido.\nUsa: INVIA ACCETTAZIONE|PREVENTIVO|RIEPILOGO AB123CD");
    }
    const plate = assertValidPlate(tokens[2]);
    return { kind: "INVIA_DOCUMENTO", plate, documentType };
  }

  const plate = tokens[1] ? assertValidPlate(tokens[1]) : "";
  if (!plate) {
    throw malformed(`Formato non valido.\nEsempio: ${keyword} AB123CD`);
  }

  switch (keyword) {
    case "NUOVA":
      requireTokenCount(tokens, 2, "NUOVA AB123CD");
      return { kind: "NUOVA", plate };
    case "STATO":
      requireTokenCount(tokens, 2, "STATO AB123CD");
      return { kind: "STATO", plate };
    case "NOTA": {
      if (tokens.length < 3) {
        throw malformed("Formato nota non valido.\nUsa: NOTA AB123CD testo");
      }

      return { kind: "NOTA", plate, text: tokens.slice(2).join(" ") };
    }
    case "RICAMBIO": {
      if (tokens.length < 5) {
        throw malformed("Formato ricambio non valido.\nUsa: RICAMBIO AB123CD descrizione quantita prezzo");
      }

      const unitPrice = parsePositiveDecimal(tokens[tokens.length - 1], "prezzo");
      const quantity = parsePositiveDecimal(tokens[tokens.length - 2], "quantita");
      const description = tokens.slice(2, -2).join(" ").trim();
      if (!description) {
        throw malformed("Descrizione ricambio mancante.");
      }

      return { kind: "RICAMBIO", plate, description, quantity, unitPrice };
    }
    case "MANODOPERA": {
      requireTokenCount(tokens, 3, "MANODOPERA AB123CD ore");
      return { kind: "MANODOPERA", plate, hours: parsePositiveDecimal(tokens[2], "ore") };
    }
    case "CHIUDI":
      requireTokenCount(tokens, 2, "CHIUDI AB123CD");
      return { kind: "CHIUDI", plate };
    case "RITIRATA":
      requireTokenCount(tokens, 2, "RITIRATA AB123CD");
      return { kind: "RITIRATA", plate };
    case "REVISIONE": {
      if (tokens.length === 2) {
        return { kind: "REVISIONE_LOOKUP", plate };
      }
      if (tokens.length === 3) {
        try {
          return { kind: "REVISIONE_UPDATE", plate, revisionDueDate: assertIsoDate(tokens[2]) };
        } catch {
          throw malformed("Data revisione non valida.\nUsa: REVISIONE AB123CD 2026-11-20");
        }
      }
      throw malformed("Formato revisione non valido.\nUsa: REVISIONE AB123CD");
    }
    default:
      throw unknownCommand();
  }
}

function requireTokenCount(tokens: string[], expected: number, example: string): void {
  if (tokens.length !== expected) {
    throw malformed(`Formato non valido.\nEsempio: ${example}`);
  }
}

function malformed(publicMessage: string): AppError {
  return new AppError("Malformed command", { parseStatus: "malformed", publicMessage });
}

function unknownCommand(): AppError {
  return new AppError("Unknown command", {
    parseStatus: "unknown_command",
    publicMessage: "Comando non riconosciuto.\nUsa: NUOVA, STATO, NOTA, RICAMBIO, MANODOPERA, CHIUDI, RITIRATA, REVISIONE, REVISIONIINSCADENZA, CERCA/RICERCA, INVIA, COMANDO.",
  });
}
