-- Security hardening migration
-- Apply to an existing DB that was created before email verification + rate limiting were added.
--
-- Local:       npx wrangler d1 execute bdmso --local --file=./db/migrations/001_security_hardening.sql
-- Production:  npx wrangler d1 execute bdmso --file=./db/migrations/001_security_hardening.sql --config wrangler.prod.toml

ALTER TABLE guardian_accounts ADD COLUMN email_verified INTEGER NOT NULL DEFAULT 0;

CREATE TABLE IF NOT EXISTS email_verification_tokens (
  token TEXT PRIMARY KEY,
  account_id TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  created_at TEXT NOT NULL,
  FOREIGN KEY (account_id) REFERENCES guardian_accounts (id)
);

CREATE TABLE IF NOT EXISTS login_attempts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  email TEXT NOT NULL,
  success INTEGER NOT NULL,
  attempted_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_login_attempts_email_time
ON login_attempts (email, attempted_at);
