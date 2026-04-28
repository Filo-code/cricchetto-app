import "server-only";

import { LayoutGrid } from "lucide-react";
import { peekDashboardSession } from "../../lib/dashboard/session-core";
import { isPlatformSession } from "../../lib/admin/platform-session";
import { ButtonLink } from "../ui/button";

export async function PlatformConsoleNavLink() {
  const session = await peekDashboardSession();
  if (!session || !isPlatformSession(session)) return null;
  return (
    <ButtonLink href="/admin/workshops" aria-label="Console Filò — gestione officine" className="shrink-0">
      <LayoutGrid className="h-4 w-4" />
      Console Filò
    </ButtonLink>
  );
}
