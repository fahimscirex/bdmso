-- 0024: add the CHECK + FK constraints to registrations and payments on EXISTING
-- DBs (0023 could only do childless tables; these two are referenced by other
-- tables, and D1 won't drop a referenced table). Done by rebuilding the whole
-- linked group LEAF-FIRST so no foreign_keys=OFF is needed: back up every row to
-- a temp table, drop children before parents, recreate with the final schema,
-- restore the rows parent-first, recreate indexes/trigger, drop the temp tables.
-- ADDITIVE to the data: every row is copied back, nothing is deleted.
--
-- Group: registrations (parent) + payments + attendance + scores +
-- registration_notes + registration_option_changes (its children, directly or
-- transitively). attendance/scores keep the constraints 0023 already gave them.
--
-- PRECONDITIONS (verified on LOCAL 2026-06-19; RE-VERIFY on prod): enum columns
-- conform to the allowlists; zero FK orphans (payments.coupon_code,
-- attendance/scores.event_key); migration 0023 already applied. EXPLICIT column
-- names are used everywhere (physical column order differs from schema.sql).
--
--   wrangler d1 execute bdmso --local  --file=./db/migrations/0024_payments_registrations_constraints.sql
--   wrangler d1 execute bdmso --remote --file=./db/migrations/0024_payments_registrations_constraints.sql --config wrangler.prod.toml

BEGIN TRANSACTION;

-- 1) Back up every row (no constraints on the backup tables).
CREATE TABLE _bak_roc   AS SELECT * FROM registration_option_changes;
CREATE TABLE _bak_notes AS SELECT * FROM registration_notes;
CREATE TABLE _bak_sco   AS SELECT * FROM scores;
CREATE TABLE _bak_att   AS SELECT * FROM attendance;
CREATE TABLE _bak_pay   AS SELECT * FROM payments;
CREATE TABLE _bak_reg   AS SELECT * FROM registrations;

-- 2) Drop leaf-first (each table has no remaining children when dropped).
DROP TABLE registration_option_changes;
DROP TABLE registration_notes;
DROP TABLE scores;
DROP TABLE attendance;
DROP TABLE payments;
DROP TABLE registrations;

-- 3) Recreate parent-first with the final constraints (matches schema.sql).
CREATE TABLE registrations (
  id TEXT PRIMARY KEY,
  registration_type TEXT NOT NULL,
  student_full_name TEXT NOT NULL,
  student_date_of_birth TEXT NOT NULL,
  student_class_name TEXT NOT NULL,
  student_gender TEXT NOT NULL DEFAULT '',
  student_medium TEXT,
  student_school TEXT NOT NULL,
  student_district TEXT NOT NULL,
  guardian_account_id TEXT NOT NULL,
  guardian_full_name TEXT NOT NULL,
  guardian_relationship TEXT NOT NULL,
  guardian_phone TEXT NOT NULL,
  guardian_email TEXT NOT NULL,
  guardian_address TEXT NOT NULL,
  preferred_venue TEXT,
  preferred_subject TEXT,
  program_options TEXT,
  terms_accepted INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'submitted' CHECK (status IN ('submitted','payment_pending','paid','confirmed','cancelled')),
  source_page TEXT,
  member_id TEXT UNIQUE,
  cohort_key TEXT,
  reminded_at TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT,
  FOREIGN KEY (guardian_account_id) REFERENCES guardian_accounts (id)
);

CREATE TABLE payments (
  id TEXT PRIMARY KEY,
  registration_id TEXT NOT NULL,
  amount REAL NOT NULL CHECK (amount >= 0),
  currency TEXT NOT NULL DEFAULT 'BDT',
  tran_id TEXT UNIQUE,
  val_id TEXT,
  gateway_status TEXT,
  method TEXT,
  account_number TEXT,
  channel TEXT NOT NULL DEFAULT 'online',
  invoice_no TEXT,
  coupon_code TEXT,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','paid','failed','cancelled','expired','refunded')),
  purpose TEXT NOT NULL DEFAULT 'initial' CHECK (purpose IN ('initial','option-upgrade')),
  proposed_options TEXT,
  cohort_key TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY (registration_id) REFERENCES registrations (id),
  FOREIGN KEY (coupon_code) REFERENCES coupons (code)
);

CREATE TABLE attendance (
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

CREATE TABLE scores (
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

CREATE TABLE registration_notes (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  registration_id TEXT NOT NULL,
  author_account_id TEXT NOT NULL,
  body TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (registration_id) REFERENCES registrations (id),
  FOREIGN KEY (author_account_id) REFERENCES guardian_accounts (id)
);

CREATE TABLE registration_option_changes (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  registration_id TEXT NOT NULL,
  from_options TEXT NOT NULL,
  to_options TEXT NOT NULL,
  from_price REAL NOT NULL,
  to_price REAL NOT NULL,
  delta REAL NOT NULL,
  action TEXT NOT NULL,
  payment_id TEXT,
  actor_account_id TEXT NOT NULL,
  acknowledged_no_refund INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL,
  FOREIGN KEY (registration_id) REFERENCES registrations (id),
  FOREIGN KEY (payment_id) REFERENCES payments (id),
  FOREIGN KEY (actor_account_id) REFERENCES guardian_accounts (id)
);

-- 4) Restore rows parent-first (explicit columns; order satisfies FKs per row).
INSERT INTO registrations (id, registration_type, student_full_name, student_date_of_birth, student_class_name, student_gender, student_medium, student_school, student_district, guardian_account_id, guardian_full_name, guardian_relationship, guardian_phone, guardian_email, guardian_address, preferred_venue, preferred_subject, program_options, terms_accepted, status, source_page, member_id, cohort_key, reminded_at, created_at, updated_at)
  SELECT id, registration_type, student_full_name, student_date_of_birth, student_class_name, student_gender, student_medium, student_school, student_district, guardian_account_id, guardian_full_name, guardian_relationship, guardian_phone, guardian_email, guardian_address, preferred_venue, preferred_subject, program_options, terms_accepted, status, source_page, member_id, cohort_key, reminded_at, created_at, updated_at FROM _bak_reg;

INSERT INTO payments (id, registration_id, amount, currency, tran_id, val_id, gateway_status, method, account_number, channel, invoice_no, coupon_code, status, purpose, proposed_options, cohort_key, created_at, updated_at)
  SELECT id, registration_id, amount, currency, tran_id, val_id, gateway_status, method, account_number, channel, invoice_no, coupon_code, status, purpose, proposed_options, cohort_key, created_at, updated_at FROM _bak_pay;

INSERT INTO attendance (id, registration_id, event_key, status, checked_in_at, checked_in_by, notes)
  SELECT id, registration_id, event_key, status, checked_in_at, checked_in_by, notes FROM _bak_att;

INSERT INTO scores (id, registration_id, event_key, section, score, max_score, rank, tier, entered_at, entered_by)
  SELECT id, registration_id, event_key, section, score, max_score, rank, tier, entered_at, entered_by FROM _bak_sco;

INSERT INTO registration_notes (id, registration_id, author_account_id, body, created_at)
  SELECT id, registration_id, author_account_id, body, created_at FROM _bak_notes;

INSERT INTO registration_option_changes (id, registration_id, from_options, to_options, from_price, to_price, delta, action, payment_id, actor_account_id, acknowledged_no_refund, created_at)
  SELECT id, registration_id, from_options, to_options, from_price, to_price, delta, action, payment_id, actor_account_id, acknowledged_no_refund, created_at FROM _bak_roc;

-- 5) Recreate indexes + trigger.
CREATE INDEX IF NOT EXISTS idx_registrations_cohort ON registrations (cohort_key);
CREATE INDEX IF NOT EXISTS idx_registrations_guardian_email ON registrations (guardian_email);
CREATE INDEX IF NOT EXISTS idx_registrations_guardian_account ON registrations (guardian_account_id);
CREATE INDEX IF NOT EXISTS idx_registrations_guardian_account_status ON registrations (guardian_account_id, status);
CREATE INDEX IF NOT EXISTS idx_registrations_status_created ON registrations (status, created_at);
CREATE INDEX IF NOT EXISTS idx_registrations_created ON registrations (created_at);
CREATE TRIGGER IF NOT EXISTS trg_registrations_updated_at
AFTER UPDATE ON registrations FOR EACH ROW
WHEN NEW.updated_at IS OLD.updated_at
BEGIN
  UPDATE registrations SET updated_at = datetime('now') WHERE rowid = NEW.rowid;
END;

CREATE INDEX IF NOT EXISTS idx_payments_cohort ON payments (cohort_key);
CREATE INDEX IF NOT EXISTS idx_payments_registration_id ON payments (registration_id);
CREATE INDEX IF NOT EXISTS idx_payments_tran_id ON payments (tran_id);
CREATE INDEX IF NOT EXISTS idx_payments_val_id ON payments (val_id);
CREATE INDEX IF NOT EXISTS idx_payments_status_updated ON payments (status, updated_at);
CREATE INDEX IF NOT EXISTS idx_payments_channel ON payments (channel);
CREATE INDEX IF NOT EXISTS idx_payments_coupon ON payments (coupon_code);
CREATE UNIQUE INDEX IF NOT EXISTS idx_payments_one_pending_upgrade
ON payments (registration_id)
WHERE status = 'pending' AND purpose = 'option-upgrade';

CREATE INDEX IF NOT EXISTS idx_attendance_event ON attendance (event_key, status);
CREATE INDEX IF NOT EXISTS idx_scores_event_section ON scores (event_key, section, score DESC);
CREATE INDEX IF NOT EXISTS idx_registration_notes_reg ON registration_notes (registration_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_option_changes_registration ON registration_option_changes (registration_id, created_at DESC);

-- 6) Drop the temp backups.
DROP TABLE _bak_roc;
DROP TABLE _bak_notes;
DROP TABLE _bak_sco;
DROP TABLE _bak_att;
DROP TABLE _bak_pay;
DROP TABLE _bak_reg;

COMMIT;
