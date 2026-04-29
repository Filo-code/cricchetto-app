import { AppError, getErrorMessage } from "../../../../../lib/errors";
import { requireDashboardRequest } from "../../../../../lib/dashboard/auth";
import { getWorkshopSettings } from "../../../../../lib/dashboard/read";
import { listWorkshopStaff, addWorkshopStaffMember, type StaffMember } from "../../../../../lib/staff";

type ListResponse = { ok: true; data: StaffMember[] } | { ok: false; error: string };
type AddResponse = { ok: true; data: StaffMember } | { ok: false; error: string };

export async function GET(request: Request): Promise<Response> {
  try {
    requireDashboardRequest(request);
    const settings = await getWorkshopSettings();
    const staff = await listWorkshopStaff(settings.id);
    return Response.json({ ok: true, data: staff } satisfies ListResponse);
  } catch (error) {
    const status = error instanceof AppError ? error.statusCode : 500;
    console.error("[dashboard-settings-staff-get]", { message: getErrorMessage(error) });
    return Response.json({ ok: false, error: "Elenco staff non disponibile." } satisfies ListResponse, { status });
  }
}

export async function POST(request: Request): Promise<Response> {
  try {
    requireDashboardRequest(request);
    const settings = await getWorkshopSettings();

    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return Response.json({ ok: false, error: "Corpo della richiesta non valido." } satisfies AddResponse, { status: 400 });
    }

    const b = body as Record<string, unknown>;
    const displayName = typeof b.displayName === "string" ? b.displayName.trim() : "";
    const phone = typeof b.phone === "string" ? b.phone.trim() : "";
    const roleRaw = typeof b.role === "string" ? b.role : "staff";
    const role = roleRaw === "owner" || roleRaw === "staff" ? roleRaw : null;

    if (!displayName) {
      return Response.json({ ok: false, error: "Il nome è obbligatorio." } satisfies AddResponse, { status: 400 });
    }
    if (!phone) {
      return Response.json({ ok: false, error: "Il numero WhatsApp è obbligatorio." } satisfies AddResponse, { status: 400 });
    }
    if (!role) {
      return Response.json({ ok: false, error: "Il ruolo deve essere 'owner' o 'staff'." } satisfies AddResponse, { status: 400 });
    }

    const member = await addWorkshopStaffMember(settings.id, { displayName, phone, role });
    return Response.json({ ok: true, data: member } satisfies AddResponse, { status: 201 });
  } catch (error) {
    if (error instanceof Error && error.message.includes("già registrato")) {
      return Response.json({ ok: false, error: error.message } satisfies AddResponse, { status: 409 });
    }
    if (error instanceof Error && error.message.includes("non valido")) {
      return Response.json({ ok: false, error: error.message } satisfies AddResponse, { status: 400 });
    }
    const status = error instanceof AppError ? error.statusCode : 500;
    console.error("[dashboard-settings-staff-post]", { message: getErrorMessage(error) });
    return Response.json({ ok: false, error: "Operazione non riuscita." } satisfies AddResponse, { status });
  }
}
