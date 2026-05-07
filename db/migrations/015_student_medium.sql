-- Add medium of instruction field to registrations.
-- Bangla medium: valid classes are 3–5. English medium: classes 3–6.
--
-- Local:       npx wrangler d1 execute bdmso --local --file=./db/migrations/015_student_medium.sql
-- Production:  npx wrangler d1 execute bdmso --file=./db/migrations/015_student_medium.sql --config wrangler.prod.toml

ALTER TABLE registrations ADD COLUMN student_medium TEXT;
