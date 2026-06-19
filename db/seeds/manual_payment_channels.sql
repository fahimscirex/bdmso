-- One-time data fix: tag the externally-settled (manual bKash) payments as
-- channel='manual' so they count toward the dashboard's cash-collection figure.
--
-- WHY THIS EXISTS: these payments were recorded on prod BEFORE the manual-
-- payments migration (0012) was applied there, so they carry only the
-- gateway_status='Manual (admin)' marker. When 0012 lands on remote it adds the
-- `channel` column defaulting to 'online', which would misclassify them. Run
-- this AFTER applying migration 0012 to the remote D1, then deploy the worker
-- that reads `channel` for cash collection.
--
--   pay_819d503e0c6a41849138 - Shamriddhi Paul (Lab Day, ৳1500, bKash)
--   pay_ee00159c1574099505cd - Ridhi Rajeshwari Paul Pranjol (Lab Day, ৳1500, bKash)
--   pay_manual_DFI0FTKPLU    - Soumit Barai (Preparatory Camp, ৳3000, bKash)
UPDATE payments SET channel = 'manual'
WHERE id IN (
  'pay_819d503e0c6a41849138',
  'pay_ee00159c1574099505cd',
  'pay_manual_DFI0FTKPLU'
);
