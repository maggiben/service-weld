-- ARCA simulation mode: skip live WSAA/WSFE for local/dev (fail-safe ON).
INSERT INTO system_setting (key, value)
VALUES ('arca_simulation_mode', 'true')
ON CONFLICT (key) DO NOTHING;
