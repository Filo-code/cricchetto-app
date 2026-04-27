import "server-only";

import { supabaseServer } from "../supabase-server";

export type WorkshopStatus = "active" | "suspended" | "closed";

export interface AdminWorkshopUser {
  id: string;
  email: string;
  displayName: string | null;
  role: "owner" | "staff";
  isActive: boolean;
}

export interface AdminWorkshopListItem {
  id: string;
  name: string;
  status: WorkshopStatus;
  createdAt: string;
  closedAt: string | null;
  closedReason: string | null;
  city: string | null;
  users: AdminWorkshopUser[];
}

export async function listWorkshopsForAdmin(): Promise<AdminWorkshopListItem[]> {
  const { data: workshops, error } = await supabaseServer
    .from("workshops")
    .select("id,name,display_name,status,created_at,closed_at,closed_reason")
    .order("created_at", { ascending: false });

  if (error) throw new Error(`Failed to list workshops: ${error.message}`);
  const rows = (workshops ?? []) as any[];
  if (rows.length === 0) return [];

  const workshopIds = rows.map((w) => w.id);

  const { data: profiles } = await (supabaseServer as any)
    .from("workshop_profiles")
    .select("workshop_id,citta")
    .in("workshop_id", workshopIds);
  const cityByWorkshop = new Map<string, string | null>(
    ((profiles ?? []) as any[]).map((p) => [p.workshop_id, p.citta ?? null]),
  );

  const { data: users, error: usersErr } = await supabaseServer
    .from("workshop_users")
    .select("id,workshop_id,email,display_name,role,is_active")
    .in("workshop_id", workshopIds)
    .order("created_at", { ascending: true });

  if (usersErr) throw new Error(`Failed to list workshop users: ${usersErr.message}`);

  const usersByWorkshop = new Map<string, AdminWorkshopUser[]>();
  for (const u of (users ?? []) as any[]) {
    const list = usersByWorkshop.get(u.workshop_id) ?? [];
    list.push({
      id: u.id,
      email: u.email,
      displayName: u.display_name ?? null,
      role: u.role as "owner" | "staff",
      isActive: u.is_active,
    });
    usersByWorkshop.set(u.workshop_id, list);
  }

  return rows.map((w) => ({
    id: w.id,
    name: (w.display_name ?? w.name) as string,
    status: ((w.status ?? "active") as WorkshopStatus),
    createdAt: w.created_at as string,
    closedAt: (w.closed_at ?? null) as string | null,
    closedReason: (w.closed_reason ?? null) as string | null,
    city: cityByWorkshop.get(w.id) ?? null,
    users: usersByWorkshop.get(w.id) ?? [],
  }));
}

export async function setWorkshopStatus(
  workshopId: string,
  status: WorkshopStatus,
  reason?: string,
): Promise<void> {
  const update: Record<string, unknown> = { status };
  if (status === "closed") {
    update.closed_at = new Date().toISOString();
    if (reason) update.closed_reason = reason;
  }
  if (status === "active") {
    update.closed_at = null;
    update.closed_reason = null;
  }

  const { error } = await supabaseServer
    .from("workshops")
    .update(update)
    .eq("id", workshopId);

  if (error) throw new Error(`Failed to update workshop status: ${error.message}`);
}
