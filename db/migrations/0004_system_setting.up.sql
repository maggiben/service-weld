-- Additive: key/value system settings (alert thresholds, etc.).

CREATE TABLE IF NOT EXISTS system_setting (
    key         text PRIMARY KEY,
    value       text NOT NULL,
    updated_at  timestamptz NOT NULL DEFAULT now(),
    version     integer NOT NULL DEFAULT 1
);

INSERT INTO system_setting (key, value)
VALUES ('supplier_loan_overdue_days', '120')
ON CONFLICT (key) DO NOTHING;
