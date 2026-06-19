-- 0021_cohorts_updated_at_and_indexes.sql
-- Additive, safe-on-live-D1 changes only (no table rebuilds):
--   1. cohorts.updated_at + auto-touch trigger, mirroring migration 0006 so
--      cohort status changes (draft -> enrolling -> running -> ended) are
--      traceable like every other mutable table.
--   2. A handful of genuinely-missing indexes on frequently-queried / FK columns
--      (see AUDIT-REPORT.md "Database - Missing Indexes").
--
-- Apply:
--   wrangler d1 execute bdmso --local  --file=./db/migrations/0021_cohorts_updated_at_and_indexes.sql
--   wrangler d1 execute bdmso --remote --file=./db/migrations/0021_cohorts_updated_at_and_indexes.sql --config wrangler.prod.toml

-- M16: cohorts had only created_at. ADD COLUMN cannot take a non-constant
-- default, so the column is nullable; existing rows are backfilled to created_at
-- and the AFTER UPDATE trigger keeps it current with zero worker-code changes.
ALTER TABLE cohorts ADD COLUMN updated_at TEXT;
UPDATE cohorts SET updated_at = created_at WHERE updated_at IS NULL;
CREATE TRIGGER IF NOT EXISTS trg_cohorts_updated_at
AFTER UPDATE ON cohorts FOR EACH ROW
WHEN NEW.updated_at IS OLD.updated_at
BEGIN
  UPDATE cohorts SET updated_at = datetime('now') WHERE rowid = NEW.rowid;
END;

-- Missing indexes on frequently-queried / foreign-key columns.
CREATE INDEX IF NOT EXISTS idx_cohorts_status   ON cohorts (status);
CREATE INDEX IF NOT EXISTS idx_payments_channel ON payments (channel);
CREATE INDEX IF NOT EXISTS idx_payments_coupon  ON payments (coupon_code);
CREATE INDEX IF NOT EXISTS idx_sessions_expires ON sessions (expires_at);
