"use client";

import { useActionState } from "react";
import { Button } from "../ui/button";
import type { AdminWorkshopListItem } from "../../lib/admin/workshops";
import {
  suspendWorkshopAction,
  closeWorkshopAction,
  reactivateWorkshopAction,
  generateUserResetLinkAction,
  type WorkshopStatusActionState,
  type ResetPasswordActionState,
} from "../../app/admin/workshops/actions";

const STATUS_LABELS: Record<string, string> = {
  active: "Attiva",
  suspended: "Sospesa",
  closed: "Chiusa",
};

const STATUS_COLORS: Record<string, string> = {
  active: "text-emerald-400",
  suspended: "text-amber-400",
  closed: "text-red-400",
};

const initialStatus: WorkshopStatusActionState = { ok: false, message: "" };
const initialReset: ResetPasswordActionState = { ok: false, message: "" };

function WorkshopStatusActions({
  workshop,
  isProtected,
}: {
  workshop: AdminWorkshopListItem;
  isProtected: boolean;
}) {
  const [suspendState, suspendAction] = useActionState(suspendWorkshopAction, initialStatus);
  const [closeState, closeAction] = useActionState(closeWorkshopAction, initialStatus);
  const [reactivateState, reactivateAction] = useActionState(reactivateWorkshopAction, initialStatus);

  const feedback = suspendState.message || closeState.message || reactivateState.message;
  const feedbackOk = suspendState.ok || closeState.ok || reactivateState.ok;

  if (isProtected) {
    return (
      <p className="text-[10px] font-mono text-zinc-600 uppercase tracking-[0.12em]">
        Piattaforma / protetta — azioni disabilitate
      </p>
    );
  }

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap gap-2">
        {workshop.status !== "active" && (
          <form action={reactivateAction}>
            <input type="hidden" name="workshopId" value={workshop.id} />
            <Button type="submit" variant="ghost" className="text-xs text-emerald-400 hover:text-emerald-300">
              Riattiva
            </Button>
          </form>
        )}
        {workshop.status === "active" && (
          <form action={suspendAction}>
            <input type="hidden" name="workshopId" value={workshop.id} />
            <Button type="submit" variant="ghost" className="text-xs text-amber-400 hover:text-amber-300">
              Sospendi
            </Button>
          </form>
        )}
        {workshop.status !== "closed" && (
          <form action={closeAction}>
            <input type="hidden" name="workshopId" value={workshop.id} />
            <Button type="submit" variant="ghost" className="text-xs text-red-400 hover:text-red-300">
              Chiudi
            </Button>
          </form>
        )}
      </div>
      {feedback && (
        <p className={`text-[11px] ${feedbackOk ? "text-emerald-400" : "text-red-400"}`}>{feedback}</p>
      )}
    </div>
  );
}

function UserResetLink({ userId, userEmail }: { userId: string; userEmail: string }) {
  const [state, formAction] = useActionState(generateUserResetLinkAction, initialReset);

  if (state.ok && state.resetLink) {
    return (
      <div className="space-y-1">
        <p className="text-[10px] font-mono uppercase tracking-[0.15em] text-zinc-500">Link reset (valido 72h — mostra una sola volta)</p>
        <div className="flex items-start gap-2">
          <code className="flex-1 rounded-lg border border-white/10 bg-black/30 px-2 py-1 text-[10px] text-zinc-300 break-all">
            {state.resetLink}
          </code>
          <Button
            type="button"
            variant="ghost"
            className="text-xs shrink-0"
            onClick={() => navigator.clipboard?.writeText(state.resetLink!)}
          >
            Copia
          </Button>
        </div>
      </div>
    );
  }

  return (
    <form action={formAction} className="inline">
      <input type="hidden" name="userId" value={userId} />
      <Button type="submit" variant="ghost" className="text-[10px] text-zinc-500 hover:text-zinc-300" title={`Reset password per ${userEmail}`}>
        Reset password
      </Button>
      {state.message && !state.ok && (
        <span className="ml-2 text-[10px] text-red-400">{state.message}</span>
      )}
    </form>
  );
}

export function WorkshopListTable({
  workshops,
  platformWorkshopId,
}: {
  workshops: AdminWorkshopListItem[];
  platformWorkshopId?: string | null;
}) {
  if (workshops.length === 0) {
    return (
      <p className="text-sm text-zinc-500">Nessuna officina trovata.</p>
    );
  }

  return (
    <div className="space-y-4">
      {workshops.map((workshop) => {
        const isProtected = !!platformWorkshopId && workshop.id === platformWorkshopId;
        return (
          <div key={workshop.id} className="rounded-2xl border border-white/10 bg-white/[0.02] p-5 space-y-3">
            <div className="flex items-start justify-between gap-4">
              <div>
                <div className="flex items-center gap-2">
                  <p className="text-sm font-medium text-zinc-100">{workshop.name}</p>
                  {isProtected && (
                    <span className="text-[9px] font-mono uppercase tracking-[0.15em] border border-zinc-700 text-zinc-500 rounded px-1.5 py-0.5">
                      Piattaforma
                    </span>
                  )}
                </div>
                {workshop.city && <p className="text-[11px] text-zinc-500">{workshop.city}</p>}
                <p className="text-[10px] text-zinc-600 font-mono">
                  Creata: {new Date(workshop.createdAt).toLocaleDateString("it-IT")}
                  {workshop.closedAt && ` · Chiusa: ${new Date(workshop.closedAt).toLocaleDateString("it-IT")}`}
                </p>
                {workshop.closedReason && (
                  <p className="text-[10px] text-zinc-600">Motivo: {workshop.closedReason}</p>
                )}
              </div>
              <span className={`text-[11px] font-mono ${STATUS_COLORS[workshop.status] ?? "text-zinc-400"}`}>
                {STATUS_LABELS[workshop.status] ?? workshop.status}
              </span>
            </div>

            {workshop.users.length > 0 && (
              <div className="border-t border-white/[0.06] pt-3 space-y-2">
                <p className="text-[10px] font-mono uppercase tracking-[0.15em] text-zinc-600">Utenti</p>
                {workshop.users.map((user) => (
                  <div key={user.id} className="flex items-center justify-between gap-2">
                    <div>
                      <span className="text-[11px] text-zinc-300">{user.email}</span>
                      {user.displayName && <span className="ml-2 text-[10px] text-zinc-500">{user.displayName}</span>}
                      <span className="ml-2 text-[10px] text-zinc-600">[{user.role}]</span>
                      {!user.isActive && <span className="ml-2 text-[10px] text-red-400">[disabilitato]</span>}
                    </div>
                    <UserResetLink userId={user.id} userEmail={user.email} />
                  </div>
                ))}
              </div>
            )}

            <div className="border-t border-white/[0.06] pt-3">
              <WorkshopStatusActions workshop={workshop} isProtected={isProtected} />
            </div>
          </div>
        );
      })}
    </div>
  );
}
