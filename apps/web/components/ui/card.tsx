import type { ReactNode } from "react";
import { cn } from "./utils";

export function Card({ children, className, interactive = false }: { children: ReactNode; className?: string; interactive?: boolean }) {
  return (
    <section
      className={cn(
        "glass-panel rounded-2xl p-5 sm:p-6",
        interactive && "glass-panel-interactive",
        className,
      )}
    >
      {children}
    </section>
  );
}

export function CardHeader({ title, eyebrow, action }: { title: string; eyebrow?: string; action?: ReactNode }) {
  return (
    <div className="mb-5 flex items-start justify-between gap-4">
      <div>
        {eyebrow ? (
          <p className="mb-1.5 text-[10px] font-mono font-medium uppercase tracking-[0.2em] text-zinc-500">{eyebrow}</p>
        ) : null}
        <h2 className="text-lg font-semibold tracking-tight text-zinc-50">{title}</h2>
      </div>
      {action}
    </div>
  );
}
