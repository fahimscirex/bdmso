-- Record which cohort (program run) each payment belongs to. Derivable via the
-- registration, but storing it on the payment makes per-cohort revenue reporting
-- direct and keeps the link stable. Stamped at payment creation = the
-- registration's cohort_key; backfilled here for existing rows.
ALTER TABLE payments ADD COLUMN cohort_key TEXT;
CREATE INDEX IF NOT EXISTS idx_payments_cohort ON payments (cohort_key);
UPDATE payments SET cohort_key =
  (SELECT r.cohort_key FROM registrations r WHERE r.id = payments.registration_id)
  WHERE cohort_key IS NULL;
