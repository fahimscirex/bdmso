-- email_verification_tokens and password_reset_tokens were created without
-- created_at in early deployments. The schema already has the column; this
-- migration backfills it on live DBs that predate the schema change.

ALTER TABLE email_verification_tokens ADD COLUMN created_at TEXT NOT NULL DEFAULT (datetime('now'));
ALTER TABLE password_reset_tokens     ADD COLUMN created_at TEXT NOT NULL DEFAULT (datetime('now'));
