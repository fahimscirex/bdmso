-- 0005_registrations_guardian_index.sql
-- The guardian dashboard's main query filters registrations by
-- guardian_account_id (and often status), but there was no index on it - every
-- dashboard load table-scanned. Add the single-column index plus the
-- (guardian_account_id, status) compound the list query uses.
--
-- Apply:
--   wrangler d1 execute bdmso --local  --file=./db/migrations/0005_registrations_guardian_index.sql
--   wrangler d1 execute bdmso --remote --file=./db/migrations/0005_registrations_guardian_index.sql --config wrangler.prod.toml
CREATE INDEX IF NOT EXISTS idx_registrations_guardian_account
  ON registrations (guardian_account_id);
CREATE INDEX IF NOT EXISTS idx_registrations_guardian_account_status
  ON registrations (guardian_account_id, status);
