-- 0028: per-question breakdown for a score (e.g. {"Short Q":11,"Essay Q":2}).
-- Shown to guardians alongside the section total once results are published.
ALTER TABLE scores ADD COLUMN detail_json TEXT;
