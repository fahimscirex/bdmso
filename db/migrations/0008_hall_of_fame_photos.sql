-- 0008_hall_of_fame_photos.sql
-- Homepage Hall of Fame slider photos, now editable from the admin dashboard
-- (was public/data/results.json `photos`). D1 is the source of truth; rows
-- materialize to src/content/data/halloffame.json for Astro to server-render.
--
-- Apply:
--   wrangler d1 execute bdmso --local  --file=./db/migrations/0008_hall_of_fame_photos.sql
--   wrangler d1 execute bdmso --remote --file=./db/migrations/0008_hall_of_fame_photos.sql --config wrangler.prod.toml

CREATE TABLE IF NOT EXISTS hall_of_fame_photos (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  image TEXT NOT NULL,
  caption TEXT,
  year TEXT,
  sort_order INTEGER NOT NULL DEFAULT 0,
  published INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_by TEXT,
  FOREIGN KEY (updated_by) REFERENCES guardian_accounts (id)
);
CREATE INDEX IF NOT EXISTS idx_hall_of_fame_published
ON hall_of_fame_photos (published, sort_order);

CREATE TRIGGER IF NOT EXISTS trg_hall_of_fame_photos_updated_at
AFTER UPDATE ON hall_of_fame_photos FOR EACH ROW
WHEN NEW.updated_at IS OLD.updated_at
BEGIN
  UPDATE hall_of_fame_photos SET updated_at = datetime('now') WHERE rowid = NEW.rowid;
END;
