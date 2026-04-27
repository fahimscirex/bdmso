-- Reformat member IDs from BDMSO-YYYY-NNNNN to YY-NNNNN and recover from a partial 003 run.
-- Safe to run whether 003 completed, partially applied, or never ran.
--
-- Local:       npx wrangler d1 execute bdmso --local --file=./db/migrations/004_member_id_reformat.sql
-- Production:  npx wrangler d1 execute bdmso --file=./db/migrations/004_member_id_reformat.sql --config wrangler.prod.toml

CREATE TABLE IF NOT EXISTS member_id_seq (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  reserved_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_registrations_member_id
ON registrations (member_id) WHERE member_id IS NOT NULL;

-- Reset: wipe old IDs and sequence, then backfill in creation order with the new format.
UPDATE registrations SET member_id = NULL;
DELETE FROM member_id_seq;
DELETE FROM sqlite_sequence WHERE name = 'member_id_seq';

INSERT INTO member_id_seq (reserved_at)
SELECT created_at FROM registrations ORDER BY rowid;

UPDATE registrations
SET member_id = substr(strftime('%Y', created_at), 3, 2) || '-' || printf('%05d', (
  SELECT COUNT(*) FROM registrations r2 WHERE r2.rowid <= registrations.rowid
))
WHERE member_id IS NULL;
