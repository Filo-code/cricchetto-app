import { cookies } from "next/headers";
import { isPlatformSession } from "../../../../../lib/admin/platform-session";
import { readDashboardSearchSuggestions, readDashboardWorkshop } from "../../../../../lib/dashboard/read";
import { COOKIE_NAME, verifyDashboardSession } from "../../../../../lib/dashboard/session-core";
import { AppError, getErrorMessage } from "../../../../../lib/errors";

export async function GET(request: Request): Promise<Response> {
  try {
    const cookieStore = await cookies();
    const session = verifyDashboardSession(cookieStore.get(COOKIE_NAME)?.value);
    if (!session) {
      return Response.json({ ok: false, error: "Non autenticato" }, { status: 401 });
    }

    let workshop: Awaited<ReturnType<typeof readDashboardWorkshop>>;
    try {
      workshop = await readDashboardWorkshop();
    } catch {
      return Response.json({ ok: false, error: "Non autenticato" }, { status: 401 });
    }

    if (
      (workshop.status === "suspended" || workshop.status === "closed")
      && !isPlatformSession(session)
    ) {
      return Response.json({ ok: false, error: "Account sospeso" }, { status: 403 });
    }

    const url = new URL(request.url);
    const q = url.searchParams.get("q") ?? "";
    const data = await readDashboardSearchSuggestions(q);
    return Response.json({ ok: true, data });
  } catch (error) {
    const status = error instanceof AppError ? error.statusCode : 500;
    return Response.json(
      { ok: false, error: error instanceof AppError ? error.publicMessage : getErrorMessage(error) },
      { status },
    );
  }
}
