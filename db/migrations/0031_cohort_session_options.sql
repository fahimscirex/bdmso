-- Date-scoped result events. A mock-test registration is one enrollment that
-- can cover several dated sessions (mt1/mt2/final), so a date's roster/results
-- can't be derived from cohort_key alone. session_options holds the program
-- option ids that belong to this event (e.g. ["mt2-math","mt2-sci"]); a
-- registration is "enrolled in this date" if its program_options intersect
-- these (or it already has a score for the event). NULL = not a dated event
-- (olympiad/quiz/etc.) -> whole paid roster, unchanged.
ALTER TABLE cohorts ADD COLUMN session_options TEXT;
