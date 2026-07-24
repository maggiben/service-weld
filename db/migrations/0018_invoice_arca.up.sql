-- Fiscal authorization fields for ARCA (WSFE) electronic invoices.
-- Populated when an approved invoice is authorized via FECAESolicitar.

ALTER TABLE invoice
    ADD COLUMN IF NOT EXISTS cae text,
    ADD COLUMN IF NOT EXISTS cae_due_date date,
    ADD COLUMN IF NOT EXISTS cbte_tipo smallint,
    ADD COLUMN IF NOT EXISTS pto_vta smallint,
    ADD COLUMN IF NOT EXISTS cbte_nro integer,
    ADD COLUMN IF NOT EXISTS cbte_fch date,
    ADD COLUMN IF NOT EXISTS doc_tipo smallint,
    ADD COLUMN IF NOT EXISTS doc_nro bigint,
    ADD COLUMN IF NOT EXISTS condicion_iva_receptor smallint,
    ADD COLUMN IF NOT EXISTS imp_neto numeric(14,2),
    ADD COLUMN IF NOT EXISTS imp_iva numeric(14,2),
    ADD COLUMN IF NOT EXISTS imp_total numeric(14,2),
    ADD COLUMN IF NOT EXISTS arca_environment text,
    ADD COLUMN IF NOT EXISTS arca_qr_url text,
    ADD COLUMN IF NOT EXISTS authorized_at timestamptz,
    ADD COLUMN IF NOT EXISTS authorized_by bigint;

ALTER TABLE invoice
    DROP CONSTRAINT IF EXISTS ck_invoice_cae_pair;
ALTER TABLE invoice
    ADD CONSTRAINT ck_invoice_cae_pair CHECK (
        (cae IS NULL AND cae_due_date IS NULL AND authorized_at IS NULL)
        OR (cae IS NOT NULL AND cae_due_date IS NOT NULL AND authorized_at IS NOT NULL
            AND cbte_tipo IS NOT NULL AND pto_vta IS NOT NULL AND cbte_nro IS NOT NULL)
    );

CREATE UNIQUE INDEX IF NOT EXISTS uq_invoice_arca_voucher
    ON invoice (pto_vta, cbte_tipo, cbte_nro)
    WHERE cae IS NOT NULL;
