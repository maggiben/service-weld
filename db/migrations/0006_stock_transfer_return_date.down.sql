-- Revert return_date on stock_transfer.

DROP INDEX IF EXISTS ix_transfer_open;
ALTER TABLE stock_transfer DROP CONSTRAINT IF EXISTS ck_transfer_return_order;
ALTER TABLE stock_transfer DROP COLUMN IF EXISTS return_date;
