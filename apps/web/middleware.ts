import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

// Centralized auth guard for dashboard and work-order API routes.
// Route handlers still call requireDashboardRequest() — this is defense-in-depth.
// Internal (/api/internal/*), webhook (/api/webhooks/*), and admin (/api/admin/*)
// routes use separate auth mechanisms and are intentionally excluded here.

export function middleware(request: NextRequest): NextResponse {
  const expected = process.env.Criccheto_DASHBOARD_API_SECRET;
  if (!expected) {
    console.error("[middleware] Criccheto_DASHBOARD_API_SECRET not configured");
    return NextResponse.json({ ok: false, error: "Server misconfigured" }, { status: 500 });
  }

  const actual = request.headers.get("x-dashboard-secret");
  // Constant-time check is also done inside requireDashboardRequest() in each handler.
  // This early exit prevents reaching route handler code at all on unauthenticated requests.
  if (!actual || actual.length !== expected.length || actual !== expected) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    "/api/dashboard/:path*",
    "/api/work-orders/:path*",
    "/api/customers/:path*",
    "/api/vehicles/:path*",
    "/api/revisions/:path*",
  ],
};
