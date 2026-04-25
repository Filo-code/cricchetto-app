import type { LucideIcon } from "lucide-react";
import type { ReactNode } from "react";

export function EmptyState({
  title,
  children,
  icon: Icon,
}: {
  title: string;
  children?: ReactNode;
  icon?: LucideIcon;
}) {
  return (
    <div className="rounded-2xl border border-dashed border-white/10 bg-white/[0.02] px-5 py-10 text-center">
      {Icon ? (
        <div className="mx-auto mb-4 flex h-11 w-11 items-center justify-center rounded-2xl border border-white/10 bg-white/[0.04] text-zinc-500">
          <Icon className="h-5 w-5" />
        </div>
      ) : null}
      <p className="text-sm font-medium text-zinc-200">{title}</p>
      {children ? <div className="mt-1.5 text-sm leading-6 text-zinc-500">{children}</div> : null}
    </div>
  );
}
