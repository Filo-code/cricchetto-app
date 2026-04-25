"use client";

import { ImageIcon } from "lucide-react";
import { useRouter } from "next/navigation";
import { useActionState, useEffect, useRef } from "react";
import { uploadWorkshopLogoAction, type DashboardActionState } from "../../lib/dashboard/actions";
import { Card, CardHeader } from "../ui/card";
import { FormSubmitButton } from "./form-submit-button";

const initialState: DashboardActionState = { ok: false, message: "" };

export function WorkshopLogoForm({ logoUrl }: { logoUrl: string | null }) {
  const [state, formAction] = useActionState(uploadWorkshopLogoAction, initialState);
  const router = useRouter();
  const formRef = useRef<HTMLFormElement>(null);

  useEffect(() => {
    if (state.ok) {
      formRef.current?.reset();
      router.refresh();
    }
  }, [state.ok, state.stamp, router]);

  return (
    <Card>
      <CardHeader title="Logo officina" eyebrow="Branding" />
      {logoUrl ? (
        <div className="mb-5 flex items-center gap-4 rounded-2xl border border-white/[0.06] bg-white/[0.02] px-4 py-3">
          <div className="flex h-14 w-14 shrink-0 items-center justify-center overflow-hidden rounded-xl border border-white/[0.08] bg-white/[0.03]">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={logoUrl} alt="Logo officina" className="h-full w-full object-contain" />
          </div>
          <div>
            <p className="text-[10.5px] font-semibold uppercase tracking-[0.18em] text-zinc-500">Logo attuale</p>
            <p className="mt-0.5 text-xs text-zinc-400">Carica un nuovo file per sostituirlo.</p>
          </div>
        </div>
      ) : (
        <div className="mb-5 flex items-center gap-4 rounded-2xl border border-white/[0.06] bg-white/[0.02] px-4 py-3">
          <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-xl border border-dashed border-white/[0.12] bg-white/[0.01]">
            <ImageIcon className="h-5 w-5 text-zinc-600" />
          </div>
          <div>
            <p className="text-[10.5px] font-semibold uppercase tracking-[0.18em] text-zinc-500">Nessun logo</p>
            <p className="mt-0.5 text-xs text-zinc-400">Carica un logo per i tuoi documenti.</p>
          </div>
        </div>
      )}
      <form ref={formRef} action={formAction} className="space-y-4">
        <label className="block">
          <span className="mb-2 block text-[13px] font-medium tracking-wide text-zinc-300">Carica logo</span>
          <input
            name="logo"
            type="file"
            accept="image/jpeg,image/jpg,image/png,image/webp,image/svg+xml"
            required
            className="block w-full rounded-xl border border-white/[0.08] bg-white/[0.03] px-3 py-2 text-sm text-zinc-300 file:mr-4 file:rounded-lg file:border-0 file:bg-white/[0.06] file:px-3 file:py-1.5 file:text-xs file:font-medium file:text-zinc-300 hover:border-white/[0.12] focus:outline-none focus:ring-1 focus:ring-accent/40"
          />
          <p className="mt-2 text-xs text-zinc-500">JPG, PNG, WebP o SVG — max 2 MB. Il logo appare nell&apos;intestazione dei documenti generati.</p>
        </label>
        {state.message ? (
          <p className={state.ok
            ? "rounded-xl border border-success/25 bg-success-soft px-4 py-3 text-sm text-emerald-200 animate-fade-in"
            : "rounded-xl border border-danger/25 bg-danger-soft px-4 py-3 text-sm text-red-200 animate-fade-in"
          }>
            {state.message}
          </p>
        ) : null}
        <div className="flex justify-end">
          <FormSubmitButton label="Carica logo" pendingLabel="Caricamento..." className="min-w-36" />
        </div>
      </form>
    </Card>
  );
}
