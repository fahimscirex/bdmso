-- Staged review-and-publish. Content edits (posts, programs, press mentions,
-- hall-of-fame, medalists, team) no longer push to GitHub on every save.
-- Instead each write UPSERTS a pending_publish row; a single admin "publish"
-- action then commits every staged change in ONE GitHub commit.
--
--   entity_type         - 'post' | 'program' | 'press' | 'halloffame' | 'medalist' | 'team'
--   entity_id           - the per-file key: slug for posts/programs; for the
--                         whole-file JSON datasets (press/halloffame/medalist/
--                         team) it is the dataset name itself, so every row
--                         edit of that dataset dedupes to ONE pending row.
--   action              - 'create' | 'update' | 'delete' (delete only applies
--                         to per-file entities; JSON datasets always rebuild).
--   materialized_path   - repo-relative path the publish step writes.
--   materialized_content- the .md / .json text staged for that path. NULL for a
--                         delete (the file is removed at publish time).
--   d1_after_json       - snapshot of the D1 row(s) at stage time (debugging /
--                         preview). Not used to drive the commit.
CREATE TABLE IF NOT EXISTS pending_publish (
  id TEXT PRIMARY KEY,
  entity_type TEXT NOT NULL,
  entity_id TEXT NOT NULL,
  action TEXT NOT NULL,                                -- 'create' | 'update' | 'delete'
  materialized_path TEXT,
  materialized_content TEXT,
  d1_after_json TEXT,
  status TEXT NOT NULL DEFAULT 'pending',              -- 'pending' | 'published'
  staged_by TEXT,
  staged_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT
);

-- One pending row per entity: repeated edits collapse onto it (see the UPSERT
-- in worker/routes/admin.js). The publish/discard sweep filters by status.
CREATE UNIQUE INDEX IF NOT EXISTS idx_pending_publish_entity
ON pending_publish (entity_type, entity_id);

CREATE INDEX IF NOT EXISTS idx_pending_publish_status
ON pending_publish (status);
