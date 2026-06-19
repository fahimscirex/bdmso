-- 0022_publish_updated_at_triggers.sql
-- Additive, safe-on-live-D1 changes only (no table rebuilds):
--   pending_publish.updated_at and publish_snapshots.updated_at carry the column
--   but never had the AFTER UPDATE auto-touch trigger that every other mutable
--   table gets, so updated_at went stale on edits. Add both, mirroring the
--   trg_cohorts_updated_at pattern (the WHEN guard only touches the row when the
--   write did not already change updated_at).
--
-- Apply:
--   wrangler d1 execute bdmso --local  --file=./db/migrations/0022_publish_updated_at_triggers.sql
--   wrangler d1 execute bdmso --remote --file=./db/migrations/0022_publish_updated_at_triggers.sql --config wrangler.prod.toml

CREATE TRIGGER IF NOT EXISTS trg_pending_publish_updated_at
AFTER UPDATE ON pending_publish FOR EACH ROW
WHEN NEW.updated_at IS OLD.updated_at
BEGIN
  UPDATE pending_publish SET updated_at = datetime('now') WHERE rowid = NEW.rowid;
END;

CREATE TRIGGER IF NOT EXISTS trg_publish_snapshots_updated_at
AFTER UPDATE ON publish_snapshots FOR EACH ROW
WHEN NEW.updated_at IS OLD.updated_at
BEGIN
  UPDATE publish_snapshots SET updated_at = datetime('now') WHERE rowid = NEW.rowid;
END;
