-- Per-run priced options (Option C). A run (cohort) can offer its own list of
-- named, priced choices - e.g. "1 subject / 500", "2 subjects / 800" - and the
-- parent picks exactly one per run. NULL/empty options_json = the run uses its
-- flat price_override (the simple case), unchanged. Additive.
--
-- options_json shape: [{ "id": "s1", "label": "1 subject", "price": 500 }, ...]
ALTER TABLE cohorts ADD COLUMN options_json TEXT;

-- Which option within the run a registration bought (NULL for flat runs). The
-- receipt still has one row per (registration, run); option_id records the tier
-- and price_paid freezes its price.
ALTER TABLE registration_cohorts ADD COLUMN option_id TEXT;
