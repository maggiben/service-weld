DROP INDEX IF EXISTS ix_rate_lookup;
CREATE INDEX ix_rate_lookup
    ON rental_rate (client_party_id, gas_code, capacity_m3, effective_from DESC);

ALTER TABLE cylinder_sale DROP COLUMN IF EXISTS capacity_unit;
ALTER TABLE rental_rate DROP COLUMN IF EXISTS capacity_unit;
ALTER TABLE cylinder DROP COLUMN IF EXISTS capacity_unit;

DROP TYPE IF EXISTS capacity_unit;
