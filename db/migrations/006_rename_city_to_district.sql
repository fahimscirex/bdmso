-- Rename student_city to student_district across registrations.
--
-- Local:       npx wrangler d1 execute bdmso --local --file=./db/migrations/006_rename_city_to_district.sql
-- Production:  npx wrangler d1 execute bdmso --file=./db/migrations/006_rename_city_to_district.sql --config wrangler.prod.toml

ALTER TABLE registrations RENAME COLUMN student_city TO student_district;
