-- Unified results: the public winners (medalists) are GENERATED from a cohort's
-- finalised scores, not maintained separately. Two independent gates per cohort:
--   results_published  (existing) -> guardians see their own child's score
--   public_featured    (new)      -> this run's winners appear on the public
--                                    /results page (opt-in, admin-controlled)
ALTER TABLE cohorts ADD COLUMN public_featured INTEGER NOT NULL DEFAULT 0;

-- Medalist rows generated from a cohort carry its key so re-featuring replaces
-- them cleanly. NULL = a hand-entered / historical archive row (kept as-is).
ALTER TABLE medalists ADD COLUMN cohort_key TEXT;
CREATE INDEX IF NOT EXISTS idx_medalists_cohort ON medalists (cohort_key);
