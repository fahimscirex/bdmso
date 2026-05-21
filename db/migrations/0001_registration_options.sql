-- Migration 0001 - registration option columns + member ID counter
--
-- Brings a database created BEFORE these changes up to date. A database
-- created fresh from db/schema.sql already has everything here; this file
-- exists only because `CREATE TABLE IF NOT EXISTS` in schema.sql cannot add
-- columns to a table that already exists, so re-applying schema.sql is not
-- enough on its own.
--
-- Run ONCE against such a database:
--   wrangler d1 execute bdmso --local  --file=./db/migrations/0001_registration_options.sql
--   wrangler d1 execute bdmso --remote --file=./db/migrations/0001_registration_options.sql --config wrangler.prod.toml
--
-- The ALTERs error with "duplicate column name" if the columns already
-- exist - that just means the database is already current, nothing to do.

-- New member-ID counter (replaces the old member_id_seq table). Created
-- first so it still lands even if the ALTERs below abort on an
-- already-current database. reserveMemberId() inserts into this table on
-- the first paid receipt; without it, member-ID assignment fails after a
-- payment has already been confirmed.
CREATE TABLE IF NOT EXISTS member_id_class_seq (
  year INTEGER NOT NULL,
  class_digit INTEGER NOT NULL,
  next_seq INTEGER NOT NULL DEFAULT 1,
  PRIMARY KEY (year, class_digit)
);

-- Registration columns the registration / enrollment flows now read and write.
ALTER TABLE registrations ADD COLUMN preferred_subject TEXT;
ALTER TABLE registrations ADD COLUMN program_options TEXT;
ALTER TABLE registrations ADD COLUMN member_id TEXT;

-- registrations.member_id is declared UNIQUE in schema.sql. A column added
-- via ALTER TABLE cannot carry a UNIQUE constraint, so enforce it with an
-- equivalent unique index instead.
CREATE UNIQUE INDEX IF NOT EXISTS idx_registrations_member_id
ON registrations (member_id) WHERE member_id IS NOT NULL;
