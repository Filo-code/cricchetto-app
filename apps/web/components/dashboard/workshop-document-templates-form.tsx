"use client";

import { AlertCircle, FileText } from "lucide-react";
import { useRouter } from "next/navigation";
import { useActionState, useEffect, useRef } from "react";
import {
  uploadWorkshopDocumentTemplateAction,
  deactivateWorkshopDocumentTemplateAction,
  type DashboardActionState,
} from "../../lib/dashboard/actions";
import type { WorkshopDocumentTemplate, DocumentTemplateType } from "../../lib/dashboard/document-templates";
import { Card, CardHeader } from "../ui/card";
import { FormSubmitButton } from "./form-submit-button";

const initialState: DashboardActionState = { ok: false, message: "" };

const DOCUMENT_TYPE_LABELS: Record<DocumentTemplateType, string> = {
  intake_acceptance: "Accettazione",
  estimate: "Preventivo",
  final_summary: "Riepilogo finale",
};

const DOCUMENT_TYPES: DocumentTemplateType[] = ["intake_acceptance", "estimate", "final_summary"];

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function TemplateRow({
  documentType,
  activeTemplate,
}: {
  documentType: DocumentTemplateType;
  activeTemplate: WorkshopDocumentTemplate | null;
}) {
  const [uploadState, uploadAction] = useActionState(uploadWorkshopDocumentTemplateAction, initialState);
  const [deactivateState, deactivateAction] = useActionState(deactivateWorkshopDocumentTemplateAction, initialState);
  const router = useRouter();
  const uploadRef = useRef<HTMLFormElement>(null);
  const label = DOCUMENT_TYPE_LABELS[documentType];

  useEffect(() => {
    if (uploadState.ok) {
      uploadRef.current?.reset();
      router.refresh();
    }
  }, [uploadState.ok, uploadState.stamp, router]);

  useEffect(() => {
    if (deactivateState.ok) router.refresh();
  }, [deactivateState.ok, deactivateState.stamp, router]);

  const feedbackMsg = uploadState.message || deactivateState.message;
  const feedbackOk = uploadState.message ? uploadState.ok : deactivateState.ok;

  return (
    <div className="rounded-2xl border border-white/[0.07] bg-white/[0.02] p-4">
      <div className="mb-4 flex items-start justify-between gap-3">
        <div className="flex items-start gap-3 min-w-0">
          <div className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-white/[0.07] bg-white/[0.03] text-accent">
            <FileText className="h-3.5 w-3.5" />
          </div>
          <div className="min-w-0">
            <p className="text-sm font-medium text-zinc-100">{label}</p>
            {activeTemplate ? (
              <p className="mt-0.5 truncate text-xs font-mono text-zinc-400">
                {activeTemplate.filename}
                <span className="text-zinc-600"> · {formatBytes(activeTemplate.sizeBytes)}</span>
              </p>
            ) : (
              <p className="mt-0.5 text-xs text-zinc-600">Nessun template caricato</p>
            )}
          </div>
        </div>
        {activeTemplate ? (
          <form action={deactivateAction} className="shrink-0">
            <input type="hidden" name="templateId" value={activeTemplate.id} />
            <button
              type="submit"
              className="text-[11px] font-medium text-zinc-600 transition-colors hover:text-red-400"
              onClick={(e) => {
                if (!confirm("Disattivare questo template? Il file non verrà eliminato.")) e.preventDefault();
              }}
            >
              Disattiva
            </button>
          </form>
        ) : null}
      </div>

      <form ref={uploadRef} action={uploadAction} className="flex flex-wrap items-end gap-3">
        <input type="hidden" name="documentType" value={documentType} />
        <label className="flex-1 block min-w-52">
          <input
            name="file"
            type="file"
            accept="application/pdf"
            required
            className="block w-full rounded-xl border border-white/[0.08] bg-white/[0.03] px-3 py-2 text-sm text-zinc-300 file:mr-4 file:rounded-lg file:border-0 file:bg-white/[0.06] file:px-3 file:py-1.5 file:text-xs file:font-medium file:text-zinc-300 hover:border-white/[0.12] focus:outline-none focus:ring-1 focus:ring-accent/40"
          />
        </label>
        <FormSubmitButton label="Carica" pendingLabel="Caricamento..." className="min-w-28" />
      </form>

      {feedbackMsg ? (
        <p className={feedbackOk
          ? "mt-3 rounded-xl border border-success/25 bg-success-soft px-3 py-2 text-xs text-emerald-200 animate-fade-in"
          : "mt-3 rounded-xl border border-danger/25 bg-danger-soft px-3 py-2 text-xs text-red-200 animate-fade-in"
        }>
          {feedbackMsg}
        </p>
      ) : null}
    </div>
  );
}

export function WorkshopDocumentTemplatesForm({
  templates,
}: {
  templates: WorkshopDocumentTemplate[];
}) {
  const activeByType = Object.fromEntries(templates.map((t) => [t.documentType, t])) as Partial<Record<DocumentTemplateType, WorkshopDocumentTemplate>>;

  return (
    <Card>
      <CardHeader title="Template documenti" eyebrow="Documenti" />
      <div className="mb-5 flex items-start gap-3 rounded-2xl border border-amber-500/20 bg-amber-500/[0.04] px-4 py-3">
        <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-amber-400/70" />
        <p className="text-xs leading-5 text-zinc-500">
          I template vengono salvati in modo sicuro.{" "}
          <span className="text-amber-400/70">L&apos;uso automatico nella generazione PDF non è ancora attivo</span>
          {" "}— il generatore documenti dovrà essere aggiornato per applicarli.
        </p>
      </div>
      <div className="space-y-3">
        {DOCUMENT_TYPES.map((docType) => (
          <TemplateRow
            key={docType}
            documentType={docType}
            activeTemplate={activeByType[docType] ?? null}
          />
        ))}
      </div>
    </Card>
  );
}
