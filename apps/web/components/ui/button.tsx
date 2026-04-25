import type { AnchorHTMLAttributes, ButtonHTMLAttributes, ReactNode } from "react";
import Link from "next/link";
import { cn } from "./utils";

const base =
  "inline-flex h-10 items-center justify-center gap-2 rounded-xl border px-4 text-sm font-medium tracking-tight transition-all duration-200 ease-out-quint focus:outline-none focus-visible:ring-2 focus-visible:ring-accent/60 focus-visible:ring-offset-2 focus-visible:ring-offset-[#0a0c10] disabled:pointer-events-none disabled:opacity-50 active:translate-y-[1px]";

const variants = {
  primary:
    "border-accent/50 bg-gradient-to-b from-accent to-accent-500 text-zinc-950 shadow-[0_6px_20px_-6px_rgba(214,179,106,0.55),inset_0_1px_0_rgba(255,255,255,0.3)] hover:shadow-[0_10px_28px_-8px_rgba(214,179,106,0.7),inset_0_1px_0_rgba(255,255,255,0.4)] hover:brightness-105",
  ghost:
    "border-white/10 bg-white/[0.04] text-zinc-100 hover:border-white/20 hover:bg-white/[0.08] hover:text-zinc-50",
  danger:
    "border-red-400/30 bg-red-400/10 text-red-100 hover:border-red-400/50 hover:bg-red-400/15",
};

export function Button({
  children,
  className,
  variant = "ghost",
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: keyof typeof variants }) {
  return (
    <button className={cn(base, variants[variant], className)} {...props}>
      {children}
    </button>
  );
}

export function ButtonLink({
  children,
  className,
  variant = "ghost",
  href,
  ...props
}: AnchorHTMLAttributes<HTMLAnchorElement> & { children: ReactNode; href: string; variant?: keyof typeof variants }) {
  return (
    <Link href={href} className={cn(base, variants[variant], className)} {...props}>
      {children}
    </Link>
  );
}
