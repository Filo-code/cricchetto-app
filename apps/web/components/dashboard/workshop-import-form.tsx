"use client";

import { useActionState } from "react";
import {
  previewCsvImportAction,
  confirmCsvImportAction,
  type ImportPreviewState,
  type ImportConfirmState,
} from "../../lib/dashboard/actions";
import { Card, CardHeader } from "../ui/card";
import { Input } from "../ui/input";
import { FormSubmitButton } from "./form-submit-button";

const initialPreview: ImportPreviewState = { ok: false };
const initialConfirm: ImportConfirmState = { ok: false };

export function WorkshopImportForm() {
  const [previewState, previewAction] = useActionState(previewCsvImportAction, initialPreview);
  const [confirmState, confirmAction] = useActionState(confirmCsvImportAction, initialConfirm);

  const hasPreview = previewState.ok && previewState.rows_total !== undefined;
  const importDone = confirmState.ok;

  return (
    <Card>
      <CardHeader title="Importazione dati" eyebrow="Gestionale" />
      <div className="space-y-5">
        <p className="text-sm leading-relaxed text-zinc-400">
          Carica un CSV esportato dal vecchio gestionale. Prima viene mostrata un&apos;anteprima: nessun dato viene salvato finché non confermi.
        </p>

        <div className="rounded-xl border border-white/[0.06] bg-white/[0.02] p-4 space-y-2">
          <p className="text-[10px] font-mono uppercase tracking-[0.15em] text-zinc-500">Colonne attese</p>
          <p className="text-xs font-mono text-zinc-400 break-all">
            plate · customer_name · customer_phone · vehicle_model · revision_due_date
          </p>
          <p className="text-[11px] text-zinc-600">
            Solo <span className="font-mono">plate</span> è obbligatoria. I campi{" "}
            <span className="font-mono">kilometers</span>,{" "}
            <span className="font-mono">note</span>,{" "}
            <span className="font-mono">last_service_date</span> vengono accettati ma non salvati.
          </p>
        </div>

        {!importDone && (
          <form action={previewAction} className="space-y-4">
            <label className="block">
              <span className="mb-2 block text-[13px] font-medium tracking-wide text-zinc-300">File CSV</span>
              <input
                name="csvFile"
                type="file"
                accept=".csv,text/csv,text/plain"
                required
                className="block w-full rounded-xl border border-white/[0.08] bg-white/[0.03] px-3 py-2 text-sm text-zinc-300 file:mr-4 file:rounded-lg file:border-0 file:bg-white/[0.06] file:px-3 file:py-1.5 file:text-xs file:font-medium file:text-zinc-300 hover:border-white/[0.12] focus:outline-none focus:ring-1 focus:ring-accent/40"
              />
              <p className="mt-1.5 text-[11px] text-zinc-600">Max 512 KB · max 500 righe</p>
            </label>
            {previewState.message && !previewState.ok && (
              <p className="rounded-xl border border-danger/25 bg-danger-soft px-4 py-3 text-sm text-red-200 animate-fade-in">
                {previewState.message}
              </p>
            )}
            <div className="flex justify-end">
              <FormSubmitButton label="Analizza anteprima" pendingLabel="Analisi..." className="min-w-44" />
            </div>
          </form>
        )}

        {hasPreview && !importDone && (
          <div className="space-y-4 border-t border-white/[0.06] pt-4">
            <p className="text-[10px] font-mono uppercase tracking-[0.15em] text-zinc-500">Anteprima importazione</p>

            <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
              <StatBox label="Righe totali" value={previewState.rows_total!} />
              <StatBox label="Valide" value={previewState.valid_rows!} />
              <StatBox label="Non valide" value={previewState.invalid_rows!} />
              <StatBox label="Veicoli esistenti" value={previewState.existing_vehicles!} />
              <StatBox label="Veicoli da creare" value={previewState.would_create_vehicles!} highlight />
              <StatBox label="Clienti da creare" value={previewState.would_create_customers!} highlight />
            </div>

            {previewState.errors && previewState.errors.length > 0 && (
              <div className="rounded-xl border border-amber-900/30 bg-amber-900/10 p-4 space-y-1.5">
                <p className="text-[10px] font-mono uppercase tracking-[0.15em] text-amber-600">
                  Righe non valide ({previewState.errors.length})
                </p>
                {previewState.errors.slice(0, 10).map((err) => (
                  <p key={err.row} className="text-xs font-mono text-amber-400">
                    Riga {err.row}: {err.reason}
                  </p>
                ))}
                {previewState.errors.length > 10 && (
                  <p className="text-[11px] text-zinc-600">
                    ... e altre {previewState.errors.length - 10} righe non valide.
                  </p>
                )}
              </div>
            )}

            {(previewState.would_create_vehicles ?? 0) > 0 ? (
              <form action={confirmAction} className="space-y-4 border-t border-white/[0.06] pt-4">
                <input type="hidden" name="csvText" value={previewState.csvText ?? ""} />
                <label className="block">
                  <span className="mb-2 block text-[13px] font-medium tracking-wide text-zinc-300">
                    Digita{" "}
                    <span className="font-mono text-accent">IMPORTA DATI</span>{" "}
                    per confermare l&apos;importazione
                  </span>
                  <Input
                    name="confirmText"
                    type="text"
                    autoComplete="off"
                    spellCheck={false}
                    placeholder="IMPORTA DATI"
                  />
                </label>
                {confirmState.message && !confirmState.ok && (
                  <p className="rounded-xl border border-danger/25 bg-danger-soft px-4 py-3 text-sm text-red-200 animate-fade-in">
                    {confirmState.message}
                  </p>
                )}
                <div className="flex justify-end">
                  <FormSubmitButton
                    label={`Importa ${previewState.would_create_vehicles} veicoli`}
                    pendingLabel="Importazione in corso..."
                    variant="primary"
                    className="min-w-44"
                  />
                </div>
              </form>
            ) : (
              <p className="rounded-xl border border-white/[0.06] bg-white/[0.02] px-4 py-3 text-sm text-zinc-500">
                Nessun nuovo veicolo da importare: tutti i veicoli nel file esistono già.
              </p>
            )}
          </div>
        )}

        {importDone && (
          <div className="space-y-4 border-t border-white/[0.06] pt-4">
            <p className="text-[10px] font-mono uppercase tracking-[0.15em] text-emerald-500">Importazione completata</p>
            <div className="grid grid-cols-3 gap-2">
              <StatBox label="Veicoli creati" value={confirmState.created_vehicles ?? 0} highlight />
              <StatBox label="Clienti creati" value={confirmState.created_customers ?? 0} highlight />
              <StatBox label="Già esistenti" value={confirmState.skipped_existing ?? 0} />
            </div>
            {confirmState.errors && confirmState.errors.length > 0 && (
              <div className="rounded-xl border border-amber-900/30 bg-amber-900/10 p-4 space-y-1.5">
                <p className="text-[10px] font-mono uppercase tracking-[0.15em] text-amber-600">
                  Errori ({confirmState.errors.length})
                </p>
                {confirmState.errors.slice(0, 8).map((err) => (
                  <p key={err.row} className="text-xs font-mono text-amber-400">
                    Riga {err.row}: {err.reason}
                  </p>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </Card>
  );
}

function StatBox({ label, value, highlight = false }: { label: string; value: number; highlight?: boolean }) {
  return (
    <div className="rounded-xl border border-white/[0.06] bg-white/[0.02] p-3">
      <p className={`text-xl font-semibold tabular-nums ${highlight ? "text-zinc-100" : "text-zinc-400"}`}>{value}</p>
      <p className="mt-0.5 text-[11px] text-zinc-600">{label}</p>
    </div>
  );
}
