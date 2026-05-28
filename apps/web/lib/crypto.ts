import { createHmac, timingSafeEqual } from "node:crypto";

import { AppError } from "./errors";

function safeBufferFromHex(value: string): Buffer | null {
  if (!/^[a-f0-9]+$/i.test(value) || value.length % 2 !== 0) {
    return null;
  }

  return Buffer.from(value, "hex");
}

export function timingSafeEqualString(actual: string | null | undefined, expected: string): boolean {
  if (!actual) {
    return false;
  }

  const actualBuffer = Buffer.from(actual, "utf8");
  const expectedBuffer = Buffer.from(expected, "utf8");

  let result = actualBuffer.length === expectedBuffer.length;
  if (result) {
    try {
      result = timingSafeEqual(actualBuffer, expectedBuffer);
    } catch {
      result = false;
    }
  }

  return result;
}

export function verifyMetaSha256Signature(input: {
  rawBody: string;
  signatureHeader: string | null;
  appSecret: string;
}): void {
  const prefix = "sha256=";
  const signature = input.signatureHeader?.trim();
  if (!signature?.startsWith(prefix)) {
    throw new AppError("Missing WhatsApp signature", { statusCode: 401, parseStatus: "ignored" });
  }

  const providedHex = signature.slice(prefix.length);
  const provided = safeBufferFromHex(providedHex);
  if (!provided) {
    throw new AppError("Invalid WhatsApp signature format", { statusCode: 401, parseStatus: "ignored" });
  }

  const expectedHex = createHmac("sha256", input.appSecret).update(input.rawBody, "utf8").digest("hex");
  const expected = Buffer.from(expectedHex, "hex");

  if (provided.length !== expected.length || !timingSafeEqual(provided, expected)) {
    throw new AppError("Invalid WhatsApp signature", { statusCode: 401, parseStatus: "ignored" });
  }
}
