-- Reverse 0013_remito_lifecycle.

DROP TRIGGER IF EXISTS trg_audit_delivery_note ON delivery_note;
DROP TRIGGER IF EXISTS trg_touch_delivery_note ON delivery_note;

DROP TABLE IF EXISTS remito_status_history;

DROP INDEX IF EXISTS ix_remito_deleted;
DROP INDEX IF EXISTS ix_remito_scheduled;
DROP INDEX IF EXISTS ix_remito_priority;
DROP INDEX IF EXISTS ix_remito_type;
DROP INDEX IF EXISTS ix_remito_status;

ALTER TABLE delivery_note
    DROP COLUMN IF EXISTS deleted_at,
    DROP COLUMN IF EXISTS version,
    DROP COLUMN IF EXISTS updated_at,
    DROP COLUMN IF EXISTS created_at,
    DROP COLUMN IF EXISTS cancel_reason,
    DROP COLUMN IF EXISTS scheduled_delivery_at,
    DROP COLUMN IF EXISTS observations,
    DROP COLUMN IF EXISTS priority,
    DROP COLUMN IF EXISTS status,
    DROP COLUMN IF EXISTS remito_type;

DROP TYPE IF EXISTS remito_priority;
DROP TYPE IF EXISTS remito_type;
DROP TYPE IF EXISTS remito_status;
