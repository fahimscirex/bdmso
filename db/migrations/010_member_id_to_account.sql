-- Move member_id from registrations → guardian_accounts.
-- One account = one member_id. Storing it per-registration caused UNIQUE violations
-- when a guardian enrolled in multiple programs.
-- Supersedes migration 009 (which only dropped the UNIQUE index).
--
-- Local:       npx wrangler d1 execute bdmso --local --file=./db/migrations/010_member_id_to_account.sql
-- Production:  npx wrangler d1 execute bdmso --file=./db/migrations/010_member_id_to_account.sql --config wrangler.prod.toml

-- 1. Add member_id to guardian_accounts (UNIQUE - one per account)
ALTER TABLE guardian_accounts ADD COLUMN member_id TEXT;
CREATE UNIQUE INDEX IF NOT EXISTS idx_guardian_accounts_member_id
ON guardian_accounts (member_id) WHERE member_id IS NOT NULL;

-- 2. Backfill: copy each guardian's first member_id from registrations
UPDATE guardian_accounts
SET member_id = (
  SELECT member_id FROM registrations
  WHERE guardian_account_id = guardian_accounts.id
    AND member_id IS NOT NULL
  ORDER BY created_at ASC
  LIMIT 1
)
WHERE EXISTS (
  SELECT 1 FROM registrations
  WHERE guardian_account_id = guardian_accounts.id
    AND member_id IS NOT NULL
);

-- 3. Remove member_id from registrations.
-- Cannot use DROP COLUMN - column has a UNIQUE constraint (auto-named, un-droppable).
-- Cannot use DROP TABLE - payments.registration_id FK references registrations.
-- Solution: rename → create new (payments FK now resolves to new table) → drop old.
ALTER TABLE registrations RENAME TO registrations_old;

CREATE TABLE registrations (
  id TEXT PRIMARY KEY,
  registration_type TEXT NOT NULL,
  student_full_name TEXT NOT NULL,
  student_date_of_birth TEXT NOT NULL,
  student_class_name TEXT NOT NULL,
  student_gender TEXT NOT NULL DEFAULT '',
  student_school TEXT NOT NULL,
  student_district TEXT NOT NULL,
  guardian_account_id TEXT NOT NULL,
  guardian_full_name TEXT NOT NULL,
  guardian_relationship TEXT NOT NULL,
  guardian_phone TEXT NOT NULL,
  guardian_email TEXT NOT NULL,
  guardian_address TEXT NOT NULL,
  terms_accepted INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'submitted',
  source_page TEXT,
  created_at TEXT NOT NULL
);

INSERT INTO registrations
SELECT id, registration_type, student_full_name, student_date_of_birth, student_class_name,
       student_gender, student_school, student_district, guardian_account_id, guardian_full_name,
       guardian_relationship, guardian_phone, guardian_email, guardian_address,
       terms_accepted, status, source_page, created_at
FROM registrations_old;

DROP TABLE registrations_old;

CREATE INDEX IF NOT EXISTS idx_registrations_guardian_email
ON registrations (guardian_email);
