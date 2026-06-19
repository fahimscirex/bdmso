-- Adds account_number to payments: the payer's account/wallet number returned
-- by shurjoPay verification (bKash/Nagad number or masked card number). Shown
-- in the admin panel alongside the resolved payment method.
ALTER TABLE payments ADD COLUMN account_number TEXT;  -- shurjoPay payer account/wallet/card number
