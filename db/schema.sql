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
  role TEXT NOT NULL DEFAULT 'guardian' CHECK (role IN ('guardian','admin','editor','mentor')),
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
  status TEXT NOT NULL DEFAULT 'submitted' CHECK (status IN ('submitted','payment_pending','paid','confirmed','cancelled')),
  source_page TEXT,
  attribution TEXT,                -- JSON: first-touch fbclid / utm_* / landing - ties a signup to a paid ad click
  member_id TEXT UNIQUE,           -- BdMSOYY0C-XXX; assigned on first paid receipt
  cohort_key TEXT,                 -- the program run this registration belongs to (cohorts.cohort_key); stamped at signup
  reminded_at TEXT,                -- last bulk payment-reminder email; powers the 24h remind cooldown
  created_at TEXT NOT NULL,
  updated_at TEXT,                         -- last change; maintained by trigger (see bottom)
  FOREIGN KEY (guardian_account_id) REFERENCES guardian_accounts (id)
);
CREATE INDEX IF NOT EXISTS idx_registrations_cohort ON registrations (cohort_key);

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

-- Admin list/triage/analytics filter + sort globally on status/created_at.
CREATE INDEX IF NOT EXISTS idx_registrations_status_created
ON registrations (status, created_at);
CREATE INDEX IF NOT EXISTS idx_registrations_created
ON registrations (created_at);

CREATE TABLE IF NOT EXISTS sponsorship_enquiries (
  id TEXT PRIMARY KEY,
  organization TEXT NOT NULL,
  contact_person TEXT NOT NULL,
  email TEXT NOT NULL,
  phone TEXT,
  interest TEXT NOT NULL,
  message TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'new' CHECK (status IN ('new','contacted','converted','closed')),
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

-- Session cleanup scans by expiry.
CREATE INDEX IF NOT EXISTS idx_sessions_expires
ON sessions (expires_at);

-- Gateway column mapping (shurjoPay):
--   tran_id        = merchant order_id      (we generate; sent as order_id to /api/secret-pay)
--   val_id         = sp_order_id            (from secret-pay response; used to look up the row in /payment-callback because shurjoPay's redirect identifies the txn by sp_order_id, not by our id)
--   gateway_status = transaction_status     (from /api/verification: "Success" on paid)
CREATE TABLE IF NOT EXISTS payments (
  id TEXT PRIMARY KEY,
  registration_id TEXT NOT NULL,
  amount REAL NOT NULL CHECK (amount >= 0),
  currency TEXT NOT NULL DEFAULT 'BDT',
  tran_id TEXT UNIQUE,       -- merchant order_id
  val_id TEXT,               -- shurjoPay sp_order_id (set at create-payment time)
  gateway_status TEXT,       -- shurjoPay transaction_status
  method TEXT,               -- shurjoPay payment method (card brand, bKash, Nagad, ...)
  account_number TEXT,       -- shurjoPay payer account/wallet/card number (from verification)
  channel TEXT NOT NULL DEFAULT 'online',  -- 'online' (shurjoPay) | 'manual' (cash/bank/offline)
  invoice_no TEXT,           -- 'INV-YYYY-NNNN' generated for manual payments
  coupon_code TEXT,          -- coupon applied at checkout (used_count incremented on success)
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','paid','failed','cancelled','expired','refunded')),
  purpose TEXT NOT NULL DEFAULT 'initial' CHECK (purpose IN ('initial','option-upgrade')),  -- 'initial' (first registration payment) | 'option-upgrade' (top-up for switching to a more expensive option)
  proposed_options TEXT,                    -- JSON array of option ids this payment is buying; null on 'initial' rows. On 'option-upgrade' success, copied into registrations.program_options.
  cohort_key TEXT,           -- the program run this payment is for (= registration's cohort_key); stamped at creation
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY (registration_id) REFERENCES registrations (id),
  FOREIGN KEY (coupon_code) REFERENCES coupons (code)
);
CREATE INDEX IF NOT EXISTS idx_payments_cohort ON payments (cohort_key);

CREATE INDEX IF NOT EXISTS idx_payments_registration_id
ON payments (registration_id);

CREATE INDEX IF NOT EXISTS idx_payments_tran_id
ON payments (tran_id);

CREATE INDEX IF NOT EXISTS idx_payments_val_id
ON payments (val_id);

-- Admin payments list filters by status + sorts by updated_at; revenue/triage too.
CREATE INDEX IF NOT EXISTS idx_payments_status_updated
ON payments (status, updated_at);

-- Manual-payment lookups filter by channel; coupon usage queries filter by coupon_code.
CREATE INDEX IF NOT EXISTS idx_payments_channel ON payments (channel);
CREATE INDEX IF NOT EXISTS idx_payments_coupon ON payments (coupon_code);

-- At most one in-flight option-upgrade payment per registration. The
-- /options/upgrade route also checks this in code, but two parallel
-- requests can both pass the SELECT before either INSERT; the unique
-- partial index closes that race. Scoped to purpose='option-upgrade' so
-- the existing Pay Now retry flow (which can hold multiple pending
-- 'initial' rows over time) is unaffected.
CREATE UNIQUE INDEX IF NOT EXISTS idx_payments_one_pending_upgrade
ON payments (registration_id)
WHERE status = 'pending' AND purpose = 'option-upgrade';

-- Atomic per-year counter for human-readable invoice numbers (manual payments).
-- Format: INV-YYYY-NNNN. One row per year; a single INSERT … ON CONFLICT DO
-- UPDATE … RETURNING reserves + increments without a read-modify-write race.
CREATE TABLE IF NOT EXISTS invoice_seq (
  year INTEGER PRIMARY KEY,
  next_seq INTEGER NOT NULL DEFAULT 1
);

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
  discount_type TEXT NOT NULL DEFAULT 'percent' CHECK (discount_type IN ('percent','fixed')), -- 'percent' or 'fixed'
  discount_value REAL NOT NULL CHECK (discount_value >= 0),
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
  action TEXT NOT NULL CHECK (action IN ('same','upgrade','downgrade')),
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
  enroll_by_run INTEGER NOT NULL DEFAULT 0,            -- 1 = priced by runs (cohorts) instead of pricing_json; program_options holds cohort_keys
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
  status TEXT NOT NULL DEFAULT 'absent' CHECK (status IN ('absent','present','late','no_show')),       -- 'absent' | 'present' | 'late' | 'no_show'
  checked_in_at TEXT,
  checked_in_by TEXT,
  notes TEXT,
  FOREIGN KEY (registration_id) REFERENCES registrations (id),
  FOREIGN KEY (checked_in_by) REFERENCES guardian_accounts (id),
  FOREIGN KEY (event_key) REFERENCES cohorts (cohort_key),
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
  detail_json TEXT,                            -- optional per-question breakdown, e.g. {"Short Q":11,"Essay Q":2}
  FOREIGN KEY (registration_id) REFERENCES registrations (id),
  FOREIGN KEY (entered_by) REFERENCES guardian_accounts (id),
  FOREIGN KEY (event_key) REFERENCES cohorts (cohort_key),
  UNIQUE (registration_id, event_key, section)
);
CREATE INDEX IF NOT EXISTS idx_scores_event_section
ON scores (event_key, section, score DESC);

-- Cohort/run = a scheduled instance of a program. Registrations bind to a
-- cohort (registrations.cohort_key), results bind via scores.event_key =
-- cohorts.cohort_key, and reports group by it. cohort_key is INTERNAL only
-- (never in public URLs); format {program}-{YYYY}-b{N}. status lifecycle:
-- draft -> upcoming -> enrolling -> running -> ended -> archived. price_override
-- null = use the program's catalog price. sections/results_published are used
-- by exam-bearing cohorts only.
CREATE TABLE IF NOT EXISTS cohorts (
  cohort_key        TEXT PRIMARY KEY,
  program_slug      TEXT NOT NULL,
  label             TEXT NOT NULL,
  status            TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','upcoming','enrolling','running','ended','archived')),
  enroll_opens      TEXT,
  enroll_closes     TEXT,
  starts_on         TEXT,
  ends_on           TEXT,
  price_override    INTEGER,                       -- this option's price (falls back to programs.fee_amount when null)
  choice_group      TEXT,                           -- options sharing a non-null value are mutually exclusive ("choose one"); NULL = freely combinable ("choose any")
  capacity          INTEGER,
  sections          TEXT NOT NULL DEFAULT '[]',
  results_published INTEGER NOT NULL DEFAULT 0,  -- released to guardians (private scores)
  public_featured   INTEGER NOT NULL DEFAULT 0,  -- this run's winners shown on the public /results page
  session_options   TEXT,                         -- JSON option ids this dated event covers (e.g. ["mt2-math","mt2-sci"]); NULL = whole roster
  published_at      TEXT,
  created_at        TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at        TEXT,                         -- last change; maintained by trigger (see migration 0021)
  FOREIGN KEY (program_slug) REFERENCES programs (slug)
);
CREATE INDEX IF NOT EXISTS idx_cohorts_program ON cohorts (program_slug);
CREATE INDEX IF NOT EXISTS idx_cohorts_program_status ON cohorts (program_slug, status);
CREATE INDEX IF NOT EXISTS idx_cohorts_status ON cohorts (status);

-- The "receipt": which options (cohorts) each registration bought, price frozen
-- at purchase. One row per option. See migration 0033 and plan.md.
CREATE TABLE IF NOT EXISTS registration_cohorts (
  registration_id TEXT NOT NULL,
  cohort_key      TEXT NOT NULL,
  price_paid      INTEGER NOT NULL DEFAULT 0,
  created_at      TEXT NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY (registration_id, cohort_key),
  FOREIGN KEY (registration_id) REFERENCES registrations (id),
  FOREIGN KEY (cohort_key) REFERENCES cohorts (cohort_key)
);
CREATE INDEX IF NOT EXISTS idx_registration_cohorts_cohort ON registration_cohorts (cohort_key);

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
CREATE TRIGGER IF NOT EXISTS trg_cohorts_updated_at
AFTER UPDATE ON cohorts FOR EACH ROW
WHEN NEW.updated_at IS OLD.updated_at
BEGIN
  UPDATE cohorts SET updated_at = datetime('now') WHERE rowid = NEW.rowid;
END;

-- ─── Homepage / marketing datasets (editable from the admin dashboard) ───────
-- Press mentions, Hall of Fame slider photos, and Olympiad medalists. These were
-- previously hand-edited JSON (public/data/*.json) and hardcoded HTML; they now
-- live in D1 (source of truth) and materialize to src/content/data/*.json that
-- Astro server-renders. See scripts/materialize.mjs. (Migrations 0007-0009.)

CREATE TABLE IF NOT EXISTS press_mentions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  outlet TEXT NOT NULL,                                -- publication name
  title TEXT NOT NULL,
  url TEXT NOT NULL,                                   -- link to the article
  published_on TEXT,                                   -- ISO yyyy-mm-dd (or yyyy-mm when day unknown)
  image TEXT,                                          -- uploaded /r2 path or /images/ path; optional
  featured INTEGER NOT NULL DEFAULT 0,                 -- 1 = large lead card in the homepage collage
  sort_order INTEGER NOT NULL DEFAULT 0,
  published INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_by TEXT,
  FOREIGN KEY (updated_by) REFERENCES guardian_accounts (id)
);
CREATE INDEX IF NOT EXISTS idx_press_mentions_published
ON press_mentions (published, featured, published_on DESC);

CREATE TABLE IF NOT EXISTS hall_of_fame_photos (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  image TEXT NOT NULL,                                 -- uploaded /r2 path or /images/ path
  caption TEXT,
  year TEXT,
  sort_order INTEGER NOT NULL DEFAULT 0,
  published INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_by TEXT,
  FOREIGN KEY (updated_by) REFERENCES guardian_accounts (id)
);
CREATE INDEX IF NOT EXISTS idx_hall_of_fame_published
ON hall_of_fame_photos (published, sort_order);

CREATE TABLE IF NOT EXISTS medalists (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  year TEXT NOT NULL,                                  -- "2025"
  category TEXT NOT NULL,                              -- "Mathematics" | "Science" (accordion section)
  medal TEXT NOT NULL,                                 -- "gold" | "silver" | "bronze"
  name TEXT NOT NULL,
  school TEXT,                                         -- free-form detail, e.g. "St. Joseph HSS · 5"
  sort_order INTEGER NOT NULL DEFAULT 0,
  published INTEGER NOT NULL DEFAULT 0,
  cohort_key TEXT,                                     -- set when generated from a cohort's scores; NULL = hand-entered/historical archive
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_by TEXT,
  FOREIGN KEY (updated_by) REFERENCES guardian_accounts (id)
);
CREATE INDEX IF NOT EXISTS idx_medalists_cohort ON medalists (cohort_key);
CREATE INDEX IF NOT EXISTS idx_medalists_published
ON medalists (published, year, category, medal, sort_order);

CREATE TRIGGER IF NOT EXISTS trg_press_mentions_updated_at
AFTER UPDATE ON press_mentions FOR EACH ROW
WHEN NEW.updated_at IS OLD.updated_at
BEGIN
  UPDATE press_mentions SET updated_at = datetime('now') WHERE rowid = NEW.rowid;
END;
CREATE TRIGGER IF NOT EXISTS trg_hall_of_fame_photos_updated_at
AFTER UPDATE ON hall_of_fame_photos FOR EACH ROW
WHEN NEW.updated_at IS OLD.updated_at
BEGIN
  UPDATE hall_of_fame_photos SET updated_at = datetime('now') WHERE rowid = NEW.rowid;
END;
CREATE TRIGGER IF NOT EXISTS trg_medalists_updated_at
AFTER UPDATE ON medalists FOR EACH ROW
WHEN NEW.updated_at IS OLD.updated_at
BEGIN
  UPDATE medalists SET updated_at = datetime('now') WHERE rowid = NEW.rowid;
END;

-- Team / delegation page (/team). One row per person across all sections.
-- Was hardcoded in team.astro. (Migration 0010.)
CREATE TABLE IF NOT EXISTS team_members (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  section TEXT NOT NULL,                               -- delegation | advisor | organizing | mentor | alumni
  subgroup TEXT,                                       -- delegation only: Mathematics | Science | Leadership
  year TEXT,                                           -- delegation only
  name TEXT NOT NULL,
  role TEXT,                                           -- small line: medal, job title, or tutor role
  affiliation TEXT,                                    -- secondary line (advisors / leadership)
  image TEXT,
  sort_order INTEGER NOT NULL DEFAULT 0,
  published INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_by TEXT,
  FOREIGN KEY (updated_by) REFERENCES guardian_accounts (id)
);
CREATE INDEX IF NOT EXISTS idx_team_members_published
ON team_members (published, section, sort_order);

CREATE TRIGGER IF NOT EXISTS trg_team_members_updated_at
AFTER UPDATE ON team_members FOR EACH ROW
WHEN NEW.updated_at IS OLD.updated_at
BEGIN
  UPDATE team_members SET updated_at = datetime('now') WHERE rowid = NEW.rowid;
END;

-- Staged review-and-publish. Content edits stage a pending_publish row instead
-- of pushing to GitHub; a single admin "publish" action commits them all in one
-- GitHub commit. (Migration 0013.)
--
--   entity_type  - 'post' | 'program' | 'press' | 'halloffame' | 'medalist' | 'team'
--   entity_id    - slug for posts/programs; the dataset name for the whole-file
--                  JSON datasets, so all row edits of that dataset dedupe to one
--                  pending row.
--   action       - 'create' | 'update' | 'delete'
CREATE TABLE IF NOT EXISTS pending_publish (
  id TEXT PRIMARY KEY,
  entity_type TEXT NOT NULL,
  entity_id TEXT NOT NULL,
  action TEXT NOT NULL,                                -- 'create' | 'update' | 'delete'
  materialized_path TEXT,
  materialized_content TEXT,
  d1_after_json TEXT,
  status TEXT NOT NULL DEFAULT 'pending',              -- 'pending' | 'published'
  staged_by TEXT REFERENCES guardian_accounts(id),
  staged_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_pending_publish_entity
ON pending_publish (entity_type, entity_id);
CREATE INDEX IF NOT EXISTS idx_pending_publish_status
ON pending_publish (status);

-- Revert baseline for discard: each entity's D1 row(s) as of the last publish.
-- entity_id matches pending_publish (slug for posts/programs, dataset name for
-- the JSON datasets). d1_json is the whole table for datasets, the single row
-- for per-file entities.
CREATE TABLE IF NOT EXISTS publish_snapshots (
  entity_type TEXT NOT NULL,
  entity_id   TEXT NOT NULL,
  d1_json     TEXT NOT NULL,
  updated_at  TEXT NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY (entity_type, entity_id)
);

CREATE TRIGGER IF NOT EXISTS trg_pending_publish_updated_at
AFTER UPDATE ON pending_publish FOR EACH ROW
WHEN NEW.updated_at IS OLD.updated_at
BEGIN
  UPDATE pending_publish SET updated_at = datetime('now') WHERE rowid = NEW.rowid;
END;

CREATE TRIGGER IF NOT EXISTS trg_publish_snapshots_updated_at
AFTER UPDATE ON publish_snapshots FOR EACH ROW
WHEN NEW.updated_at IS OLD.updated_at
BEGIN
  UPDATE publish_snapshots SET updated_at = datetime('now') WHERE rowid = NEW.rowid;
END;

-- Key/value app settings (runtime toggles, e.g. offline_payment_enabled).
CREATE TABLE IF NOT EXISTS settings (
  key        TEXT PRIMARY KEY,
  value      TEXT NOT NULL,
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);
