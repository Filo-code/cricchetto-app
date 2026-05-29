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
  displayName: string | null;
  status: WorkshopStatus;
  createdAt: string;
  closedAt: string | null;
  closedReason: string | null;
  city: string | null;
  timezone: string;
  users: AdminWorkshopUser[];
  workOrderCount: number;
  lastActivityAt: string | null;
  activeUserCount: number;
}

export async function listWorkshopsForAdmin(): Promise<AdminWorkshopListItem[]> {
  const { data: workshops, error } = await supabaseServer
    .from("workshops")
    .select("id,name,display_name,status,created_at,closed_at,closed_reason,timezone")
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

  // Usage metrics: work-order count + last activity per workshop.
  // MVP scale (few tenants, bounded work orders) — fetch ids+created_at and aggregate in JS.
  // Revisit with a grouped RPC if work_orders grows large.
  const woCountByWorkshop = new Map<string, number>();
  const lastActivityByWorkshop = new Map<string, string>();
  const { data: workOrders, error: woErr } = await supabaseServer
    .from("work_orders")
    .select("workshop_id,created_at")
    .in("workshop_id", workshopIds);
  if (woErr) {
    console.warn("[admin/workshops] work_orders metrics skipped:", woErr.message);
  } else {
    for (const wo of (workOrders ?? []) as any[]) {
      woCountByWorkshop.set(wo.workshop_id, (woCountByWorkshop.get(wo.workshop_id) ?? 0) + 1);
      const prev = lastActivityByWorkshop.get(wo.workshop_id);
      if (!prev || wo.created_at > prev) {
        lastActivityByWorkshop.set(wo.workshop_id, wo.created_at as string);
      }
    }
  }

  return rows.map((w) => ({
    id: w.id,
    name: (w.display_name ?? w.name) as string,
    displayName: (w.display_name ?? null) as string | null,
    status: ((w.status ?? "active") as WorkshopStatus),
    createdAt: w.created_at as string,
    closedAt: (w.closed_at ?? null) as string | null,
    closedReason: (w.closed_reason ?? null) as string | null,
    city: cityByWorkshop.get(w.id) ?? null,
    timezone: (w.timezone ?? "Europe/Rome") as string,
    users: usersByWorkshop.get(w.id) ?? [],
    workOrderCount: woCountByWorkshop.get(w.id) ?? 0,
    lastActivityAt: lastActivityByWorkshop.get(w.id) ?? null,
    activeUserCount: (usersByWorkshop.get(w.id) ?? []).filter((u) => u.isActive).length,
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

export interface WorkshopAdminUpdate {
  displayName: string | null;
  city: string | null;
  timezone: string | null;
  ownerUserId: string | null;
  ownerDisplayName: string | null;
}

export async function updateWorkshopForAdmin(
  workshopId: string,
  updates: WorkshopAdminUpdate,
): Promise<void> {
  const workshopPatch: Record<string, unknown> = {};
  if (updates.displayName !== null) {
    workshopPatch.display_name = updates.displayName.trim() || null;
  }
  if (updates.timezone !== null && updates.timezone.trim()) {
    workshopPatch.timezone = updates.timezone.trim();
  }

  if (Object.keys(workshopPatch).length > 0) {
    const { error } = await supabaseServer
      .from("workshops")
      .update(workshopPatch)
      .eq("id", workshopId);
    if (error) throw new Error(`Errore aggiornamento officina: ${error.message}`);
  }

  if (updates.city !== null) {
    const { error } = await (supabaseServer as any)
      .from("workshop_profiles")
      .update({ citta: updates.city.trim() || null })
      .eq("workshop_id", workshopId);
    if (error) throw new Error(`Errore aggiornamento profilo: ${error.message}`);
  }

  if (updates.ownerUserId && updates.ownerDisplayName !== null) {
    const { error } = await (supabaseServer as any)
      .from("workshop_users")
      .update({ display_name: updates.ownerDisplayName.trim() || null })
      .eq("id", updates.ownerUserId)
      .eq("workshop_id", workshopId);
    if (error) throw new Error(`Errore aggiornamento utente: ${error.message}`);
  }
}
