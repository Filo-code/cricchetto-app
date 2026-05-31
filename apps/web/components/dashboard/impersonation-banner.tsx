"use client";

import { useActionState } from "react";
import { stopImpersonationAction, type WorkshopStatusActionState } from "../../app/admin/workshops/actions";

const initial: WorkshopStatusActionState = { ok: false, message: "" };

export function ImpersonationBanner({
  workshopName,
  actorEmail,
}: {
  workshopName: string;
  actorEmail: string;
}) {
  const [state, formAction] = useActionState(stopImpersonationAction, initial);

  return (
    <div className="sticky top-0 z-50 flex items-center justify-between gap-4 bg-red-900/90 px-4 py-2 text-[11px] text-red-200 backdrop-blur-sm border-b border-red-700/50">
      <span className="font-mono">
        <span className="text-red-400 font-semibold">IMPERSONAZIONE</span>
        {" · "}
        <span className="text-red-100">{workshopName}</span>
        {" · "}
        <span className="text-red-400">{actorEmail}</span>
      </span>
      <form action={formAction}>
        <button
          type="submit"
          className="rounded border border-red-600 px-2.5 py-1 text-[10px] font-mono uppercase tracking-[0.12em] text-red-300 hover:bg-red-800 hover:text-red-100 transition-colors"
        >
          Esci impersonazione
        </button>
        {state.message && !state.ok && (
          <span className="ml-2 text-red-400">{state.message}</span>
        )}
      </form>
    </div>
  );
}
