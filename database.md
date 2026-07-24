# PostgreSQL Database Design

## Cylinder Custody, Circulation & Rental Management System

**Version:** 1.0 · **Target:** PostgreSQL 15+
**Companion docs:** `domain.md`, `workflows.md`, `sdd.md`.
**Legend:** `» observed` = grounded in the legacy workbooks; **Why** = design rationale.

> This is the physical model that replaces the three Excel workbooks. The single most important decision is that a physical movement is stored **once** in `movement_event` and read from either the client or the cylinder side — the legacy "two books, typed twice" problem is designed out.

---

## 0. Design Principles & Conventions

- **Surrogate keys.** Every table has `id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY`. Natural keys (serial, CUIT, remito) get **unique constraints**, not PK duty. **Why:** natural keys here are dirty/mutable/non-unique across owners (`» observed`: same serial `309817` for Linde and for us); stable surrogate PKs keep FKs small and joins fast.
- **Money** = `numeric(14,2)` (ARS). **Why:** never `float` for currency.
- **Dates** = `date` for business movement dates (the source is day-granular); `timestamptz` for system columns (`created_at`, `updated_at`, audit). **Why:** movements are recorded per day `» observed`; system events need TZ-aware instants.
- **Case-insensitive text** = `citext` for names/usernames/emails. **Why:** kills the legacy casing drift (`atal`/`ATAL`, `TORRES`/`torres`).
- **Controlled vocabularies** = native `ENUM` for stable small sets; **reference tables** for extensible sets (gas types, localities). **Why:** enums are fast and self-documenting; gas list must be extensible and alias-mapped.
- **Every mutable table carries:** `created_at`, `updated_at`, `created_by`, `updated_by`, `version integer NOT NULL DEFAULT 1` (optimistic lock), and — where soft delete applies — `deleted_at timestamptz`.
- **Naming:** `snake_case`; FK columns `<referenced_table>_id`; indexes `ix_<table>_<cols>`; unique `uq_…`; check `ck_…`; exclusion `ex_…`.
- **Build order:** tables are presented grouped by concern, not strict creation order. Two forward references exist (`cylinder.battery_id → cylinder_battery`, and `*_by → app_user`); in the build script, create `cylinder_battery`, `app_user`, `dispatch_territory`, `locality`, and `gas_type` first, or add those FKs last via `ALTER TABLE … ADD CONSTRAINT`. **Why:** avoids circular-dependency errors at `CREATE` time without changing the model.

### Extensions

```sql
CREATE EXTENSION IF NOT EXISTS citext;      -- case-insensitive names/emails
CREATE EXTENSION IF NOT EXISTS pg_trgm;     -- fuzzy client/serial search (near-duplicate names)
CREATE EXTENSION IF NOT EXISTS btree_gist;  -- exclusion constraint: no overlapping custody
CREATE EXTENSION IF NOT EXISTS pgcrypto;    -- gen_random_uuid() for idempotency keys
```

**Why:** `pg_trgm` mitigates the legacy near-duplicate names (`MASTANTUONO` vs `MANSTANTUONO`); `btree_gist` lets one exclusion constraint enforce single-custody across time.

---

## 1. Enumerated Types

```sql
CREATE TYPE party_type        AS ENUM ('SELF','SUPPLIER','SUBDISTRIBUTOR','CUSTOMER');
CREATE TYPE ownership_basis   AS ENUM ('OURS','SUPPLIER','CUSTOMER');
CREATE TYPE cylinder_state    AS ENUM ('IN_STOCK_EMPTY','IN_STOCK_FULL','AT_CLIENT','AT_SUPPLIER',
                                       'SOLD','LOST','BROKEN','RETURNED_TO_SUPPLIER','RETIRED');
CREATE TYPE cylinder_cond     AS ENUM ('EMPTY','FULL');
CREATE TYPE packaging_kind    AS ENUM ('SINGLE','BATTERY','BATTERY_MEMBER');
CREATE TYPE movement_kind     AS ENUM ('RENTAL','REFILL');           -- Nuestra vs Su Propiedad
CREATE TYPE movement_state    AS ENUM ('OPEN','CLOSED','SWAPPED','LOST','SOLD','VOID');
CREATE TYPE delivery_note_kind AS ENUM ('DELIVERY','RETURN');         -- remito salida vs devolución
CREATE TYPE accessory_type    AS ENUM ('REGULATOR','ADAPTER','PORTABLE_O2_BACKPACK'); -- regulador/adaptador/mochila
CREATE TYPE accessory_state   AS ENUM ('IN_STOCK','ON_LOAN','IN_REPAIR','LOST','BROKEN','RETIRED');
CREATE TYPE accessory_rental_state AS ENUM ('ON_LOAN','RETURNED','LOST');
CREATE TYPE charge_basis      AS ENUM ('RENTAL','FREE_LOAN');        -- alquiler vs prestado
CREATE TYPE client_coverage   AS ENUM ('PRIVATE','MUNICIPAL_HOSPITAL');
CREATE TYPE client_status     AS ENUM ('ACTIVE','DORMANT','INACTIVE');
CREATE TYPE client_segment    AS ENUM ('METALWORKING','AGRO','TRANSPORT','BEVERAGE','FOOD_PROCESSING',
                                       'LASER_CUTTING','MEDICAL_HOMECARE','PUBLIC_SECTOR','RESELLER','OTHER');
CREATE TYPE loan_stage        AS ENUM ('RECEIVED','OUT_TO_CLIENT','BACK_FROM_CLIENT','RETURNED_TO_SUPPLIER');
CREATE TYPE rate_period       AS ENUM ('DAILY','MONTHLY');
CREATE TYPE invoice_status    AS ENUM ('DRAFT','APPROVED','EXPORTED','CANCELLED');
CREATE TYPE audit_action      AS ENUM ('INSERT','UPDATE','DELETE','VOID');
CREATE TYPE exception_status  AS ENUM ('OPEN','RESOLVED','IGNORED');
CREATE TYPE capacity_unit     AS ENUM ('M3','KG');  -- D-18: magnitude lives in capacity_m3
```

**Why enums here:** these sets are stable and drive branching logic (state machines in `sdd.md`). Enum comparison is integer-fast and prevents the free-text chaos the spreadsheets suffered.

---

## 2. Reference Data Tables

### 2.1 `gas_type` + `gas_alias`

```sql
CREATE TABLE gas_type (
    code         text PRIMARY KEY,                 -- 'O2','CO2','ATAL','AR','AR_50','ACET','MAPAX30'...
    name         text NOT NULL,
    family       text,                             -- 'oxygen','inert','fuel','mix'
    purity       text,                             -- '5.0' etc.
    is_medical   boolean NOT NULL DEFAULT false,   -- O2_MED
    is_active    boolean NOT NULL DEFAULT true
);

CREATE TABLE gas_alias (                           -- legacy normalization map
    alias        citext PRIMARY KEY,               -- 'o','ox','oxigeno','argom','elio'...
    gas_code     text NOT NULL REFERENCES gas_type(code)
);
CREATE INDEX ix_gas_alias_code ON gas_alias(gas_code);
```

**Why a table, not an enum:** the gas catalogue is business-extensible and, critically, must map the **dozens of legacy spellings** (`o/ox/oxigeno`, `elio/helio`, `argom/argon`) `» observed` to a canonical code during migration and data entry. An enum can't carry an alias map.

### 2.2 `locality`, `dispatch_territory`

```sql
CREATE TABLE dispatch_territory (
    id       bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    name     citext NOT NULL UNIQUE,               -- 'Junín','Chacabuco','Ceres'
    is_active boolean NOT NULL DEFAULT true
);

CREATE TABLE locality (
    id          bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    name        citext NOT NULL,                   -- Chacabuco, Salto, Rojas, Arrecifes...
    province    text NOT NULL DEFAULT 'Buenos Aires',
    territory_id bigint REFERENCES dispatch_territory(id),
    CONSTRAINT uq_locality_name UNIQUE (name, province)
);
CREATE INDEX ix_locality_territory ON locality(territory_id);
```

**Why:** the two route-books map to two territories `» observed` (Junín/Chacabuco) plus the Ceres outpost; localities feed routing and reporting facets.

---

## 3. Party, Client & Contacts

### 3.1 `party` — anyone who can own or hold a cylinder

```sql
CREATE TABLE party (
    id           bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    party_type   party_type NOT NULL,
    display_name citext NOT NULL,                  -- 'US','Linde','Intergas','Nordelta','DSJ','Ceres','TORRES AMERICANAS'
    is_self      boolean NOT NULL DEFAULT false,   -- exactly one row true (our own company)
    created_at   timestamptz NOT NULL DEFAULT now(),
    updated_at   timestamptz NOT NULL DEFAULT now(),
    created_by   bigint,
    updated_by   bigint,
    version      integer NOT NULL DEFAULT 1,
    deleted_at   timestamptz
);
CREATE UNIQUE INDEX uq_party_self ON party (is_self) WHERE is_self;   -- only one SELF
CREATE UNIQUE INDEX uq_party_name_type ON party (party_type, display_name) WHERE deleted_at IS NULL;
CREATE INDEX ix_party_name_trgm ON party USING gin (display_name gin_trgm_ops);
```

**Why one `party` table (class-table inheritance):** owners (us), suppliers (Linde/Intergas/Nordelta/DSJ `» observed`), sub-distributors (Ceres/Pantiga/Ezequiel/Tito/Buroni `» observed`) and customers can all **own** cylinders and be **origins/holders** of movements. A single `party` lets `cylinder.owner_party_id` and `movement_event.*_party_id` reference one type. `uq_party_self` guarantees a single "our company" node. Trigram index powers fuzzy search.

### 3.2 `client` — customer extension (1:1 with party)

```sql
CREATE TABLE client (
    party_id             bigint PRIMARY KEY REFERENCES party(id),
    legal_name           text,
    cuit                 text,                     -- 'NN-NNNNNNNN-N'
    cuit_valid           boolean NOT NULL DEFAULT false,
    address_street       text,
    locality_id          bigint REFERENCES locality(id),
    territory_id         bigint REFERENCES dispatch_territory(id),
    coverage             client_coverage NOT NULL DEFAULT 'PRIVATE',
    segment              client_segment,
    delivery_instructions text,                    -- 'PASAR POR BALANZA Y PARAR'
    daily_rate_default   numeric(14,2),            -- fallback rental rate
    status               client_status NOT NULL DEFAULT 'ACTIVE',
    created_at           timestamptz NOT NULL DEFAULT now(),
    updated_at           timestamptz NOT NULL DEFAULT now(),
    created_by bigint, updated_by bigint,
    version  integer NOT NULL DEFAULT 1,
    deleted_at timestamptz,
    CONSTRAINT ck_client_cuit_format
      CHECK (cuit IS NULL OR cuit ~ '^\d{2}-\d{8}-\d$')
);
CREATE UNIQUE INDEX uq_client_cuit ON client (cuit) WHERE cuit IS NOT NULL AND deleted_at IS NULL;
CREATE INDEX ix_client_territory ON client (territory_id);
CREATE INDEX ix_client_coverage  ON client (coverage);
CREATE INDEX ix_client_locality  ON client (locality_id);
```

**Columns/why:** `coverage='MUNICIPAL_HOSPITAL'` routes medical billing `» observed` (`HOSP.MUNIC.`). `delivery_instructions` captures the weighbridge/route notes `» observed`. `cuit` **format** is a CHECK; **check-digit** validity is computed in the app and stored in `cuit_valid` (mod-11 isn't expressible as an immutable CHECK). Partial unique on `cuit` enforces one client per tax id **but only for non-deleted rows** (soft-delete-aware). `ck_client_cuit_format` blocks malformed CUITs.

### 3.3 `client_contact`

```sql
CREATE TABLE client_contact (
    id           bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    client_party_id bigint NOT NULL REFERENCES client(party_id),
    name         text,                             -- 'JUAN','DIEGO'
    phone        text,                             -- '02352-452126'
    role         text,
    is_primary   boolean NOT NULL DEFAULT false
);
CREATE INDEX ix_contact_client ON client_contact(client_party_id);
CREATE UNIQUE INDEX uq_contact_primary ON client_contact(client_party_id) WHERE is_primary;
```

**Why a child table:** clients have **multiple** named contacts/phones `» observed` (ARGEAVE lists JUAN & DIEGO, two phone lines); a normalized child avoids repeating-group columns.

---

## 4. Cylinders, Batteries, Accessories, Remitos, Rates

### 4.1 `cylinder`

```sql
CREATE TABLE cylinder (
    id             bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    owner_party_id bigint NOT NULL REFERENCES party(id),
    serial_number  citext NOT NULL,
    gas_code       text REFERENCES gas_type(code),
    capacity_m3    numeric(5,2),                   -- magnitude; unit in capacity_unit (D-18)
    capacity_unit  capacity_unit NOT NULL DEFAULT 'M3',  -- M3 | KG
    ownership_basis ownership_basis NOT NULL,
    packaging      packaging_kind NOT NULL DEFAULT 'SINGLE',
    battery_id     bigint REFERENCES cylinder_battery(id),
    home_territory_id bigint REFERENCES dispatch_territory(id),
    state          cylinder_state NOT NULL DEFAULT 'IN_STOCK_EMPTY',
    condition      cylinder_cond  NOT NULL DEFAULT 'EMPTY',
    acquisition_date date,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    created_by bigint, updated_by bigint,
    version    integer NOT NULL DEFAULT 1,
    deleted_at timestamptz,
    CONSTRAINT ck_cyl_capacity CHECK (capacity_m3 IS NULL OR capacity_m3 > 0),
    CONSTRAINT ck_cyl_owner_basis
      CHECK ( (ownership_basis='CUSTOMER') OR true )   -- see trigger for full owner⇄basis rule
);
CREATE UNIQUE INDEX uq_cyl_owner_serial
    ON cylinder (owner_party_id, serial_number) WHERE deleted_at IS NULL;
CREATE INDEX ix_cyl_serial_trgm ON cylinder USING gin (serial_number gin_trgm_ops);
CREATE INDEX ix_cyl_state       ON cylinder (state);
CREATE INDEX ix_cyl_owner       ON cylinder (owner_party_id);
CREATE INDEX ix_cyl_battery     ON cylinder (battery_id);
CREATE INDEX ix_cyl_gas         ON cylinder (gas_code);
```

**Why:** identity is **`(owner_party_id, serial_number)`** — resolves the legacy cross-owner serial collision `» observed`. `state`/`condition` make stock counts state-derived (no manual tallies). Trigram on serial supports partial-serial field lookups. The owner⇄ownership-basis consistency (OURS⇒is_self owner, SUPPLIER⇒supplier owner, CUSTOMER⇒customer owner) is enforced by trigger because it spans a join to `party`.

### 4.2 `cylinder_battery` + `battery_member`

```sql
CREATE TABLE cylinder_battery (
    id           bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    battery_code citext NOT NULL,                  -- '11002','2811','2625'
    owner_party_id bigint NOT NULL REFERENCES party(id),
    gas_code     text REFERENCES gas_type(code),   -- 'bat O2','bat atal'
    member_count smallint,
    state        cylinder_state NOT NULL DEFAULT 'IN_STOCK_EMPTY',
    version      integer NOT NULL DEFAULT 1,
    deleted_at   timestamptz
);
CREATE UNIQUE INDEX uq_battery_code ON cylinder_battery(owner_party_id, battery_code) WHERE deleted_at IS NULL;

CREATE TABLE battery_member (
    battery_id   bigint NOT NULL REFERENCES cylinder_battery(id),
    cylinder_id  bigint NOT NULL REFERENCES cylinder(id),
    added_at     timestamptz NOT NULL DEFAULT now(),
    removed_at   timestamptz,
    PRIMARY KEY (battery_id, cylinder_id)
);
CREATE UNIQUE INDEX uq_member_one_active_battery
    ON battery_member (cylinder_id) WHERE removed_at IS NULL;
```

**Why:** `11002 bat` lists 8 member serials in its header `» observed`. `uq_member_one_active_battery` enforces **BR-13** — a cylinder belongs to at most one active battery and can't circulate independently while packed.

### 4.3 `accessory` + `rental_rate` + `delivery_note`

```sql
CREATE TABLE accessory (
    id            bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    accessory_type accessory_type NOT NULL,
    identifier    text,                            -- e.g. mochila serial '101294'
    owner_party_id bigint NOT NULL REFERENCES party(id),
    state         accessory_state NOT NULL DEFAULT 'IN_STOCK',
    version       integer NOT NULL DEFAULT 1,
    deleted_at    timestamptz
);
CREATE UNIQUE INDEX uq_accessory_ident ON accessory(accessory_type, identifier)
    WHERE identifier IS NOT NULL AND deleted_at IS NULL;

CREATE TABLE delivery_note (                       -- Remito
    id           bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    remito_number text NOT NULL,
    kind         delivery_note_kind NOT NULL DEFAULT 'DELIVERY',
    issued_date  date,
    client_party_id bigint REFERENCES client(party_id),
    CONSTRAINT uq_remito UNIQUE (remito_number)
);
CREATE INDEX ix_remito_client ON delivery_note(client_party_id);
CREATE INDEX ix_remito_kind ON delivery_note(kind);

CREATE TABLE rental_rate (                         -- effective-dated rates (rate history)
    id            bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    client_party_id bigint REFERENCES client(party_id),  -- NULL = default rate
    gas_code      text REFERENCES gas_type(code),        -- NULL = any gas
    capacity_m3   numeric(5,2),                          -- NULL = any size; magnitude in capacity_unit
    capacity_unit capacity_unit NOT NULL DEFAULT 'M3',
    period        rate_period NOT NULL DEFAULT 'DAILY',
    amount        numeric(14,2) NOT NULL CHECK (amount >= 0),
    effective_from date NOT NULL,
    effective_to   date,
    CONSTRAINT ck_rate_range CHECK (effective_to IS NULL OR effective_to >= effective_from),
    CONSTRAINT ck_rate_capacity CHECK (capacity_m3 IS NULL OR capacity_m3 > 0)
);
CREATE INDEX ix_rate_lookup ON rental_rate (client_party_id, gas_code, capacity_m3, capacity_unit, effective_from DESC);
```

**Why `rental_rate` is effective-dated:** rates change (`$85/día`, `ALQ $333,33` `» observed`) and past invoices must reprice at the **rate that was in force**; storing `effective_from/to` gives correct back-dated billing without mutating history.

---

## 5. Transactional Core

### 5.1 `movement_event` — the heart of the system

```sql
CREATE TABLE movement_event (
    id              bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    request_id      uuid NOT NULL DEFAULT gen_random_uuid(),   -- idempotency (offline sync)
    cylinder_id     bigint NOT NULL REFERENCES cylinder(id),
    holder_party_id bigint NOT NULL REFERENCES party(id),      -- the client/patient holding it
    movement_kind   movement_kind NOT NULL,                    -- RENTAL | REFILL
    property_basis  ownership_basis NOT NULL,                  -- OURS | SUPPLIER | CUSTOMER
    gas_code        text REFERENCES gas_type(code),
    delivery_date   date NOT NULL,                             -- ENTREGA (or 'vacío' in)
    return_date     date,                                      -- DEVOLUCIÓN (or 'lleno' out)
    rental_days     integer GENERATED ALWAYS AS (return_date - delivery_date) STORED,
    origin_party_id bigint REFERENCES party(id),               -- node origin (e.g. 'Buroni')
    swap_with_cyl_id bigint REFERENCES cylinder(id),           -- returned a different serial
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
    CONSTRAINT ck_move_kind_basis CHECK ( (movement_kind='REFILL') = (property_basis='CUSTOMER') ),
    CONSTRAINT ck_move_closed     CHECK ( state <> 'CLOSED' OR return_date IS NOT NULL )
);
```

**Indexes / uniqueness**

```sql
-- Single-custody (BR-01): at most one OPEN cycle per cylinder
CREATE UNIQUE INDEX uq_move_one_open ON movement_event (cylinder_id) WHERE state = 'OPEN';

-- Stronger option (also blocks historical overlaps) — requires btree_gist:
ALTER TABLE movement_event ADD CONSTRAINT ex_move_no_overlap
  EXCLUDE USING gist (
     cylinder_id WITH =,
     daterange(delivery_date, COALESCE(return_date, 'infinity'::date), '[)') WITH &&
  ) WHERE (state <> 'VOID');

CREATE INDEX ix_move_cyl_date    ON movement_event (cylinder_id, delivery_date);      -- cylinder history
CREATE INDEX ix_move_holder_date ON movement_event (holder_party_id, delivery_date);  -- client account
CREATE INDEX ix_move_open_holder ON movement_event (holder_party_id)
                                   WHERE return_date IS NULL AND state='OPEN';         -- outstanding per client
CREATE INDEX ix_move_open_all    ON movement_event (delivery_date)
                                   WHERE return_date IS NULL AND state='OPEN';         -- global float/aging
CREATE INDEX ix_move_deliverdate ON movement_event (delivery_date);                   -- date range / pruning
CREATE INDEX ix_move_remito      ON movement_event (remito_id);
CREATE INDEX ix_move_gas         ON movement_event (gas_code);
```

**Why the key choices:**

- **`rental_days` is a `GENERATED … STORED` column** = `return_date − delivery_date`. **This is the fix for the legacy formula that produced 429/352 ERROR cells** `» observed`. It can never error: when `return_date` is NULL it is simply NULL, and the app computes _accrued_ days (`today − delivery_date`) for open rentals at query time.
- **`uq_move_one_open`** (partial unique) enforces **single-custody (BR-01)** cheaply: a cylinder can have many historical rows but only one `OPEN`. The **exclusion constraint** is the stronger alternative — it also forbids overlapping historical intervals and uses half-open ranges (`[)`) so a **same-day return-and-redeliver** (medical `» observed`) does **not** falsely conflict.
- **`ck_move_kind_basis`** enforces **BR-08**: REFILL ⇔ CUSTOMER (customer-owned refills), everything else is rental. So the DB itself guarantees rental never attaches to a client's own cylinder.
- **`origin_party_id`** replaces the legacy "text-in-the-date-cell" hack (`buroni` `» observed`) that broke the day formula — origins are structured FKs now.
- **`request_id UNIQUE`** gives **idempotent** writes so an offline driver's retried sync can't create duplicate movements.
- **No `deleted_at`** on this table: corrections use the `VOID` state (append-only semantics), so the audit/history stays truthful. Upper-bound date plausibility (`≤ today+30d`) is a **trigger**, not a CHECK, because `CURRENT_DATE` is not IMMUTABLE.

### 5.2 `cylinder_sale`

```sql
CREATE TABLE cylinder_sale (
    id            bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    cylinder_id   bigint NOT NULL REFERENCES cylinder(id),
    client_party_id bigint REFERENCES client(party_id),
    sale_date     date NOT NULL,
    gas_code      text REFERENCES gas_type(code),
    capacity_m3   numeric(5,2),
    capacity_unit capacity_unit NOT NULL DEFAULT 'M3',
    price         numeric(14,2) CHECK (price IS NULL OR price >= 0),
    address_snapshot text, locality_snapshot text, phone_snapshot text,
    note          text,
    created_at timestamptz NOT NULL DEFAULT now(), created_by bigint,
    version    integer NOT NULL DEFAULT 1
);
CREATE UNIQUE INDEX uq_sale_cylinder ON cylinder_sale (cylinder_id);  -- a cylinder is sold once
CREATE INDEX ix_sale_client ON cylinder_sale (client_party_id);
CREATE INDEX ix_sale_date   ON cylinder_sale (sale_date);
```

**Why:** the `CILINDROS VENDIDOS` sheet captures date/serial/client/gas/size/address `» observed`. `uq_sale_cylinder` guarantees a cylinder is sold **once** (terminal, BR-06/BR-09). Address/phone are **snapshots** because the client's current data may differ from what applied at sale time.

### 5.3 `supplier_loan_cycle`

```sql
CREATE TABLE supplier_loan_cycle (
    id            bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    cylinder_id   bigint NOT NULL REFERENCES cylinder(id),
    supplier_party_id bigint NOT NULL REFERENCES party(id),
    client_party_id bigint REFERENCES client(party_id),
    gas_code      text REFERENCES gas_type(code),
    received_from_supplier date,
    delivered_to_client    date,
    returned_by_client     date,
    returned_to_supplier   date,
    stage         loan_stage NOT NULL DEFAULT 'RECEIVED',
    version       integer NOT NULL DEFAULT 1,
    CONSTRAINT ck_loan_order CHECK (
        (delivered_to_client IS NULL OR received_from_supplier IS NULL OR delivered_to_client >= received_from_supplier)
    AND (returned_by_client  IS NULL OR delivered_to_client   IS NULL OR returned_by_client  >= delivered_to_client)
    AND (returned_to_supplier IS NULL OR returned_by_client   IS NULL OR returned_to_supplier >= returned_by_client)
    )
);
CREATE INDEX ix_loan_supplier ON supplier_loan_cycle (supplier_party_id, stage);
CREATE INDEX ix_loan_open ON supplier_loan_cycle (received_from_supplier)
    WHERE returned_to_supplier IS NULL;   -- "supplier assets to return" report
```

**Why:** the `NORDELTA` sheet records the exact four-date round-trip `» observed`. `ck_loan_order` enforces **BR-11** monotonic stages; the partial index drives the overdue-supplier-return worklist.

### 5.4 `stock_transfer` (inter-node)

```sql
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
```

**Why:** movements between hubs/sub-distributors (`HAY QUE DEVOLVER A BURONI`, Ceres dispositions `» observed`) are a distinct concept from client rentals; a dedicated table keeps `movement_event` focused on customer circulation.

### 5.5 `accessory_rental`

```sql
CREATE TABLE accessory_rental (
    id            bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    accessory_id  bigint NOT NULL REFERENCES accessory(id),
    client_party_id bigint NOT NULL REFERENCES client(party_id),
    quantity      smallint NOT NULL DEFAULT 1 CHECK (quantity >= 1),
    start_date    date NOT NULL,
    end_date      date,
    charge_basis  charge_basis NOT NULL DEFAULT 'RENTAL',
    remito_id     bigint REFERENCES delivery_note(id),
    state         accessory_rental_state NOT NULL DEFAULT 'ON_LOAN',
    note          text,
    version       integer NOT NULL DEFAULT 1,
    CONSTRAINT ck_acc_dates CHECK (end_date IS NULL OR end_date >= start_date)
);
CREATE UNIQUE INDEX uq_acc_one_open ON accessory_rental (accessory_id) WHERE state = 'ON_LOAN';
CREATE INDEX ix_acc_client_open ON accessory_rental (client_party_id) WHERE state='ON_LOAN';
```

**Why:** regulators/adapters/mochilas are rented or free-loaned `» observed` (51× regulator rentals in Chacabuco). `uq_acc_one_open` stops the same unit being on two loans; the partial client index drives the "accessory not recovered" block on account closure (BR-10).

---

## 6. Billing (lightweight; accounting is external)

```sql
CREATE TABLE invoice (
    id            bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    client_party_id bigint NOT NULL REFERENCES client(party_id),
    period_start  date NOT NULL,
    period_end    date NOT NULL,
    status        invoice_status NOT NULL DEFAULT 'DRAFT',
    total         numeric(14,2) NOT NULL DEFAULT 0,
    created_at timestamptz NOT NULL DEFAULT now(),
    version    integer NOT NULL DEFAULT 1,
    CONSTRAINT ck_inv_period CHECK (period_end >= period_start)
);
CREATE UNIQUE INDEX uq_invoice_client_period ON invoice(client_party_id, period_start, period_end)
    WHERE status <> 'CANCELLED';
CREATE INDEX ix_invoice_status ON invoice(status);

CREATE TABLE charge_line (
    id            bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    invoice_id    bigint NOT NULL REFERENCES invoice(id) ON DELETE CASCADE,
    source_table  text NOT NULL,                  -- 'movement_event','accessory_rental','cylinder_sale'
    source_id     bigint NOT NULL,                -- traceability back to the physical event
    description   text NOT NULL,
    quantity      numeric(14,2) NOT NULL,         -- rental days or gas units
    unit          text NOT NULL,                  -- 'días','m³','unidad'
    unit_price    numeric(14,2) NOT NULL,
    amount        numeric(14,2) NOT NULL
);
CREATE INDEX ix_charge_invoice ON charge_line(invoice_id);
CREATE INDEX ix_charge_source  ON charge_line(source_table, source_id);
```

**Why:** every charge line carries `source_table/source_id` back to the physical movement — full audit from invoice → event, which the spreadsheets never had. `ON DELETE CASCADE` only on this internal child (draft invoices); nothing else cascades.

---

## 7. Authentication & Authorization

```sql
CREATE TABLE app_user (
    id           bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    username     citext NOT NULL UNIQUE,
    email        citext UNIQUE,
    password_hash text NOT NULL,
    is_active    boolean NOT NULL DEFAULT true,
    mfa_enabled  boolean NOT NULL DEFAULT false,
    last_login_at timestamptz,
    created_at timestamptz NOT NULL DEFAULT now(),
    version    integer NOT NULL DEFAULT 1,
    deleted_at timestamptz
);

CREATE TABLE role (
    id    bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    code  text NOT NULL UNIQUE,                    -- 'CLERK','DRIVER','BILLING','ADMIN'...
    name  text NOT NULL
);

CREATE TABLE user_role (
    user_id bigint NOT NULL REFERENCES app_user(id),
    role_id bigint NOT NULL REFERENCES role(id),
    PRIMARY KEY (user_id, role_id)
);

CREATE TABLE user_territory_scope (                -- driver/sub-distributor scoping
    user_id     bigint NOT NULL REFERENCES app_user(id),
    territory_id bigint NOT NULL REFERENCES dispatch_territory(id),
    PRIMARY KEY (user_id, territory_id)
);
```

**Why:** RBAC + optional **territory scoping** (a driver sees only their route). `app_user.id` is the FK target for every `created_by`/`updated_by` and the audit actor.

---

## 8. Audit, History, Exceptions, Alerts

### 8.1 `audit_log` (append-only, partitioned by month)

```sql
CREATE TABLE audit_log (
    id           bigint GENERATED ALWAYS AS IDENTITY,
    occurred_at  timestamptz NOT NULL DEFAULT now(),
    actor_user_id bigint,
    actor_role   text,
    action       audit_action NOT NULL,
    entity_table text NOT NULL,
    entity_id    bigint,
    before       jsonb,
    after        jsonb,
    request_id   uuid,
    source       text,                             -- 'web','mobile','migration','scheduler'
    PRIMARY KEY (id, occurred_at)
) PARTITION BY RANGE (occurred_at);

CREATE INDEX ix_audit_entity ON audit_log (entity_table, entity_id, occurred_at DESC);
CREATE INDEX ix_audit_actor  ON audit_log (actor_user_id, occurred_at DESC);
-- monthly partitions, e.g.:
-- CREATE TABLE audit_log_2026_07 PARTITION OF audit_log
--   FOR VALUES FROM ('2026-07-01') TO ('2026-08-01');
```

**Why:** a **single generic** audit table (JSONB `before`/`after`) captures every mutation from one set of triggers — no per-table audit code. **Append-only** is enforced by `REVOKE UPDATE, DELETE ON audit_log FROM app_role;` so history is tamper-resistant. It is **partitioned monthly** because it is the fastest-growing table and old months can be detached/archived cheaply.

### 8.2 History (temporal / SCD-2) for mutable master data

```sql
CREATE TABLE client_history (LIKE client INCLUDING ALL);
ALTER TABLE client_history
    ADD COLUMN history_id  bigint GENERATED ALWAYS AS IDENTITY,
    ADD COLUMN valid_from  timestamptz NOT NULL DEFAULT now(),
    ADD COLUMN valid_to    timestamptz,
    ADD COLUMN change_op   audit_action NOT NULL;
CREATE INDEX ix_client_hist ON client_history (party_id, valid_from DESC);

CREATE TABLE cylinder_history (LIKE cylinder INCLUDING ALL);
ALTER TABLE cylinder_history
    ADD COLUMN history_id bigint GENERATED ALWAYS AS IDENTITY,
    ADD COLUMN valid_from timestamptz NOT NULL DEFAULT now(),
    ADD COLUMN valid_to   timestamptz,
    ADD COLUMN change_op  audit_action NOT NULL;
CREATE INDEX ix_cyl_hist ON cylinder_history (id, valid_from DESC);
```

**Why history tables in addition to audit_log:** `audit_log` answers "who changed what/when"; **history tables answer "what did this client/cylinder look like on date X"** in queryable, typed columns (e.g., which territory/rate/owner applied at the time of a past movement). A `BEFORE UPDATE/DELETE` trigger closes the current version (`valid_to = now()`) and inserts the prior image. Reserved for **mutable master data** (client, cylinder, rate); transactional tables don't need it (they're already event logs).

### 8.3 `migration_exception`, `alert`

```sql
CREATE TABLE migration_exception (
    id        bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    workbook  text NOT NULL, sheet text, row_ref text,
    raw       jsonb NOT NULL,                      -- original cells
    reason    text NOT NULL,                       -- 'impossible date','ERROR cell','text-in-date','orphan serial'
    status    exception_status NOT NULL DEFAULT 'OPEN',
    created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX ix_migex_status ON migration_exception(status);

CREATE TABLE alert (
    id        bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    alert_type text NOT NULL,                      -- 'LONG_OUTSTANDING','SUPPLY_GAP','SUPPLIER_OVERDUE'...
    entity_table text, entity_id bigint,
    severity  smallint NOT NULL DEFAULT 3,
    created_at timestamptz NOT NULL DEFAULT now(),
    resolved_at timestamptz,
    assigned_role text
);
CREATE INDEX ix_alert_open ON alert (alert_type) WHERE resolved_at IS NULL;
```

**Why:** migration must quarantine the legacy dirt (2047/2048 dates, ERROR cells, `buroni`-in-date `» observed`) instead of aborting; `alert` persists the worklists (`VER N°`, overdue returns `» observed`).

---

## 9. Cross-Cutting Recommendations (with rationale)

### 9.1 Partitioning

- **`audit_log`: RANGE by `occurred_at` (monthly).** **Why:** it grows unbounded and fastest; monthly partitions make retention/archival a metadata `DETACH`, and pruning speeds time-boxed audit queries.
- **`movement_event`: keep as a single table for now; partition later by RANGE on `delivery_date` (yearly) when it exceeds ~10–20M rows.** **Why:** today it's ~180k rows `» observed` — partitioning would add cost with no benefit and, more importantly, **would break the single-custody partial-unique index** (`uq_move_one_open`), since a unique index on a partitioned table must include the partition key. **Migration path:** when partitioning becomes necessary, move single-custody enforcement to a tiny **`cylinder_open_holding(cylinder_id PK, movement_id)`** current-state table (maintained by trigger), which keeps an O(1) unique guarantee independent of the historical table's partitions.
- **Do not partition master data** (client/cylinder/party): small and heavily FK-referenced.

### 9.2 Indexes

- **Partial indexes for "open/outstanding"** (`WHERE return_date IS NULL AND state='OPEN'`). **Why:** the hottest operational queries are "what's still out per client" and "aging float" `» observed`; a partial index is tiny (only open rows) and extremely fast.
- **Composite `(entity, date)` indexes** for the two dominant read paths: cylinder history `(cylinder_id, delivery_date)` and client account `(holder_party_id, delivery_date)` — mirroring the two legacy books.
- **Trigram GIN** on `party.display_name` and `cylinder.serial_number`. **Why:** fuzzy client-name search (near-duplicates) and partial-serial lookup.
- **Covering/lookup index** on `rental_rate (client, gas, capacity, effective_from DESC)` for point-in-time rate resolution.
- Index every **FK column** used in joins/filters (done above). Avoid over-indexing write-hot tables beyond these.

### 9.3 Audit tables

- **One generic, append-only `audit_log`** fed by a shared trigger function attached to every business table. **Why:** uniform coverage, zero per-table boilerplate, JSONB diff, and DB-level immutability (`REVOKE UPDATE/DELETE`). Directly remedies the legacy "overwrite-in-place, no trace" flaw.

### 9.4 Soft delete

- **`deleted_at timestamptz` on master data** (party, client, cylinder, battery, accessory, app_user) with **partial unique indexes** (`WHERE deleted_at IS NULL`) and read views that hide deleted rows. **Why:** these rows are referenced by years of history; hard delete would orphan movements. Soft delete preserves referential integrity and is reversible.
- **No soft delete on `movement_event`, `cylinder_sale`, `supplier_loan_cycle`, `audit_log`.** **Why:** these are the ledger. Corrections use the **`VOID` state** (append-only), so the financial/asset history is never silently altered — the opposite of the legacy behavior.

### 9.5 History tables

- **SCD-2 history tables for client/cylinder/rate** via `BEFORE UPDATE/DELETE` triggers (`valid_from/valid_to`). **Why:** to reconstruct "what was true at the time" (territory, owner, rate) for a movement dated years ago — essential for correct historical reporting and dispute resolution.

### 9.6 Optimistic locking

- **`version integer` on every mutable row**, bumped by a trigger on UPDATE; the application updates with `... WHERE id=:id AND version=:expected` and treats 0 rows affected as a **conflict (HTTP 409)**. **Why:** the field app works **offline** and syncs later `» observed` (medical near-daily edits); two operators can touch the same client/cylinder. Optimistic locking avoids long-held DB locks while preventing lost updates — pessimistic locking would be untenable for offline mobile.

---

## 10. Business-Rule → Constraint Traceability

| Rule (from `sdd.md`)       | Enforcement in this schema                                         |
| -------------------------- | ------------------------------------------------------------------ |
| BR-01 Single custody       | `uq_move_one_open` partial unique / `ex_move_no_overlap` exclusion |
| BR-02 Cylinder identity    | `uq_cyl_owner_serial`                                              |
| BR-03 Rental days computed | `movement_event.rental_days` GENERATED STORED                      |
| BR-04 Date monotonicity    | `ck_move_dates`, `ck_loan_order`, `ck_acc_dates`, `ck_rate_range`  |
| BR-05 Plausible dates      | `ck_move_lowerdate` (CHECK) + upper-bound trigger                  |
| BR-06 Terminal exclusivity | `uq_sale_cylinder` + state machine + triggers                      |
| BR-08 Refill⇔Customer      | `ck_move_kind_basis`                                               |
| BR-09 Sale precondition    | trigger (no OPEN movement) + `uq_sale_cylinder`                    |
| BR-10 Accessory recovery   | `uq_acc_one_open` + closure trigger                                |
| BR-11 Supplier loop order  | `ck_loan_order`                                                    |
| BR-13 Battery integrity    | `uq_member_one_active_battery`                                     |
| BR-14 Structured origin    | `movement_event.origin_party_id` FK (no text-in-date)              |
| BR-15 Controlled vocab     | ENUM types + `gas_type`/`gas_alias`                                |
| BR-16 Single-event posting | one `movement_event` row (no dual books)                           |
| BR-17 CUIT validity        | `ck_client_cuit_format` + `cuit_valid` + `uq_client_cuit`          |
| BR-19 Rate application     | `rental_rate` effective-dated lookup                               |
| BR-20 Outstanding = open   | `return_date IS NULL` + partial indexes                            |

---

### Summary of the decisive choices

1. **One `movement_event` table** with a **generated `rental_days`** column ends both the dual-posting and the ERROR-cell problems in one stroke.
2. **`(owner, serial)` identity** and a **`party` supertype** cleanly model the multi-owner cylinder pool (ours / Linde / Intergas / Nordelta / DSJ / customer) the spreadsheets only hinted at with inline text.
3. **Partial-unique / exclusion constraints** turn the previously-unenforceable business invariants (single custody, one open loan) into hard database guarantees.
4. **Append-only ledger + soft-deleted master data + SCD-2 history + generic audit + optimistic version** give full traceability and safe concurrency for an offline-capable, multi-user replacement of a fragile single-operator spreadsheet.
