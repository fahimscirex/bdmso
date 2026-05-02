CREATE TABLE IF NOT EXISTS guardian_accounts (
  id TEXT PRIMARY KEY,
  email TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  password_salt TEXT NOT NULL,
  password_iterations INTEGER NOT NULL DEFAULT 600000,
  full_name TEXT NOT NULL,
  phone TEXT,
  email_verified INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL
);

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
  member_id TEXT UNIQUE,
  registration_type TEXT NOT NULL,
  student_full_name TEXT NOT NULL,
  student_date_of_birth TEXT NOT NULL,
  student_class_name TEXT NOT NULL,
  student_gender TEXT NOT NULL DEFAULT '',
  student_school TEXT NOT NULL,
  student_district TEXT NOT NULL,
  guardian_account_id TEXT NOT NULL,
  guardian_full_name TEXT NOT NULL,
  guardian_relationship TEXT NOT NULL,
  guardian_phone TEXT NOT NULL,
  guardian_email TEXT NOT NULL,
  guardian_address TEXT NOT NULL,
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

CREATE TABLE IF NOT EXISTS payments (
  id TEXT PRIMARY KEY,
  registration_id TEXT NOT NULL,
  account_id TEXT NOT NULL,
  amount REAL NOT NULL,
  currency TEXT NOT NULL DEFAULT 'BDT',
  tran_id TEXT UNIQUE,
  val_id TEXT,
  gateway_status TEXT,
  status TEXT NOT NULL DEFAULT 'pending',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY (registration_id) REFERENCES registrations (id),
  FOREIGN KEY (account_id) REFERENCES guardian_accounts (id)
);

CREATE INDEX IF NOT EXISTS idx_payments_registration_id
ON payments (registration_id);

CREATE INDEX IF NOT EXISTS idx_payments_tran_id
ON payments (tran_id);

CREATE TABLE IF NOT EXISTS coupons (
  code TEXT PRIMARY KEY,
  discount_type TEXT NOT NULL DEFAULT 'percent',
  discount_value REAL NOT NULL,
  max_uses INTEGER,
  used_count INTEGER NOT NULL DEFAULT 0,
  applies_to TEXT,
  expires_at TEXT,
  created_at TEXT NOT NULL
);
