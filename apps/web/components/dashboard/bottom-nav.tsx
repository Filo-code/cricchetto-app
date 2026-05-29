"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { LayoutDashboard, Wrench, Car, RotateCw } from "lucide-react";

const NAV_ITEMS = [
  { href: "/dashboard", label: "Cruscotto", icon: LayoutDashboard },
  { href: "/dashboard/work-orders", label: "Schede", icon: Wrench },
  { href: "/dashboard/vehicles", label: "Veicoli", icon: Car },
  { href: "/dashboard/revisions", label: "Revisioni", icon: RotateCw },
];

export function BottomNav() {
  const pathname = usePathname();

  return (
    <nav className="fixed bottom-0 left-0 right-0 border-t border-white/[0.06] bg-black/95 backdrop-blur-sm lg:hidden">
      <div className="flex h-16 items-center justify-around px-2">
        {NAV_ITEMS.map(({ href, label, icon: Icon }) => {
          const isActive = pathname === href || (href !== "/dashboard" && pathname.startsWith(href));
          return (
            <Link
              key={href}
              href={href}
              className={`flex flex-col items-center justify-center gap-1 flex-1 py-2 px-1 rounded-lg transition-colors ${
                isActive
                  ? "text-accent bg-accent/10"
                  : "text-zinc-400 hover:text-zinc-200 hover:bg-white/[0.05]"
              }`}
            >
              <Icon className="h-5 w-5" />
              <span className="text-[10px] leading-none text-center">{label}</span>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
