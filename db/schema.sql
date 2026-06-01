-- Full schema for a FRESH database. CREATE TABLE IF NOT EXISTS makes the file
-- safe to re-run, but re-applying it does NOT add newly-introduced columns to
-- a table that already exists - SQLite simply skips the existing table.
--
-- Apply (fresh database):
--   wrangler d1 execute bdmso --local  --file=./db/schema.sql
--   wrangler d1 execute bdmso --remote --file=./db/schema.sql --config wrangler.prod.toml
--
-- This file is the canonical source of truth. When you ADD a column here, also
-- add an ALTER-TABLE script under db/migrations/ and run it against existing
-- dev / prod databases. See db/migrations/0001_registration_options.sql.

CREATE TABLE IF NOT EXISTS guardian_accounts (
  id TEXT PRIMARY KEY,
  email TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  password_salt TEXT NOT NULL,
  password_iterations INTEGER NOT NULL DEFAULT 100000,
  full_name TEXT NOT NULL,
  phone TEXT,
  email_verified INTEGER NOT NULL DEFAULT 0,
  member_id TEXT,
  role TEXT NOT NULL DEFAULT 'guardian',   -- 'guardian' | 'admin' | 'editor' | 'mentor'
  created_at TEXT NOT NULL,
  updated_at TEXT                          -- last change; maintained by trigger (see bottom)
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

CREATE TABLE IF NOT EXISTS password_reset_tokens (
  token TEXT PRIMARY KEY,
  account_id TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  used INTEGER NOT NULL DEFAULT 0,
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

-- Generic rate-limit log. bucket is a category ('payment-create',
-- 'registration', 'sponsorship', 'reset-password', 'admin-ip',
-- 'forgot-password'); key is whatever identifies the actor for that
-- bucket (account_id, IP address, email). One row per attempt;
-- countActionAttempts() sums within a sliding window.
CREATE TABLE IF NOT EXISTS action_attempts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  bucket TEXT NOT NULL,
  key TEXT NOT NULL,
  attempted_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_action_attempts_bucket_key_time
ON action_attempts (bucket, key, attempted_at);

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
  preferred_subject TEXT,         -- Olympiad only: 'math' | 'science' | 'both'
  program_options TEXT,           -- JSON array of option ids selected at registration (Mock Test sessions, Prep Course subjects, etc.)
  terms_accepted INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'submitted',
  source_page TEXT,
  member_id TEXT UNIQUE,           -- BdMSOYY0C-XXX; assigned on first paid receipt
  created_at TEXT NOT NULL,
  updated_at TEXT,                         -- last change; maintained by trigger (see bottom)
  FOREIGN KEY (guardian_account_id) REFERENCES guardian_accounts (id)
);

-- Atomic counter for human-readable BdMSO IDs.
-- Format: BdMSO + 2-digit-year + 0 + 1-digit-class + - + 3-digit-seq
-- (e.g. BdMSO2604-001 = first issued Class-4 student of 2026).
-- One row per (year, class_digit); single statement reserves + increments
-- atomically via INSERT … ON CONFLICT DO UPDATE … RETURNING.
CREATE TABLE IF NOT EXISTS member_id_class_seq (
  year INTEGER NOT NULL,
  class_digit INTEGER NOT NULL,
  next_seq INTEGER NOT NULL DEFAULT 1,
  PRIMARY KEY (year, class_digit)
);

CREATE INDEX IF NOT EXISTS idx_registrations_guardian_email
ON registrations (guardian_email);

-- Guardian dashboard reads registrations by account (and status); without these
-- it table-scans on every load.
CREATE INDEX IF NOT EXISTS idx_registrations_guardian_account
ON registrations (guardian_account_id);
CREATE INDEX IF NOT EXISTS idx_registrations_guardian_account_status
ON registrations (guardian_account_id, status);

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
  created_at TEXT NOT NULL,
  updated_at TEXT                          -- last change; maintained by trigger (see bottom)
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
  method TEXT,               -- shurjoPay payment method (card brand, bKash, Nagad, ...)
  coupon_code TEXT,          -- coupon applied at checkout (used_count incremented on success)
  status TEXT NOT NULL DEFAULT 'pending',
  purpose TEXT NOT NULL DEFAULT 'initial',  -- 'initial' (first registration payment) | 'option-upgrade' (top-up for switching to a more expensive option)
  proposed_options TEXT,                    -- JSON array of option ids this payment is buying; null on 'initial' rows. On 'option-upgrade' success, copied into registrations.program_options.
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

-- At most one in-flight option-upgrade payment per registration. The
-- /options/upgrade route also checks this in code, but two parallel
-- requests can both pass the SELECT before either INSERT; the unique
-- partial index closes that race. Scoped to purpose='option-upgrade' so
-- the existing Pay Now retry flow (which can hold multiple pending
-- 'initial' rows over time) is unaffected.
CREATE UNIQUE INDEX IF NOT EXISTS idx_payments_one_pending_upgrade
ON payments (registration_id)
WHERE status = 'pending' AND purpose = 'option-upgrade';

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
  created_at TEXT NOT NULL,
  updated_at TEXT                          -- last change; maintained by trigger (see bottom)
);

-- NOTE: coupon seed data lives in separate files, not here:
--   db/seed-dev.sql  - LOCAL ONLY (TESTBDMSO etc.)
--   db/seed-prod.sql - applied to both local and prod
-- This file (schema.sql) defines the structure only, so re-applying it
-- against any environment can't accidentally drop a free-money coupon
-- into the wrong place.

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

-- Guardian-initiated option changes on existing registrations (e.g. Prep
-- Course math -> both, or adding a Mock Test session). Distinct from
-- admin_audit_log because the actor is always the registration's owner.
-- One row per accepted change; the linked payment_id is set only on the
-- option-upgrade path (where the change committed via a top-up payment).
CREATE TABLE IF NOT EXISTS registration_option_changes (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  registration_id TEXT NOT NULL,
  from_options TEXT NOT NULL,       -- JSON array of previous option ids
  to_options TEXT NOT NULL,         -- JSON array of new option ids
  from_price REAL NOT NULL,
  to_price REAL NOT NULL,
  delta REAL NOT NULL,              -- to_price - from_price (negative for downgrade)
  action TEXT NOT NULL,             -- 'same' | 'upgrade' | 'downgrade'
  payment_id TEXT,                  -- non-null only when action='upgrade' (links the top-up payment that committed this change)
  actor_account_id TEXT NOT NULL,
  acknowledged_no_refund INTEGER NOT NULL DEFAULT 0,  -- 1 when guardian confirmed they won't be refunded on a downgrade
  created_at TEXT NOT NULL,
  FOREIGN KEY (registration_id) REFERENCES registrations (id),
  FOREIGN KEY (payment_id) REFERENCES payments (id),
  FOREIGN KEY (actor_account_id) REFERENCES guardian_accounts (id)
);

CREATE INDEX IF NOT EXISTS idx_option_changes_registration
ON registration_option_changes (registration_id, created_at DESC);

-- Programs catalogue (editable from the admin dashboard; D1 is source of truth
-- for editing + checkout pricing). Field vocabulary: see db/migrations/0002_programs.sql
-- and docs/content-samples/. (Replaces an earlier speculative scaffold that was
-- never wired up - cohort/venue/routine_json/subjects_json.)
CREATE TABLE IF NOT EXISTS programs (
  slug TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  tagline TEXT,                                        -- hero lede on the detail page
  category TEXT,                                       -- competition | beginner | advanced | residential
  registration_status TEXT NOT NULL DEFAULT 'closed',  -- open | closed | coming_soon | on_enquiry
  registration_opens TEXT,
  registration_closes TEXT,                            -- also drives the guardian edit window
  schedule_label TEXT,
  starts_on TEXT,
  ends_on TEXT,
  price_label TEXT,
  fee_amount INTEGER,                                  -- flat fee for programs without choices; NULL = on enquiry
  pricing_json TEXT,                                   -- {selection,choices:[{id,label,note,price}]}; overrides fee_amount when set
  eyebrow TEXT,
  image TEXT,
  audience TEXT,
  duration TEXT,
  format TEXT,
  outcome TEXT,
  level TEXT,
  meta_description TEXT,
  home_order TEXT,
  register_url TEXT,
  register_label TEXT,
  body_md TEXT NOT NULL DEFAULT '',
  hidden INTEGER NOT NULL DEFAULT 0,
  repeatable INTEGER NOT NULL DEFAULT 0,
  always_open INTEGER NOT NULL DEFAULT 0,              -- 1 = year-round, registration always open (ignore dates)
  published INTEGER NOT NULL DEFAULT 0,
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_by TEXT,
  FOREIGN KEY (updated_by) REFERENCES guardian_accounts (id)
);

CREATE INDEX IF NOT EXISTS idx_programs_published_order
ON programs (published, home_order);

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

-- ─── Admin notes on registrations ────────────────────────────────────────
-- Append-only thread of internal notes per registration. Used by admins to
-- track follow-ups, flags, and conversation history without polluting the
-- registration row itself.
CREATE TABLE IF NOT EXISTS registration_notes (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  registration_id TEXT NOT NULL,
  author_account_id TEXT NOT NULL,
  body TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (registration_id) REFERENCES registrations (id),
  FOREIGN KEY (author_account_id) REFERENCES guardian_accounts (id)
);
CREATE INDEX IF NOT EXISTS idx_registration_notes_reg
ON registration_notes (registration_id, created_at DESC);

-- ─── Triage queue ────────────────────────────────────────────────────────
-- Persisted snooze/dismiss state per (admin, target). Allows admins to
-- temporarily hide an attention item ("snooze 24h") without losing it.
-- target_kind is one of 'stuck_reg' | 'failed_payment' | 'sponsorship'
-- | 'expiring_coupon'; target_id is the related entity's PK.
CREATE TABLE IF NOT EXISTS triage_state (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  admin_account_id TEXT NOT NULL,
  target_kind TEXT NOT NULL,
  target_id TEXT NOT NULL,
  snoozed_until TEXT,                          -- NULL = dismissed permanently
  resolved_at TEXT,                            -- set when marked resolved
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (admin_account_id) REFERENCES guardian_accounts (id),
  UNIQUE (admin_account_id, target_kind, target_id)
);

-- ─── Email templates ─────────────────────────────────────────────────────
-- Saved bodies for broadcast. Subject and body support {{vars}}.
CREATE TABLE IF NOT EXISTS email_templates (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL UNIQUE,
  subject TEXT NOT NULL,
  body TEXT NOT NULL,
  category TEXT,                               -- e.g. 'reminder' | 'event' | 'announcement'
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_by TEXT,
  FOREIGN KEY (updated_by) REFERENCES guardian_accounts (id)
);

-- ─── Broadcast send log ──────────────────────────────────────────────────
-- One row per broadcast send, with sent/failed counts so the admin
-- "history" tab can list past sends.
CREATE TABLE IF NOT EXISTS broadcast_log (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  subject TEXT NOT NULL,
  body TEXT NOT NULL,
  filters_json TEXT,                           -- the {program, venue, status} used
  recipient_count INTEGER NOT NULL DEFAULT 0,
  sent_count INTEGER NOT NULL DEFAULT 0,
  failed_count INTEGER NOT NULL DEFAULT 0,
  channel TEXT NOT NULL DEFAULT 'email',       -- 'email' | 'sms'
  sent_by TEXT,
  sent_at TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (sent_by) REFERENCES guardian_accounts (id)
);
CREATE INDEX IF NOT EXISTS idx_broadcast_log_time
ON broadcast_log (sent_at DESC);

-- ─── Event-day flows: attendance + scores ────────────────────────────────
-- Per-registration attendance state for the National Round and other
-- in-person events. Free-form `event_key` so multiple events can coexist
-- (e.g. 'national-round-2026', 'tst-2026', 'camp-2026').
CREATE TABLE IF NOT EXISTS attendance (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  registration_id TEXT NOT NULL,
  event_key TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'absent',       -- 'absent' | 'present' | 'late' | 'no_show'
  checked_in_at TEXT,
  checked_in_by TEXT,
  notes TEXT,
  FOREIGN KEY (registration_id) REFERENCES registrations (id),
  FOREIGN KEY (checked_in_by) REFERENCES guardian_accounts (id),
  UNIQUE (registration_id, event_key)
);
CREATE INDEX IF NOT EXISTS idx_attendance_event
ON attendance (event_key, status);

-- Per-registration scores. One row per (registration, event, section)
-- so Math + Science live separately and totals are derived.
CREATE TABLE IF NOT EXISTS scores (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  registration_id TEXT NOT NULL,
  event_key TEXT NOT NULL,
  section TEXT NOT NULL,                       -- 'math' | 'science' | 'tst-math' | 'tst-science'
  score REAL NOT NULL,
  max_score REAL NOT NULL,
  rank INTEGER,                                -- nullable; computed when results are finalised
  tier TEXT,                                   -- 'champion' | 'all-round' | 'math' | 'science' | NULL
  entered_at TEXT NOT NULL DEFAULT (datetime('now')),
  entered_by TEXT,
  FOREIGN KEY (registration_id) REFERENCES registrations (id),
  FOREIGN KEY (entered_by) REFERENCES guardian_accounts (id),
  UNIQUE (registration_id, event_key, section)
);
CREATE INDEX IF NOT EXISTS idx_scores_event_section
ON scores (event_key, section, score DESC);

-- Keep updated_at current on the mutable tables that carry it. The WHEN guard
-- only touches the row when the write did not already change updated_at, so it
-- is safe regardless of the recursive_triggers setting. (See migration 0006.)
CREATE TRIGGER IF NOT EXISTS trg_guardian_accounts_updated_at
AFTER UPDATE ON guardian_accounts FOR EACH ROW
WHEN NEW.updated_at IS OLD.updated_at
BEGIN
  UPDATE guardian_accounts SET updated_at = datetime('now') WHERE rowid = NEW.rowid;
END;
CREATE TRIGGER IF NOT EXISTS trg_registrations_updated_at
AFTER UPDATE ON registrations FOR EACH ROW
WHEN NEW.updated_at IS OLD.updated_at
BEGIN
  UPDATE registrations SET updated_at = datetime('now') WHERE rowid = NEW.rowid;
END;
CREATE TRIGGER IF NOT EXISTS trg_coupons_updated_at
AFTER UPDATE ON coupons FOR EACH ROW
WHEN NEW.updated_at IS OLD.updated_at
BEGIN
  UPDATE coupons SET updated_at = datetime('now') WHERE rowid = NEW.rowid;
END;
CREATE TRIGGER IF NOT EXISTS trg_sponsorship_enquiries_updated_at
AFTER UPDATE ON sponsorship_enquiries FOR EACH ROW
WHEN NEW.updated_at IS OLD.updated_at
BEGIN
  UPDATE sponsorship_enquiries SET updated_at = datetime('now') WHERE rowid = NEW.rowid;
END;
