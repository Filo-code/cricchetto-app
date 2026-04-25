import type { ReactNode } from "react";
import { cn } from "./utils";

type BadgeTone = "neutral" | "amber" | "green" | "blue" | "red";

const tones: Record<BadgeTone, { surface: string; dot: string }> = {
  neutral: {
    surface: "border-white/10 bg-white/[0.06] text-zinc-200",
    dot: "bg-zinc-400",
  },
  amber: {
    surface: "border-accent/25 bg-accent/[0.12] text-accent-100",
    dot: "bg-accent",
  },
  green: {
    surface: "border-emerald-400/20 bg-emerald-400/10 text-emerald-200",
    dot: "bg-emerald-400",
  },
  blue: {
    surface: "border-sky-400/20 bg-sky-400/10 text-sky-200",
    dot: "bg-sky-400",
  },
  red: {
    surface: "border-red-400/25 bg-red-400/10 text-red-200",
    dot: "bg-red-400",
  },
};

export function Badge({
  children,
  tone = "neutral",
  className,
  dot = false,
  pulse = false,
}: {
  children: ReactNode;
  tone?: BadgeTone;
  className?: string;
  dot?: boolean;
  pulse?: boolean;
}) {
  const t = tones[tone];
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] font-medium tracking-wide",
        t.surface,
        className,
      )}
    >
      {dot ? (
        <span className={cn("status-dot", t.dot, pulse && "status-dot-pulse")} aria-hidden />
      ) : null}
      {children}
    </span>
  );
}
