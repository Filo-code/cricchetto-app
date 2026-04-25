import type { ReactNode } from "react";

export function DashboardShell({ children }: { children: ReactNode }) {
  return (
    <main className="mx-auto min-h-screen w-full max-w-7xl px-4 py-6 sm:px-6 sm:py-8 lg:px-8 animate-fade-in">
      {children}
      <footer className="mt-16 border-t border-white/[0.06] pb-8 pt-6 text-center">
        <p className="text-xs text-zinc-600">
          Powered by{" "}
          <span className="font-semibold text-zinc-500">Filò</span>
        </p>
      </footer>
    </main>
  );
}
