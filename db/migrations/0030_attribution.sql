-- First-party ad attribution: capture fbclid / utm_* (and landing page) from the
-- visitor's first touch so we can tell which registrations came from a paid ad
-- click, independent of Meta's dashboard. Stored as a small JSON blob.
ALTER TABLE registrations ADD COLUMN attribution TEXT;
