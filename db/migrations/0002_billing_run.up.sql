-- Additive: billing run grouping for W20 draft → approve → export (009 / Phase 3).
-- Idempotent where practical.

CREATE TABLE IF NOT EXISTS billing_run (
    id              bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    period_start    date NOT NULL,
    period_end      date NOT NULL,
    client_party_id bigint REFERENCES client(party_id),
    status          invoice_status NOT NULL DEFAULT 'DRAFT',
    created_at      timestamptz NOT NULL DEFAULT now(),
    created_by      bigint,
    CONSTRAINT ck_billing_run_period CHECK (period_end >= period_start)
);

ALTER TABLE invoice
  ADD COLUMN IF NOT EXISTS billing_run_id bigint REFERENCES billing_run(id);

CREATE INDEX IF NOT EXISTS ix_invoice_billing_run ON invoice(billing_run_id);
CREATE INDEX IF NOT EXISTS ix_billing_run_period ON billing_run(period_start, period_end);
