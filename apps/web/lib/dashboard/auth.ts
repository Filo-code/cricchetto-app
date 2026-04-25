import { timingSafeEqualString } from "../crypto";
import { AppError } from "../errors";

const DASHBOARD_SECRET_HEADER = "x-dashboard-secret";

export function requireDashboardRequest(request: Request): void {
  const expected = process.env.Criccheto_DASHBOARD_API_SECRET ?? process.env.Criccheto_INTERNAL_API_SECRET;
  if (!expected) {
    throw new AppError("Criccheto_DASHBOARD_API_SECRET or Criccheto_INTERNAL_API_SECRET is required", {
      statusCode: 500,
      parseStatus: "error",
    });
  }

  const actual = request.headers.get(DASHBOARD_SECRET_HEADER);
  if (!timingSafeEqualString(actual, expected)) {
    throw new AppError("Invalid dashboard API secret", { statusCode: 401, parseStatus: "ignored" });
  }
}

export function dashboardServerHeaders(): HeadersInit {
  const secret = process.env.Criccheto_DASHBOARD_API_SECRET ?? process.env.Criccheto_INTERNAL_API_SECRET;
  if (!secret) {
    throw new Error("Criccheto_DASHBOARD_API_SECRET or Criccheto_INTERNAL_API_SECRET is required");
  }

  return {
    [DASHBOARD_SECRET_HEADER]: secret,
  };
}
