-- Member IDs are now assigned only after successful payment, not at registration time.
-- Clear member_id for any unpaid registrations so they receive IDs via the payment flow.
--
-- Local:       npx wrangler d1 execute bdmso --local --file=./db/migrations/005_member_id_on_payment.sql
-- Production:  npx wrangler d1 execute bdmso --file=./db/migrations/005_member_id_on_payment.sql --config wrangler.prod.toml

UPDATE registrations
SET member_id = NULL
WHERE status != 'paid';
