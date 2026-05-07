-- Add preferred_venue to registrations (National Qualifying Round only).
--
-- Local:       npx wrangler d1 execute bdmso --local --file=./db/migrations/011_preferred_venue.sql
-- Production:  npx wrangler d1 execute bdmso --file=./db/migrations/011_preferred_venue.sql --config wrangler.prod.toml

ALTER TABLE registrations ADD COLUMN preferred_venue TEXT;
