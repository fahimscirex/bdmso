-- 0002_programs.sql
-- Move programs out of public/data/programs-detail.json into D1 so they can be
-- edited from the admin dashboard. D1 is the source of truth for editing + the
-- worker's checkout price validation; on save the worker materialises
-- apps/static/src/content/programs/<slug>.md and commits it (GitHub API) so
-- Astro builds the static page from the committed file.
--
-- Field names match the locked content vocabulary (see docs/content-samples/).
--
-- Apply:
--   wrangler d1 execute bdmso --local  --file=./db/migrations/0002_programs.sql
--   wrangler d1 execute bdmso --remote --file=./db/migrations/0002_programs.sql --config wrangler.prod.toml
--
-- NOTE: an earlier speculative `programs` table (cohort/venue/routine_json/
-- subjects_json) shipped in schema.sql on the admin-redesign branch but was
-- never wired to any route, editor, or prod DB. Drop it so this correct,
-- grounded shape replaces it. The DROP is a no-op on prod (no table there yet).
DROP TABLE IF EXISTS programs;

CREATE TABLE IF NOT EXISTS programs (
  slug TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  category TEXT,                                       -- competition | beginner | advanced | residential

  -- registration
  registration_status TEXT NOT NULL DEFAULT 'closed',  -- open | closed | coming_soon | on_enquiry
  registration_opens TEXT,                             -- ISO date
  registration_closes TEXT,                            -- ISO date; also drives the guardian edit window

  -- schedule
  schedule_label TEXT,                                 -- human display string
  starts_on TEXT,                                      -- ISO date
  ends_on TEXT,                                        -- ISO date

  -- pricing
  price_label TEXT,                                    -- card display, e.g. "৳ 1,000" / "From ৳ 500" / "On enquiry"
  fee_amount INTEGER,                                  -- flat catalog fee (BDT) for programs without choices; NULL = on enquiry
  pricing_json TEXT,                                   -- {selection:'single'|'multiple', choices:[{id,label,note,price}]} | NULL. When set, price = chosen choices (overrides fee_amount).

  -- presentation
  eyebrow TEXT,
  image TEXT,                                          -- R2 key or /images/ path
  audience TEXT,
  duration TEXT,
  format TEXT,
  outcome TEXT,
  level TEXT,
  meta_description TEXT,
  home_order TEXT,                                     -- zero-padded sort key, "01"
  register_url TEXT,                                   -- external registration link (overrides the built-in flow)
  register_label TEXT,

  -- body + visibility
  body_md TEXT NOT NULL DEFAULT '',                    -- detail-page prose (About / What you'll do / ...)
  hidden INTEGER NOT NULL DEFAULT 0,                   -- 1 = no public page at all
  repeatable INTEGER NOT NULL DEFAULT 0,               -- 1 = a guardian may register more than once (e.g. mock-test sessions)
  published INTEGER NOT NULL DEFAULT 0,                -- 0 = draft (not materialised to a file)

  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_by TEXT,
  FOREIGN KEY (updated_by) REFERENCES guardian_accounts (id)
);

CREATE INDEX IF NOT EXISTS idx_programs_published_order
ON programs (published, home_order);
