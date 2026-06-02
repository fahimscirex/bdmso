-- 0010_team_members.sql
-- Team / delegation page (/team), now editable from the admin dashboard (was
-- hardcoded HTML in team.astro). D1 is the source of truth; rows materialize to
-- src/content/data/team.json for Astro to server-render.
--
-- Apply:
--   wrangler d1 execute bdmso --local  --file=./db/migrations/0010_team_members.sql
--   wrangler d1 execute bdmso --remote --file=./db/migrations/0010_team_members.sql --config wrangler.prod.toml

CREATE TABLE IF NOT EXISTS team_members (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  section TEXT NOT NULL,
  subgroup TEXT,
  year TEXT,
  name TEXT NOT NULL,
  role TEXT,
  affiliation TEXT,
  image TEXT,
  sort_order INTEGER NOT NULL DEFAULT 0,
  published INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_by TEXT,
  FOREIGN KEY (updated_by) REFERENCES guardian_accounts (id)
);
CREATE INDEX IF NOT EXISTS idx_team_members_published
ON team_members (published, section, sort_order);

CREATE TRIGGER IF NOT EXISTS trg_team_members_updated_at
AFTER UPDATE ON team_members FOR EACH ROW
WHEN NEW.updated_at IS OLD.updated_at
BEGIN
  UPDATE team_members SET updated_at = datetime('now') WHERE rowid = NEW.rowid;
END;
