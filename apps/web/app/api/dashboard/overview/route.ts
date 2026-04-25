import { requireDashboardRequest } from "../../../../lib/dashboard/auth";
import { getDashboardOverview } from "../../../../lib/dashboard/read";
import type { DashboardOverview } from "../../../../lib/dashboard/types";
import { AppError, getErrorMessage } from "../../../../lib/errors";

type DashboardOverviewResponse =
  | { ok: true; data: DashboardOverview }
  | { ok: false; error: string };

export async function GET(request: Request): Promise<Response> {
  try {
    requireDashboardRequest(request);
    const data = await getDashboardOverview();
    if (data === undefined) {
      throw new Error("Dashboard overview returned undefined data");
    }

    return Response.json({ ok: true, data } satisfies DashboardOverviewResponse);
  } catch (error) {
    const status = getDashboardOverviewErrorStatus(error);
    console.error("[dashboard-overview]", {
      event: "dashboard_overview_failed",
      status,
      errorType: error instanceof Error ? error.name : typeof error,
      message: getErrorMessage(error),
    });

    return Response.json(
      { ok: false, error: getDashboardOverviewErrorMessage(error, status) } satisfies DashboardOverviewResponse,
      { status },
    );
  }
}

function getDashboardOverviewErrorStatus(error: unknown): number {
  const status = error instanceof AppError ? error.statusCode : 500;
  return status >= 400 && status <= 599 ? status : 500;
}

function getDashboardOverviewErrorMessage(error: unknown, status: number): string {
  if (error instanceof AppError && status < 500 && error.publicMessage) {
    return error.publicMessage;
  }

  return "Dashboard overview unavailable.";
}
