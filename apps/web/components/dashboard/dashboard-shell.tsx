import type { ReactNode } from "react";
import { BottomNav } from "./bottom-nav";

export function DashboardShell({ children }: { children: ReactNode }) {
  return (
    <>
      <div aria-hidden className="pointer-events-none fixed inset-x-0 top-0 z-50 h-px bg-gradient-to-r from-transparent via-accent/50 to-transparent" />
      <main className="mx-auto min-h-screen w-full max-w-7xl px-4 py-6 sm:px-6 sm:py-8 lg:px-8 pb-20 lg:pb-0 animate-fade-in">
        {children}
        <footer className="mt-16 border-t border-white/[0.06] pb-8 pt-6">
          <div className="flex flex-col items-center gap-2">
            <img src="/brand/filo-wordmark.svg" alt="Filò" className="h-10 w-auto mix-blend-screen opacity-50 transition-opacity hover:opacity-70" width={252} height={180} />
            <p className="text-[11px] tracking-[0.12em] text-zinc-700">Powered by Filò</p>
          </div>
        </footer>
      </main>
      <BottomNav />
    </>
  );
}
