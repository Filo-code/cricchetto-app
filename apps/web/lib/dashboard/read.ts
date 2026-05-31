// Barrel: re-exports all public dashboard read functions from domain files.
// Import from this file to avoid touching call sites.

export { readDashboardWorkshop } from "./read-core";

export { getDashboardOverview } from "./read-overview";

export {
  getOpenWorkOrders,
  getReadyWorkOrders,
  getFilteredWorkOrders,
  getWorkOrderDetail,
  readWorkOrderForMutation,
  readWorkOrderMessageLogs,
  readCustomerAndVehicleForEdit,
} from "./read-work-orders";

export type { DashboardMessageLog, DashboardCustomerVehicleData } from "./read-work-orders";

export {
  listVehicles,
  getVehicleDetailByPlate,
  readVehicleForMutation,
} from "./read-vehicles";

export { getUpcomingRevisions } from "./read-revisions";

export { searchDashboard, readDashboardSearchSuggestions } from "./read-search";

export {
  getWorkshopSettings,
  uploadWorkshopLogo,
  readWorkshopChannelStatus,
} from "./read-settings";

export type { WorkshopFullSettings } from "./read-settings";
