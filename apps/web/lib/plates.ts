import { AppError } from "./errors";

const PLATE_PATTERN = /^[A-Z0-9]{5,10}$/;

export function normalizePlate(input: string): string {
  return input.trim().toUpperCase().replace(/[\s.-]/g, "");
}

export function assertValidPlate(input: string): string {
  const plate = normalizePlate(input);

  if (!PLATE_PATTERN.test(plate)) {
    throw new AppError("Invalid plate", {
      parseStatus: "malformed",
      publicMessage: "Targa non valida.\nEsempio: NUOVA AB123CD",
    });
  }

  return plate;
}
