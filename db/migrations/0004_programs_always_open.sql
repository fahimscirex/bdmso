-- 0004_programs_always_open.sql
-- Add the always_open flag to programs. 1 = year-round, registration is always
-- open and the date window is ignored. The open/upcoming/closed state is now
-- derived from this flag plus registration_opens/registration_closes, replacing
-- the registration_status enum as the open/closed driver.

ALTER TABLE programs ADD COLUMN always_open INTEGER NOT NULL DEFAULT 0;
