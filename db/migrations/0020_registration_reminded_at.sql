-- Track when a payment reminder was last sent for a registration, so the bulk
-- "remind" action can skip anyone reminded in the last 24h (stop over-messaging
-- guardians who get re-selected in the unpaid list day after day).
ALTER TABLE registrations ADD COLUMN reminded_at TEXT;
