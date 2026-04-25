import type { LucideIcon } from "lucide-react";
import Link from "next/link";
import { cn } from "../ui/utils";

type KpiTone = "accent" | "success" | "warning" | "danger" | "info";

const tones: Record<KpiTone, { icon: string; glow: string }> = {
  accent: {
    icon: "border-accent/30 bg-accent/[0.10] text-accent shadow-[inset_0_1px_0_rgba(255,255,255,0.06),0_0_20px_rgba(214,179,106,0.12)]",
    glow: "from-accent/[0.08] to-transparent",
  },
  success: {
    icon: "border-emerald-400/25 bg-emerald-400/[0.08] text-emerald-300 shadow-[inset_0_1px_0_rgba(255,255,255,0.06),0_0_20px_rgba(74,222,128,0.10)]",
    glow: "from-emerald-400/[0.06] to-transparent",
  },
  warning: {
    icon: "border-amber-400/25 bg-amber-400/[0.08] text-amber-300 shadow-[inset_0_1px_0_rgba(255,255,255,0.06),0_0_20px_rgba(251,191,36,0.10)]",
    glow: "from-amber-400/[0.06] to-transparent",
  },
  danger: {
    icon: "border-red-400/25 bg-red-400/[0.08] text-red-300 shadow-[inset_0_1px_0_rgba(255,255,255,0.06),0_0_20px_rgba(248,113,113,0.10)]",
    glow: "from-red-400/[0.06] to-transparent",
  },
  info: {
    icon: "border-sky-400/25 bg-sky-400/[0.08] text-sky-300 shadow-[inset_0_1px_0_rgba(255,255,255,0.06),0_0_20px_rgba(125,211,252,0.10)]",
    glow: "from-sky-400/[0.06] to-transparent",
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
      <div className={cn("pointer-events-none absolute inset-x-0 -top-12 h-28 bg-gradient-to-b blur-2xl opacity-70", t.glow)} aria-hidden />
      <div className="relative flex items-start justify-between">
        <div className={cn("flex h-10 w-10 items-center justify-center rounded-xl border transition-transform duration-300 ease-out-quint group-hover:scale-105", t.icon)}>
          <Icon className="h-5 w-5" />
        </div>
      </div>
      <div className="relative mt-6">
        <p className="text-[2rem] font-semibold leading-none tracking-tight text-zinc-50 tabular-nums">{value}</p>
        <p className="mt-2 text-[13px] font-medium text-zinc-400">{label}</p>
        {hint ? <p className="mt-1 text-xs text-zinc-600">{hint}</p> : null}
      </div>
    </>
  );

  if (href) {
    return (
      <Link
        href={href}
        className="glass-panel group relative block overflow-hidden rounded-2xl p-5 transition-all duration-300 ease-out-quint hover:-translate-y-[1px] hover:border-white/20 focus-visible:border-accent/40 focus-visible:outline-none"
      >
        {content}
      </Link>
    );
  }

  return (
    <div className="glass-panel group relative overflow-hidden rounded-2xl p-5 transition-all duration-300 ease-out-quint hover:-translate-y-[1px] hover:border-white/20">
      {content}
    </div>
  );
}
