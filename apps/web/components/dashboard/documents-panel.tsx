"use client";

import { Download, ExternalLink, FileText, Printer, Receipt } from "lucide-react";
import { useRouter } from "next/navigation";
import { useActionState, useEffect } from "react";
import { generateEstimateAction, type DashboardActionState } from "../../lib/dashboard/actions";
import { documentStatusLabel, documentTypeLabel, formatDateTime } from "../../lib/dashboard/formatters";
import type { DashboardDocument } from "../../lib/dashboard/types";
import type { WorkOrderStatus } from "../../lib/types";
import { Badge } from "../ui/badge";
import { ButtonLink } from "../ui/button";
import { Card, CardHeader } from "../ui/card";
import { EmptyState } from "./empty-state";
import { FormSubmitButton } from "./form-submit-button";

const initialState: DashboardActionState = { ok: false, message: "" };
const ESTIMATE_STATUSES = new Set<WorkOrderStatus>(["accepted", "in_progress"]);

export function DocumentsPanel({
  documents,
  workOrderId,
  status,
}: {
  documents: DashboardDocument[];
  workOrderId: string;
  status: WorkOrderStatus;
}) {
  const [estimateState, estimateAction] = useActionState(generateEstimateAction, initialState);
  const router = useRouter();
  const canGenerateEstimate = ESTIMATE_STATUSES.has(status);
  const estimateInFlight = documents.some(
    (document) => document.documentType === "estimate" && (document.status === "pending" || document.status === "generating"),
  );
  const hasInFlightDocuments = documents.some(
    (document) => document.status === "pending" || document.status === "generating",
  );

  useEffect(() => {
    if (estimateState.ok) {
      router.refresh();
    }
  }, [estimateState.ok, estimateState.stamp, router]);

  useEffect(() => {
    if (!hasInFlightDocuments) return;
    const interval = setInterval(() => {
      router.refresh();
    }, 8000);
    return () => clearInterval(interval);
  }, [hasInFlightDocuments, router]);

  return (
    <Card>
      <CardHeader title="Documenti" eyebrow={documents.length > 0 ? `${documents.length}` : undefined} />

      {canGenerateEstimate ? (
        <form action={estimateAction} className="mb-5 rounded-2xl border border-white/10 bg-white/[0.03] p-4">
          <input type="hidden" name="workOrderId" value={workOrderId} />
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-start gap-3">
              <div className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-white/10 bg-white/[0.04] text-accent">
                <Receipt className="h-4 w-4" />
              </div>
              <div>
                <p className="text-sm font-medium text-zinc-100">Genera preventivo</p>
                <p className="mt-1 text-xs leading-5 text-zinc-500">
                  Crea una nuova versione del preventivo dai dati correnti. L'accettazione e il riepilogo finale sono automatici.
                </p>
              </div>
            </div>
            <FormSubmitButton
              label={estimateInFlight ? "Rigenera preventivo" : "Genera preventivo"}
              pendingLabel="Generazione preventivo..."
              variant="primary"
              className="sm:min-w-44"
            />
          </div>
          {estimateState.message ? (
            <p
              className={
                estimateState.ok
                  ? "mt-3 rounded-xl border border-success/25 bg-success-soft px-3 py-2 text-sm text-emerald-200 animate-fade-in"
                  : "mt-3 rounded-xl border border-danger/25 bg-danger-soft px-3 py-2 text-sm text-red-200 animate-fade-in"
              }
            >
              {estimateState.message}
            </p>
          ) : null}
        </form>
      ) : null}

      <div className="space-y-3">
        {documents.length > 0 ? (
          documents.map((document) => {
            const tone = document.status === "ready" ? "green" : document.status === "failed" ? "red" : "amber";
            const pulse = document.status === "generating" || document.status === "pending";
            return (
              <div
                key={document.id}
                className="flex flex-col gap-4 rounded-2xl border border-white/10 bg-white/[0.03] p-4 transition-colors hover:border-white/20 sm:flex-row sm:items-center sm:justify-between"
              >
                <div className="flex items-start gap-3 min-w-0">
                  <div className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-white/10 bg-white/[0.04] text-accent">
                    <FileText className="h-4 w-4" />
                  </div>
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="font-medium text-zinc-50">{documentTypeLabel(document.documentType)}</p>
                      <Badge tone={tone} dot pulse={pulse}>
                        {documentStatusLabel(document.status)}
                      </Badge>
                      <Badge tone="neutral">v{document.version}</Badge>
                    </div>
                    <p className="mt-1 truncate text-sm text-zinc-500">
                      {document.filename ?? "File non ancora disponibile"}
                      <span className="text-zinc-700"> · </span>
                      <span className="tabular-nums">{formatDateTime(document.generatedAt ?? document.createdAt)}</span>
                    </p>
                    {document.statusMessage ? (
                      <p className="mt-1 text-xs leading-5 text-zinc-500">{document.statusMessage}</p>
                    ) : null}
                  </div>
                </div>
                {document.downloadUrl ? (
                  <div className="flex flex-wrap gap-2 shrink-0">
                    <ButtonLink href={document.downloadUrl} target="_blank" rel="noreferrer" aria-label="Apri documento">
                      <ExternalLink className="h-4 w-4" />
                      Apri
                    </ButtonLink>
                    <ButtonLink
                      href={document.downloadUrl}
                      target="_blank"
                      rel="noreferrer"
                      aria-label="Stampa documento PDF"
                    >
                      <Printer className="h-4 w-4" />
                      Stampa
                    </ButtonLink>
                    <ButtonLink
                      href={document.downloadUrl}
                      download={document.filename ?? undefined}
                      aria-label="Scarica documento"
                    >
                      <Download className="h-4 w-4" />
                      Scarica
                    </ButtonLink>
                  </div>
                ) : null}
              </div>
            );
          })
        ) : (
          <EmptyState title="Nessun documento" icon={FileText}>
            I documenti generati dal backend compariranno qui.
          </EmptyState>
        )}
      </div>
    </Card>
  );
}
