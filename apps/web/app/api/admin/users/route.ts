import { AppError, getErrorMessage } from "../../../../lib/errors";
import { verifyDashboardSessionForApi } from "../../../../lib/dashboard/session-api";
import { readDashboardWorkshop } from "../../../../lib/dashboard/read";
import { createWorkshopUser, generatePasswordResetToken } from "../../../../lib/dashboard/users";

export async function POST(request: Request): Promise<Response> {
  try {
    const session = await verifyDashboardSessionForApi();
    if (!session || session.role !== "owner") {
      return Response.json({ ok: false, error: "Non autorizzato." }, { status: 403 });
    }

    const body = await request.json() as { email?: unknown; displayName?: unknown; role?: unknown };
    const email = typeof body.email === "string" ? body.email.trim() : "";
    const displayName = typeof body.displayName === "string" ? body.displayName.trim() || null : null;
    const role = body.role === "staff" ? "staff" : "owner";

    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return Response.json({ ok: false, error: "Email non valida." }, { status: 400 });
    }

    const workshop = await readDashboardWorkshop();
    if (session.workshopId !== workshop.id) {
      return Response.json({ ok: false, error: "Non autorizzato." }, { status: 403 });
    }

    const user = await createWorkshopUser({ workshopId: workshop.id, email, displayName: displayName ?? undefined, role });
    const { token, expiresAt } = await generatePasswordResetToken(user.id);

    const baseUrl = process.env.NEXT_PUBLIC_APP_URL ?? process.env.Criccheto_APP_URL ?? "";
    const setupUrl = `${baseUrl}/set-password?token=${token}`;

    return Response.json({
      ok: true,
      user: { id: user.id, email: user.email, role: user.role, displayName: user.displayName },
      setupUrl,
      expiresAt: expiresAt.toISOString(),
    });
  } catch (error) {
    const status = error instanceof AppError ? error.statusCode : 500;
    return Response.json({ ok: false, error: getErrorMessage(error) }, { status });
  }
}
