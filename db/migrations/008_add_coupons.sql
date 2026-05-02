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

-- Seed a test coupon for development
INSERT OR IGNORE INTO coupons (code, discount_type, discount_value, max_uses, applies_to, created_at)
VALUES ('TESTBDMSO', 'percent', 100, 50, NULL, CURRENT_TIMESTAMP);
