import { requireDashboardSession } from "../../lib/dashboard/session";

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  await requireDashboardSession();
  return children;
}
