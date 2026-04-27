"use client";

import { useActionState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { Button } from "../ui/button";
import { Input } from "../ui/input";
import { updateCustomerAction, updateVehicleAction } from "../../lib/dashboard/actions";
import type { DashboardCustomerVehicleData } from "../../lib/dashboard/read";

const initialState = { ok: false, message: "", stamp: 0 };

function CustomerForm({ data }: { data: DashboardCustomerVehicleData }) {
  const router = useRouter();
  const [state, formAction] = useActionState(updateCustomerAction, initialState);

  useEffect(() => {
    if (state.ok && state.stamp) router.refresh();
  }, [state.ok, state.stamp, router]);

  return (
    <form action={formAction} className="space-y-3">
      <input type="hidden" name="customerId" value={data.customerId ?? ""} />
      <input type="hidden" name="workOrderId" value="" />
      <label className="block">
        <span className="mb-1 block text-[11px] font-mono uppercase tracking-[0.15em] text-zinc-500">Nome cliente</span>
        <Input name="name" type="text" defaultValue={data.customerName ?? ""} required />
      </label>
      <label className="block">
        <span className="mb-1 block text-[11px] font-mono uppercase tracking-[0.15em] text-zinc-500">Telefono</span>
        <Input name="phone" type="tel" defaultValue={data.customerPhone ?? ""} />
      </label>
      {state.message && (
        <p className={`text-[11px] ${state.ok ? "text-emerald-400" : "text-red-400"}`}>{state.message}</p>
      )}
      <Button type="submit" variant="ghost" className="text-xs">
        Salva cliente
      </Button>
    </form>
  );
}

function VehicleForm({ data, workOrderId }: { data: DashboardCustomerVehicleData; workOrderId: string }) {
  const router = useRouter();
  const [state, formAction] = useActionState(updateVehicleAction, initialState);

  useEffect(() => {
    if (state.ok && state.stamp) router.refresh();
  }, [state.ok, state.stamp, router]);

  return (
    <form action={formAction} className="space-y-3">
      <input type="hidden" name="vehicleId" value={data.vehicleId} />
      <input type="hidden" name="workOrderId" value={workOrderId} />
      <label className="block">
        <span className="mb-1 block text-[11px] font-mono uppercase tracking-[0.15em] text-zinc-500">Targa</span>
        <Input name="plate" type="text" defaultValue={data.vehiclePlate} required />
      </label>
      <label className="block">
        <span className="mb-1 block text-[11px] font-mono uppercase tracking-[0.15em] text-zinc-500">Modello</span>
        <Input name="model" type="text" defaultValue={data.vehicleModel ?? ""} />
      </label>
      {state.message && (
        <p className={`text-[11px] ${state.ok ? "text-emerald-400" : "text-red-400"}`}>{state.message}</p>
      )}
      <Button type="submit" variant="ghost" className="text-xs">
        Salva veicolo
      </Button>
    </form>
  );
}

export function CustomerVehicleEditForm({
  data,
  workOrderId,
}: {
  data: DashboardCustomerVehicleData;
  workOrderId: string;
}) {
  return (
    <div className="rounded-2xl border border-white/10 bg-white/[0.02] p-5 space-y-5">
      <h3 className="text-[11px] font-mono uppercase tracking-[0.15em] text-zinc-500">Dati cliente e veicolo</h3>

      {data.customerId ? (
        <div>
          <p className="mb-3 text-[10px] font-mono uppercase tracking-[0.15em] text-zinc-600">Cliente</p>
          <CustomerForm data={data} />
        </div>
      ) : (
        <p className="text-[11px] text-zinc-600">Nessun cliente associato a questa scheda.</p>
      )}

      <div className="border-t border-white/[0.06] pt-4">
        <p className="mb-3 text-[10px] font-mono uppercase tracking-[0.15em] text-zinc-600">Veicolo</p>
        <VehicleForm data={data} workOrderId={workOrderId} />
      </div>
    </div>
  );
}
