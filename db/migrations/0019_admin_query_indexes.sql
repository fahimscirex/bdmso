-- Indexes for the hottest admin queries. The admin payments list filters by
-- status and sorts by updated_at; the registrations list/triage/analytics filter
-- and sort globally on status + created_at. Without these, those scans grow with
-- table size on the live DB. (Pair with the sargable date-range predicates in
-- worker/routes/admin.js - date(col) wrapping would otherwise defeat these.)
CREATE INDEX IF NOT EXISTS idx_payments_status_updated   ON payments (status, updated_at);
CREATE INDEX IF NOT EXISTS idx_registrations_status_created ON registrations (status, created_at);
CREATE INDEX IF NOT EXISTS idx_registrations_created     ON registrations (created_at);
