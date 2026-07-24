DROP INDEX IF EXISTS ix_remito_kind;
ALTER TABLE delivery_note DROP COLUMN IF EXISTS kind;
DROP TYPE IF EXISTS delivery_note_kind;
