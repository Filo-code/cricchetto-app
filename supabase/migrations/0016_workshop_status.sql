-- Migration 0016: workshop soft status (active / suspended / closed)
-- No hard deletes. All data preserved.

ALTER TABLE workshops
  ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'active'
    CONSTRAINT workshops_status_check CHECK (status IN ('active', 'suspended', 'closed'));

ALTER TABLE workshops
  ADD COLUMN IF NOT EXISTS closed_at timestamptz NULL;

ALTER TABLE workshops
  ADD COLUMN IF NOT EXISTS closed_reason text NULL;

CREATE INDEX IF NOT EXISTS idx_workshops_status ON workshops(status);
