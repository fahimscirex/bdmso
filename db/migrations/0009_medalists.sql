-- 0009_medalists.sql
-- Olympiad medal winners, now editable from the admin dashboard (was hardcoded
-- HTML in results.astro). D1 is the source of truth; rows materialize to
-- src/content/data/medalists.json for Astro to server-render the /results page.
--
-- Apply:
--   wrangler d1 execute bdmso --local  --file=./db/migrations/0009_medalists.sql
--   wrangler d1 execute bdmso --remote --file=./db/migrations/0009_medalists.sql --config wrangler.prod.toml

CREATE TABLE IF NOT EXISTS medalists (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  year TEXT NOT NULL,
  category TEXT NOT NULL,
  medal TEXT NOT NULL,
  name TEXT NOT NULL,
  school TEXT,
  sort_order INTEGER NOT NULL DEFAULT 0,
  published INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_by TEXT,
  FOREIGN KEY (updated_by) REFERENCES guardian_accounts (id)
);
CREATE INDEX IF NOT EXISTS idx_medalists_published
ON medalists (published, year, category, medal, sort_order);

CREATE TRIGGER IF NOT EXISTS trg_medalists_updated_at
AFTER UPDATE ON medalists FOR EACH ROW
WHEN NEW.updated_at IS OLD.updated_at
BEGIN
  UPDATE medalists SET updated_at = datetime('now') WHERE rowid = NEW.rowid;
END;
