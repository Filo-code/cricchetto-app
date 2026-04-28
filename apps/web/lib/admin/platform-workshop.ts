// Returns the protected platform workshop ID (never allow suspend/close).
// Checks PLATFORM_WORKSHOP_ID first, then falls back to dashboard workshop env vars.
export function getPlatformWorkshopId(): string | null {
  return (
    process.env.Criccheto_PLATFORM_WORKSHOP_ID?.trim() ||
    process.env.Criccheto_DASHBOARD_WORKSHOP_ID?.trim() ||
    process.env.Criccheto_WORKSHOP_ID?.trim() ||
    null
  );
}
