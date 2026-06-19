-- 0023: add CHECK + FK constraints via the SQLite table-rebuild recipe
-- (create-new, copy, drop, rename). ADDITIVE to the data: every row is copied,
-- nothing is deleted.
--
-- SCOPE: only tables that have NO incoming FK references (coupons, cohorts,
-- attendance, scores). On D1/workerd, foreign_keys cannot be turned off and
-- defer_foreign_keys is not honored, so a table that other tables reference by
-- FK (registrations, payments) cannot be dropped/rebuilt without a risky
-- cascade-rebuild of every child. Those two get their CHECK/FK constraints in
-- schema.sql (fresh DBs) only; existing DBs keep relying on the app-layer
-- validation already in the worker routes.
--
-- PRECONDITIONS (verified against LOCAL data 2026-06-19; RE-VERIFY on prod):
--   - Enum columns hold only allowlisted values (allowlists are supersets of
--     every value the worker code writes, derived from the code).
--   - Zero FK orphans for the new FKs (cohorts.program_slug, attendance/
--     scores.event_key) and zero existing FK violations.
--   - Migration 0006 fully applied (coupons.updated_at present). A DB where
--     0006 only partially applied must first run
--     'ALTER TABLE coupons ADD COLUMN updated_at TEXT'.
--
-- The copy uses EXPLICIT column names (never SELECT *) because existing DBs have
-- a different physical column order than schema.sql (migrations appended cols).
--
--   wrangler d1 execute bdmso --local  --file=./db/migrations/0023_check_and_fk_constraints.sql
--   wrangler d1 execute bdmso --remote --file=./db/migrations/0023_check_and_fk_constraints.sql --config wrangler.prod.toml

BEGIN TRANSACTION;

-- ===== coupons: CHECK discount_type, discount_value >= 0 =====
CREATE TABLE coupons_new (
  code TEXT PRIMARY KEY,
  discount_type TEXT NOT NULL DEFAULT 'percent' CHECK (discount_type IN ('percent','fixed')),
  discount_value REAL NOT NULL CHECK (discount_value >= 0),
  max_uses INTEGER,
  used_count INTEGER NOT NULL DEFAULT 0,
  applies_to TEXT,
  expires_at TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT
);
INSERT INTO coupons_new (code, discount_type, discount_value, max_uses, used_count, applies_to, expires_at, created_at, updated_at)
  SELECT code, discount_type, discount_value, max_uses, used_count, applies_to, expires_at, created_at, updated_at FROM coupons;
DROP TABLE coupons;
ALTER TABLE coupons_new RENAME TO coupons;
CREATE TRIGGER IF NOT EXISTS trg_coupons_updated_at
AFTER UPDATE ON coupons FOR EACH ROW
WHEN NEW.updated_at IS OLD.updated_at
BEGIN
  UPDATE coupons SET updated_at = datetime('now') WHERE rowid = NEW.rowid;
END;

-- ===== cohorts: CHECK status, FK program_slug -> programs(slug) =====
CREATE TABLE cohorts_new (
  cohort_key        TEXT PRIMARY KEY,
  program_slug      TEXT NOT NULL,
  label             TEXT NOT NULL,
  status            TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','upcoming','enrolling','running','ended','archived')),
  enroll_opens      TEXT,
  enroll_closes     TEXT,
  starts_on         TEXT,
  ends_on           TEXT,
  price_override    INTEGER,
  capacity          INTEGER,
  sections          TEXT NOT NULL DEFAULT '[]',
  results_published INTEGER NOT NULL DEFAULT 0,
  public_featured   INTEGER NOT NULL DEFAULT 0,
  published_at      TEXT,
  created_at        TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at        TEXT,
  FOREIGN KEY (program_slug) REFERENCES programs (slug)
);
INSERT INTO cohorts_new (cohort_key, program_slug, label, status, enroll_opens, enroll_closes, starts_on, ends_on, price_override, capacity, sections, results_published, public_featured, published_at, created_at, updated_at)
  SELECT cohort_key, program_slug, label, status, enroll_opens, enroll_closes, starts_on, ends_on, price_override, capacity, sections, results_published, public_featured, published_at, created_at, updated_at FROM cohorts;
DROP TABLE cohorts;
ALTER TABLE cohorts_new RENAME TO cohorts;
CREATE INDEX IF NOT EXISTS idx_cohorts_program ON cohorts (program_slug);
CREATE INDEX IF NOT EXISTS idx_cohorts_program_status ON cohorts (program_slug, status);
CREATE INDEX IF NOT EXISTS idx_cohorts_status ON cohorts (status);
CREATE TRIGGER IF NOT EXISTS trg_cohorts_updated_at
AFTER UPDATE ON cohorts FOR EACH ROW
WHEN NEW.updated_at IS OLD.updated_at
BEGIN
  UPDATE cohorts SET updated_at = datetime('now') WHERE rowid = NEW.rowid;
END;

-- ===== attendance: CHECK status, FK event_key -> cohorts(cohort_key) =====
CREATE TABLE attendance_new (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  registration_id TEXT NOT NULL,
  event_key TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'absent' CHECK (status IN ('absent','present','late','no_show')),
  checked_in_at TEXT,
  checked_in_by TEXT,
  notes TEXT,
  FOREIGN KEY (registration_id) REFERENCES registrations (id),
  FOREIGN KEY (checked_in_by) REFERENCES guardian_accounts (id),
  FOREIGN KEY (event_key) REFERENCES cohorts (cohort_key),
  UNIQUE (registration_id, event_key)
);
INSERT INTO attendance_new (id, registration_id, event_key, status, checked_in_at, checked_in_by, notes)
  SELECT id, registration_id, event_key, status, checked_in_at, checked_in_by, notes FROM attendance;
DROP TABLE attendance;
ALTER TABLE attendance_new RENAME TO attendance;
CREATE INDEX IF NOT EXISTS idx_attendance_event ON attendance (event_key, status);

-- ===== scores: FK event_key -> cohorts(cohort_key) =====
CREATE TABLE scores_new (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  registration_id TEXT NOT NULL,
  event_key TEXT NOT NULL,
  section TEXT NOT NULL,
  score REAL NOT NULL,
  max_score REAL NOT NULL,
  rank INTEGER,
  tier TEXT,
  entered_at TEXT NOT NULL DEFAULT (datetime('now')),
  entered_by TEXT,
  FOREIGN KEY (registration_id) REFERENCES registrations (id),
  FOREIGN KEY (entered_by) REFERENCES guardian_accounts (id),
  FOREIGN KEY (event_key) REFERENCES cohorts (cohort_key),
  UNIQUE (registration_id, event_key, section)
);
INSERT INTO scores_new (id, registration_id, event_key, section, score, max_score, rank, tier, entered_at, entered_by)
  SELECT id, registration_id, event_key, section, score, max_score, rank, tier, entered_at, entered_by FROM scores;
DROP TABLE scores;
ALTER TABLE scores_new RENAME TO scores;
CREATE INDEX IF NOT EXISTS idx_scores_event_section ON scores (event_key, section, score DESC);

COMMIT;
