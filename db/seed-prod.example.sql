-- Template for db/seed-prod.sql (which is gitignored and holds the
-- real values). Copy this file, replace the REPLACE_ME placeholders
-- with the actual codes from your password manager / internal docs,
-- and run against both local and prod:
--
--   cp db/seed-prod.example.sql db/seed-prod.sql
--   # edit db/seed-prod.sql with real codes
--   wrangler d1 execute bdmso --local --file=./db/seed-prod.sql
--   wrangler d1 execute bdmso --remote --file=./db/seed-prod.sql --config wrangler.prod.toml

-- Internal staff/partner coupon for live payment sanity checks.
-- 99% (not 100%) so the gateway still runs a real charge - a 0-BDT
-- path skips shurjoPay entirely. Capped at 100 uses; rotate the
-- code if it leaks. Keep the real value out of source control.
INSERT OR IGNORE INTO coupons (code, discount_type, discount_value, max_uses, applies_to, created_at)
VALUES ('REPLACE_ME_PILOT_CODE', 'percent', 99, 100, NULL, CURRENT_TIMESTAMP);
