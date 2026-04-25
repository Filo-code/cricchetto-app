"use client";

import { Search } from "lucide-react";
import { useRouter } from "next/navigation";
import { FormEvent, useState } from "react";
import { Button } from "../ui/button";
import { Input } from "../ui/input";

export function PlateSearch() {
  const [query, setQuery] = useState("");
  const router = useRouter();

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const cleaned = query.trim().replace(/\s+/g, " ");
    if (cleaned) {
      router.push(`/dashboard/search?q=${encodeURIComponent(cleaned)}`);
    }
  }

  return (
    <form onSubmit={submit} className="glass-panel rounded-2xl p-5 sm:p-6">
      <div className="mb-4 flex flex-col gap-1">
        <label htmlFor="plate-search" className="block text-sm font-semibold tracking-tight text-zinc-100">
          Ricerca rapida
        </label>
        <p className="text-xs text-zinc-500">Targa, nome o cognome cliente.</p>
      </div>
      <div className="flex flex-col gap-3 sm:flex-row">
        <div className="relative flex-1">
          <Search className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-500" aria-hidden />
          <Input
            id="plate-search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Cerca per targa o nome cliente"
            aria-label="Cerca per targa o nome cliente"
            autoComplete="off"
            className="pl-11"
          />
        </div>
        <Button type="submit" variant="primary" className="h-12 sm:w-36">
          <Search className="h-4 w-4" />
          Cerca
        </Button>
      </div>
    </form>
  );
}
