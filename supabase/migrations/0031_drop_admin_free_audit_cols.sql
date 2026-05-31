-- Remove audit columns from workshops: reason/set_by/set_at already recorded
-- in platform_audit_events (eventType: workshop.free_access_enabled/disabled).
-- Single source of truth for audit data = platform_audit_events.
ALTER TABLE workshops DROP COLUMN admin_free_reason;
ALTER TABLE workshops DROP COLUMN admin_free_set_by;
ALTER TABLE workshops DROP COLUMN admin_free_set_at;
