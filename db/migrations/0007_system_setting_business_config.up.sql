-- Additive: business timezone, rental min-days, and primary language settings.

INSERT INTO system_setting (key, value)
VALUES
  ('business_timezone', 'America/Argentina/Buenos_Aires'),
  ('rental_min_days', '0'),
  ('primary_language', 'es')
ON CONFLICT (key) DO NOTHING;
