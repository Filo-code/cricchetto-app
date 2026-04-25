import type { AttachmentType, DocumentStatus, DocumentType, WorkOrderStatus } from "../types";

export interface DashboardTotals {
  laborTotal: number;
  partsTotal: number;
  grandTotal: number;
}

export interface DashboardWorkOrderSummary {
  id: string;
  publicCode: string;
  plate: string;
  status: WorkOrderStatus;
  reportedIssue: string;
  vehicleModel: string | null;
  customerName: string | null;
  customerPhone: string | null;
  kilometers: number | null;
  revisionDueDate: string | null;
  revisionReminderEnabled: boolean | null;
  revisionAppointmentDate: string | null;
  revisionAppointmentTime: string | null;
  readyAt: string | null;
  collectedAt: string | null;
  createdAt: string;
  updatedAt: string;
  totals: DashboardTotals;
}

export interface DashboardActivity {
  id: string;
  eventType: string;
  actorType: string;
  actorRef: string | null;
  createdAt: string;
  workOrderId: string | null;
  publicCode: string | null;
  plate: string | null;
}

export interface DashboardRevision {
  vehicleId: string;
  plate: string;
  model: string | null;
  customerName: string | null;
  revisionDueDate: string;
  revisionReminderEnabled: boolean | null;
  revisionAppointmentDate: string | null;
  revisionAppointmentTime: string | null;
  activeWorkOrderId: string | null;
  activeWorkOrderStatus: WorkOrderStatus | null;
}

export interface DashboardOverview {
  workshop: {
    id: string;
    name: string;
    timezone: string;
  };
  counts: {
    active: number;
    accepted: number;
    inProgress: number;
    ready: number;
    overdueRevisions: number;
  };
  activeWorkOrders: DashboardWorkOrderSummary[];
  inProgressWorkOrders: DashboardWorkOrderSummary[];
  readyWorkOrders: DashboardWorkOrderSummary[];
  recentActivity: DashboardActivity[];
  upcomingRevisions: DashboardRevision[];
}

export interface DashboardNote {
  id: string;
  note: string;
  source: string;
  createdBy: string | null;
  createdAt: string;
}

export interface DashboardItem {
  id: string;
  itemType: "labor" | "part";
  description: string;
  quantity: number;
  unitPrice: number;
  rowTotal: number;
  source: string;
  createdBy: string | null;
  createdAt: string;
}

export interface DashboardDocument {
  id: string;
  documentType: DocumentType;
  status: DocumentStatus;
  version: number;
  filename: string | null;
  generatedAt: string | null;
  downloadUrl: string | null;
  statusMessage: string | null;
  createdAt: string;
}

export interface DashboardAttachment {
  id: string;
  attachmentType: AttachmentType;
  filename: string | null;
  mimeType: string | null;
  createdBy: string | null;
  createdAt: string;
  capturedAt: string | null;
  fileSize: number | null;
  source: string | null;
  previewUrl: string | null;
  downloadUrl: string | null;
  transcriptionStatus: string | null;
}

export interface DashboardWorkOrderDetail {
  workOrder: DashboardWorkOrderSummary & {
    rowVersion: number;
    intakeCompletedAt: string;
    vehicleId: string;
    customerId: string | null;
  };
  notes: DashboardNote[];
  items: DashboardItem[];
  attachments: DashboardAttachment[];
  documents: DashboardDocument[];
  activity: DashboardActivity[];
}

export interface DashboardVehicleDetail {
  vehicle: {
    id: string;
    plate: string;
    model: string | null;
    revisionDueDate: string | null;
    revisionReminderEnabled: boolean | null;
    revisionAppointmentDate: string | null;
    revisionAppointmentTime: string | null;
    rowVersion: number;
    customerName: string | null;
    customerPhone: string | null;
    createdAt: string;
    updatedAt: string;
  };
  activeWorkOrder: DashboardWorkOrderSummary | null;
  workOrders: DashboardWorkOrderSummary[];
  revisionEvents: Array<{
    id: string;
    previousRevisionDueDate: string | null;
    newRevisionDueDate: string | null;
    source: string;
    createdBy: string | null;
    createdAt: string;
  }>;
}

export interface DashboardSearchVehicle {
  vehicleId: string;
  plate: string;
  model: string | null;
  customerName: string | null;
  revisionDueDate: string | null;
  activeWorkOrderId: string | null;
  activeWorkOrderStatus: WorkOrderStatus | null;
}

export interface DashboardSearchResult {
  query: string;
  vehicles: DashboardSearchVehicle[];
  activeWorkOrders: DashboardWorkOrderSummary[];
  historyWorkOrders: DashboardWorkOrderSummary[];
}
