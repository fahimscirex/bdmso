-- Options-model: "parents pick one option" is a per-program choice, not a
-- per-option one. When 1, a program's options are mutually exclusive (the
-- parent picks exactly one, e.g. Math/Science/Both); when 0 they combine and
-- prices sum (e.g. the Mock Test dates). Additive; default 0.
--
-- Supersedes the per-run cohorts.choice_group control (kept as a reserved,
-- unused column - pick-one is now derived from this program flag).
ALTER TABLE programs ADD COLUMN pick_one INTEGER NOT NULL DEFAULT 0;
