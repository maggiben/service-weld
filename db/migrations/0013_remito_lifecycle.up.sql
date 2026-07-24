-- Remito lifecycle (docs/specs/remitos.md M0): status, type, priority, audit.

DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'remito_status') THEN
        CREATE TYPE remito_status AS ENUM (
            'DRAFT',
            'PREPARED',
            'ASSIGNED',
            'LOADED',
            'IN_TRANSIT',
            'DELIVERED',
            'SIGNED',
            'CLOSED',
            'INVOICED',
            'ARCHIVED',
            'CANCELLED'
        );
    END IF;
END $$;

DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'remito_type') THEN
        CREATE TYPE remito_type AS ENUM (
            'DELIVERY',
            'CYLINDER_RETURN',
            'ACCESSORY_RETURN',
            'TRANSFER_WAREHOUSE',
            'INTERNAL_TRANSFER',
            'CUSTOMER_PICKUP',
            'ADJUSTMENT',
            'RENTAL_PICKUP',
            'RENTAL_DELIVERY'
        );
    END IF;
END $$;

DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'remito_priority') THEN
        CREATE TYPE remito_priority AS ENUM ('LOW', 'NORMAL', 'HIGH', 'URGENT');
    END IF;
END $$;

ALTER TABLE delivery_note
    ADD COLUMN IF NOT EXISTS remito_type remito_type,
    ADD COLUMN IF NOT EXISTS status remito_status NOT NULL DEFAULT 'CLOSED',
    ADD COLUMN IF NOT EXISTS priority remito_priority NOT NULL DEFAULT 'NORMAL',
    ADD COLUMN IF NOT EXISTS observations text,
    ADD COLUMN IF NOT EXISTS scheduled_delivery_at timestamptz,
    ADD COLUMN IF NOT EXISTS cancel_reason text,
    ADD COLUMN IF NOT EXISTS created_at timestamptz NOT NULL DEFAULT now(),
    ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now(),
    ADD COLUMN IF NOT EXISTS version integer NOT NULL DEFAULT 1,
    ADD COLUMN IF NOT EXISTS deleted_at timestamptz;

-- Backfill type from legacy kind; existing operational remitos are CLOSED.
UPDATE delivery_note
SET remito_type = CASE
    WHEN kind = 'RETURN' THEN 'CYLINDER_RETURN'::remito_type
    ELSE 'DELIVERY'::remito_type
END
WHERE remito_type IS NULL;

ALTER TABLE delivery_note
    ALTER COLUMN remito_type SET NOT NULL,
    ALTER COLUMN remito_type SET DEFAULT 'DELIVERY';

-- New explicit creates start as DRAFT.
ALTER TABLE delivery_note
    ALTER COLUMN status SET DEFAULT 'DRAFT';

CREATE INDEX IF NOT EXISTS ix_remito_status ON delivery_note(status);
CREATE INDEX IF NOT EXISTS ix_remito_type ON delivery_note(remito_type);
CREATE INDEX IF NOT EXISTS ix_remito_priority ON delivery_note(priority);
CREATE INDEX IF NOT EXISTS ix_remito_scheduled ON delivery_note(scheduled_delivery_at);
CREATE INDEX IF NOT EXISTS ix_remito_deleted ON delivery_note(deleted_at);

CREATE TABLE IF NOT EXISTS remito_status_history (
    id            bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    remito_id     bigint NOT NULL REFERENCES delivery_note(id),
    from_status   remito_status,
    to_status     remito_status NOT NULL,
    actor_user_id bigint REFERENCES app_user(id),
    note          text,
    at            timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS ix_remito_status_history_remito
    ON remito_status_history(remito_id, at);

DROP TRIGGER IF EXISTS trg_touch_delivery_note ON delivery_note;
CREATE TRIGGER trg_touch_delivery_note
    BEFORE UPDATE ON delivery_note
    FOR EACH ROW EXECUTE FUNCTION fn_touch_row();

DROP TRIGGER IF EXISTS trg_audit_delivery_note ON delivery_note;
CREATE TRIGGER trg_audit_delivery_note
    AFTER INSERT OR UPDATE OR DELETE ON delivery_note
    FOR EACH ROW EXECUTE FUNCTION fn_audit();
