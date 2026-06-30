-- Programs-and-Options model (see plan.md). Additive only: nothing is dropped,
-- no existing behaviour changes until the read/write paths and the data
-- migration land. Safe to apply to prod ahead of the code.
--
-- A cohort is an "option" a parent can buy inside a program (a date, or a
-- subject). registration_cohorts is the "receipt": one row per option a
-- registration bought, with the price frozen at purchase time.

-- Options sharing a non-empty choice_group are mutually exclusive ("choose
-- one", e.g. Math/Science/Both). NULL = freely combinable ("choose any", e.g.
-- the Mock Test dates). The option's price is its existing price_override.
ALTER TABLE cohorts ADD COLUMN choice_group TEXT;

-- The receipt: which options each registration bought, and what each cost that
-- day. Replaces the overloaded registrations.program_options + single
-- cohort_key once the read/write paths move over. price_paid is the snapshot,
-- so historical receipts never recompute when an option's price changes later.
CREATE TABLE IF NOT EXISTS registration_cohorts (
  registration_id TEXT NOT NULL,
  cohort_key      TEXT NOT NULL,
  price_paid      INTEGER NOT NULL DEFAULT 0,
  created_at      TEXT NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY (registration_id, cohort_key),
  FOREIGN KEY (registration_id) REFERENCES registrations (id),
  FOREIGN KEY (cohort_key) REFERENCES cohorts (cohort_key)
);

-- Roster + per-option revenue both look up by cohort_key.
CREATE INDEX IF NOT EXISTS idx_registration_cohorts_cohort ON registration_cohorts (cohort_key);
