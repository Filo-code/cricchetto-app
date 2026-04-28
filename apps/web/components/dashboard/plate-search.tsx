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
    <form onSubmit={submit} className="glass-panel flex items-center gap-3 rounded-xl px-4 py-3 focus-within:border-accent/[0.18] transition-colors duration-200">
      <Search className="h-4 w-4 shrink-0 text-zinc-600" aria-hidden />
      <span className="hidden text-[9.5px] font-mono uppercase tracking-[0.14em] text-zinc-700 sm:block">Targa</span>
      <div className="flex-1 min-w-0">
        <Input
          id="plate-search"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
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
  );
}
