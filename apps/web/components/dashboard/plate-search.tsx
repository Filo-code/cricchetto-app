"use client";

import { Loader2, Search } from "lucide-react";
import { useRouter } from "next/navigation";
import { FormEvent, KeyboardEvent, useCallback, useEffect, useRef, useState } from "react";
import { statusLabel } from "../../lib/dashboard/formatters";
import type { DashboardSearchVehicle } from "../../lib/dashboard/types";
import { Button } from "../ui/button";
import { Input } from "../ui/input";

export function PlateSearch() {
  const [query, setQuery] = useState("");
  const [suggestions, setSuggestions] = useState<DashboardSearchVehicle[]>([]);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [searched, setSearched] = useState(false);
  const router = useRouter();
  const containerRef = useRef<HTMLDivElement>(null);
  const abortRef = useRef<AbortController | null>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const cleaned = query.trim().replace(/\s+/g, " ");
    if (cleaned) {
      setOpen(false);
      router.push(`/dashboard/search?q=${encodeURIComponent(cleaned)}`);
    }
  }

  function handleSuggestionClick(vehicle: DashboardSearchVehicle) {
    setOpen(false);
    if (vehicle.activeWorkOrderId) {
      router.push(`/dashboard/work-orders/${vehicle.activeWorkOrderId}`);
    } else {
      router.push(`/dashboard/vehicles/${vehicle.plate}`);
    }
  }

  function handleKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key === "Escape") {
      setOpen(false);
    }
  }

  const fetchSuggestions = useCallback((q: string) => {
    if (timerRef.current) clearTimeout(timerRef.current);

    if (q.trim().length < 2) {
      setSuggestions([]);
      setOpen(false);
      setSearched(false);
      return;
    }

    timerRef.current = setTimeout(async () => {
      if (abortRef.current) abortRef.current.abort();
      const controller = new AbortController();
      abortRef.current = controller;

      setLoading(true);
      try {
        const res = await fetch(`/api/dashboard/search/suggestions?q=${encodeURIComponent(q.trim())}`, {
          signal: controller.signal,
        });
        if (res.ok) {
          const json = await res.json() as { ok: boolean; data?: DashboardSearchVehicle[] };
          setSuggestions(json.data ?? []);
          setOpen(true);
          setSearched(true);
        }
      } catch (err) {
        if (!(err instanceof Error && err.name === "AbortError")) {
          setSuggestions([]);
        }
      } finally {
        setLoading(false);
      }
    }, 250);
  }, []);

  useEffect(() => {
    fetchSuggestions(query);
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [query, fetchSuggestions]);

  useEffect(() => {
    function onMouseDown(event: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", onMouseDown);
    return () => document.removeEventListener("mousedown", onMouseDown);
  }, []);

  const showDropdown = open && (suggestions.length > 0 || (!loading && searched));

  return (
    <div ref={containerRef} className="relative">
      <form onSubmit={submit} className="glass-panel flex items-center gap-3 rounded-xl px-4 py-3 focus-within:border-accent/[0.18] transition-colors duration-200">
        {loading ? (
          <Loader2 className="h-4 w-4 shrink-0 animate-spin text-zinc-600" aria-hidden />
        ) : (
          <Search className="h-4 w-4 shrink-0 text-zinc-600" aria-hidden />
        )}
        <span className="hidden text-[9.5px] font-mono uppercase tracking-[0.14em] text-zinc-700 sm:block">Targa</span>
        <div className="flex-1 min-w-0">
          <Input
            id="plate-search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Cerca per targa o nome cliente…"
            aria-label="Cerca per targa o nome cliente"
            autoComplete="off"
            className="h-9 border-white/[0.06] bg-transparent text-sm shadow-none"
          />
        </div>
        <Button type="submit" variant="primary" className="h-9 shrink-0 px-5 text-xs">
          Cerca
        </Button>
      </form>

      {showDropdown && (
        <div className="absolute z-50 mt-1 w-full overflow-hidden rounded-xl border border-white/[0.08] bg-zinc-900/95 shadow-xl backdrop-blur-sm animate-fade-in-up">
          <div className="max-h-[min(20rem,50dvh)] overflow-y-auto">
          {suggestions.length === 0 ? (
            <p className="px-4 py-3 text-sm text-zinc-500">Nessun risultato</p>
          ) : (
            <ul>
              {suggestions.map((vehicle) => (
                <li key={vehicle.vehicleId}>
                  <button
                    type="button"
                    className="w-full px-4 py-3 text-left transition-colors duration-150 hover:bg-white/[0.06] focus:bg-white/[0.06] focus:outline-none"
                    onClick={() => handleSuggestionClick(vehicle)}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-mono text-sm font-semibold tracking-wide text-zinc-50">
                        {vehicle.plate}
                      </span>
                      {vehicle.activeWorkOrderStatus && (
                        <span className="shrink-0 text-xs text-green-400">
                          {statusLabel(vehicle.activeWorkOrderStatus)}
                        </span>
                      )}
                    </div>
                    {(vehicle.customerName ?? vehicle.model) ? (
                      <p className="mt-0.5 truncate text-xs text-zinc-500">
                        {[vehicle.customerName, vehicle.model].filter(Boolean).join(" · ")}
                      </p>
                    ) : null}
                  </button>
                </li>
              ))}
            </ul>
          )}
          </div>
        </div>
      )}
    </div>
  );
}
