-- Down: remove billing_run linkage (003 C4 — prefer not to drop in prod; for local rollback only).

DROP INDEX IF EXISTS ix_billing_run_period;
DROP INDEX IF EXISTS ix_invoice_billing_run;
ALTER TABLE invoice DROP COLUMN IF EXISTS billing_run_id;
DROP TABLE IF EXISTS billing_run;
