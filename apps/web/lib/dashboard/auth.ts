import { timingSafeEqualString } from "../crypto";
import { AppError } from "../errors";

const DASHBOARD_SECRET_HEADER = "x-dashboard-secret";

export function requireDashboardRequest(request: Request): void {
  const expected = process.env.Cricchetto_DASHBOARD_API_SECRET;

  if (!expected) {
    throw new AppError("Dashboard API misconfigured", {
      statusCode: 500,
      parseStatus: "error",
    });
  }

  const actual = request.headers.get(DASHBOARD_SECRET_HEADER);

  if (!actual) {
    throw new AppError("Missing dashboard secret", {
      statusCode: 401,
      parseStatus: "ignored",
    });
  }

  const isValid = timingSafeEqualString(actual, expected);

  if (!isValid) {
    throw new AppError("Invalid dashboard secret", {
      statusCode: 401,
      parseStatus: "ignored",
    });
  }
}

export function dashboardServerHeaders(): HeadersInit {
  const secret = process.env.Cricchetto_DASHBOARD_API_SECRET;

  if (!secret) {
    throw new Error("Cricchetto_DASHBOARD_API_SECRET is required");
  }

  return {
    [DASHBOARD_SECRET_HEADER]: secret,
  };
}