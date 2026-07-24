-- Per-fill gas prices for customer-owned (REFILL / Su Propiedad) cylinders.
-- Precedence mirrors rental_rate: client > gas > capacity (009 R2 / D-19).

CREATE TABLE IF NOT EXISTS refill_rate (
    id              bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    client_party_id bigint REFERENCES client(party_id),
    gas_code        text REFERENCES gas_type(code),
    capacity_m3     numeric(5,2),
    capacity_unit   capacity_unit NOT NULL DEFAULT 'M3',
    amount          numeric(14,2) NOT NULL CHECK (amount >= 0),
    effective_from  date NOT NULL,
    effective_to    date,
    CONSTRAINT ck_refill_rate_range
        CHECK (effective_to IS NULL OR effective_to >= effective_from),
    CONSTRAINT ck_refill_rate_capacity
        CHECK (capacity_m3 IS NULL OR capacity_m3 > 0)
);

CREATE INDEX IF NOT EXISTS ix_refill_rate_lookup
    ON refill_rate (client_party_id, gas_code, capacity_m3, capacity_unit, effective_from DESC);

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_trigger WHERE tgname = 'trg_audit_refill_rate'
    ) THEN
        CREATE TRIGGER trg_audit_refill_rate
            AFTER INSERT OR UPDATE OR DELETE ON refill_rate
            FOR EACH ROW EXECUTE FUNCTION fn_audit();
    END IF;
END $$;
