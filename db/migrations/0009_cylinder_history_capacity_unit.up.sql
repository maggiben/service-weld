-- D-18 follow-up: cylinder_history must mirror cylinder column *order* so
-- fn_history_cylinder() SELECT (OLD).* + (valid_from, valid_to, change_op) aligns.
-- ADD COLUMN alone appends after change_op and breaks the SCD-2 trigger; rebuild
-- from LIKE cylinder so capacity_unit sits with the other cylinder columns.
--
-- Idempotent: skip when capacity_unit already matches cylinder's ordinal (e.g.
-- after baseline schema.sql). Named INSERT so legacy "column appended at end"
-- and current "column mid-table" layouts both copy correctly.

ALTER TABLE cylinder_history
    ADD COLUMN IF NOT EXISTS capacity_unit capacity_unit NOT NULL DEFAULT 'M3';

DO $$
DECLARE
    cyl_attnum  smallint;
    hist_attnum smallint;
BEGIN
    SELECT a.attnum INTO cyl_attnum
    FROM pg_attribute a
    WHERE a.attrelid = 'cylinder'::regclass
      AND a.attname = 'capacity_unit'
      AND NOT a.attisdropped;

    SELECT a.attnum INTO hist_attnum
    FROM pg_attribute a
    WHERE a.attrelid = 'cylinder_history'::regclass
      AND a.attname = 'capacity_unit'
      AND NOT a.attisdropped;

    -- LIKE cylinder keeps the same attnum for shared columns; ADD COLUMN
    -- appends after change_op and yields a larger attnum.
    IF cyl_attnum IS NOT NULL
       AND hist_attnum IS NOT NULL
       AND hist_attnum = cyl_attnum THEN
        RAISE NOTICE 'cylinder_history.capacity_unit already aligned; skipping rebuild';
        RETURN;
    END IF;

    CREATE TABLE cylinder_history_rebuild (
        LIKE cylinder,
        valid_from timestamptz NOT NULL,
        valid_to   timestamptz NOT NULL DEFAULT now(),
        change_op  audit_action NOT NULL
    );

    INSERT INTO cylinder_history_rebuild (
        id,
        owner_party_id,
        serial_number,
        gas_code,
        capacity_m3,
        capacity_unit,
        ownership_basis,
        packaging,
        battery_id,
        home_territory_id,
        state,
        condition,
        acquisition_date,
        created_at,
        updated_at,
        created_by,
        updated_by,
        version,
        deleted_at,
        valid_from,
        valid_to,
        change_op
    )
    SELECT
        id,
        owner_party_id,
        serial_number,
        gas_code,
        capacity_m3,
        COALESCE(capacity_unit, 'M3'::capacity_unit),
        ownership_basis,
        packaging,
        battery_id,
        home_territory_id,
        state,
        condition,
        acquisition_date,
        created_at,
        updated_at,
        created_by,
        updated_by,
        version,
        deleted_at,
        valid_from,
        valid_to,
        change_op
    FROM cylinder_history;

    DROP TABLE cylinder_history;
    ALTER TABLE cylinder_history_rebuild RENAME TO cylinder_history;

    DROP INDEX IF EXISTS ix_cyl_hist;
    CREATE INDEX ix_cyl_hist ON cylinder_history (id, valid_from DESC);
END $$;
