"use client";

import { Loader2, Search } from "lucide-react";
import { useRouter } from "next/navigation";
import { FormEvent, KeyboardEvent, useCallback, useEffect, useRef, useState } from "react";
import { statusLabel } from "../../lib/dashboard/formatters";
import type { SearchSuggestion } from "../../lib/dashboard/types";
import { Button } from "../ui/button";
import { Input } from "../ui/input";

function highlight(text: string, query: string): React.ReactNode {
  if (!text || !query) return text;
  const q = query.trim().toLowerCase();
  if (!q) return text;
  const idx = text.toLowerCase().indexOf(q);
  if (idx === -1) return text;
  return (
    <>
      {text.slice(0, idx)}
      <mark className="rounded-sm bg-accent/30 px-0.5 text-zinc-100 not-italic">
        {text.slice(idx, idx + q.length)}
      </mark>
      {text.slice(idx + q.length)}
    </>
  );
}

function suggestionHref(s: SearchSuggestion): string {
  if (s.kind === "work_order") return `/dashboard/work-orders/${s.workOrderId}`;
  if (s.activeWorkOrderId) return `/dashboard/work-orders/${s.activeWorkOrderId}`;
  return `/dashboard/vehicles/${s.plate}`;
}

export function PlateSearch() {
  const [query, setQuery] = useState("");
  const [suggestions, setSuggestions] = useState<SearchSuggestion[]>([]);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [searched, setSearched] = useState(false);
  const [selectedIndex, setSelectedIndex] = useState(-1);
  const router = useRouter();
  const containerRef = useRef<HTMLDivElement>(null);
  const abortRef = useRef<AbortController | null>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (selectedIndex >= 0 && suggestions[selectedIndex]) {
      router.push(suggestionHref(suggestions[selectedIndex]));
      setOpen(false);
      return;
    }
    const cleaned = query.trim().replace(/\s+/g, " ");
    if (cleaned) {
      setOpen(false);
      router.push(`/dashboard/search?q=${encodeURIComponent(cleaned)}`);
    }
  }

  function handleSuggestionClick(suggestion: SearchSuggestion) {
    setOpen(false);
    router.push(suggestionHref(suggestion));
  }

  function handleKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (!open || suggestions.length === 0) {
      if (event.key === "Escape") setOpen(false);
      return;
    }
    switch (event.key) {
      case "ArrowDown":
        event.preventDefault();
        setSelectedIndex((i) => Math.min(i + 1, suggestions.length - 1));
        break;
      case "ArrowUp":
        event.preventDefault();
        setSelectedIndex((i) => Math.max(i - 1, -1));
        break;
      case "Escape":
        setOpen(false);
        setSelectedIndex(-1);
        break;
    }
  }

  const fetchSuggestions = useCallback((q: string) => {
    if (timerRef.current) clearTimeout(timerRef.current);

    if (q.trim().length < 2) {
      setSuggestions([]);
      setOpen(false);
      setSearched(false);
      setSelectedIndex(-1);
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
          const json = await res.json() as { ok: boolean; data?: SearchSuggestion[] };
          setSuggestions(json.data ?? []);
          setOpen(true);
          setSearched(true);
          setSelectedIndex(-1);
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
      <form
        onSubmit={submit}
        className="glass-panel flex items-center gap-3 rounded-xl px-4 py-3 transition-colors duration-200 focus-within:border-accent/[0.18]"
      >
        {loading ? (
          <Loader2 className="h-4 w-4 shrink-0 animate-spin text-zinc-600" aria-hidden />
        ) : (
          <Search className="h-4 w-4 shrink-0 text-zinc-600" aria-hidden />
        )}
        <span className="hidden text-[9.5px] font-mono uppercase tracking-[0.14em] text-zinc-700 sm:block">Targa</span>
        <div className="min-w-0 flex-1">
          <Input
            id="plate-search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Cerca per targa o nome cliente…"
            aria-label="Cerca per targa o nome cliente"
            aria-expanded={showDropdown}
            aria-autocomplete="list"
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
              <ul role="listbox">
                {suggestions.map((suggestion, idx) => (
                  <li key={suggestion.kind === "vehicle" ? suggestion.vehicleId : suggestion.workOrderId} role="option" aria-selected={idx === selectedIndex}>
                    <button
                      type="button"
                      className={`w-full px-4 py-3 text-left transition-colors duration-150 focus:outline-none ${
                        idx === selectedIndex
                          ? "bg-white/[0.09]"
                          : "hover:bg-white/[0.06] focus:bg-white/[0.06]"
                      }`}
                      onMouseEnter={() => setSelectedIndex(idx)}
                      onClick={() => handleSuggestionClick(suggestion)}
                    >
                      {suggestion.kind === "vehicle" ? (
                        <>
                          <div className="flex items-center justify-between gap-2">
                            <span className="font-mono text-sm font-semibold tracking-wide text-zinc-50">
                              {highlight(suggestion.plate, query)}
                            </span>
                            {suggestion.activeWorkOrderStatus && (
                              <span className="shrink-0 text-xs text-green-400">
                                {statusLabel(suggestion.activeWorkOrderStatus)}
                              </span>
                            )}
                          </div>
                          {(suggestion.customerName ?? suggestion.model) ? (
                            <p className="mt-0.5 truncate text-xs text-zinc-500">
                              {[suggestion.customerName, suggestion.model].filter(Boolean).map((s, i) => (
                                <span key={i}>{i > 0 ? " · " : ""}{highlight(s!, query)}</span>
                              ))}
                            </p>
                          ) : null}
                        </>
                      ) : (
                        <>
                          <div className="flex items-center justify-between gap-2">
                            <span className="font-mono text-xs text-zinc-400">
                              {highlight(suggestion.publicCode, query)}
                            </span>
                            <span className="shrink-0 text-xs text-green-400">
                              {statusLabel(suggestion.status)}
                            </span>
                          </div>
                          <div className="flex items-center gap-2">
                            <span className="font-mono text-sm font-semibold tracking-wide text-zinc-50">
                              {highlight(suggestion.plate, query)}
                            </span>
                            {suggestion.customerName && (
                              <p className="truncate text-xs text-zinc-500">
                                {highlight(suggestion.customerName, query)}
                              </p>
                            )}
                          </div>
                        </>
                      )}
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
