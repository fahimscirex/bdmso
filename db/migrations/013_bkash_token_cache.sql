-- Single-row cache for bKash id_token (TTL ~1 hour).
-- Avoids a redundant token/grant call on every payment callback.
--
-- Local:       npx wrangler d1 execute bdmso --local --file=./db/migrations/013_bkash_token_cache.sql
-- Production:  npx wrangler d1 execute bdmso --file=./db/migrations/013_bkash_token_cache.sql --config wrangler.prod.toml

CREATE TABLE IF NOT EXISTS bkash_token_cache (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  id_token TEXT NOT NULL,
  expires_at TEXT NOT NULL
);
