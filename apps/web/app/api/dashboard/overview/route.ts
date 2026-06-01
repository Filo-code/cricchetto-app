import { requireDashboardRequest } from "../../../../lib/dashboard/auth";
import { getDashboardOverview } from "../../../../lib/dashboard/read";
import type { DashboardOverview } from "../../../../lib/dashboard/types";
import { AppError, getErrorMessage } from "../../../../lib/errors";

type DashboardOverviewResponse =
  | { ok: true; data: DashboardOverview }
  | { ok: false; error: string };

export async function GET(request: Request): Promise<Response> {
  try {
    // 🔐 AUTH GUARD (API SECRET ONLY)
    requireDashboardRequest(request);

    // BUSINESS LOGIC
    const data = await getDashboardOverview();

    if (!data) {
      throw new AppError("Dashboard empty", {
        statusCode: 404,
        publicMessage: "No dashboard data available",
      });
    }

    return Response.json({
      ok: true,
      data,
    } satisfies DashboardOverviewResponse);
  } catch (error) {
    const status = getDashboardOverviewErrorStatus(error);

    console.error("[dashboard-overview]", {
      event: "dashboard_overview_failed",
      status,
      errorType: error instanceof Error ? error.name : typeof error,
      message: getErrorMessage(error),
    });

    return Response.json(
      {
        ok: false,
        error: getDashboardOverviewErrorMessage(error, status),
      } satisfies DashboardOverviewResponse,
      { status }
    );
  }
}

/**
 * ERROR STATUS NORMALIZATION
 */
function getDashboardOverviewErrorStatus(error: unknown): number {
  if (error instanceof AppError) {
    return error.statusCode;
  }
  return 500;
}

/**
 * ERROR MESSAGE NORMALIZATION
 */
function getDashboardOverviewErrorMessage(error: unknown, status: number): string {
  if (error instanceof AppError && status < 500 && error.publicMessage) {
    return error.publicMessage;
  }

  if (status === 401) return "Unauthorized";
  if (status === 404) return "Not found";

  return "Dashboard unavailable.";
}