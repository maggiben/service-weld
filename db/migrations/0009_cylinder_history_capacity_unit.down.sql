-- Reverse of rebuild: restore capacity_unit at table end (pre-rebuild layout).
-- Prefer restoring from backup if this down is needed in production.

CREATE TABLE cylinder_history_rebuild (
    id                bigint,
    owner_party_id    bigint,
    serial_number     citext,
    gas_code          text,
    capacity_m3       numeric(5,2),
    ownership_basis   ownership_basis,
    packaging         packaging_kind,
    battery_id        bigint,
    home_territory_id bigint,
    state             cylinder_state,
    condition         cylinder_cond,
    acquisition_date  date,
    created_at        timestamptz,
    updated_at        timestamptz,
    created_by        bigint,
    updated_by        bigint,
    version           integer,
    deleted_at        timestamptz,
    valid_from        timestamptz NOT NULL,
    valid_to          timestamptz NOT NULL DEFAULT now(),
    change_op         audit_action NOT NULL,
    capacity_unit     capacity_unit NOT NULL DEFAULT 'M3'
);

INSERT INTO cylinder_history_rebuild
SELECT
    id, owner_party_id, serial_number, gas_code, capacity_m3,
    ownership_basis, packaging, battery_id, home_territory_id, state, condition,
    acquisition_date, created_at, updated_at, created_by, updated_by, version,
    deleted_at, valid_from, valid_to, change_op, capacity_unit
FROM cylinder_history;

DROP TABLE cylinder_history;
ALTER TABLE cylinder_history_rebuild RENAME TO cylinder_history;
CREATE INDEX ix_cyl_hist ON cylinder_history (id, valid_from DESC);
