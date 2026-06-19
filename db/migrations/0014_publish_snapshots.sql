-- Revert baseline for the staged review-and-publish system. Content edits hit
-- D1 live, so "discard" needs the last-published state to roll back to. On each
-- publish we snapshot every committed entity's D1 row(s) here; discard restores
-- D1 from this baseline (or deletes never-published rows).
--
--   entity_type - 'post' | 'program' | 'press' | 'halloffame' | 'medalist' | 'team'
--   entity_id   - slug for posts/programs; the dataset name for the JSON datasets
--                 (matches pending_publish.entity_id).
--   d1_json     - JSON array of the entity's D1 row(s) as of the last publish:
--                 the whole table for datasets, the single row for per-file
--                 entities.
CREATE TABLE IF NOT EXISTS publish_snapshots (
  entity_type TEXT NOT NULL,
  entity_id   TEXT NOT NULL,
  d1_json     TEXT NOT NULL,
  updated_at  TEXT NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY (entity_type, entity_id)
);
