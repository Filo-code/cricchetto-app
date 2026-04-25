import { AppError } from "./errors";
import { timingSafeEqualString } from "./crypto";

export function requireInternalRequest(request: Request): void {
  const expected = process.env.Criccheto_INTERNAL_API_SECRET;

  if (!expected) {
    throw new AppError("Criccheto_INTERNAL_API_SECRET is required", { statusCode: 500, parseStatus: "error" });
  }

  const actual = request.headers.get("x-internal-secret");
  if (!timingSafeEqualString(actual, expected)) {
    throw new AppError("Invalid internal API secret", { statusCode: 401, parseStatus: "ignored" });
  }
}
