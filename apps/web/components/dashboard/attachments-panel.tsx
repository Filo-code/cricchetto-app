"use client";

import { Download, File as FileIcon, FileImage, Headphones, Trash2, Upload, X } from "lucide-react";
import { useRouter } from "next/navigation";
import { useActionState, useEffect, useRef } from "react";
import { removeAttachmentAction, uploadWorkOrderAttachmentAction, type DashboardActionState } from "../../lib/dashboard/actions";
import { attachmentTypeLabel, formatDateTime } from "../../lib/dashboard/formatters";
import type { DashboardAttachment } from "../../lib/dashboard/types";
import type { WorkOrderStatus } from "../../lib/types";
import { Badge } from "../ui/badge";
import { Button, ButtonLink } from "../ui/button";
import { Card, CardHeader } from "../ui/card";
import { Input } from "../ui/input";
import { EmptyState } from "./empty-state";
import { FormSubmitButton } from "./form-submit-button";

const initialState: DashboardActionState = { ok: false, message: "" };
const MUTABLE_STATUSES = new Set<WorkOrderStatus>(["accepted", "in_progress", "ready"]);

export function AttachmentsPanel({
  attachments,
  workOrderId,
  status,
}: {
  attachments: DashboardAttachment[];
  workOrderId: string;
  status: WorkOrderStatus;
}) {
  const [state, formAction] = useActionState(uploadWorkOrderAttachmentAction, initialState);
  const [removeState, removeAction] = useActionState(removeAttachmentAction, initialState);
  const formRef = useRef<HTMLFormElement>(null);
  const router = useRouter();
  const canUpload = MUTABLE_STATUSES.has(status);

  useEffect(() => {
    if (state.ok) {
      formRef.current?.reset();
      router.refresh();
    }
  }, [router, state.ok, state.stamp]);

  useEffect(() => {
    if (removeState.ok) router.refresh();
  }, [removeState.ok, removeState.stamp, router]);

  return (
    <Card>
      <CardHeader title="Media e allegati" eyebrow={attachments.length > 0 ? `${attachments.length} file` : undefined} />

      {canUpload ? (
        <form ref={formRef} action={formAction} className="mb-5 rounded-2xl border border-white/10 bg-white/[0.03] p-4">
          <input type="hidden" name="workOrderId" value={workOrderId} />
          <div className="mb-4 flex items-start justify-between gap-3">
            <div>
              <p className="text-sm font-medium text-zinc-100">Carica media dal dashboard</p>
              <p className="mt-1 text-xs leading-5 text-zinc-500">
                Immagini, documenti, audio e video finiscono nello stesso archivio allegati usato dai canali messaggistica.
              </p>
            </div>
            <Button type="button" variant="ghost" className="h-9 w-9 px-0" onClick={() => formRef.current?.reset()} aria-label="Azzera form allegati">
              <X className="h-4 w-4" />
            </Button>
          </div>
          <label className="block">
            <span className="mb-2 block text-[13px] font-medium tracking-wide text-zinc-300">File</span>
            <Input
              name="file"
              type="file"
              accept="image/*,audio/*,video/*,application/pdf,text/plain,.doc,.docx,.xls,.xlsx,.zip"
              required
              className="h-auto px-3 py-3 file:mr-3 file:rounded-lg file:border-0 file:bg-accent/15 file:px-3 file:py-2 file:text-sm file:font-medium file:text-accent"
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
              <p className="text-xs leading-5 text-zinc-500">I file salvati diventano visibili subito nella scheda e restano nel registro allegati condiviso con chat e dashboard.</p>
            )}
            <FormSubmitButton label="Carica allegato" pendingLabel="Caricamento allegato..." className="sm:min-w-44" />
          </div>
        </form>
      ) : (
        <p className="mb-5 rounded-2xl border border-white/10 bg-white/[0.03] px-4 py-3 text-sm leading-6 text-zinc-500">
          La scheda e in sola lettura. Gli allegati restano scaricabili ma non possono essere aggiunti dal dashboard.
        </p>
      )}

      <div className="space-y-3">
        {attachments.length > 0 ? (
          attachments.map((attachment) => (
            <article key={attachment.id} className="overflow-hidden rounded-2xl border border-white/10 bg-white/[0.03]">
              {attachment.previewUrl && isImageAttachment(attachment) ? (
                <img
                  src={attachment.previewUrl}
                  alt={attachment.filename ?? "Allegato immagine"}
                  className="h-56 w-full object-cover"
                />
              ) : null}
              <div className="space-y-3 p-4">
                <div className="flex items-start gap-3">
                  <div className="mt-0.5 flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-white/10 bg-white/[0.04] text-accent">
                    <AttachmentIcon attachment={attachment} />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="font-medium text-zinc-50">{attachment.filename ?? attachmentTypeLabel(attachment.attachmentType)}</p>
                      <Badge tone={badgeTone(attachment.attachmentType)}>{attachmentTypeLabel(attachment.attachmentType)}</Badge>
                      {attachment.source ? <Badge tone="neutral">{attachment.source}</Badge> : null}
                    </div>
                    <p className="mt-1 text-sm text-zinc-500">
                      {attachment.mimeType ?? "mime sconosciuto"}
                      <span className="text-zinc-700"> · </span>
                      <span className="tabular-nums">{formatDateTime(attachment.capturedAt ?? attachment.createdAt)}</span>
                    </p>
                  </div>
                </div>

                {attachment.previewUrl && attachment.attachmentType === "audio" ? (
                  <audio controls preload="none" className="w-full">
                    <source src={attachment.previewUrl} type={attachment.mimeType ?? undefined} />
                  </audio>
                ) : null}

                <div className="flex flex-wrap items-center gap-2 text-xs text-zinc-600">
                  {attachment.createdBy ? <span>Caricato da {attachment.createdBy}</span> : null}
                  {typeof attachment.fileSize === "number" ? <span>{formatFileSize(attachment.fileSize)}</span> : null}
                  {attachment.transcriptionStatus ? <span>Trascrizione: {attachment.transcriptionStatus}</span> : null}
                </div>

                {attachment.previewUrl && isVideoAttachment(attachment) ? (
                  <video controls preload="metadata" className="w-full rounded-xl border border-white/10 bg-black/30">
                    <source src={attachment.previewUrl} type={attachment.mimeType ?? undefined} />
                  </video>
                ) : null}

                <div className="flex flex-wrap items-center gap-2">
                  {attachment.previewUrl && !isImageAttachment(attachment) ? (
                    <ButtonLink href={attachment.previewUrl} target="_blank" rel="noreferrer" aria-label="Apri allegato">
                      <Upload className="h-4 w-4" />
                      Apri
                    </ButtonLink>
                  ) : null}
                  {attachment.downloadUrl ? (
                    <ButtonLink href={attachment.downloadUrl} target="_blank" rel="noreferrer" aria-label="Scarica allegato">
                      <Download className="h-4 w-4" />
                      Scarica
                    </ButtonLink>
                  ) : null}
                  {canUpload ? (
                    <form action={removeAction}>
                      <input type="hidden" name="workOrderId" value={workOrderId} />
                      <input type="hidden" name="attachmentId" value={attachment.id} />
                      <button
                        type="submit"
                        className="flex h-9 items-center gap-1.5 rounded-xl border border-white/10 bg-white/[0.03] px-3 text-sm text-zinc-500 transition-colors hover:border-danger/25 hover:bg-danger-soft hover:text-red-300"
                        aria-label="Rimuovi allegato"
                        onClick={(e) => { if (!confirm("Rimuovere questo allegato?")) e.preventDefault(); }}
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                        Rimuovi
                      </button>
                    </form>
                  ) : null}
                </div>
              </div>
            </article>
          ))
        ) : (
          <EmptyState title="Nessun allegato" icon={FileImage}>
            Immagini, documenti e audio ricevuti dai canali o caricati dal dashboard compariranno qui.
          </EmptyState>
        )}
      </div>
    </Card>
  );
}

function AttachmentIcon({ attachment }: { attachment: DashboardAttachment }) {
  if (attachment.attachmentType === "photo") {
    return <FileImage className="h-4 w-4" />;
  }
  if (attachment.attachmentType === "audio") {
    return <Headphones className="h-4 w-4" />;
  }
  return <FileIcon className="h-4 w-4" />;
}

function badgeTone(type: DashboardAttachment["attachmentType"]): "amber" | "blue" | "neutral" {
  if (type === "photo") return "amber";
  if (type === "audio") return "blue";
  return "neutral";
}

function isImageAttachment(attachment: DashboardAttachment): boolean {
  return attachment.attachmentType === "photo" || Boolean(attachment.mimeType?.startsWith("image/"));
}

function isVideoAttachment(attachment: DashboardAttachment): boolean {
  return Boolean(attachment.mimeType?.startsWith("video/"));
}

function formatFileSize(size: number): string {
  if (size < 1024) {
    return `${size} B`;
  }
  if (size < 1024 * 1024) {
    return `${(size / 1024).toFixed(1)} KB`;
  }
  return `${(size / (1024 * 1024)).toFixed(1)} MB`;
}
