-- payments.account_id is redundant - derivable via registration_id → registrations.guardian_account_id.
-- Remove it to eliminate the duplicate FK.
--
-- Local:       npx wrangler d1 execute bdmso --local --file=./db/migrations/012_drop_payments_account_id.sql
-- Production:  npx wrangler d1 execute bdmso --file=./db/migrations/012_drop_payments_account_id.sql --config wrangler.prod.toml

ALTER TABLE payments RENAME TO payments_old;

CREATE TABLE payments (
  id TEXT PRIMARY KEY,
  registration_id TEXT NOT NULL,
  amount REAL NOT NULL,
  currency TEXT NOT NULL DEFAULT 'BDT',
  tran_id TEXT UNIQUE,
  val_id TEXT,
  gateway_status TEXT,
  status TEXT NOT NULL DEFAULT 'pending',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

INSERT INTO payments
SELECT id, registration_id, amount, currency, tran_id, val_id, gateway_status, status, created_at, updated_at
FROM payments_old;

DROP TABLE payments_old;

CREATE INDEX IF NOT EXISTS idx_payments_registration_id ON payments (registration_id);
CREATE INDEX IF NOT EXISTS idx_payments_tran_id ON payments (tran_id);
