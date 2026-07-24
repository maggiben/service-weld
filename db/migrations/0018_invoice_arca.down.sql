DROP INDEX IF EXISTS uq_invoice_arca_voucher;

ALTER TABLE invoice DROP CONSTRAINT IF EXISTS ck_invoice_cae_pair;

ALTER TABLE invoice
    DROP COLUMN IF EXISTS cae,
    DROP COLUMN IF EXISTS cae_due_date,
    DROP COLUMN IF EXISTS cbte_tipo,
    DROP COLUMN IF EXISTS pto_vta,
    DROP COLUMN IF EXISTS cbte_nro,
    DROP COLUMN IF EXISTS cbte_fch,
    DROP COLUMN IF EXISTS doc_tipo,
    DROP COLUMN IF EXISTS doc_nro,
    DROP COLUMN IF EXISTS condicion_iva_receptor,
    DROP COLUMN IF EXISTS imp_neto,
    DROP COLUMN IF EXISTS imp_iva,
    DROP COLUMN IF EXISTS imp_total,
    DROP COLUMN IF EXISTS arca_environment,
    DROP COLUMN IF EXISTS arca_qr_url,
    DROP COLUMN IF EXISTS authorized_at,
    DROP COLUMN IF EXISTS authorized_by;
