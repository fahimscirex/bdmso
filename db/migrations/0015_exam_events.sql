-- Defined exam events for the results system. Replaces the old "event_key is
-- whatever string someone typed" model: admins pick an event from this list,
-- enter/import scores against it (scores.event_key = exam_events.event_key),
-- finalise ranks, then flip results_published to release results to guardians.
--
--   event_key         - stable id, also used as scores.event_key / attendance.event_key
--                       (e.g. 'national-olympiad-2026')
--   label             - human label shown in admin + on the guardian dashboard
--   program_slug      - the program this exam belongs to (programs.slug); the
--                       roster is registrations with registration_type = program_slug
--   sections          - JSON array of scoring sections, each {id,label,max}:
--                       [{"id":"math","label":"Mathematics","max":50}, ...]
--   results_published - 0 = hidden from guardians (draft); 1 = released
--   published_at      - ISO timestamp when results were released
CREATE TABLE IF NOT EXISTS exam_events (
  event_key         TEXT PRIMARY KEY,
  label             TEXT NOT NULL,
  program_slug      TEXT NOT NULL,
  sections          TEXT NOT NULL DEFAULT '[]',
  results_published INTEGER NOT NULL DEFAULT 0,
  published_at      TEXT,
  created_at        TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_exam_events_program ON exam_events (program_slug);
