-- Add optional owner-refreshed dosage shares without changing existing static
-- share behavior.
ALTER TABLE dosage_shares ADD COLUMN is_live INTEGER NOT NULL DEFAULT 0;
ALTER TABLE dosage_shares ADD COLUMN share_mode TEXT;
ALTER TABLE dosage_shares ADD COLUMN updated_at INTEGER;

UPDATE dosage_shares
SET updated_at = created_at
WHERE updated_at IS NULL;
