-- Full schema. Idempotent (uses CREATE TABLE IF NOT EXISTS), so re-apply anytime.
--
-- Apply:
--   wrangler d1 execute bdmso --local  --file=./db/schema.sql
--   wrangler d1 execute bdmso --remote --file=./db/schema.sql --config wrangler.prod.toml
--
-- This file is the canonical source of truth. As long as production has no data
-- you want to preserve, schema changes happen here and the DB gets re-applied.
-- Once production has live data, add a db/migrations/ folder with timestamped
-- apply-scripts for incremental ALTERs.

CREATE TABLE IF NOT EXISTS guardian_accounts (
  id TEXT PRIMARY KEY,
  email TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  password_salt TEXT NOT NULL,
  password_iterations INTEGER NOT NULL DEFAULT 600000,
  full_name TEXT NOT NULL,
  phone TEXT,
  email_verified INTEGER NOT NULL DEFAULT 0,
  member_id TEXT,
  role TEXT NOT NULL DEFAULT 'guardian',   -- 'guardian' | 'admin' | 'editor' | 'mentor'
  created_at TEXT NOT NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_guardian_accounts_member_id
ON guardian_accounts (member_id) WHERE member_id IS NOT NULL;

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

CREATE TABLE IF NOT EXISTS registrations (
  id TEXT PRIMARY KEY,
  registration_type TEXT NOT NULL,
  student_full_name TEXT NOT NULL,
  student_date_of_birth TEXT NOT NULL,
  student_class_name TEXT NOT NULL,
  student_gender TEXT NOT NULL DEFAULT '',
  student_medium TEXT,
  student_school TEXT NOT NULL,
  student_district TEXT NOT NULL,
  guardian_account_id TEXT NOT NULL,
  guardian_full_name TEXT NOT NULL,
  guardian_relationship TEXT NOT NULL,
  guardian_phone TEXT NOT NULL,
  guardian_email TEXT NOT NULL,
  guardian_address TEXT NOT NULL,
  preferred_venue TEXT,
  terms_accepted INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'submitted',
  source_page TEXT,
  created_at TEXT NOT NULL,
  FOREIGN KEY (guardian_account_id) REFERENCES guardian_accounts (id)
);

-- Atomic counter for human-readable member IDs (BDMSO-YYYY-NNNNN).
-- Each registration INSERT into this table returns the next sequence via last_row_id.
CREATE TABLE IF NOT EXISTS member_id_seq (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  reserved_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_registrations_guardian_email
ON registrations (guardian_email);

CREATE TABLE IF NOT EXISTS sponsorship_enquiries (
  id TEXT PRIMARY KEY,
  organization TEXT NOT NULL,
  contact_person TEXT NOT NULL,
  email TEXT NOT NULL,
  phone TEXT,
  interest TEXT NOT NULL,
  message TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'new',
  source_page TEXT,
  created_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_sponsorship_enquiries_email
ON sponsorship_enquiries (email);

CREATE TABLE IF NOT EXISTS sessions (
  id TEXT PRIMARY KEY,
  account_id TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  created_at TEXT NOT NULL,
  FOREIGN KEY (account_id) REFERENCES guardian_accounts (id)
);

CREATE INDEX IF NOT EXISTS idx_sessions_account_id
ON sessions (account_id);

-- Gateway column mapping (shurjoPay):
--   tran_id        = merchant order_id      (we generate; sent as order_id to /api/secret-pay)
--   val_id         = sp_order_id            (from secret-pay response; used to look up the row in /payment-callback because shurjoPay's redirect identifies the txn by sp_order_id, not by our id)
--   gateway_status = transaction_status     (from /api/verification: "Success" on paid)
CREATE TABLE IF NOT EXISTS payments (
  id TEXT PRIMARY KEY,
  registration_id TEXT NOT NULL,
  amount REAL NOT NULL,
  currency TEXT NOT NULL DEFAULT 'BDT',
  tran_id TEXT UNIQUE,       -- merchant order_id
  val_id TEXT,               -- shurjoPay sp_order_id (set at create-payment time)
  gateway_status TEXT,       -- shurjoPay transaction_status
  coupon_code TEXT,          -- coupon applied at checkout (used_count incremented on success)
  status TEXT NOT NULL DEFAULT 'pending',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY (registration_id) REFERENCES registrations (id)
);

CREATE INDEX IF NOT EXISTS idx_payments_registration_id
ON payments (registration_id);

CREATE INDEX IF NOT EXISTS idx_payments_tran_id
ON payments (tran_id);

CREATE INDEX IF NOT EXISTS idx_payments_val_id
ON payments (val_id);

-- shurjoPay /api/get_token returns a bearer token valid for ~1 hour plus
-- the store_id we need on every /api/secret-pay call. Cached in this
-- single-row table so concurrent worker invocations don't each spend an
-- extra round-trip to grant a fresh token.
CREATE TABLE IF NOT EXISTS shurjopay_token_cache (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  token TEXT NOT NULL,
  token_type TEXT NOT NULL,
  store_id TEXT NOT NULL,
  expires_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS coupons (
  code TEXT PRIMARY KEY,
  discount_type TEXT NOT NULL DEFAULT 'percent', -- 'percent' or 'fixed'
  discount_value REAL NOT NULL,
  max_uses INTEGER,               -- NULL = unlimited
  used_count INTEGER NOT NULL DEFAULT 0,
  applies_to TEXT,                -- NULL = all programs; comma-separated slugs otherwise
  expires_at TEXT,
  created_at TEXT NOT NULL
);

-- Dev seed: 100% off coupon for local testing. Remove before applying to production.
INSERT OR IGNORE INTO coupons (code, discount_type, discount_value, max_uses, applies_to, created_at)
VALUES ('TESTBDMSO', 'percent', 100, 50, NULL, CURRENT_TIMESTAMP);

-- ─── Dashboard tables (added 2026-05-17) ──────────────────────────────────────

CREATE TABLE IF NOT EXISTS admin_audit_log (
  id TEXT PRIMARY KEY,
  account_id TEXT NOT NULL,
  action TEXT NOT NULL,             -- e.g. 'post.publish', 'registration.update_status'
  target_type TEXT,                 -- 'post' | 'program' | 'registration' | ...
  target_id TEXT,
  payload_json TEXT,                -- before/after diff or relevant params
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (account_id) REFERENCES guardian_accounts (id)
);

CREATE INDEX IF NOT EXISTS idx_audit_account_created
ON admin_audit_log (account_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_audit_target
ON admin_audit_log (target_type, target_id);

CREATE TABLE IF NOT EXISTS programs (
  slug TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  tagline TEXT,
  cohort TEXT,
  image TEXT,                       -- R2 key or /images/ path
  start_date TEXT,                  -- ISO date
  end_date TEXT,
  venue TEXT,
  audience TEXT,
  subjects_json TEXT,               -- JSON array: ["Mathematics","Science","Both"]
  body_md TEXT,                     -- markdown body, rendered at request time
  routine_json TEXT,                -- JSON: [{day,date,blocks:[{subject,slots:[{time,label}]}]}]
  pricing_json TEXT,                -- JSON: [{name,price,currency,perks,featured}]
  registration_url TEXT,
  published INTEGER NOT NULL DEFAULT 0,
  published_at TEXT,
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_by TEXT,
  FOREIGN KEY (updated_by) REFERENCES guardian_accounts (id)
);

CREATE INDEX IF NOT EXISTS idx_programs_published
ON programs (published, updated_at DESC);

CREATE TABLE IF NOT EXISTS posts (
  slug TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  excerpt TEXT,
  category TEXT,
  author TEXT,
  image TEXT,                       -- R2 key or /images/ path
  body_md TEXT NOT NULL,            -- markdown body, rendered at request time
  published INTEGER NOT NULL DEFAULT 0,
  featured INTEGER NOT NULL DEFAULT 0,
  published_at TEXT,                -- ISO date (display date)
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_by TEXT,
  FOREIGN KEY (updated_by) REFERENCES guardian_accounts (id)
);

CREATE INDEX IF NOT EXISTS idx_posts_published
ON posts (published, published_at DESC);

CREATE INDEX IF NOT EXISTS idx_posts_category
ON posts (category) WHERE published = 1;
