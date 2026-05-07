-- Store the coupon code on the payment row so used_count can be incremented
-- only after the payment callback confirms success, not at checkout creation.
--
-- Local:       npx wrangler d1 execute bdmso --local --file=./db/migrations/014_payments_coupon_code.sql
-- Production:  npx wrangler d1 execute bdmso --file=./db/migrations/014_payments_coupon_code.sql --config wrangler.prod.toml

ALTER TABLE payments ADD COLUMN coupon_code TEXT;
