import { supabaseServer } from "../supabase-server";
import { addDays, getLocalDate } from "../time";
import { readDashboardWorkshop, countOverdue, ACTIVE_STATUSES } from "./read-core";
import { readWorkOrderSummaries, readRecentActivity } from "./read-work-orders";
import { readUpcomingRevisions } from "./read-revisions";
import type { DashboardOverview, DashboardTodayCounts } from "./types";

export async function getDashboardOverview(): Promise<DashboardOverview> {
  const workshop = await readDashboardWorkshop();
  const [activeWorkOrders, inProgressWorkOrders, readyWorkOrders, recentActivity, upcomingRevisions, todayCounts] = await Promise.all([
    readWorkOrderSummaries(workshop.id, ACTIVE_STATUSES, 12),
    readWorkOrderSummaries(workshop.id, ["in_progress"], 8),
    readWorkOrderSummaries(workshop.id, ["ready"], 8),
    readRecentActivity(workshop.id, 10),
    readUpcomingRevisions(workshop.id, workshop.timezone, 12),
    readTodayCounts(workshop.id, workshop.timezone),
  ]);

  return {
    workshop,
    counts: {
      active: activeWorkOrders.length,
      accepted: activeWorkOrders.filter((wo) => wo.status === "accepted").length,
      inProgress: inProgressWorkOrders.length,
      ready: readyWorkOrders.length,
      overdueRevisions: countOverdue(upcomingRevisions, getLocalDate(workshop.timezone)),
    },
    todayCounts,
    activeWorkOrders,
    inProgressWorkOrders,
    readyWorkOrders,
    recentActivity,
    upcomingRevisions,
  };
}

async function readTodayCounts(workshopId: string, timezone: string): Promise<DashboardTodayCounts> {
  const today = getLocalDate(timezone);
  const todayStart = `${today}T00:00:00.000Z`;

  const [enteredResult, readyResult, staleResult] = await Promise.all([
    supabaseServer
      .from("work_orders")
      .select("id", { count: "exact", head: true })
      .eq("workshop_id", workshopId)
      .in("status", ACTIVE_STATUSES)
      .gte("created_at", todayStart),
    supabaseServer
      .from("work_orders")
      .select("id", { count: "exact", head: true })
      .eq("workshop_id", workshopId)
      .eq("status", "ready")
      .gte("ready_at", todayStart),
    supabaseServer
      .from("work_orders")
      .select("id", { count: "exact", head: true })
      .eq("workshop_id", workshopId)
      .in("status", ["accepted", "in_progress"])
      .lte("updated_at", addDays(today, -3)),
  ]);

  const [awaitingResult] = await Promise.all([
    supabaseServer
      .from("work_orders")
      .select("id", { count: "exact", head: true })
      .eq("workshop_id", workshopId)
      .eq("status", "ready"),
  ]);

  return {
    enteredToday: enteredResult.count ?? 0,
    readyToday: readyResult.count ?? 0,
    awaitingPickup: awaitingResult.count ?? 0,
    staleWorkOrders: staleResult.count ?? 0,
  };
}
