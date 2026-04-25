import type { WorkOrderStatus } from "../../lib/types";
import { statusLabel } from "../../lib/dashboard/formatters";
import { Badge } from "../ui/badge";

export function WorkOrderStatusBadge({ status }: { status: WorkOrderStatus }) {
  const tone = status === "ready" ? "green" : status === "in_progress" ? "blue" : status === "accepted" ? "amber" : "neutral";
  const pulse = status === "in_progress";
  return (
    <Badge tone={tone} dot pulse={pulse}>
      {statusLabel(status)}
    </Badge>
  );
}
