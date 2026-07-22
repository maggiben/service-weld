-- Additive: optional cylinder size dimension on rental rates (null = any size).

ALTER TABLE rental_rate
    ADD COLUMN IF NOT EXISTS capacity_m3 numeric(5,2);

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'ck_rate_capacity'
    ) THEN
        ALTER TABLE rental_rate
            ADD CONSTRAINT ck_rate_capacity
            CHECK (capacity_m3 IS NULL OR capacity_m3 > 0);
    END IF;
END $$;

DROP INDEX IF EXISTS ix_rate_lookup;
CREATE INDEX ix_rate_lookup
    ON rental_rate (client_party_id, gas_code, capacity_m3, effective_from DESC);
