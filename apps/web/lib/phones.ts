const PHONE_FORMATTING_CHARS = /[\s()./-]+/g;
const ALLOWED_CUSTOMER_PHONE_CHARS = /^[+\d\s()./-]+$/;
export const CUSTOMER_PHONE_VALIDATION_MESSAGE =
  "Telefono cliente non valido.\nUsa un numero italiano come 3331234567, 02 12345678 o +39 333 123 4567.";

export function normalizePhone(input: string): string {
  const trimmed = input.trim();
  if (!trimmed) {
    return "";
  }

  const compact = trimmed.replace(PHONE_FORMATTING_CHARS, "");
  if (compact.startsWith("00")) {
    return `+${compact.slice(2)}`;
  }

  return compact;
}

export function normalizeCustomerPhone(input: string): string | null {
  const trimmed = input.trim();
  if (!trimmed || !ALLOWED_CUSTOMER_PHONE_CHARS.test(trimmed)) {
    return null;
  }

  const normalized = normalizePhone(trimmed);
  if (!normalized || !/^\+?\d+$/.test(normalized)) {
    return null;
  }

  const digits = normalized.replace(/^\+/, "");
  if (normalized.startsWith("+")) {
    return digits.length >= 6 && digits.length <= 15 ? `+${digits}` : null;
  }

  if (digits.startsWith("39") && digits.length >= 8 && digits.length <= 15) {
    return `+${digits}`;
  }

  return digits.length >= 6 && digits.length <= 12 ? `+39${digits}` : null;
}
