-- Reverse 0014_remito_lines_fleet.

DROP TRIGGER IF EXISTS trg_audit_remito_incident ON remito_incident;
DROP TRIGGER IF EXISTS trg_audit_remito_line ON remito_line;
DROP TRIGGER IF EXISTS trg_touch_remito_line ON remito_line;

DROP TABLE IF EXISTS remito_incident;
DROP TABLE IF EXISTS remito_line;

ALTER TABLE delivery_note
    DROP COLUMN IF EXISTS closed_at,
    DROP COLUMN IF EXISTS arrival_at,
    DROP COLUMN IF EXISTS departure_at,
    DROP COLUMN IF EXISTS vehicle_id,
    DROP COLUMN IF EXISTS helper_id,
    DROP COLUMN IF EXISTS driver_id,
    DROP COLUMN IF EXISTS destination_warehouse_id,
    DROP COLUMN IF EXISTS origin_warehouse_id,
    DROP COLUMN IF EXISTS picking_status,
    DROP COLUMN IF EXISTS series_id;

DROP TABLE IF EXISTS remito_series;
DROP TABLE IF EXISTS driver_profile;
DROP TABLE IF EXISTS vehicle;
DROP TABLE IF EXISTS warehouse;

DROP TYPE IF EXISTS incident_status;
DROP TYPE IF EXISTS incident_severity;
DROP TYPE IF EXISTS incident_type;
DROP TYPE IF EXISTS remito_line_kind;
DROP TYPE IF EXISTS picking_status;
