-- Additive: optional return (entry) date for stock transfers that leave and come back.

ALTER TABLE stock_transfer
    ADD COLUMN IF NOT EXISTS return_date date;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'ck_transfer_return_order'
    ) THEN
        ALTER TABLE stock_transfer
            ADD CONSTRAINT ck_transfer_return_order
            CHECK (return_date IS NULL OR return_date >= transfer_date);
    END IF;
END $$;

CREATE INDEX IF NOT EXISTS ix_transfer_open
    ON stock_transfer (transfer_date)
    WHERE return_date IS NULL;
