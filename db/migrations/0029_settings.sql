-- Key/value app settings. First use: offline_payment_enabled - the toggle that
-- controls whether the guardian registration flow offers "Pay manually / cash".
CREATE TABLE IF NOT EXISTS settings (
  key        TEXT PRIMARY KEY,
  value      TEXT NOT NULL,
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

INSERT OR IGNORE INTO settings (key, value) VALUES ('offline_payment_enabled', '1');
