import { requirePlatformOwnerSession } from "../../lib/admin/platform-auth";

// workshop_users.role = 'owner' is client-workshop scoped — not a platform owner.
// Platform owner access is controlled by requirePlatformOwnerSession (email allowlist).
export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  await requirePlatformOwnerSession();
  return <>{children}</>;
}
