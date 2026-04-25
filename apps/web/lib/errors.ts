import type { ParseStatus } from "./types";

export class AppError extends Error {
  readonly statusCode: number;
  readonly parseStatus: ParseStatus;
  readonly publicMessage: string;

  constructor(message: string, options: { statusCode?: number; parseStatus?: ParseStatus; publicMessage?: string } = {}) {
    super(message);
    this.name = "AppError";
    this.statusCode = options.statusCode ?? 400;
    this.parseStatus = options.parseStatus ?? "validation_failed";
    this.publicMessage = options.publicMessage ?? "Richiesta non valida.";
  }
}

export class DuplicateInboundMessageError extends AppError {
  constructor() {
    super("Duplicate inbound message", {
      statusCode: 200,
      parseStatus: "duplicate",
      publicMessage: "",
    });
    this.name = "DuplicateInboundMessageError";
  }
}

export function getErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }

  return String(error);
}
