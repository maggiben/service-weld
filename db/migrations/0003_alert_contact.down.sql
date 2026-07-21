-- Down: drop alert contact follow-up columns (local rollback only).

ALTER TABLE alert
  DROP COLUMN IF EXISTS last_contacted_at,
  DROP COLUMN IF EXISTS contact_note;
