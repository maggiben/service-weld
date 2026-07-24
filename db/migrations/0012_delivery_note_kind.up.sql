-- Delivery note kind: DELIVERY (salida) vs RETURN (devolución). Existing rows → DELIVERY.

DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'delivery_note_kind') THEN
        CREATE TYPE delivery_note_kind AS ENUM ('DELIVERY', 'RETURN');
    END IF;
END $$;

ALTER TABLE delivery_note
    ADD COLUMN IF NOT EXISTS kind delivery_note_kind NOT NULL DEFAULT 'DELIVERY';

CREATE INDEX IF NOT EXISTS ix_remito_kind ON delivery_note(kind);
