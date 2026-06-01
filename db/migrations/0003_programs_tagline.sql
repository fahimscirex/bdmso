-- 0003_programs_tagline.sql
-- The program detail page (apps/static/src/pages/programs/[slug].astro) renders
-- a `tagline` as the hero lede, but it lived only in the committed .md frontmatter
-- and was never represented in D1 - so the editor couldn't set it and a
-- materialise from D1 would drop it. Add the column so D1 fully owns the page.
--
-- Apply:
--   wrangler d1 execute bdmso --local  --file=./db/migrations/0003_programs_tagline.sql
--   wrangler d1 execute bdmso --remote --file=./db/migrations/0003_programs_tagline.sql --config wrangler.prod.toml
ALTER TABLE programs ADD COLUMN tagline TEXT;
