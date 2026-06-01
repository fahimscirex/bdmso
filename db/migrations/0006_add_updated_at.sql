-- 0006_add_updated_at.sql
-- Add updated_at to the mutable tables that only had created_at, so we can tell
-- when a row last changed, not just when it was created.
--
-- SQLite's ALTER TABLE ADD COLUMN cannot take a non-constant default, so the
-- column is nullable; existing rows are backfilled to created_at, and an
-- AFTER UPDATE trigger keeps it current with zero worker-code changes. The
-- `WHEN NEW.updated_at IS OLD.updated_at` guard fires the touch only when the
-- write did not itself change updated_at, so it is safe whether or not
-- recursive_triggers is on.
--
-- Apply:
--   wrangler d1 execute bdmso --local  --file=./db/migrations/0006_add_updated_at.sql
--   wrangler d1 execute bdmso --remote --file=./db/migrations/0006_add_updated_at.sql --config wrangler.prod.toml

ALTER TABLE guardian_accounts ADD COLUMN updated_at TEXT;
UPDATE guardian_accounts SET updated_at = created_at WHERE updated_at IS NULL;
CREATE TRIGGER IF NOT EXISTS trg_guardian_accounts_updated_at
AFTER UPDATE ON guardian_accounts FOR EACH ROW
WHEN NEW.updated_at IS OLD.updated_at
BEGIN
  UPDATE guardian_accounts SET updated_at = datetime('now') WHERE rowid = NEW.rowid;
END;

ALTER TABLE registrations ADD COLUMN updated_at TEXT;
UPDATE registrations SET updated_at = created_at WHERE updated_at IS NULL;
CREATE TRIGGER IF NOT EXISTS trg_registrations_updated_at
AFTER UPDATE ON registrations FOR EACH ROW
WHEN NEW.updated_at IS OLD.updated_at
BEGIN
  UPDATE registrations SET updated_at = datetime('now') WHERE rowid = NEW.rowid;
END;

ALTER TABLE coupons ADD COLUMN updated_at TEXT;
UPDATE coupons SET updated_at = created_at WHERE updated_at IS NULL;
CREATE TRIGGER IF NOT EXISTS trg_coupons_updated_at
AFTER UPDATE ON coupons FOR EACH ROW
WHEN NEW.updated_at IS OLD.updated_at
BEGIN
  UPDATE coupons SET updated_at = datetime('now') WHERE rowid = NEW.rowid;
END;

ALTER TABLE sponsorship_enquiries ADD COLUMN updated_at TEXT;
UPDATE sponsorship_enquiries SET updated_at = created_at WHERE updated_at IS NULL;
CREATE TRIGGER IF NOT EXISTS trg_sponsorship_enquiries_updated_at
AFTER UPDATE ON sponsorship_enquiries FOR EACH ROW
WHEN NEW.updated_at IS OLD.updated_at
BEGIN
  UPDATE sponsorship_enquiries SET updated_at = datetime('now') WHERE rowid = NEW.rowid;
END;
