-- Additive: follow-up notes + last contact on operational alerts (call list for rentals/refills).

ALTER TABLE alert
  ADD COLUMN IF NOT EXISTS contact_note text,
  ADD COLUMN IF NOT EXISTS last_contacted_at timestamptz;
