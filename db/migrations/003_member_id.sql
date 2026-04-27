-- Add human-readable member IDs (BDMSO-YYYY-NNNNN) to registrations.
-- The sequence table provides atomic, monotonic numbering across concurrent registrations.
--
-- Local:       npx wrangler d1 execute bdmso --local --file=./db/migrations/003_member_id.sql
-- Production:  npx wrangler d1 execute bdmso --file=./db/migrations/003_member_id.sql --config wrangler.prod.toml

ALTER TABLE registrations ADD COLUMN member_id TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS idx_registrations_member_id
ON registrations (member_id) WHERE member_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS member_id_seq (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  reserved_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- Backfill existing rows with sequential member IDs.
-- Uses rowid to ensure stable ordering by creation order.
INSERT INTO member_id_seq (reserved_at)
SELECT created_at FROM registrations WHERE member_id IS NULL ORDER BY rowid;

UPDATE registrations
SET member_id = 'BDMSO-' || strftime('%Y', created_at) || '-' || printf('%05d', (
  SELECT COUNT(*) FROM registrations r2 WHERE r2.rowid <= registrations.rowid
))
WHERE member_id IS NULL;
