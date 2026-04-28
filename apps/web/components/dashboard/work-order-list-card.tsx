import { ClipboardList } from "lucide-react";
import type { ReactNode } from "react";
import type { DashboardWorkOrderSummary } from "../../lib/dashboard/types";
import { Card, CardHeader } from "../ui/card";
import { EmptyState } from "./empty-state";
import { WorkOrderSummaryCard } from "./work-order-summary-card";

export function WorkOrderListCard({
  title,
  eyebrow,
  workOrders,
  emptyTitle,
  action,
}: {
  title: string;
  eyebrow?: string;
  workOrders: DashboardWorkOrderSummary[];
  emptyTitle: string;
  action?: ReactNode;
}) {
  return (
    <Card>
      <CardHeader
        title={title}
        eyebrow={eyebrow ? `${eyebrow} · ${workOrders.length}` : undefined}
        action={action}
      />
      <div className="space-y-2">
        {workOrders.length > 0 ? (
          workOrders.map((workOrder) => <WorkOrderSummaryCard key={workOrder.id} workOrder={workOrder} />)
        ) : (
          <EmptyState title={emptyTitle} icon={ClipboardList}>
            Quando arrivano nuove schede, compariranno qui.
          </EmptyState>
        )}
      </div>
    </Card>
  );
}
