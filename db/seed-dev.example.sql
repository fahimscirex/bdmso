-- Template for db/seed-dev.sql (gitignored). Apply against local only:
--   cp db/seed-dev.example.sql db/seed-dev.sql
--   wrangler d1 execute bdmso --local --file=./db/seed-dev.sql

-- 100% off coupon for testing the payment + receipt flow without
-- hitting shurjoPay sandbox or burning Brevo sends. Capped at 50
-- uses so a runaway dev script can't blow through silently. Never
-- run this file against production.
INSERT OR IGNORE INTO coupons (code, discount_type, discount_value, max_uses, applies_to, created_at)
VALUES ('REPLACE_ME_DEV_CODE', 'percent', 100, 50, NULL, CURRENT_TIMESTAMP);
