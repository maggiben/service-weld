-- Additive: long-outstanding alert threshold (default 90 days).

INSERT INTO system_setting (key, value)
VALUES ('long_outstanding_days', '90')
ON CONFLICT (key) DO NOTHING;
