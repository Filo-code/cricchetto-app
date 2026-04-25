import { AppError } from "./errors";

export function parsePositiveDecimal(input: string, label: string): number {
  const normalized = input.trim().replace(",", ".");
  const value = Number(normalized);

  if (!Number.isFinite(value) || value <= 0) {
    throw new AppError(`Invalid ${label}`, {
      parseStatus: "malformed",
      publicMessage: `Valore non valido per ${label}.`,
    });
  }

  return value;
}

export function formatMoney(value: number, currency = "EUR"): string {
  return `${value.toFixed(2).replace(".", ",")} ${currency}`;
}

export function formatDecimal(value: number): string {
  return Number.isInteger(value) ? String(value) : String(value).replace(".", ",");
}
