import type { LucideIcon } from "lucide-react";
import Link from "next/link";
import { cn } from "../ui/utils";

type KpiTone = "accent" | "success" | "warning" | "danger" | "info";

const tones: Record<KpiTone, { icon: string; glow: string; accent: string }> = {
  accent: {
    icon: "border-accent/25 bg-accent/[0.08] text-accent shadow-[inset_0_1px_0_rgba(255,255,255,0.05),0_0_16px_rgba(214,179,106,0.10)]",
    glow: "from-accent/[0.06] to-transparent",
    accent: "text-accent",
  },
  success: {
    icon: "border-emerald-400/20 bg-emerald-400/[0.06] text-emerald-300 shadow-[inset_0_1px_0_rgba(255,255,255,0.05),0_0_16px_rgba(74,222,128,0.08)]",
    glow: "from-emerald-400/[0.05] to-transparent",
    accent: "text-emerald-400",
  },
  warning: {
    icon: "border-amber-400/20 bg-amber-400/[0.06] text-amber-300 shadow-[inset_0_1px_0_rgba(255,255,255,0.05),0_0_16px_rgba(251,191,36,0.08)]",
    glow: "from-amber-400/[0.05] to-transparent",
    accent: "text-amber-400",
  },
  danger: {
    icon: "border-red-400/20 bg-red-400/[0.06] text-red-300 shadow-[inset_0_1px_0_rgba(255,255,255,0.05),0_0_16px_rgba(248,113,113,0.08)]",
    glow: "from-red-400/[0.04] to-transparent",
    accent: "text-red-400",
  },
  info: {
    icon: "border-sky-400/20 bg-sky-400/[0.06] text-sky-300 shadow-[inset_0_1px_0_rgba(255,255,255,0.05),0_0_16px_rgba(125,211,252,0.08)]",
    glow: "from-sky-400/[0.05] to-transparent",
    accent: "text-sky-400",
  },
};

export function KpiCard({
  label,
  value,
  icon: Icon,
  tone = "accent",
  hint,
  href,
}: {
  label: string;
  value: string | number;
  icon: LucideIcon;
  tone?: KpiTone;
  hint?: string;
  href?: string;
}) {
  const t = tones[tone];
  const content = (
    <>
      {/* Subtle ambient glow from top — Filò pattern */}
      <div className={cn("pointer-events-none absolute inset-x-0 -top-10 h-24 bg-gradient-to-b blur-2xl opacity-60", t.glow)} aria-hidden />
      <div className="relative flex items-start justify-between">
        <div className={cn("flex h-9 w-9 items-center justify-center rounded-xl border transition-transform duration-300 ease-out-quint group-hover:scale-105", t.icon)}>
          <Icon className="h-4 w-4" />
        </div>
      </div>
      <div className="relative mt-5">
        {/* Filò-style mono label */}
        <p className="text-[10.5px] font-mono font-medium uppercase tracking-widest text-zinc-500">{label}</p>
        <p className="mt-2 text-[2.25rem] font-bold leading-none tracking-tight text-zinc-50 tabular-nums">{value}</p>
        {hint ? <p className={cn("mt-1.5 text-[11px] font-medium", t.accent)}>{hint}</p> : null}
      </div>
    </>
  );

  if (href) {
    return (
      <Link
        href={href}
        className="glass-panel group relative block overflow-hidden rounded-2xl p-5 transition-all duration-300 ease-out-quint hover:-translate-y-[1px] hover:border-white/[0.12] focus-visible:border-accent/40 focus-visible:outline-none"
      >
        {content}
      </Link>
    );
  }

  return (
    <div className="glass-panel group relative overflow-hidden rounded-2xl p-5 transition-all duration-300 ease-out-quint hover:-translate-y-[1px] hover:border-white/[0.12]">
      {content}
    </div>
  );
}
