import { writeAuditEvent } from "../audit";
import { requestDocument } from "../documents";
import { cancelReadyReminders, scheduleReadyPickupNotification, scheduleReadyReminder } from "../reminders";
import { supabaseServer } from "../supabase-server";
import type { CommandEffect, DocumentType, RecipientPolicy } from "../types";

export async function executeCommandEffects(
  workshopId: string,
  effects: CommandEffect[],
): Promise<void> {
  for (const effect of effects) {
    switch (effect.type) {
      case "write_audit": {
        const p = effect.payload;
        await writeAuditEvent({
          workshopId,
          workOrderId: p.workOrderId as string | undefined,
          eventType: p.eventType as string,
          actorType: p.actorType as "mechanic" | "dashboard_user" | "system",
          actorRef: p.actorRef as string | undefined,
          before: p.before as Record<string, unknown> | undefined,
          after: p.after as Record<string, unknown> | undefined,
        });
        break;
      }

      case "update_work_order_status": {
        const p = effect.payload;
        const patch: Record<string, unknown> = { status: p.status };
        if (p.readyAt !== undefined) patch.ready_at = p.readyAt;
        if (p.collectedAt !== undefined) patch.collected_at = p.collectedAt;
        const { error } = await supabaseServer
          .from("work_orders")
          .update(patch)
          .eq("workshop_id", workshopId)
          .eq("id", p.workOrderId as string);
        if (error) throw new Error(`Failed to update work order status: ${error.message}`);
        break;
      }

      case "insert_note": {
        const p = effect.payload;
        const { error } = await supabaseServer
          .from("work_order_notes")
          .insert({
            id: p.id as string,
            workshop_id: workshopId,
            work_order_id: p.workOrderId as string,
            note: p.note as string,
            source: p.source as string,
            created_by: p.createdBy as string,
          });
        if (error) throw new Error(`Failed to insert note: ${error.message}`);
        break;
      }

      case "insert_work_order_item": {
        const p = effect.payload;
        const { error } = await supabaseServer
          .from("work_order_items")
          .insert({
            id: p.id as string,
            workshop_id: workshopId,
            work_order_id: p.workOrderId as string,
            item_type: p.itemType as string,
            description: p.description as string,
            quantity: p.quantity as number,
            unit_price: p.unitPrice as number,
            source: p.source as string,
            created_by: p.createdBy as string,
          });
        if (error) throw new Error(`Failed to insert work order item: ${error.message}`);
        break;
      }

      case "enqueue_document": {
        const p = effect.payload;
        await requestDocument(workshopId, {
          workOrderId: p.workOrderId as string,
          documentType: p.documentType as DocumentType,
          createdBy: p.createdBy as string,
        });
        break;
      }

      case "schedule_reminder": {
        const p = effect.payload;
        await scheduleReadyReminder({
          workshopId,
          workOrderId: p.workOrderId as string,
          readyAt: p.readyAt as string,
          readyReminderDays: p.readyReminderDays as number,
          recipientPolicy: p.recipientPolicy as RecipientPolicy,
          mechanicIdentifier: p.mechanicIdentifier as string | undefined,
          customerIdentifier: p.customerIdentifier as string | null | undefined,
        });
        break;
      }

      case "schedule_pickup_notification": {
        const p = effect.payload;
        await scheduleReadyPickupNotification({
          workshopId,
          workOrderId: p.workOrderId as string,
          readyAt: p.readyAt as string,
          customerIdentifier: p.customerIdentifier as string | null | undefined,
          customerName: p.customerName as string | null | undefined,
          plate: p.plate as string | null | undefined,
          workshopDisplayName: p.workshopDisplayName as string | null | undefined,
        }).catch((err: unknown) => {
          console.warn("[effect-executor] schedule_pickup_notification failed", {
            workshopId,
            workOrderId: p.workOrderId,
            errorMessage: err instanceof Error ? err.message : String(err),
          });
        });
        break;
      }

      case "cancel_reminders": {
        const p = effect.payload;
        await cancelReadyReminders(workshopId, p.workOrderId as string);
        break;
      }

      default: {
        const _exhaustive: never = effect.type;
        throw new Error(`Unknown effect type: ${String(_exhaustive)}`);
      }
    }
  }
}
