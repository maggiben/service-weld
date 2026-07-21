-- =====================================================================
-- schema.sql  ·  Cylinder Custody, Circulation & Rental Management System
-- PostgreSQL 15+   ·   Derived from database.md
-- Runnable, correctly ordered. Wrapped in one transaction (all-or-nothing).
--
-- Enforces the core domain invariants at the DB level:
--   BR-01 single custody        -> ex_move_no_overlap (gist exclusion)
--   BR-02 cylinder identity      -> uq_cyl_owner_serial
--   BR-03 rental days computed   -> movement_event.rental_days GENERATED
--   BR-04 date monotonicity      -> CHECK constraints
--   BR-05 plausible dates        -> ck_* lower bound + trigger upper bound
--   BR-07 owner<->basis          -> trg_cylinder_owner_basis
--   BR-08 refill<->customer      -> ck_move_kind_basis
--   BR-11 supplier loop order    -> ck_loan_order
--   BR-13 battery integrity      -> uq_member_one_active_battery
--   BR-17 CUIT format+uniqueness -> ck_client_cuit_format + uq_client_cuit
-- Plus: generic audit log, SCD-2 history, optimistic-lock touch triggers.
-- =====================================================================

BEGIN;

-- ---------------------------------------------------------------------
-- 0. Extensions
-- ---------------------------------------------------------------------
CREATE EXTENSION IF NOT EXISTS citext;
CREATE EXTENSION IF NOT EXISTS pg_trgm;
CREATE EXTENSION IF NOT EXISTS btree_gist;
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- ---------------------------------------------------------------------
-- 1. Enumerated types
-- ---------------------------------------------------------------------
CREATE TYPE party_type       AS ENUM ('SELF','SUPPLIER','SUBDISTRIBUTOR','CUSTOMER');
CREATE TYPE ownership_basis  AS ENUM ('OURS','SUPPLIER','CUSTOMER');
CREATE TYPE cylinder_state   AS ENUM ('IN_STOCK_EMPTY','IN_STOCK_FULL','AT_CLIENT','AT_SUPPLIER',
                                      'SOLD','LOST','BROKEN','RETURNED_TO_SUPPLIER','RETIRED');
CREATE TYPE cylinder_cond    AS ENUM ('EMPTY','FULL');
CREATE TYPE packaging_kind   AS ENUM ('SINGLE','BATTERY','BATTERY_MEMBER');
CREATE TYPE movement_kind    AS ENUM ('RENTAL','REFILL');
CREATE TYPE movement_state   AS ENUM ('OPEN','CLOSED','SWAPPED','LOST','SOLD','VOID');
CREATE TYPE accessory_type   AS ENUM ('REGULATOR','ADAPTER','PORTABLE_O2_BACKPACK');
CREATE TYPE accessory_state  AS ENUM ('IN_STOCK','ON_LOAN','IN_REPAIR','LOST','BROKEN','RETIRED');
CREATE TYPE accessory_rental_state AS ENUM ('ON_LOAN','RETURNED','LOST');
CREATE TYPE charge_basis     AS ENUM ('RENTAL','FREE_LOAN');
CREATE TYPE client_coverage  AS ENUM ('PRIVATE','MUNICIPAL_HOSPITAL');
CREATE TYPE client_status    AS ENUM ('ACTIVE','DORMANT','INACTIVE');
CREATE TYPE client_segment   AS ENUM ('METALWORKING','AGRO','TRANSPORT','BEVERAGE','FOOD_PROCESSING',
                                      'LASER_CUTTING','MEDICAL_HOMECARE','PUBLIC_SECTOR','RESELLER','OTHER');
CREATE TYPE loan_stage       AS ENUM ('RECEIVED','OUT_TO_CLIENT','BACK_FROM_CLIENT','RETURNED_TO_SUPPLIER');
CREATE TYPE rate_period      AS ENUM ('DAILY','MONTHLY');
CREATE TYPE invoice_status   AS ENUM ('DRAFT','APPROVED','EXPORTED','CANCELLED');
CREATE TYPE audit_action     AS ENUM ('INSERT','UPDATE','DELETE','VOID');
CREATE TYPE exception_status AS ENUM ('OPEN','RESOLVED','IGNORED');

-- ---------------------------------------------------------------------
-- 2. Reference data
-- ---------------------------------------------------------------------
CREATE TABLE dispatch_territory (
    id        bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    name      citext NOT NULL UNIQUE,
    is_active boolean NOT NULL DEFAULT true
);

CREATE TABLE locality (
    id           bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    name         citext NOT NULL,
    province     text NOT NULL DEFAULT 'Buenos Aires',
    territory_id bigint REFERENCES dispatch_territory(id),
    CONSTRAINT uq_locality_name UNIQUE (name, province)
);
CREATE INDEX ix_locality_territory ON locality(territory_id);

CREATE TABLE gas_type (
    code       text PRIMARY KEY,
    name       text NOT NULL,
    family     text,
    purity     text,
    is_medical boolean NOT NULL DEFAULT false,
    is_active  boolean NOT NULL DEFAULT true
);

CREATE TABLE gas_alias (
    alias    citext PRIMARY KEY,
    gas_code text NOT NULL REFERENCES gas_type(code)
);
CREATE INDEX ix_gas_alias_code ON gas_alias(gas_code);

-- ---------------------------------------------------------------------
-- 3. Auth
-- ---------------------------------------------------------------------
CREATE TABLE app_user (
    id            bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    username      citext NOT NULL UNIQUE,
    email         citext UNIQUE,
    password_hash text NOT NULL,
    is_active     boolean NOT NULL DEFAULT true,
    mfa_enabled   boolean NOT NULL DEFAULT false,
    last_login_at timestamptz,
    created_at    timestamptz NOT NULL DEFAULT now(),
    updated_at    timestamptz NOT NULL DEFAULT now(),
    version       integer NOT NULL DEFAULT 1,
    deleted_at    timestamptz
);

CREATE TABLE role (
    id   bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    code text NOT NULL UNIQUE,
    name text NOT NULL
);

CREATE TABLE user_role (
    user_id bigint NOT NULL REFERENCES app_user(id),
    role_id bigint NOT NULL REFERENCES role(id),
    PRIMARY KEY (user_id, role_id)
);

CREATE TABLE user_territory_scope (
    user_id      bigint NOT NULL REFERENCES app_user(id),
    territory_id bigint NOT NULL REFERENCES dispatch_territory(id),
    PRIMARY KEY (user_id, territory_id)
);

-- NOTE: created_by / updated_by columns below are logical references to
-- app_user(id); left as plain bigint so system/migration inserts need no user row.

-- ---------------------------------------------------------------------
-- 4. Party & Client
-- ---------------------------------------------------------------------
CREATE TABLE party (
    id           bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    party_type   party_type NOT NULL,
    display_name citext NOT NULL,
    is_self      boolean NOT NULL DEFAULT false,
    created_at   timestamptz NOT NULL DEFAULT now(),
    updated_at   timestamptz NOT NULL DEFAULT now(),
    created_by   bigint,
    updated_by   bigint,
    version      integer NOT NULL DEFAULT 1,
    deleted_at   timestamptz
);
CREATE UNIQUE INDEX uq_party_self      ON party (is_self) WHERE is_self;
CREATE UNIQUE INDEX uq_party_name_type ON party (party_type, display_name) WHERE deleted_at IS NULL;
CREATE INDEX ix_party_name_trgm        ON party USING gin (display_name gin_trgm_ops);

CREATE TABLE client (
    party_id              bigint PRIMARY KEY REFERENCES party(id),
    legal_name            text,
    cuit                  text,
    cuit_valid            boolean NOT NULL DEFAULT false,
    address_street        text,
    locality_id           bigint REFERENCES locality(id),
    territory_id          bigint REFERENCES dispatch_territory(id),
    coverage              client_coverage NOT NULL DEFAULT 'PRIVATE',
    segment               client_segment,
    delivery_instructions text,
    daily_rate_default    numeric(14,2),
    status                client_status NOT NULL DEFAULT 'ACTIVE',
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    created_by bigint, updated_by bigint,
    version    integer NOT NULL DEFAULT 1,
    deleted_at timestamptz,
    CONSTRAINT ck_client_cuit_format CHECK (cuit IS NULL OR cuit ~ '^\d{2}-\d{8}-\d$')
);
CREATE UNIQUE INDEX uq_client_cuit ON client (cuit) WHERE cuit IS NOT NULL AND deleted_at IS NULL;
CREATE INDEX ix_client_territory ON client (territory_id);
CREATE INDEX ix_client_coverage  ON client (coverage);
CREATE INDEX ix_client_locality  ON client (locality_id);

CREATE TABLE client_contact (
    id              bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    client_party_id bigint NOT NULL REFERENCES client(party_id),
    name            text,
    phone           text,
    role            text,
    is_primary      boolean NOT NULL DEFAULT false
);
CREATE INDEX ix_contact_client ON client_contact(client_party_id);
CREATE UNIQUE INDEX uq_contact_primary ON client_contact(client_party_id) WHERE is_primary;

-- ---------------------------------------------------------------------
-- 5. Batteries & Cylinders  (battery created before cylinder: FK order)
-- ---------------------------------------------------------------------
CREATE TABLE cylinder_battery (
    id             bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    battery_code   citext NOT NULL,
    owner_party_id bigint NOT NULL REFERENCES party(id),
    gas_code       text REFERENCES gas_type(code),
    member_count   smallint,
    state          cylinder_state NOT NULL DEFAULT 'IN_STOCK_EMPTY',
    created_at     timestamptz NOT NULL DEFAULT now(),
    updated_at     timestamptz NOT NULL DEFAULT now(),
    created_by bigint, updated_by bigint,
    version        integer NOT NULL DEFAULT 1,
    deleted_at     timestamptz
);
CREATE UNIQUE INDEX uq_battery_code ON cylinder_battery(owner_party_id, battery_code) WHERE deleted_at IS NULL;

CREATE TABLE cylinder (
    id                bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    owner_party_id    bigint NOT NULL REFERENCES party(id),
    serial_number     citext NOT NULL,
    gas_code          text REFERENCES gas_type(code),
    capacity_m3       numeric(5,2),
    ownership_basis   ownership_basis NOT NULL,
    packaging         packaging_kind NOT NULL DEFAULT 'SINGLE',
    battery_id        bigint REFERENCES cylinder_battery(id),
    home_territory_id bigint REFERENCES dispatch_territory(id),
    state             cylinder_state NOT NULL DEFAULT 'IN_STOCK_EMPTY',
    condition         cylinder_cond  NOT NULL DEFAULT 'EMPTY',
    acquisition_date  date,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    created_by bigint, updated_by bigint,
    version    integer NOT NULL DEFAULT 1,
    deleted_at timestamptz,
    CONSTRAINT ck_cyl_capacity CHECK (capacity_m3 IS NULL OR capacity_m3 > 0)
);
CREATE UNIQUE INDEX uq_cyl_owner_serial ON cylinder (owner_party_id, serial_number) WHERE deleted_at IS NULL;
CREATE INDEX ix_cyl_serial_trgm ON cylinder USING gin (serial_number gin_trgm_ops);
CREATE INDEX ix_cyl_state       ON cylinder (state);
CREATE INDEX ix_cyl_owner       ON cylinder (owner_party_id);
CREATE INDEX ix_cyl_battery     ON cylinder (battery_id);
CREATE INDEX ix_cyl_gas         ON cylinder (gas_code);

CREATE TABLE battery_member (
    battery_id  bigint NOT NULL REFERENCES cylinder_battery(id),
    cylinder_id bigint NOT NULL REFERENCES cylinder(id),
    added_at    timestamptz NOT NULL DEFAULT now(),
    removed_at  timestamptz,
    PRIMARY KEY (battery_id, cylinder_id)
);
CREATE UNIQUE INDEX uq_member_one_active_battery ON battery_member (cylinder_id) WHERE removed_at IS NULL;

-- ---------------------------------------------------------------------
-- 6. Accessories, remitos, rates
-- ---------------------------------------------------------------------
CREATE TABLE accessory (
    id             bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    accessory_type accessory_type NOT NULL,
    identifier     text,
    owner_party_id bigint NOT NULL REFERENCES party(id),
    state          accessory_state NOT NULL DEFAULT 'IN_STOCK',
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    created_by bigint, updated_by bigint,
    version        integer NOT NULL DEFAULT 1,
    deleted_at     timestamptz
);
CREATE UNIQUE INDEX uq_accessory_ident ON accessory(accessory_type, identifier)
    WHERE identifier IS NOT NULL AND deleted_at IS NULL;

CREATE TABLE delivery_note (
    id              bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    remito_number   text NOT NULL,
    issued_date     date,
    client_party_id bigint REFERENCES client(party_id),
    CONSTRAINT uq_remito UNIQUE (remito_number)
);
CREATE INDEX ix_remito_client ON delivery_note(client_party_id);

CREATE TABLE rental_rate (
    id              bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    client_party_id bigint REFERENCES client(party_id),
    gas_code        text REFERENCES gas_type(code),
    period          rate_period NOT NULL DEFAULT 'DAILY',
    amount          numeric(14,2) NOT NULL CHECK (amount >= 0),
    effective_from  date NOT NULL,
    effective_to    date,
    CONSTRAINT ck_rate_range CHECK (effective_to IS NULL OR effective_to >= effective_from)
);
CREATE INDEX ix_rate_lookup ON rental_rate (client_party_id, gas_code, effective_from DESC);

-- ---------------------------------------------------------------------
-- 7. Transactional core
-- ---------------------------------------------------------------------
CREATE TABLE movement_event (
    id              bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    request_id      uuid NOT NULL DEFAULT gen_random_uuid(),
    cylinder_id     bigint NOT NULL REFERENCES cylinder(id),
    holder_party_id bigint NOT NULL REFERENCES party(id),
    movement_kind   movement_kind NOT NULL,
    property_basis  ownership_basis NOT NULL,
    gas_code        text REFERENCES gas_type(code),
    delivery_date   date NOT NULL,
    return_date     date,
    rental_days     integer GENERATED ALWAYS AS (return_date - delivery_date) STORED,
    origin_party_id bigint REFERENCES party(id),
    swap_with_cyl_id bigint REFERENCES cylinder(id),
    remito_id       bigint REFERENCES delivery_note(id),
    state           movement_state NOT NULL DEFAULT 'OPEN',
    note            text,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    created_by bigint, updated_by bigint,
    version    integer NOT NULL DEFAULT 1,
    CONSTRAINT uq_movement_request UNIQUE (request_id),
    CONSTRAINT ck_move_dates      CHECK (return_date IS NULL OR return_date >= delivery_date),
    CONSTRAINT ck_move_lowerdate  CHECK (delivery_date >= DATE '2000-01-01'),
    CONSTRAINT ck_move_kind_basis CHECK ((movement_kind='REFILL') = (property_basis='CUSTOMER')),
    CONSTRAINT ck_move_closed     CHECK (state <> 'CLOSED' OR return_date IS NOT NULL)
);
-- Single custody (BR-01): also forbids overlapping historical intervals.
-- Half-open ranges [) allow same-day return-then-redeliver (medical).
-- NULL upper bound = unbounded above (open movement); two open rows overlap -> blocked.
ALTER TABLE movement_event ADD CONSTRAINT ex_move_no_overlap
  EXCLUDE USING gist (
     cylinder_id WITH =,
     daterange(delivery_date, return_date, '[)') WITH &&
  ) WHERE (state <> 'VOID');
CREATE INDEX ix_move_cyl_date    ON movement_event (cylinder_id, delivery_date);
CREATE INDEX ix_move_holder_date ON movement_event (holder_party_id, delivery_date);
CREATE INDEX ix_move_open_holder ON movement_event (holder_party_id) WHERE return_date IS NULL AND state='OPEN';
CREATE INDEX ix_move_open_all    ON movement_event (delivery_date)   WHERE return_date IS NULL AND state='OPEN';
CREATE INDEX ix_move_deliverdate ON movement_event (delivery_date);
CREATE INDEX ix_move_remito      ON movement_event (remito_id);
CREATE INDEX ix_move_gas         ON movement_event (gas_code);

CREATE TABLE cylinder_sale (
    id              bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    cylinder_id     bigint NOT NULL REFERENCES cylinder(id),
    client_party_id bigint REFERENCES client(party_id),
    sale_date       date NOT NULL,
    gas_code        text REFERENCES gas_type(code),
    capacity_m3     numeric(5,2),
    price           numeric(14,2) CHECK (price IS NULL OR price >= 0),
    address_snapshot text, locality_snapshot text, phone_snapshot text,
    note            text,
    created_at timestamptz NOT NULL DEFAULT now(), created_by bigint,
    version    integer NOT NULL DEFAULT 1
);
CREATE UNIQUE INDEX uq_sale_cylinder ON cylinder_sale (cylinder_id);
CREATE INDEX ix_sale_client ON cylinder_sale (client_party_id);
CREATE INDEX ix_sale_date   ON cylinder_sale (sale_date);

CREATE TABLE supplier_loan_cycle (
    id                     bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    cylinder_id            bigint NOT NULL REFERENCES cylinder(id),
    supplier_party_id      bigint NOT NULL REFERENCES party(id),
    client_party_id        bigint REFERENCES client(party_id),
    gas_code               text REFERENCES gas_type(code),
    received_from_supplier date,
    delivered_to_client    date,
    returned_by_client     date,
    returned_to_supplier   date,
    stage                  loan_stage NOT NULL DEFAULT 'RECEIVED',
    version                integer NOT NULL DEFAULT 1,
    CONSTRAINT ck_loan_order CHECK (
         (delivered_to_client  IS NULL OR received_from_supplier IS NULL OR delivered_to_client  >= received_from_supplier)
     AND (returned_by_client   IS NULL OR delivered_to_client    IS NULL OR returned_by_client   >= delivered_to_client)
     AND (returned_to_supplier IS NULL OR returned_by_client     IS NULL OR returned_to_supplier >= returned_by_client)
    )
);
CREATE INDEX ix_loan_supplier ON supplier_loan_cycle (supplier_party_id, stage);
CREATE INDEX ix_loan_open ON supplier_loan_cycle (received_from_supplier) WHERE returned_to_supplier IS NULL;

CREATE TABLE stock_transfer (
    id            bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    cylinder_id   bigint NOT NULL REFERENCES cylinder(id),
    from_party_id bigint NOT NULL REFERENCES party(id),
    to_party_id   bigint NOT NULL REFERENCES party(id),
    transfer_date date NOT NULL,
    note          text,
    created_at timestamptz NOT NULL DEFAULT now(), created_by bigint,
    CONSTRAINT ck_transfer_diff CHECK (from_party_id <> to_party_id)
);
CREATE INDEX ix_transfer_cyl ON stock_transfer(cylinder_id, transfer_date);
CREATE INDEX ix_transfer_to  ON stock_transfer(to_party_id);

CREATE TABLE accessory_rental (
    id              bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    accessory_id    bigint NOT NULL REFERENCES accessory(id),
    client_party_id bigint NOT NULL REFERENCES client(party_id),
    quantity        smallint NOT NULL DEFAULT 1 CHECK (quantity >= 1),
    start_date      date NOT NULL,
    end_date        date,
    charge_basis    charge_basis NOT NULL DEFAULT 'RENTAL',
    remito_id       bigint REFERENCES delivery_note(id),
    state           accessory_rental_state NOT NULL DEFAULT 'ON_LOAN',
    note            text,
    updated_at timestamptz NOT NULL DEFAULT now(),
    version         integer NOT NULL DEFAULT 1,
    CONSTRAINT ck_acc_dates CHECK (end_date IS NULL OR end_date >= start_date)
);
CREATE UNIQUE INDEX uq_acc_one_open   ON accessory_rental (accessory_id) WHERE state = 'ON_LOAN';
CREATE INDEX ix_acc_client_open       ON accessory_rental (client_party_id) WHERE state='ON_LOAN';

-- ---------------------------------------------------------------------
-- 8. Billing
-- ---------------------------------------------------------------------
CREATE TABLE invoice (
    id              bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    client_party_id bigint NOT NULL REFERENCES client(party_id),
    period_start    date NOT NULL,
    period_end      date NOT NULL,
    status          invoice_status NOT NULL DEFAULT 'DRAFT',
    total           numeric(14,2) NOT NULL DEFAULT 0,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    version    integer NOT NULL DEFAULT 1,
    CONSTRAINT ck_inv_period CHECK (period_end >= period_start)
);
CREATE UNIQUE INDEX uq_invoice_client_period ON invoice(client_party_id, period_start, period_end)
    WHERE status <> 'CANCELLED';
CREATE INDEX ix_invoice_status ON invoice(status);

CREATE TABLE charge_line (
    id           bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    invoice_id   bigint NOT NULL REFERENCES invoice(id) ON DELETE CASCADE,
    source_table text NOT NULL,
    source_id    bigint NOT NULL,
    description  text NOT NULL,
    quantity     numeric(14,2) NOT NULL,
    unit         text NOT NULL,
    unit_price   numeric(14,2) NOT NULL,
    amount       numeric(14,2) NOT NULL
);
CREATE INDEX ix_charge_invoice ON charge_line(invoice_id);
CREATE INDEX ix_charge_source  ON charge_line(source_table, source_id);

-- ---------------------------------------------------------------------
-- 9. Audit (partitioned, append-only) & operational tables
-- ---------------------------------------------------------------------
CREATE TABLE audit_log (
    id            bigint GENERATED ALWAYS AS IDENTITY,
    occurred_at   timestamptz NOT NULL DEFAULT now(),
    actor_user_id bigint,
    actor_role    text,
    action        audit_action NOT NULL,
    entity_table  text NOT NULL,
    entity_id     bigint,
    before        jsonb,
    after         jsonb,
    request_id    uuid,
    source        text,
    PRIMARY KEY (id, occurred_at)
) PARTITION BY RANGE (occurred_at);
CREATE INDEX ix_audit_entity ON audit_log (entity_table, entity_id, occurred_at DESC);
CREATE INDEX ix_audit_actor  ON audit_log (actor_user_id, occurred_at DESC);
-- default partition so inserts always land somewhere; add monthly partitions in ops.
CREATE TABLE audit_log_default PARTITION OF audit_log DEFAULT;
CREATE TABLE audit_log_2026_07 PARTITION OF audit_log FOR VALUES FROM ('2026-07-01') TO ('2026-08-01');

CREATE TABLE migration_exception (
    id        bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    workbook  text NOT NULL, sheet text, row_ref text,
    raw       jsonb NOT NULL,
    reason    text NOT NULL,
    status    exception_status NOT NULL DEFAULT 'OPEN',
    created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX ix_migex_status ON migration_exception(status);

CREATE TABLE alert (
    id            bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    alert_type    text NOT NULL,
    entity_table  text, entity_id bigint,
    severity      smallint NOT NULL DEFAULT 3,
    created_at    timestamptz NOT NULL DEFAULT now(),
    resolved_at   timestamptz,
    assigned_role text,
    contact_note       text,
    last_contacted_at  timestamptz
);
CREATE INDEX ix_alert_open ON alert (alert_type) WHERE resolved_at IS NULL;

-- Operational thresholds (US-21 supplier loan aging, etc.). Editable via API/UI.
CREATE TABLE system_setting (
    key         text PRIMARY KEY,
    value       text NOT NULL,
    updated_at  timestamptz NOT NULL DEFAULT now(),
    version     integer NOT NULL DEFAULT 1
);
INSERT INTO system_setting (key, value) VALUES ('supplier_loan_overdue_days', '120');

-- ---------------------------------------------------------------------
-- 10. History tables (SCD-2)  — created after client & cylinder (LIKE)
-- ---------------------------------------------------------------------
CREATE TABLE client_history (
    LIKE client,
    valid_from timestamptz NOT NULL,
    valid_to   timestamptz NOT NULL DEFAULT now(),
    change_op  audit_action NOT NULL
);
CREATE INDEX ix_client_hist ON client_history (party_id, valid_from DESC);

CREATE TABLE cylinder_history (
    LIKE cylinder,
    valid_from timestamptz NOT NULL,
    valid_to   timestamptz NOT NULL DEFAULT now(),
    change_op  audit_action NOT NULL
);
CREATE INDEX ix_cyl_hist ON cylinder_history (id, valid_from DESC);

-- ---------------------------------------------------------------------
-- 11. Trigger functions
-- ---------------------------------------------------------------------

-- Optimistic-lock touch: bump version + updated_at on UPDATE
CREATE OR REPLACE FUNCTION fn_touch_row() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
    NEW.updated_at := now();
    NEW.version    := OLD.version + 1;
    RETURN NEW;
END;
$$;

-- Generic audit (works for any table; entity id = id or party_id if present)
CREATE OR REPLACE FUNCTION fn_audit() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
    v_before jsonb; v_after jsonb; v_id bigint; v_action audit_action;
BEGIN
    IF    TG_OP = 'INSERT' THEN v_before := NULL;            v_after := to_jsonb(NEW); v_action := 'INSERT';
    ELSIF TG_OP = 'UPDATE' THEN v_before := to_jsonb(OLD);   v_after := to_jsonb(NEW); v_action := 'UPDATE';
    ELSE                        v_before := to_jsonb(OLD);   v_after := NULL;          v_action := 'DELETE';
    END IF;
    v_id := COALESCE( v_after->>'id',      v_after->>'party_id',
                      v_before->>'id',     v_before->>'party_id' )::bigint;
    INSERT INTO audit_log(actor_user_id, actor_role, action, entity_table, entity_id, before, after, source)
    VALUES (
        NULLIF(current_setting('app.current_user_id', true), '')::bigint,
        NULLIF(current_setting('app.current_role_code', true), ''),
        v_action, TG_TABLE_NAME, v_id, v_before, v_after,
        NULLIF(current_setting('app.source', true), '')
    );
    RETURN NULL; -- AFTER trigger
END;
$$;

-- Plausibility upper bound (CURRENT_DATE is not IMMUTABLE -> cannot be a CHECK)
CREATE OR REPLACE FUNCTION fn_movement_future_guard() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
    IF NEW.delivery_date > CURRENT_DATE + 30 THEN
        RAISE EXCEPTION 'delivery_date % too far in the future', NEW.delivery_date USING ERRCODE = '23514';
    END IF;
    IF NEW.return_date IS NOT NULL AND NEW.return_date > CURRENT_DATE + 30 THEN
        RAISE EXCEPTION 'return_date % too far in the future', NEW.return_date USING ERRCODE = '23514';
    END IF;
    RETURN NEW;
END;
$$;

-- Owner <-> ownership_basis consistency (BR-07)
CREATE OR REPLACE FUNCTION fn_cylinder_owner_basis() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE pt party_type;
BEGIN
    SELECT party_type INTO pt FROM party WHERE id = NEW.owner_party_id;
    IF NEW.ownership_basis = 'OURS' AND pt <> 'SELF' THEN
        RAISE EXCEPTION 'OURS cylinder must be owned by the SELF party';
    ELSIF NEW.ownership_basis = 'SUPPLIER' AND pt NOT IN ('SUPPLIER','SUBDISTRIBUTOR') THEN
        RAISE EXCEPTION 'SUPPLIER cylinder must be owned by a SUPPLIER/SUBDISTRIBUTOR party';
    ELSIF NEW.ownership_basis = 'CUSTOMER' AND pt <> 'CUSTOMER' THEN
        RAISE EXCEPTION 'CUSTOMER cylinder must be owned by a CUSTOMER party';
    END IF;
    RETURN NEW;
END;
$$;

-- SCD-2 history writers
CREATE OR REPLACE FUNCTION fn_history_client() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
    INSERT INTO client_history
    SELECT (OLD).*, COALESCE(OLD.updated_at, OLD.created_at), now(),
           (CASE WHEN TG_OP='DELETE' THEN 'DELETE' ELSE 'UPDATE' END)::audit_action;
    IF TG_OP='DELETE' THEN RETURN OLD; ELSE RETURN NEW; END IF;
END;
$$;

CREATE OR REPLACE FUNCTION fn_history_cylinder() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
    INSERT INTO cylinder_history
    SELECT (OLD).*, COALESCE(OLD.updated_at, OLD.created_at), now(),
           (CASE WHEN TG_OP='DELETE' THEN 'DELETE' ELSE 'UPDATE' END)::audit_action;
    IF TG_OP='DELETE' THEN RETURN OLD; ELSE RETURN NEW; END IF;
END;
$$;

-- ---------------------------------------------------------------------
-- 12. Attach triggers
-- ---------------------------------------------------------------------
-- touch (BEFORE UPDATE) on tables with version + updated_at
CREATE TRIGGER trg_touch_party            BEFORE UPDATE ON party            FOR EACH ROW EXECUTE FUNCTION fn_touch_row();
CREATE TRIGGER trg_touch_client           BEFORE UPDATE ON client           FOR EACH ROW EXECUTE FUNCTION fn_touch_row();
CREATE TRIGGER trg_touch_cylinder         BEFORE UPDATE ON cylinder         FOR EACH ROW EXECUTE FUNCTION fn_touch_row();
CREATE TRIGGER trg_touch_battery          BEFORE UPDATE ON cylinder_battery FOR EACH ROW EXECUTE FUNCTION fn_touch_row();
CREATE TRIGGER trg_touch_accessory        BEFORE UPDATE ON accessory        FOR EACH ROW EXECUTE FUNCTION fn_touch_row();
CREATE TRIGGER trg_touch_movement         BEFORE UPDATE ON movement_event   FOR EACH ROW EXECUTE FUNCTION fn_touch_row();
CREATE TRIGGER trg_touch_accrental        BEFORE UPDATE ON accessory_rental FOR EACH ROW EXECUTE FUNCTION fn_touch_row();
CREATE TRIGGER trg_touch_invoice          BEFORE UPDATE ON invoice          FOR EACH ROW EXECUTE FUNCTION fn_touch_row();

-- owner<->basis (BR-07)
CREATE TRIGGER trg_cylinder_owner_basis   BEFORE INSERT OR UPDATE ON cylinder FOR EACH ROW EXECUTE FUNCTION fn_cylinder_owner_basis();

-- future-date guard (BR-05 upper bound)
CREATE TRIGGER trg_move_future_guard      BEFORE INSERT OR UPDATE ON movement_event FOR EACH ROW EXECUTE FUNCTION fn_movement_future_guard();

-- SCD-2 history (BEFORE UPDATE OR DELETE)
CREATE TRIGGER trg_hist_client   BEFORE UPDATE OR DELETE ON client   FOR EACH ROW EXECUTE FUNCTION fn_history_client();
CREATE TRIGGER trg_hist_cylinder BEFORE UPDATE OR DELETE ON cylinder FOR EACH ROW EXECUTE FUNCTION fn_history_cylinder();

-- audit (AFTER INSERT OR UPDATE OR DELETE) on core business tables
CREATE TRIGGER trg_audit_party      AFTER INSERT OR UPDATE OR DELETE ON party            FOR EACH ROW EXECUTE FUNCTION fn_audit();
CREATE TRIGGER trg_audit_client     AFTER INSERT OR UPDATE OR DELETE ON client           FOR EACH ROW EXECUTE FUNCTION fn_audit();
CREATE TRIGGER trg_audit_cylinder   AFTER INSERT OR UPDATE OR DELETE ON cylinder         FOR EACH ROW EXECUTE FUNCTION fn_audit();
CREATE TRIGGER trg_audit_battery    AFTER INSERT OR UPDATE OR DELETE ON cylinder_battery FOR EACH ROW EXECUTE FUNCTION fn_audit();
CREATE TRIGGER trg_audit_movement   AFTER INSERT OR UPDATE OR DELETE ON movement_event   FOR EACH ROW EXECUTE FUNCTION fn_audit();
CREATE TRIGGER trg_audit_sale       AFTER INSERT OR UPDATE OR DELETE ON cylinder_sale    FOR EACH ROW EXECUTE FUNCTION fn_audit();
CREATE TRIGGER trg_audit_loan       AFTER INSERT OR UPDATE OR DELETE ON supplier_loan_cycle FOR EACH ROW EXECUTE FUNCTION fn_audit();
CREATE TRIGGER trg_audit_transfer   AFTER INSERT OR UPDATE OR DELETE ON stock_transfer   FOR EACH ROW EXECUTE FUNCTION fn_audit();
CREATE TRIGGER trg_audit_accrental  AFTER INSERT OR UPDATE OR DELETE ON accessory_rental FOR EACH ROW EXECUTE FUNCTION fn_audit();
CREATE TRIGGER trg_audit_accessory  AFTER INSERT OR UPDATE OR DELETE ON accessory        FOR EACH ROW EXECUTE FUNCTION fn_audit();
CREATE TRIGGER trg_audit_rate       AFTER INSERT OR UPDATE OR DELETE ON rental_rate       FOR EACH ROW EXECUTE FUNCTION fn_audit();

-- Keep audit_log append-only (revoke UPDATE/DELETE from application role, if present).
-- Example (uncomment after creating the role):
-- REVOKE UPDATE, DELETE ON audit_log FROM app_rw;

-- ---------------------------------------------------------------------
-- 13. Seed data (reference + our own party + roles)
-- ---------------------------------------------------------------------
INSERT INTO role(code, name) VALUES
 ('CLERK','Administrative Clerk'), ('DRIVER','Delivery Driver'), ('PLANT','Plant Operator'),
 ('INVENTORY','Inventory Controller'), ('BILLING','Billing Clerk'), ('MANAGER','Manager'),
 ('SUBDIST','Sub-Distributor'), ('ADMIN','System Administrator'),
 ('MEDICAL','Hospital Coordinator'), ('CLIENT','Client Self-Service');

-- Route books (WB1/WB2). Ceres is kept inactive: it is a sub-distributor
-- outpost/node (see party seed below), not a client delivery territory.
INSERT INTO dispatch_territory(name, is_active) VALUES
  ('Junín', true),
  ('Chacabuco', true),
  ('Ceres', false);

-- Canonical towns served by the two route books (domain.md Locality enum).
INSERT INTO locality(name, province, territory_id) VALUES
  ('Junín', 'Buenos Aires', 1),
  ('Salto', 'Buenos Aires', 1),
  ('Rojas', 'Buenos Aires', 1),
  ('Arrecifes', 'Buenos Aires', 1),
  ('Colón', 'Buenos Aires', 1),
  ('Carabelas', 'Buenos Aires', 1),
  ('Carmen de Areco', 'Buenos Aires', 1),
  ('Baigorrita', 'Buenos Aires', 1),
  ('Vedia', 'Buenos Aires', 1),
  ('Villa Sanguinetti', 'Buenos Aires', 1),
  ('Chacabuco', 'Buenos Aires', 2),
  ('O''Higgins', 'Buenos Aires', 2),
  ('Rawson', 'Buenos Aires', 2),
  ('Irala', 'Buenos Aires', 2),
  ('Chivilcoy', 'Buenos Aires', 2),
  ('Ascensión', 'Buenos Aires', 2),
  ('Tres Sargentos', 'Buenos Aires', 2),
  ('Castilla', 'Buenos Aires', 2),
  ('Sarmiento', 'Buenos Aires', 2);

INSERT INTO gas_type(code, name, family, purity, is_medical) VALUES
 ('O2','Oxígeno','oxygen',NULL,false),
 ('O2_MED','Oxígeno medicinal','oxygen',NULL,true),
 ('O2_LASER','Oxígeno láser','oxygen',NULL,false),
 ('CO2','Dióxido de carbono','inert',NULL,false),
 ('N2','Nitrógeno','inert',NULL,false),
 ('AR','Argón','inert',NULL,false),
 ('AR_50','Argón 5.0','inert','5.0',false),
 ('ATAL','Mezcla Ar/CO2 (ATAL)','mix',NULL,false),
 ('MIX20','Mezcla 20% CO2','mix',NULL,false),
 ('MIX22','Mezcla 22% CO2','mix',NULL,false),
 ('MAPAX30','MAPAX 30','mix',NULL,false),
 ('ACET','Acetileno','fuel',NULL,false),
 ('HELIUM','Helio','inert',NULL,false),
 ('THERMOLENE','Thermolene','fuel',NULL,false);

-- legacy spelling normalization (extend during migration)
INSERT INTO gas_alias(alias, gas_code) VALUES
 ('o','O2'), ('ox','O2'), ('oxigeno','O2'), ('o2','O2'),
 ('at','ATAL'), ('atal','ATAL'), ('ata','ATAL'),
 ('ar','AR'), ('argon','AR'), ('argom','AR'), ('argo','AR'),
 ('ar 5,0','AR_50'), ('argon 5,0','AR_50'), ('argon 5.0','AR_50'),
 ('co2','CO2'), ('n2','N2'), ('nitrogeno','N2'),
 ('acet','ACET'), ('acet.','ACET'), ('acetileno','ACET'),
 ('elio','HELIUM'), ('helio','HELIUM'),
 ('mapax30','MAPAX30'), ('o2 med','O2_MED'), ('o2med','O2_MED'), ('o2 laser','O2_LASER');

-- our own company + representative suppliers / sub-distributors (from the workbooks)
INSERT INTO party(party_type, display_name, is_self) VALUES ('SELF','Nuestra Empresa', true);
INSERT INTO party(party_type, display_name) VALUES
 ('SUPPLIER','Linde'), ('SUPPLIER','Intergas'), ('SUPPLIER','Nordelta'), ('SUPPLIER','DSJ'),
 ('SUBDISTRIBUTOR','Ceres'), ('SUBDISTRIBUTOR','Pantiga'), ('SUBDISTRIBUTOR','Ezequiel'),
 ('SUBDISTRIBUTOR','Tito'), ('SUBDISTRIBUTOR','Buroni');

COMMIT;

-- =====================================================================
-- Post-deploy notes:
--  * Set per-session context before writes so audit captures the actor:
--      SET app.current_user_id = '12'; SET app.current_role_code = 'CLERK'; SET app.source = 'web';
--  * Create monthly audit_log partitions ahead of time (scheduler).
--  * Do NOT partition movement_event yet (would break ex_move_no_overlap);
--    when it grows, move single-custody to a cylinder_open_holding table.
-- =====================================================================
