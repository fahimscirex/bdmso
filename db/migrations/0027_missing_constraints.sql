-- 0027: add missing CHECK + FK constraints via table-rebuild (SQLite recipe).
--
-- SCOPE: registration_option_changes (DB-05), sponsorship_enquiries (DB-08),
--        pending_publish (DB-07). These three tables have no incoming FK
--        references so they can be safely rebuilt.
--
-- guardian_accounts.role (DB-06) is NOT rebuilt here: that table is referenced
-- by 10+ child tables and cannot be dropped/rebuilt on D1 without a risky
-- cascade. The CHECK is added to schema.sql for fresh DBs only; app-layer
-- validation in the worker continues to enforce it on existing DBs.
--
-- PRECONDITIONS (verify before running on prod):
--   - registration_option_changes.action contains only: 'same','upgrade','downgrade'
--   - sponsorship_enquiries.status contains only: 'new','contacted','converted','closed'
--   - pending_publish.staged_by values are all NULL or valid guardian_accounts.id
--
--   wrangler d1 execute bdmso --local  --file=./db/migrations/0027_missing_constraints.sql
--   wrangler d1 execute bdmso --env production --remote --file=./db/migrations/0027_missing_constraints.sql

-- ── DB-05: registration_option_changes.action CHECK ─────────────────────────

CREATE TABLE IF NOT EXISTS registration_option_changes_new (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  registration_id TEXT NOT NULL,
  from_options TEXT NOT NULL,
  to_options TEXT NOT NULL,
  from_price REAL NOT NULL,
  to_price REAL NOT NULL,
  delta REAL NOT NULL,
  action TEXT NOT NULL CHECK (action IN ('same','upgrade','downgrade')),
  payment_id TEXT,
  actor_account_id TEXT NOT NULL,
  acknowledged_no_refund INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL,
  FOREIGN KEY (registration_id) REFERENCES registrations (id),
  FOREIGN KEY (payment_id) REFERENCES payments (id),
  FOREIGN KEY (actor_account_id) REFERENCES guardian_accounts (id)
);

INSERT INTO registration_option_changes_new
  SELECT id, registration_id, from_options, to_options, from_price, to_price,
         delta, action, payment_id, actor_account_id, acknowledged_no_refund, created_at
  FROM registration_option_changes;

DROP TABLE registration_option_changes;
ALTER TABLE registration_option_changes_new RENAME TO registration_option_changes;

CREATE INDEX IF NOT EXISTS idx_option_changes_registration
  ON registration_option_changes (registration_id, created_at DESC);

-- ── DB-08: sponsorship_enquiries.status CHECK ────────────────────────────────

CREATE TABLE IF NOT EXISTS sponsorship_enquiries_new (
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
  updated_at TEXT
);

INSERT INTO sponsorship_enquiries_new
  SELECT id, organization, contact_person, email, phone, interest, message,
         status, source_page, created_at, updated_at
  FROM sponsorship_enquiries;

DROP TABLE sponsorship_enquiries;
ALTER TABLE sponsorship_enquiries_new RENAME TO sponsorship_enquiries;

CREATE INDEX IF NOT EXISTS idx_sponsorship_enquiries_email
  ON sponsorship_enquiries (email);

-- ── DB-07: pending_publish.staged_by FK ─────────────────────────────────────

CREATE TABLE IF NOT EXISTS pending_publish_new (
  id TEXT PRIMARY KEY,
  entity_type TEXT NOT NULL,
  entity_id TEXT NOT NULL,
  action TEXT NOT NULL,
  materialized_path TEXT,
  materialized_content TEXT,
  d1_after_json TEXT,
  status TEXT NOT NULL DEFAULT 'pending',
  staged_by TEXT REFERENCES guardian_accounts(id),
  staged_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT
);

INSERT INTO pending_publish_new
  SELECT id, entity_type, entity_id, action, materialized_path, materialized_content,
         d1_after_json, status, staged_by, staged_at, updated_at
  FROM pending_publish;

DROP TABLE pending_publish;
ALTER TABLE pending_publish_new RENAME TO pending_publish;

CREATE UNIQUE INDEX IF NOT EXISTS idx_pending_publish_entity
  ON pending_publish (entity_type, entity_id);
CREATE INDEX IF NOT EXISTS idx_pending_publish_status
  ON pending_publish (status);
