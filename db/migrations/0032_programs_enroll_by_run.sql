-- Run-priced programs: when 1, a program is priced by its runs (cohorts)
-- instead of pricing_json. Students select one or many enrolling runs; the
-- registration stores the chosen cohort_keys in program_options and the price
-- is their sum. Defaults to 0 so every existing program behaves unchanged
-- until explicitly opted in. See plan.md (Runs-as-Enrollable-Units).
ALTER TABLE programs ADD COLUMN enroll_by_run INTEGER NOT NULL DEFAULT 0;
