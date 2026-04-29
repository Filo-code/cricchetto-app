"use client";

import { Download } from "lucide-react";
import { useState } from "react";
import { Card, CardHeader } from "../ui/card";

const EXPORTS = [
  { label: "Scarica clienti", path: "/api/dashboard/export/customers" },
  { label: "Scarica veicoli", path: "/api/dashboard/export/vehicles" },
  { label: "Scarica schede lavoro", path: "/api/dashboard/export/work-orders" },
  { label: "Scarica voci", path: "/api/dashboard/export/items" },
  { label: "Scarica note", path: "/api/dashboard/export/notes" },
] as const;

function extractFilename(disposition: string): string {
  const match = disposition.match(/filename="([^"]+)"/);
  return match ? match[1] : "cricchetto-export.csv";
}

export function WorkshopExportButtons() {
  const [downloading, setDownloading] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function handleDownload(path: string) {
    setDownloading(path);
    setError(null);
    try {
      const res = await fetch(path, { credentials: "include" });
      if (!res.ok) {
        const json = await res.json().catch(() => null);
        throw new Error(json?.error ?? `Errore ${res.status}`);
      }
      const blob = await res.blob();
      const disposition = res.headers.get("content-disposition") ?? "";
      const filename = extractFilename(disposition);

      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Download non riuscito.");
    } finally {
      setDownloading(null);
    }
  }

  return (
    <Card>
      <CardHeader title="Esportazione dati" eyebrow="CSV" />
      <div className="space-y-4">
        <p className="text-sm leading-relaxed text-zinc-400">
          Scarica i dati della tua officina in CSV. Ogni file contiene solo i dati collegati a questa officina.
        </p>

        <div className="grid gap-2 sm:grid-cols-2">
          {EXPORTS.map(({ label, path }) => (
            <button
              key={path}
              type="button"
              disabled={downloading === path}
              onClick={() => handleDownload(path)}
              className="flex items-center gap-2 rounded-xl border border-white/[0.06] bg-white/[0.02] px-4 py-3 text-sm text-zinc-300 transition-colors hover:border-white/[0.1] hover:bg-white/[0.04] hover:text-zinc-100 disabled:cursor-wait disabled:opacity-50"
            >
              <Download className="h-4 w-4 shrink-0 text-zinc-500" />
              {downloading === path ? "Download..." : label}
            </button>
          ))}
        </div>

        {error ? (
          <p className="rounded-xl border border-danger/25 bg-danger-soft px-4 py-3 text-sm text-red-200 animate-fade-in">
            {error}
          </p>
        ) : null}
      </div>
    </Card>
  );
}
