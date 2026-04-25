import type { ReactNode } from "react";
import { cn } from "./utils";

export function Table({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <div className="overflow-hidden rounded-2xl border border-white/[0.07] bg-white/[0.01]">
      <table className={cn("w-full border-collapse text-left text-sm", className)}>{children}</table>
    </div>
  );
}

export function Th({ children }: { children: ReactNode }) {
  return (
    <th className="border-b border-white/[0.06] bg-white/[0.03] px-4 py-3 text-[10px] font-mono font-medium uppercase tracking-[0.18em] text-zinc-500">
      {children}
    </th>
  );
}

export function Td({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <td
      className={cn(
        "border-b border-white/[0.04] px-4 py-3 text-zinc-200 transition-colors",
        "[tr:hover_&]:bg-white/[0.015]",
        "last:border-b-0",
        className,
      )}
    >
      {children}
    </td>
  );
}
