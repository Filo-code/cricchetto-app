"use client";

import { forwardRef, type TextareaHTMLAttributes } from "react";
import { cn } from "./utils";

export const Textarea = forwardRef<HTMLTextAreaElement, TextareaHTMLAttributes<HTMLTextAreaElement>>(function Textarea({ className, ...props }, ref) {
  return (
    <textarea
      ref={ref}
      className={cn(
        "min-h-28 w-full rounded-xl border border-white/10 bg-white/[0.05] px-4 py-3 text-base text-zinc-50 outline-none transition-all duration-200 ease-out-quint",
        "placeholder:text-zinc-600",
        "hover:border-white/20 hover:bg-white/[0.07]",
        "focus:border-accent/60 focus:bg-white/[0.07] focus:ring-4 focus:ring-accent/10 focus:shadow-[0_0_0_1px_rgba(214,179,106,0.35)]",
        className,
      )}
      {...props}
    />
  );
});
