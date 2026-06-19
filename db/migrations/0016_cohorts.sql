-- Cohort/run model for repeatable programs. Generalizes exam_events into a
-- single "cohort" = a scheduled instance (run) of a program. Registrations bind
-- to a cohort, results bind via scores.event_key = cohorts.cohort_key, and
-- reports group by it.
--
-- cohort_key is INTERNAL only (never in public URLs). Format: {program}-{YYYY}
-- for the first/only run in a year; a -b{N} suffix is added only for a program's
-- 2nd+ run within the same year (e.g. lab-day-2026, lab-day-2026-b2).
-- status lifecycle: draft -> upcoming -> enrolling -> running -> ended -> archived.
-- price_override: null = use the program's catalog price; otherwise the run's price.
CREATE TABLE IF NOT EXISTS cohorts (
  cohort_key        TEXT PRIMARY KEY,
  program_slug      TEXT NOT NULL,
  label             TEXT NOT NULL,
  status            TEXT NOT NULL DEFAULT 'draft',
  enroll_opens      TEXT,
  enroll_closes     TEXT,
  starts_on         TEXT,
  ends_on           TEXT,
  price_override    INTEGER,
  capacity          INTEGER,
  sections          TEXT NOT NULL DEFAULT '[]',
  results_published INTEGER NOT NULL DEFAULT 0,
  published_at      TEXT,
  created_at        TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_cohorts_program ON cohorts (program_slug);
CREATE INDEX IF NOT EXISTS idx_cohorts_program_status ON cohorts (program_slug, status);

-- One current (2026) cohort per program, carrying exam sections + publish state
-- where the program had an exam_events row. Status derives from the program's
-- current registration state. Key = {slug}-{MM}26: MM = start month for
-- repeatable programs, 00 for once-a-year programs.
INSERT OR IGNORE INTO cohorts
  (cohort_key, program_slug, label, status, enroll_opens, enroll_closes, starts_on, ends_on, sections, results_published, published_at)
SELECT
  p.slug || '-' ||
    CASE WHEN p.repeatable = 1 AND p.starts_on IS NOT NULL AND length(p.starts_on) >= 7
         THEN substr(p.starts_on, 6, 2) ELSE '00' END || '26',
  p.slug,
  p.title || ' 2026',
  CASE WHEN p.registration_status = 'open' OR p.always_open = 1 THEN 'enrolling' ELSE 'ended' END,
  p.registration_opens, p.registration_closes, p.starts_on, p.ends_on,
  COALESCE(e.sections, '[]'),
  COALESCE(e.results_published, 0),
  e.published_at
FROM programs p
LEFT JOIN exam_events e ON e.program_slug = p.slug;

-- Registrations bind to a cohort (backfill = each program's current cohort);
-- then re-key any existing scores onto the new cohort key via their registration.
-- Format-agnostic: keys off program_slug/registration, not a hardcoded suffix.
ALTER TABLE registrations ADD COLUMN cohort_key TEXT;
CREATE INDEX IF NOT EXISTS idx_registrations_cohort ON registrations (cohort_key);
UPDATE registrations SET cohort_key =
  (SELECT c.cohort_key FROM cohorts c WHERE c.program_slug = registrations.registration_type)
  WHERE cohort_key IS NULL;
UPDATE scores SET event_key =
  (SELECT r.cohort_key FROM registrations r WHERE r.id = scores.registration_id)
  WHERE EXISTS (SELECT 1 FROM registrations r WHERE r.id = scores.registration_id AND r.cohort_key IS NOT NULL);

-- exam_events is now subsumed by cohorts.
DROP TABLE exam_events;
