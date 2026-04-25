"use client";

import { Car } from "lucide-react";
import { useRouter } from "next/navigation";
import { FormEvent, useState } from "react";
import { normalizePlate } from "../../lib/plates";
import { Button } from "../ui/button";
import { Input } from "../ui/input";

export function VehicleHistorySearch() {
  const [plate, setPlate] = useState("");
  const router = useRouter();

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const normalized = normalizePlate(plate);
    if (normalized) {
      router.push(`/dashboard/vehicles/${encodeURIComponent(normalized)}`);
    }
  }

  return (
    <form onSubmit={submit} className="glass-panel rounded-2xl p-5 sm:p-6">
      <div className="mb-4 flex flex-col gap-1">
        <label htmlFor="vehicle-history-plate" className="block text-sm font-semibold tracking-tight text-zinc-100">
          Storico auto
        </label>
        <p className="text-xs text-zinc-500">Apri lo storico completo di una targa.</p>
      </div>
      <div className="flex flex-col gap-3 sm:flex-row">
        <div className="flex-1">
          <Input
            id="vehicle-history-plate"
            value={plate}
            onChange={(event) => setPlate(event.target.value)}
            placeholder="Es. AB123CD"
            aria-label="Targa veicolo"
            autoComplete="off"
          />
        </div>
        <Button type="submit" variant="primary" className="h-12 sm:w-36">
          <Car className="h-4 w-4" />
          Apri storico
        </Button>
      </div>
    </form>
  );
}
