-- 0007_press_mentions.sql
-- Press / media mentions, now editable from the admin dashboard (was the
-- hand-edited public/data/media.json + hardcoded HTML in media.astro, which had
-- drifted apart). D1 is the source of truth; rows materialize to
-- src/content/data/press.json for Astro to server-render.
--
-- Apply:
--   wrangler d1 execute bdmso --local  --file=./db/migrations/0007_press_mentions.sql
--   wrangler d1 execute bdmso --remote --file=./db/migrations/0007_press_mentions.sql --config wrangler.prod.toml

CREATE TABLE IF NOT EXISTS press_mentions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  outlet TEXT NOT NULL,
  title TEXT NOT NULL,
  url TEXT NOT NULL,
  published_on TEXT,
  image TEXT,
  featured INTEGER NOT NULL DEFAULT 0,
  sort_order INTEGER NOT NULL DEFAULT 0,
  published INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_by TEXT,
  FOREIGN KEY (updated_by) REFERENCES guardian_accounts (id)
);
CREATE INDEX IF NOT EXISTS idx_press_mentions_published
ON press_mentions (published, featured, published_on DESC);

CREATE TRIGGER IF NOT EXISTS trg_press_mentions_updated_at
AFTER UPDATE ON press_mentions FOR EACH ROW
WHEN NEW.updated_at IS OLD.updated_at
BEGIN
  UPDATE press_mentions SET updated_at = datetime('now') WHERE rowid = NEW.rowid;
END;
