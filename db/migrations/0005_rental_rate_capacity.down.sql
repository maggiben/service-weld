-- Revert capacity_m3 on rental_rate.

DROP INDEX IF EXISTS ix_rate_lookup;

ALTER TABLE rental_rate DROP CONSTRAINT IF EXISTS ck_rate_capacity;
ALTER TABLE rental_rate DROP COLUMN IF EXISTS capacity_m3;

CREATE INDEX ix_rate_lookup
    ON rental_rate (client_party_id, gas_code, effective_from DESC);
