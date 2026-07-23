-- D-18 follow-up: cylinder_history must mirror cylinder column *order* so
-- fn_history_cylinder() SELECT (OLD).* + (valid_from, valid_to, change_op) aligns.
-- ADD COLUMN alone appends after change_op and breaks the SCD-2 trigger; rebuild
-- from LIKE cylinder so capacity_unit sits with the other cylinder columns.

ALTER TABLE cylinder_history
    ADD COLUMN IF NOT EXISTS capacity_unit capacity_unit NOT NULL DEFAULT 'M3';

CREATE TABLE cylinder_history_rebuild (
    LIKE cylinder,
    valid_from timestamptz NOT NULL,
    valid_to   timestamptz NOT NULL DEFAULT now(),
    change_op  audit_action NOT NULL
);

-- Order matches live cylinder after 0008 (capacity_unit after deleted_at)
-- plus history trailing columns.
INSERT INTO cylinder_history_rebuild
SELECT
    id,
    owner_party_id,
    serial_number,
    gas_code,
    capacity_m3,
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
    COALESCE(capacity_unit, 'M3'::capacity_unit),
    valid_from,
    valid_to,
    change_op
FROM cylinder_history;

DROP TABLE cylinder_history;
ALTER TABLE cylinder_history_rebuild RENAME TO cylinder_history;

DROP INDEX IF EXISTS ix_cyl_hist;
CREATE INDEX ix_cyl_hist ON cylinder_history (id, valid_from DESC);
