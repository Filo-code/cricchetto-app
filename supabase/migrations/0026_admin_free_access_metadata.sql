-- Migration 0026: metadata columns for admin free-access override tracking.
--
-- admin_free_access (boolean) was added in 0025.
-- These columns record WHO set it, WHY, and WHEN — for auditability.
-- admin_free_set_by stores the platform admin email (from env session, never a DB user id).

ALTER TABLE workshops
  ADD COLUMN IF NOT EXISTS admin_free_reason text NULL,
  ADD COLUMN IF NOT EXISTS admin_free_set_by text NULL,
  ADD COLUMN IF NOT EXISTS admin_free_set_at timestamptz NULL;
