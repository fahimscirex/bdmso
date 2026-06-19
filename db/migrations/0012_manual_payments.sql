-- Cash / manual (offline) payments. A guardian can pick "pay manually" at
-- checkout: instead of a shurjoPay session we mint a pending payment row with
-- a human-readable invoice number and show them an invoice to bring/transfer.
-- An admin later marks it paid from the panel.
--
--   channel     - 'online' (shurjoPay) | 'manual' (cash/bank/offline). The
--                 existing `method` column keeps the human method label
--                 (e.g. 'manual', 'cash', 'bKash'); channel is the rail.
--   invoice_no  - 'INV-YYYY-NNNN' generated for manual payments only.
ALTER TABLE payments ADD COLUMN channel TEXT NOT NULL DEFAULT 'online';  -- 'online' | 'manual'
ALTER TABLE payments ADD COLUMN invoice_no TEXT;                          -- 'INV-YYYY-NNNN' (manual payments)

-- Atomic per-year counter for invoice numbers. One row per year; a single
-- INSERT … ON CONFLICT DO UPDATE … RETURNING reserves + increments the next
-- sequence value without a read-modify-write race.
CREATE TABLE IF NOT EXISTS invoice_seq (
  year INTEGER PRIMARY KEY,
  next_seq INTEGER NOT NULL DEFAULT 1
);
