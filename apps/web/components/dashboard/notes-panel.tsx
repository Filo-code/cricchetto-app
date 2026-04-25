"use client";

import { StickyNote, Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useActionState, useEffect, useRef } from "react";
import { addWorkOrderNoteAction, voidWorkOrderNoteAction, type DashboardActionState } from "../../lib/dashboard/actions";
import { formatDateTime } from "../../lib/dashboard/formatters";
import type { DashboardNote } from "../../lib/dashboard/types";
import type { WorkOrderStatus } from "../../lib/types";
import { Card, CardHeader } from "../ui/card";
import { Textarea } from "../ui/textarea";
import { EmptyState } from "./empty-state";
import { FormSubmitButton } from "./form-submit-button";

const initialState: DashboardActionState = { ok: false, message: "" };
const MUTABLE_STATUSES: WorkOrderStatus[] = ["accepted", "in_progress", "ready"];

export function NotesPanel({
  notes,
  workOrderId,
  status,
}: {
  notes: DashboardNote[];
  workOrderId: string;
  status: WorkOrderStatus;
}) {
  const [state, formAction] = useActionState(addWorkOrderNoteAction, initialState);
  const [voidState, voidAction] = useActionState(voidWorkOrderNoteAction, initialState);
  const formRef = useRef<HTMLFormElement>(null);
  const router = useRouter();
  const canEdit = MUTABLE_STATUSES.includes(status);

  useEffect(() => {
    if (state.ok) {
      formRef.current?.reset();
      router.refresh();
    }
  }, [router, state.ok, state.stamp]);

  useEffect(() => {
    if (voidState.ok) router.refresh();
  }, [voidState.ok, voidState.stamp, router]);

  return (
    <Card>
      <CardHeader title="Note" eyebrow={notes.length > 0 ? `${notes.length} voci` : undefined} />

      {canEdit ? (
        <form ref={formRef} action={formAction} className="mb-5 rounded-2xl border border-white/10 bg-white/[0.03] p-4">
          <input type="hidden" name="workOrderId" value={workOrderId} />
          <label className="block">
            <span className="mb-2 block text-[13px] font-medium tracking-wide text-zinc-300">Aggiungi nota</span>
            <Textarea
              name="note"
              placeholder="Esito prova su strada, autorizzazione cliente, dettaglio tecnico..."
              required
              className="min-h-24"
            />
          </label>
          <div className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            {state.message ? (
              <p
                className={
                  state.ok
                    ? "rounded-xl border border-success/25 bg-success-soft px-4 py-3 text-sm text-emerald-200 animate-fade-in"
                    : "rounded-xl border border-danger/25 bg-danger-soft px-4 py-3 text-sm text-red-200 animate-fade-in"
                }
              >
                {state.message}
              </p>
            ) : (
              <p className="text-xs leading-5 text-zinc-500">La nota viene salvata nello stesso registro operativo usato dai comandi officina.</p>
            )}
            <FormSubmitButton label="Salva nota" pendingLabel="Salvataggio nota..." className="sm:min-w-40" />
          </div>
        </form>
      ) : (
        <p className="mb-5 rounded-2xl border border-white/10 bg-white/[0.03] px-4 py-3 text-sm leading-6 text-zinc-500">
          La scheda e in sola lettura. Le note restano consultabili ma non piu modificabili.
        </p>
      )}

      <div className="space-y-3">
        {notes.length > 0 ? (
          notes.map((note) => (
            <article
              key={note.id}
              className="group rounded-2xl border border-white/10 bg-white/[0.03] p-4 transition-colors hover:border-white/20"
            >
              <p className="whitespace-pre-wrap text-sm leading-6 text-zinc-200">{note.note}</p>
              <div className="mt-3 flex items-center justify-between gap-2">
                <p className="flex items-center gap-1.5 text-xs text-zinc-600">
                  <span className="tabular-nums">{formatDateTime(note.createdAt)}</span>
                  <span className="text-zinc-700">-</span>
                  <span>{note.createdBy ?? "Operatore"}</span>
                </p>
                {canEdit ? (
                  <form action={voidAction}>
                    <input type="hidden" name="workOrderId" value={workOrderId} />
                    <input type="hidden" name="noteId" value={note.id} />
                    <button
                      type="submit"
                      className="flex h-7 w-7 items-center justify-center rounded-lg text-zinc-600 opacity-0 transition-all hover:bg-danger-soft hover:text-red-300 group-hover:opacity-100"
                      aria-label="Rimuovi nota"
                      onClick={(e) => { if (!confirm("Rimuovere questa nota?")) e.preventDefault(); }}
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </form>
                ) : null}
              </div>
            </article>
          ))
        ) : (
          <EmptyState title="Nessuna nota salvata" icon={StickyNote}>
            Le note operative aggiunte dai canali compariranno qui.
          </EmptyState>
        )}
      </div>
    </Card>
  );
}
