-- D-18: cylinder capacity as (magnitude, unit). Magnitude stays in capacity_m3
-- (legacy column name); unit is M3 or KG. Existing rows default to M3.

DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'capacity_unit') THEN
        CREATE TYPE capacity_unit AS ENUM ('M3', 'KG');
    END IF;
END $$;

ALTER TABLE cylinder
    ADD COLUMN IF NOT EXISTS capacity_unit capacity_unit NOT NULL DEFAULT 'M3';

ALTER TABLE rental_rate
    ADD COLUMN IF NOT EXISTS capacity_unit capacity_unit NOT NULL DEFAULT 'M3';

ALTER TABLE cylinder_sale
    ADD COLUMN IF NOT EXISTS capacity_unit capacity_unit NOT NULL DEFAULT 'M3';

DROP INDEX IF EXISTS ix_rate_lookup;
CREATE INDEX ix_rate_lookup
    ON rental_rate (client_party_id, gas_code, capacity_m3, capacity_unit, effective_from DESC);
