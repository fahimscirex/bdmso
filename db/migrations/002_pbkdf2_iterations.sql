-- Make password iteration count explicit per-account so we can upgrade hashes over time.
-- Existing accounts were hashed at 120k iterations; new accounts use 600k (OWASP 2023).
--
-- Local:       npx wrangler d1 execute bdmso --local --file=./db/migrations/002_pbkdf2_iterations.sql
-- Production:  npx wrangler d1 execute bdmso --file=./db/migrations/002_pbkdf2_iterations.sql --config wrangler.prod.toml

ALTER TABLE guardian_accounts ADD COLUMN password_iterations INTEGER NOT NULL DEFAULT 120000;
