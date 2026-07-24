-- Remito aggregate lines, fleet, picking, incidents, series (docs/specs/remitos.md M1–M2).

DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'picking_status') THEN
        CREATE TYPE picking_status AS ENUM (
            'PENDING', 'PREPARING', 'COMPLETE', 'LOADED'
        );
    END IF;
END $$;

DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'remito_line_kind') THEN
        CREATE TYPE remito_line_kind AS ENUM ('CYLINDER', 'ACCESSORY', 'BATTERY');
    END IF;
END $$;

DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'incident_type') THEN
        CREATE TYPE incident_type AS ENUM (
            'CUSTOMER_ABSENT', 'CYLINDER_DAMAGED', 'WRONG_QUANTITY', 'LEAK',
            'WRONG_GAS', 'WRONG_SERIAL', 'DELIVERY_REJECTED', 'LATE_DELIVERY', 'OTHER'
        );
    END IF;
END $$;

DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'incident_severity') THEN
        CREATE TYPE incident_severity AS ENUM ('LOW', 'MEDIUM', 'HIGH', 'CRITICAL');
    END IF;
END $$;

DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'incident_status') THEN
        CREATE TYPE incident_status AS ENUM (
            'OPEN', 'IN_REVIEW', 'RESOLVED', 'DISMISSED'
        );
    END IF;
END $$;

CREATE TABLE IF NOT EXISTS warehouse (
    id            bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    code          text NOT NULL,
    name          text NOT NULL,
    territory_id  bigint REFERENCES dispatch_territory(id),
    address       text,
    is_active     boolean NOT NULL DEFAULT true,
    created_at    timestamptz NOT NULL DEFAULT now(),
    updated_at    timestamptz NOT NULL DEFAULT now(),
    deleted_at    timestamptz,
    CONSTRAINT uq_warehouse_code UNIQUE (code)
);

CREATE TABLE IF NOT EXISTS vehicle (
    id               bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    plate            citext NOT NULL,
    name             text,
    capacity_units   integer,
    capacity_weight  numeric(12,2),
    is_active        boolean NOT NULL DEFAULT true,
    created_at       timestamptz NOT NULL DEFAULT now(),
    updated_at       timestamptz NOT NULL DEFAULT now(),
    deleted_at       timestamptz,
    CONSTRAINT uq_vehicle_plate UNIQUE (plate)
);

CREATE TABLE IF NOT EXISTS driver_profile (
    id                   bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    user_id              bigint REFERENCES app_user(id),
    display_name         text NOT NULL,
    phone                text,
    license_no           text,
    license_expiry       date,
    default_vehicle_id   bigint REFERENCES vehicle(id),
    is_helper_eligible   boolean NOT NULL DEFAULT true,
    is_active            boolean NOT NULL DEFAULT true,
    created_at           timestamptz NOT NULL DEFAULT now(),
    updated_at           timestamptz NOT NULL DEFAULT now(),
    deleted_at           timestamptz,
    CONSTRAINT uq_driver_profile_user UNIQUE (user_id)
);

CREATE TABLE IF NOT EXISTS remito_series (
    id                     bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    code                   text NOT NULL,
    emission_point_label   text,
    pad_width              integer NOT NULL DEFAULT 8 CHECK (pad_width BETWEEN 4 AND 12),
    next_number            bigint NOT NULL DEFAULT 1 CHECK (next_number >= 1),
    is_active              boolean NOT NULL DEFAULT true,
    created_at             timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT uq_remito_series_code UNIQUE (code)
);

ALTER TABLE delivery_note
    ADD COLUMN IF NOT EXISTS series_id bigint REFERENCES remito_series(id),
    ADD COLUMN IF NOT EXISTS picking_status picking_status NOT NULL DEFAULT 'PENDING',
    ADD COLUMN IF NOT EXISTS origin_warehouse_id bigint REFERENCES warehouse(id),
    ADD COLUMN IF NOT EXISTS destination_warehouse_id bigint REFERENCES warehouse(id),
    ADD COLUMN IF NOT EXISTS driver_id bigint REFERENCES driver_profile(id),
    ADD COLUMN IF NOT EXISTS helper_id bigint REFERENCES driver_profile(id),
    ADD COLUMN IF NOT EXISTS vehicle_id bigint REFERENCES vehicle(id),
    ADD COLUMN IF NOT EXISTS departure_at timestamptz,
    ADD COLUMN IF NOT EXISTS arrival_at timestamptz,
    ADD COLUMN IF NOT EXISTS closed_at timestamptz;

CREATE INDEX IF NOT EXISTS ix_remito_picking ON delivery_note(picking_status);
CREATE INDEX IF NOT EXISTS ix_remito_driver ON delivery_note(driver_id);
CREATE INDEX IF NOT EXISTS ix_remito_vehicle ON delivery_note(vehicle_id);
CREATE INDEX IF NOT EXISTS ix_remito_warehouse ON delivery_note(origin_warehouse_id);

CREATE TABLE IF NOT EXISTS remito_line (
    id                   bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    remito_id            bigint NOT NULL REFERENCES delivery_note(id),
    line_no              integer NOT NULL,
    item_kind            remito_line_kind NOT NULL,
    cylinder_id          bigint REFERENCES cylinder(id),
    battery_id           bigint REFERENCES cylinder_battery(id),
    accessory_id         bigint REFERENCES accessory(id),
    serial_number        citext,
    gas_code             text REFERENCES gas_type(code),
    capacity_value       numeric(5,2),
    capacity_unit        capacity_unit,
    owner_party_id       bigint REFERENCES party(id),
    is_rental            boolean NOT NULL DEFAULT false,
    ownership_basis      ownership_basis,
    qty                  numeric(12,3) NOT NULL DEFAULT 1 CHECK (qty > 0),
    picked_qty           numeric(12,3) NOT NULL DEFAULT 0 CHECK (picked_qty >= 0),
    delivered_qty        numeric(12,3),
    returned_qty         numeric(12,3),
    unit                 text,
    pressure             numeric(10,2),
    condition            cylinder_cond,
    barcode              text,
    qr_code              text,
    movement_event_id    bigint REFERENCES movement_event(id),
    accessory_rental_id  bigint REFERENCES accessory_rental(id),
    weight_kg            numeric(10,2),
    notes                text,
    scanned_at           timestamptz,
    created_at           timestamptz NOT NULL DEFAULT now(),
    updated_at           timestamptz NOT NULL DEFAULT now(),
    deleted_at           timestamptz,
    CONSTRAINT uq_remito_line_no UNIQUE (remito_id, line_no),
    CONSTRAINT ck_remito_line_picked CHECK (picked_qty <= qty)
);
CREATE INDEX IF NOT EXISTS ix_remito_line_remito ON remito_line(remito_id);
CREATE INDEX IF NOT EXISTS ix_remito_line_cylinder ON remito_line(cylinder_id);
CREATE INDEX IF NOT EXISTS ix_remito_line_serial ON remito_line(serial_number);

CREATE TABLE IF NOT EXISTS remito_incident (
    id            bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    remito_id     bigint NOT NULL REFERENCES delivery_note(id),
    line_id       bigint REFERENCES remito_line(id),
    type          incident_type NOT NULL,
    severity      incident_severity NOT NULL DEFAULT 'MEDIUM',
    status        incident_status NOT NULL DEFAULT 'OPEN',
    description   text NOT NULL,
    reported_by   bigint REFERENCES app_user(id),
    reported_at   timestamptz NOT NULL DEFAULT now(),
    resolution    text,
    resolved_by   bigint REFERENCES app_user(id),
    resolved_at   timestamptz,
    created_at    timestamptz NOT NULL DEFAULT now(),
    updated_at    timestamptz NOT NULL DEFAULT now(),
    deleted_at    timestamptz
);
CREATE INDEX IF NOT EXISTS ix_remito_incident_remito ON remito_incident(remito_id);
CREATE INDEX IF NOT EXISTS ix_remito_incident_status ON remito_incident(status);

-- Seed default series + warehouses from territories (idempotent).
INSERT INTO remito_series (code, emission_point_label, next_number)
SELECT 'A', 'Casa central', 1
WHERE NOT EXISTS (SELECT 1 FROM remito_series WHERE code = 'A');

INSERT INTO warehouse (code, name, territory_id)
SELECT upper(left(regexp_replace(name, '[^A-Za-z0-9]', '', 'g'), 8)),
       name,
       id
FROM dispatch_territory t
WHERE NOT EXISTS (
    SELECT 1 FROM warehouse w WHERE w.territory_id = t.id AND w.deleted_at IS NULL
);

DROP TRIGGER IF EXISTS trg_touch_remito_line ON remito_line;
CREATE TRIGGER trg_touch_remito_line
    BEFORE UPDATE ON remito_line
    FOR EACH ROW EXECUTE FUNCTION fn_touch_row();

DROP TRIGGER IF EXISTS trg_audit_remito_line ON remito_line;
CREATE TRIGGER trg_audit_remito_line
    AFTER INSERT OR UPDATE OR DELETE ON remito_line
    FOR EACH ROW EXECUTE FUNCTION fn_audit();

DROP TRIGGER IF EXISTS trg_audit_remito_incident ON remito_incident;
CREATE TRIGGER trg_audit_remito_incident
    AFTER INSERT OR UPDATE OR DELETE ON remito_incident
    FOR EACH ROW EXECUTE FUNCTION fn_audit();
