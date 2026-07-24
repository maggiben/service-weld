# Remito Management System — Architecture Specification

> Status: **DRAFT — for approval**. Scope: redesign the current thin `delivery_note` reference registry into a production-grade **Remito** (delivery note) subsystem for an industrial gas company that rents and delivers cylinders.
>
> This document is the architecture specification. **No code is delivered here.** After approval it will be split into numbered implementation specs under `specs/` (candidate: `015-remito-system.md` … `018-*`) and executed incrementally per the milestones in §25.
>
> Conventions: `MUST` / `SHOULD` / `MAY` per RFC 2119. Requirements are numbered `R-nn`, constraints `C-nn`, non-functional `NFR-nn`. Cross-references: `BR-nn` (business rules, `specs/001`), `D-nn` (ADRs, `specs/DECISIONS.md`), `Wnn` (workflow steps). This spec must stay consistent with `specs/001`–`014`; on conflict, the numbered `specs/` and `DECISIONS.md` win until updated.

---

## Table of contents

1. [Business goals & context](#1-business-goals--context)
2. [Glossary & terminology](#2-glossary--terminology)
3. [Current state & gap analysis](#3-current-state--gap-analysis)
4. [Target architecture overview](#4-target-architecture-overview)
5. [Remito lifecycle (state machine)](#5-remito-lifecycle-state-machine)
6. [Warehouse picking](#6-warehouse-picking)
7. [Remito types](#7-remito-types)
8. [Domain model — header, lines, sub-entities](#8-domain-model)
9. [Fleet assignment (truck / driver / helper / times)](#9-fleet-assignment)
10. [Cylinder tracking & traceability](#10-cylinder-tracking--traceability)
11. [Scanning (QR / barcode / serial)](#11-scanning-qr--barcode--serial)
12. [Geolocation checkpoints](#12-geolocation-checkpoints)
13. [Signatures, photos & proof of delivery](#13-signatures-photos--proof-of-delivery)
14. [Rental automation chain](#14-rental-automation-chain)
15. [Printable document (PDF) & reprints](#15-printable-document-pdf--reprints)
16. [Mobile / field experience (offline)](#16-mobile--field-experience-offline)
17. [Incident management](#17-incident-management)
18. [Audit](#18-audit)
19. [Reports](#19-reports)
20. [Search](#20-search)
21. [Permissions (RBAC)](#21-permissions-rbac)
22. [REST API](#22-rest-api)
23. [Database schema](#23-database-schema)
24. [Non-functional requirements](#24-non-functional-requirements)
25. [Implementation phases (milestones)](#25-implementation-phases-milestones)
26. [Open questions & decisions to ratify](#26-open-questions--decisions-to-ratify)
27. [Changelog vs. prior draft](#27-changelog-vs-prior-draft)

---

## 1. Business goals & context

### 1.1 Purpose

The **Remito** is the operational document that accompanies every physical movement of cylinders and accessories. It is used by **warehouse, dispatch, truck drivers, customers, administration, and accounting**. The redesign makes the remito the **single operational source of truth** for what physically left a warehouse, what was delivered, what was returned, who signed for it, and what was subsequently invoiced.

Today (see §3) the remito is a thin external reference (`remito_number` + `kind` + client), with operational truth spread across `movement_event` and `accessory_rental`. The target promotes the remito to a **first-class Aggregate Root** (§4.1) with its own lines, picking state, fleet assignment, geolocation checkpoints, signatures, photos, incidents, and — on confirmation/close — automatic side effects: inventory movements, cylinder location updates, rental open/close, and complete audit — while keeping cylinder custody truth in `movement_event` (BR-16: exactly one stored event per physical movement).

### 1.2 Business goals

- **G-1** Remito is the source of truth of every physical movement (delivery, return, transfer, adjustment, pickup, rental).
- **G-2** End-to-end traceability of every cylinder: previous/current owner, location, truck, customer, dates, last remito, inspections, hydro test, certification expiry.
- **G-3** Legally-sound proof of delivery: signatures (driver + customer), phased photos (before/during/after), identity, timestamp, GPS checkpoints.
- **G-4** Field operations work **offline** and sync reliably; no delivery is lost due to connectivity.
- **G-5** Clean handoff to billing/accounting: a remito, once closed, becomes invoiceable with an auditable trail; rental open/close is automatic from remito confirmation (§14); rental-day billing remains owned by `specs/009` (DRY).
- **G-6** Operational visibility: warehouse picking lists, dispatchers plan trucks/helpers/routes/ETAs, managers see productivity, incidents, pending deliveries, and rental balances.
- **G-7** Preserve existing invariants and conventions (single-custody, territory scoping D-2, capability RBAC, additive migrations, ≥80% coverage gate).
- **G-8** Eliminate manual typing errors via mandatory scan of QR / barcode / serial before load and delivery.
- **G-9** Fiscal-style document numbering by emission point (e.g. `A-00001234`) and controlled reprint copies (Original / Duplicado / Triplicado / Reimpresión #N).

### 1.3 Actors

| Actor             | Primary role code(s)                 | Uses remito to…                                                                  |
| ----------------- | ------------------------------------ | -------------------------------------------------------------------------------- |
| Warehouse / plant | `INVENTORY`, `PLANT`                 | Pick, stage, scan, mark picking complete, load onto truck                        |
| Dispatcher        | `CLERK` (+ dispatch capability)      | Create, plan, assign truck / driver / helper / route / ETA                       |
| Truck driver      | `DRIVER`                             | Execute route, scan, capture geo/photos/signature, mark delivered, log incidents |
| Helper (ayudante) | `DRIVER` or dedicated helper profile | Assist load/unload; recorded on remito, may share field device                   |
| Customer          | (`CLIENT`, not granted in v1 — D-1)  | Receive goods, sign, receive PDF                                                 |
| Administration    | `MANAGER`, `ADMIN`                   | Oversight, corrections, cancellations, reporting                                 |
| Accounting        | `BILLING`                            | Consume closed remitos, monthly rental invoices, reconcile                       |
| Read-only         | `MANAGER` (read scope)               | View without mutating                                                            |

---

## 2. Glossary & terminology

- **Remito** — the delivery note document (Spanish _remito_). Terminology per `specs/001`: remito = delivery note.
- **Header** — the remito's top-level record (§8.1).
- **Line / detail** — a single item row on a remito (a cylinder, accessory, or battery reference) (§8.2).
- **Movement event** — the existing central transactional record of a cylinder custody change (`movement_event`), one per physical movement (BR-16). Remito lines that concern cylinders **reference** movement events; they do not replace them.
- **Custody / holder** — the party currently responsible for a cylinder (`movement_event.holder_party_id`).
- **Party** — supertype for client, owner, supplier, sub-distributor (`party`).
- **Warehouse / depot** — a physical stock location. **New entity** (does not exist today; see §3, §8.4).
- **Truck / vehicle** — a delivery vehicle. **New entity**.
- **Driver** — personnel who operate trucks. Modeled as a `party`/`user` with role `DRIVER`, linked to a driver profile (§8.4, §9).
- **Helper (ayudante)** — second crew member on the truck; optional `helper_id` on remito/route (§9).
- **Route** — an ordered plan of stops for a truck on a date. **New entity**.
- **Picking** — warehouse sub-process that prepares the remito lines for loading (§6).
- **Emission point / series** — fiscal-style numbering prefix per branch/punto de emisión (e.g. `A`, `B`, `CH`) producing numbers like `A-00001234` (§8.6).
- **Reprint copy** — controlled PDF copy type: Original, Duplicado, Triplicado, or numbered reimpresión with reason (§15).
- **Territory** — dispatch territory (`dispatch_territory`, e.g. Junín, Chacabuco, Ceres), used for RBAC scoping (D-2).

---

## 3. Current state & gap analysis

### 3.1 What exists today

- `delivery_note` table: `id`, `remito_number` (unique), `kind` (`DELIVERY|RETURN`), `issued_date`, `client_party_id`. No line-item table; movements/rentals link back via FK (`movement_event.remito_id`, `accessory_rental.remito_id`).
- `resolveDeliveryNote()` **find-or-create** helper used implicitly by movement and accessory creation; `kind` always defaults to `DELIVERY`.
- API: `GET /delivery-notes`, `POST /delivery-notes`, `GET /delivery-notes/{id}`; capabilities `delivery_notes:read|write`. No PATCH/DELETE, no lifecycle.
- Web: `DeliveryNotesPage.tsx` (DataGrid list, create drawer, detail drawer). No `deliveryNoteLogic.ts`.
- Zod: `packages/schemas/src/delivery-note.ts`.
- **No** warehouse, truck, driver-profile, route, signature, attachment, incident, remito-line, or status-history entities.
- **No** audit trigger on `delivery_note` (unlike `movement_event`, `client`).
- **No** PDF/QR/barcode generation anywhere in the stack.
- Cylinder, client, gas, territory, battery, accessory models already exist and are reused.

### 3.2 Gaps to close

| Gap                                    | Target                                                            |
| -------------------------------------- | ----------------------------------------------------------------- |
| No lifecycle / status                  | Full state machine (§5) with status history                       |
| No warehouse picking workflow          | Picking sub-state machine (§6): PENDING→PREPARING→COMPLETE→LOADED |
| Only 2 types                           | 9 remito types (§7)                                               |
| No line items                          | `remito_line` table (§8.2) — Aggregate owns lines                 |
| No warehouse/truck/driver/helper/route | New entities (§8.4, §9)                                           |
| No planned/actual times                | ETA / departure / arrival timestamps (§9)                         |
| No geo checkpoints                     | Start / sign / close GPS (§12)                                    |
| No phased photo evidence               | Before / during / after + cylinder / customer site (§13)          |
| Thin scan support                      | Dedicated QR/barcode/serial scan protocol (§11)                   |
| Manual rental open/close               | Automatic Remito→Movement→Rental→Invoice chain (§14)              |
| No controlled reprints                 | Original/Duplicado/Triplicado/Reimpresión #N with reason (§15)    |
| Simple remito_number                   | Emission-point series `A-00001234` (§8.6)                         |
| No proof of delivery                   | Signatures + attachments (§13)                                    |
| No incidents                           | Incident entity (§17)                                             |
| No audit on remito                     | Trigger + status/event history (§18)                              |
| No PDF/QR/barcode                      | Server-side generation (§15)                                      |
| No offline field flow for remitos      | Field PWA remito module (§16)                                     |
| Thin RBAC                              | Granular capabilities (§21)                                       |

### 3.3 Migration & backward compatibility

- **C-1** The redesign MUST be additive to the DB per `specs/011`/`012` (additive `*.up.sql` migrations + paired `.down.sql`). No destructive rewrites of `delivery_note`.
- **C-2** Strategy: **extend** `delivery_note` in place (rename to logical Aggregate Root `remito` via a view or by adding columns; keep table name `delivery_note` to avoid breaking FKs, or add `remito`-prefixed columns). Preferred: keep `delivery_note` as the header table, **add** new columns (status, picking_status, series, branch, warehouse, driver, helper, truck, route, times, geo checkpoints, priority, soft-delete, version, timestamps) and **add** child tables (`remito_line`, `remito_status_history`, `remito_signature`, `remito_attachment`, `remito_incident`, `remito_geo_event`, `remito_print_log`, `remito_scan_event`). Existing FKs (`movement_event.remito_id`, `accessory_rental.remito_id`) remain valid.
- **C-3** Existing rows backfill to `status = 'CLOSED'` (historical) or a dedicated `LEGACY` state; existing `kind` maps into the new `type` enum (`DELIVERY`→`DELIVERY`, `RETURN`→`CYLINDER_RETURN`).
- **C-4** `resolveDeliveryNote()` find-or-create continues to work for legacy implicit linking, but new flows create remitos explicitly with full header data; implicit creation SHOULD be deprecated behind a feature flag once the redesign ships.
- **C-5** All existing endpoints keep working; new endpoints are additive under `/remitos` (alias) while `/delivery-notes` is retained until the web app migrates, then deprecated (documented in `specs/004`).

---

## 4. Target architecture overview

Aligns with the existing layered architecture:

```
┌───────────────────────────────────────────────────────────────────────┐
│  apps/web (Next.js 16 back-office)     apps/field (Next.js PWA, offline) │
│  - Remito pages, drawers, PDF preview  - Route, scan, sign, photos, sync │
│  - remitoLogic.ts (view/form helpers)  - IndexedDB queue (idb-keyval)    │
└───────────────────────────────┬───────────────────────────────────────┘
                                 │  @weld/api-client (typed HTTP)
┌───────────────────────────────▼───────────────────────────────────────┐
│  apps/api (NestJS 11)                                                    │
│  - RemitosModule: controller + service + repository (Kysely)            │
│  - Zod DTOs (nestjs-zod) → Swagger/OpenAPI                              │
│  - CapabilitiesGuard + TransactionInterceptor (audit GUCs, D-2 scope)   │
│  - PDF service, QR/barcode service, media/upload service, sync endpoint  │
│  - pg-boss jobs: PDF render, thumbnailing, e-remito (future)            │
└───────────────────────────────┬───────────────────────────────────────┘
        @weld/domain (remito state machine, guards)  @weld/schemas (Zod)
┌───────────────────────────────▼───────────────────────────────────────┐
│  PostgreSQL 15+ (schema.sql + db/migrations, Kysely types)              │
│  - delivery_note (extended) + remito_line + status_history + signature   │
│    + attachment + incident + warehouse + vehicle + driver_profile + route │
│  - audit_log (trigger fn_audit on new tables) + object storage refs      │
└─────────────────────────────────────────────────────────────────────────┘
```

- **R-1** Business rules (transitions, guards, numbering, picking, scan matching, rental side effects) MUST live in `@weld/domain` (framework-light) and be enforced hard by the DB where they are true invariants; controllers/services orchestrate, they do not own rules (SOLID/DRY, `engineering-principles`).
- **R-2** Transport DTOs MUST be Zod schemas in `@weld/schemas` (one source of truth shared by API, web, field, api-client), consumed via `nestjs-zod`; Swagger-emitted OpenAPI derives from them.
- **R-3** Web/field form & view helpers MUST live in `remitoLogic.ts` modules with unit tests, not copy-pasted across drawers/pages.
- **R-4** Object/media storage (photos, signatures, generated PDFs) MUST be stored in an external object store (S3-compatible) with only references/metadata in PostgreSQL. Storage provider is an open decision (§26).

### 4.1 Remito as Aggregate Root (confirmation semantics)

Industrial ERPs treat the delivery note as the **unit of consistency**, not a passive header over free-standing movements. Weld adopts that model:

- **R-4a** The **Remito Aggregate** is the write boundary for: header, lines, picking status, fleet assignment, scan events, geo events, signatures, attachments, incidents, and print log. External modules NEVER mutate remito children except through Remito application services.
- **R-4b** On **confirm / close** (`SIGNED` → `CLOSED`, or an explicit `confirm` command — see §5), the Aggregate MUST atomically:
  1. Validate all guards (scans complete, required PoD present, critical incidents triaged).
  2. **Post inventory** — create exactly one `movement_event` per cylinder line (BR-16) and link `remito_line.movement_event_id`.
  3. **Update cylinder location / custody** — holder and state derive from the posted movement (existing cylinder state machine, `specs/008`).
  4. **Open or close rental cycles** for rentable lines (§14) — feed `specs/009`; never recompute rental days inside remito.
  5. **Write audit** — status history + `fn_audit()` before/after.
- **R-4c** Until `CLOSED`, movements are **not** the source of operational truth for that delivery; the remito lines are. After `CLOSED`, remito is immutable and custody truth lives in `movement_event` with remito as the documentary parent.
- **R-4d** Domain events emitted by the Aggregate (in-process, then optionally outbox): `RemitoPrepared`, `RemitoLoaded`, `RemitoDispatched`, `RemitoDelivered`, `RemitoSigned`, `RemitoClosed`, `RemitoCancelled`, `RentalOpened`, `RentalClosed`. Handlers update projections and billing readiness; they MUST NOT invent a second custody ledger.

---

## 5. Remito lifecycle (state machine)

### 5.1 Document states

```
        ┌─────────┐
        │  DRAFT  │
        └────┬────┘
             ▼
        ┌──────────┐     ← warehouse picking (§6) runs here:
        │ PREPARED │       picking_status reaches COMPLETE
        └────┬─────┘
             ▼
        ┌───────────┐
        │ ASSIGNED  │     ← truck + driver + helper + route + ETA set (§9)
        └────┬──────┘
             ▼
        ┌──────────┐      ← picking_status MUST be LOADED
        │  LOADED  │      ← cargo verified on truck (scan gate)
        └────┬─────┘
             ▼
        ┌────────────┐
        │ IN_TRANSIT │    ← departed warehouse (departure_at + geo)
        └────┬───────┘
             ▼
        ┌────────────┐
        │ DELIVERED  │    ← goods handed over (geo at start/arrival)
        └────┬───────┘
             ▼
        ┌─────────┐
        │ SIGNED  │       ← PoD captured (signatures + photos + geo)
        └────┬────┘
             ▼
        ┌─────────┐
        │ CLOSED  │       ← Aggregate confirms: movements + rental + audit (§4.1)
        └────┬────┘
             ▼
        ┌───────────┐
        │ INVOICED  │     ← monthly / period billing linked (specs/009)
        └────┬──────┘
             ▼
        ┌───────────┐
        │ ARCHIVED  │
        └───────────┘

  CANCELLED  ← from DRAFT..IN_TRANSIT (and DELIVERED..SIGNED with elevated capability)
```

`LOADED` is added as a first-class document status so dispatch and warehouse share an unambiguous “on the truck, not yet departed” checkpoint. Warehouse picking still has its own sub-state (§6).

### 5.2 Allowed transitions & guards

| From                | To           | Trigger / capability      | Guard (MUST hold)                                                                                           |
| ------------------- | ------------ | ------------------------- | ----------------------------------------------------------------------------------------------------------- |
| —                   | `DRAFT`      | create (`remitos:write`)  | Valid header; type set                                                                                      |
| `DRAFT`             | `PREPARED`   | `remitos:prepare`         | ≥1 line; picking COMPLETE (§6); serials verified via scan where required                                    |
| `PREPARED`          | `ASSIGNED`   | `remitos:assign`          | Vehicle + driver set; scheduled ETA set; route assigned; helper optional                                    |
| `ASSIGNED`          | `LOADED`     | `remitos:load`            | `picking_status = LOADED`; load scans match all lines (§11)                                                 |
| `LOADED`            | `IN_TRANSIT` | `remitos:dispatch`        | `departure_at` set; geo checkpoint `DEPARTURE` recorded (§12)                                               |
| `IN_TRANSIT`        | `DELIVERED`  | `remitos:deliver`         | Geo `DELIVERY_START` (or arrival); delivered qtys recorded; field scans done                                |
| `DELIVERED`         | `SIGNED`     | `remitos:sign`            | Customer signature OR documented refusal; geo `SIGN`; required photo phases                                 |
| `SIGNED`            | `CLOSED`     | `remitos:close`           | Aggregate confirmation (§4.1): movements posted, rental open/close, geo `CLOSE`, critical incidents triaged |
| `CLOSED`            | `INVOICED`   | `remitos:invoice`         | Linked to invoice / billing run (`specs/009`)                                                               |
| `INVOICED`          | `ARCHIVED`   | `remitos:archive`         | Invoice finalized; retention satisfied                                                                      |
| `DRAFT..IN_TRANSIT` | `CANCELLED`  | `remitos:cancel`          | Mandatory `cancel_reason`; reverse any pre-posted effects                                                   |
| `DELIVERED..SIGNED` | `CANCELLED`  | `remitos:cancel:elevated` | Compensating movements + rental reversal + audit                                                            |

- **R-5** Transitions MUST be validated in `@weld/domain` (`remitoTransitions.ts`). Illegal transition → HTTP 409.
- **R-6** Every transition MUST write `remito_status_history` and rely on `fn_audit()` for field-level before/after.
- **R-7** `CLOSED`, `INVOICED`, `ARCHIVED` are immutable except invoice link / archival; edits require cancel + reissue.
- **R-8** Cancellation MUST require a reason; post-delivery cancellations generate compensating `movement_event`s and reverse rental open/close (BR-16).
- **R-9** Backfill: legacy rows enter as `CLOSED`/`LEGACY` and are read-only (C-3).

### 5.3 Edge cases

- **E-1** Partial delivery: per-line `delivered_qty < qty`; undelivered items → incident + follow-up remito or return-to-stock.
- **E-2** Customer absent → `CUSTOMER_ABSENT`; may stay `IN_TRANSIT` or zero-deliver; reschedule ETA or return.
- **E-3** Offline deliver/sign then sync (§16): local advance to `SIGNED`; server reconciles with `request_id`; server authoritative.
- **E-4** Reopen: only ADMIN `CLOSED`→`SIGNED` via `remitos:reopen:elevated`; not after `INVOICED`.
- **E-5** Customer pickup (`CUSTOMER_PICKUP`): may skip `ASSIGNED`/`LOADED`/`IN_TRANSIT` (depot counter flow) with type-specific transition shortcuts in domain.

---

## 6. Warehouse picking

Before the truck leaves, the depot MUST know exactly what to stage and load. Picking is a **sub-lifecycle** on the remito (`picking_status`), orthogonal to but gated by document status.

### 6.1 Picking states

```
  PENDING  →  PREPARING  →  COMPLETE  →  LOADED
```

| State       | Meaning                                                                      |
| ----------- | ---------------------------------------------------------------------------- |
| `PENDING`   | Remito drafted / waiting for warehouse                                       |
| `PREPARING` | Warehouse is pulling cylinders/accessories; line-level pick progress tracked |
| `COMPLETE`  | All lines staged and scan-verified at the dock; remito may become `PREPARED` |
| `LOADED`    | Cargo scanned onto the truck; remito may become document-status `LOADED`     |

### 6.2 Rules

- **R-78** Each remito line tracks `picked_qty`, `picked_at`, `picked_by`, and optional dock-scan `remito_scan_event` with `context = PICK`.
- **R-79** `picking_status` advances to `COMPLETE` only when every line has `picked_qty = qty` (or an explicit short-pick with incident).
- **R-80** `picking_status → LOADED` requires a load-context scan of every serialized line onto the assigned vehicle (§11). Mismatch → block + incident `WRONG_SERIAL` / `WRONG_QUANTITY`.
- **R-81** Warehouse UI MUST show a **picking list** (by remito / by route wave): gas, capacity, serial, location slot, barcode — so the depósito knows exactly what to load.
- **R-82** Capability: `remitos:pick` (INVENTORY/PLANT); `remitos:load` for LOADED transition (INVENTORY or DRIVER at dock).
- **R-83** Customer-pickup and adjustment types MAY auto-complete picking with a type-specific shortcut (still audited).

---

## 7. Remito types

- **R-10** Implement a `remito_type` enum with these values, each with type-specific validation:

| Type                 | Meaning                                           | Origin      | Destination     | Cylinder custody effect (movement_kind) |
| -------------------- | ------------------------------------------------- | ----------- | --------------- | --------------------------------------- |
| `DELIVERY`           | Deliver full cylinders to a customer              | warehouse   | customer        | `DELIVERY` (holder → customer)          |
| `CYLINDER_RETURN`    | Customer returns cylinders                        | customer    | warehouse       | `RETURN`                                |
| `ACCESSORY_RETURN`   | Return of accessories only                        | customer    | warehouse       | accessory rental state change           |
| `TRANSFER_WAREHOUSE` | Move stock between warehouses                     | warehouse A | warehouse B     | internal `TRANSFER`                     |
| `INTERNAL_TRANSFER`  | Move within warehouse / to truck as rolling stock | warehouse   | warehouse/truck | internal reallocation                   |
| `CUSTOMER_PICKUP`    | Customer collects at the depot                    | warehouse   | customer        | `DELIVERY`, no truck/route required     |
| `ADJUSTMENT`         | Inventory correction                              | warehouse   | warehouse       | elevated + reason; not invoiceable      |
| `RENTAL_PICKUP`      | Collect rented cylinders at rental end            | customer    | warehouse       | `RETURN` + rental close (§14)           |
| `RENTAL_DELIVERY`    | Deliver rented cylinders (rental start)           | warehouse   | customer        | `DELIVERY` + rental open (§14)          |

- **R-11** Type-specific required fields (domain + Zod):
  - Customer-facing types MUST have `customer_party_id` and delivery address (except pickups).
  - Transfer types MUST have distinct origin/destination warehouses; no customer.
  - `ADJUSTMENT` MUST require `remitos:adjust:elevated` + reason; not invoiceable.
  - `RENTAL_*` and any line with `is_rental = true` on `DELIVERY`/`CYLINDER_RETURN` MUST participate in the rental automation chain (§14).
- **R-12** `type` immutable after `PREPARED` (change = cancel + reissue).
- **C-6** Legacy `kind` maps: `DELIVERY`→`DELIVERY`, `RETURN`→`CYLINDER_RETURN`.

---

## 8. Domain model

Aggregate root: **Remito** composing **RemitoLine**, **RemitoStatusHistory**, **RemitoSignature**, **RemitoAttachment**, **RemitoIncident**, **RemitoGeoEvent**, **RemitoScanEvent**, **RemitoPrintLog**. Supporting: **Warehouse**, **Vehicle**, **DriverProfile**, **Route**. Reuses: `Cylinder`, `Client`/`Party`, `GasType`, `DispatchTerritory`, `Accessory`, `AccessoryRental`, `MovementEvent`, `Invoice`.

### 8.1 Remito header

| Field                                                    | Type                | Notes                                          |
| -------------------------------------------------------- | ------------------- | ---------------------------------------------- |
| `id`                                                     | bigint PK           | internal identity — **not** the printed number |
| `remito_number`                                          | text                | display number e.g. `A-00001234` (§8.6)        |
| `series_id`                                              | FK → remito_series  | emission point / punto de emisión              |
| `type`                                                   | `remito_type`       | §7                                             |
| `status`                                                 | `remito_status`     | §5                                             |
| `picking_status`                                         | `picking_status`    | §6                                             |
| `company_id`                                             | FK                  | issuing legal company                          |
| `branch_id`                                              | FK                  | issuing branch                                 |
| `origin_warehouse_id`                                    | FK → warehouse      |                                                |
| `destination_warehouse_id`                               | FK → warehouse      | transfers                                      |
| `issued_date`                                            | date                | document date                                  |
| `scheduled_delivery_at`                                  | timestamptz         | planned ETA (hora prevista)                    |
| `departure_at`                                           | timestamptz         | hora salida warehouse                          |
| `arrival_at`                                             | timestamptz         | hora llegada cliente                           |
| `delivered_at`                                           | timestamptz         | handover time                                  |
| `closed_at`                                              | timestamptz         | Aggregate confirmation time                    |
| `driver_id`                                              | FK → driver_profile | chofer                                         |
| `helper_id`                                              | FK → driver_profile | ayudante (nullable)                            |
| `vehicle_id`                                             | FK → vehicle        | camión                                         |
| `route_id`                                               | FK → route          |                                                |
| `customer_party_id`                                      | FK → client         | ship-to                                        |
| `billing_customer_party_id`                              | FK → client         | bill-to                                        |
| `delivery_address`                                       | jsonb               | snapshot at issue                              |
| `delivery_geo`                                           | point               | destination coordinates                        |
| `contact_phone`                                          | text                |                                                |
| `sales_order_ref`                                        | text                |                                                |
| `invoice_id`                                             | FK → invoice        | set at INVOICED                                |
| `observations`                                           | text                |                                                |
| `priority`                                               | `remito_priority`   |                                                |
| `territory_id`                                           | FK                  | D-2 scope                                      |
| `total_packages`                                         | int                 | total bultos (derived or entered)              |
| `total_weight_kg`                                        | numeric             | total peso if applicable                       |
| `cancel_reason`                                          | text                |                                                |
| `version`                                                | int                 | optimistic concurrency                         |
| `created_by` / `created_at` / `updated_*` / `deleted_at` |                     |                                                |

- **R-13** Address and fiscal snapshots MUST be denormalized at issue so reprints reflect historical data.

### 8.2 Remito line (detail)

| Field                                                   | Type                           | Notes                                |
| ------------------------------------------------------- | ------------------------------ | ------------------------------------ |
| `id`                                                    | bigint PK                      |                                      |
| `remito_id`                                             | FK                             | parent Aggregate                     |
| `line_no`                                               | int                            |                                      |
| `item_kind`                                             | `CYLINDER\|ACCESSORY\|BATTERY` |                                      |
| `cylinder_id` / `battery_id` / `accessory_id`           | FK null                        |                                      |
| `serial_number`                                         | citext                         | snapshot                             |
| `gas_code`                                              | FK                             | snapshot                             |
| `capacity_value` / `capacity_unit`                      |                                | D-18; never convert                  |
| `owner_party_id`                                        | FK                             |                                      |
| `is_rental`                                             | boolean                        | drives §14 automation                |
| `ownership_basis`                                       | enum                           | snapshot                             |
| `qty` / `picked_qty` / `delivered_qty` / `returned_qty` | numeric                        |                                      |
| `unit`                                                  | text                           |                                      |
| `pressure`                                              | numeric                        |                                      |
| `condition`                                             | `cylinder_cond`                |                                      |
| `barcode` / `qr_code`                                   | text                           |                                      |
| `movement_event_id`                                     | FK                             | set on CLOSE (BR-16)                 |
| `accessory_rental_id`                                   | FK                             | accessory lines                      |
| `rental_cycle_ref`                                      | text/FK                        | open rental id when applicable (§14) |
| `weight_kg`                                             | numeric null                   | for totals                           |
| `notes`                                                 | text                           |                                      |
| `scanned_at`                                            | timestamptz                    | last successful scan                 |
| `deleted_at`                                            | timestamptz                    |                                      |

- **R-14** Cylinder lines link to exactly one `movement_event` once `CLOSED` (BR-16).
- **R-15** Battery lines move as a unit while retaining member identity (BR-13).
- **R-16** Serialized cylinders: `qty = 1` per line; accessories MAY be bulk.

### 8.3 Sub-entities

- **RemitoStatusHistory**, **RemitoSignature**, **RemitoAttachment**, **RemitoIncident** — enriched in §12–§17.
- **RemitoGeoEvent** — §12.
- **RemitoScanEvent** — §11.
- **RemitoPrintLog** — §15.

### 8.4 New operational entities

- **Warehouse** `(id, code, name, branch_id, territory_id, address, geo, is_active)`.
- **Vehicle** `(id, plate, name, capacity_units, capacity_weight, branch_id, is_active)`.
- **DriverProfile** `(id, user_id, party_id, license_no, license_expiry, phone, default_vehicle_id, is_helper_eligible, is_active)` — used for both chofer and ayudante.
- **Route** + **RouteStop** — ordered stops with planned ETA / arrived / completed.
- **Company** / **Branch** — fiscal entity + branch / punto de emisión (§26).

### 8.5 Value objects & enums

- **R-17** New enums (single-sourced in `@weld/schemas` + `schema.sql`, BR-15): `remito_type`, `remito_status` (incl. `LOADED`), `picking_status`, `remito_priority`, `remito_line_kind`, `signature_role`, `incident_*`, `attachment_kind` (phased), `geo_event_kind`, `scan_context`, `scan_code_kind`, `print_copy_kind`.
- **R-18** Reuse: `Capacity`, `CylinderSerialNumber`, `ownership_basis`, `cylinder_cond`, `movement_kind`, `Money(ARS)`.

### 8.6 Numbering & emission points (punto de emisión)

Do **not** print the internal `id`. Printed numbers are fiscal-style:

| Series / emission point | Example printed number |
| ----------------------- | ---------------------- |
| `A` (casa central)      | `A-00001234`           |
| `B` (sucursal)          | `B-00000155`           |
| `CH` (Chacabuco)        | `CH-00000599`          |

- **R-19** `remito_series` defines: `code` (prefix), `branch_id`, `emission_point_label`, `pad_width` (default 8), `next_number`, `doc_class`, `is_active`. Display format: `{code}-{next_number padded}`.
- **R-20** Allocation MUST be atomic (`SELECT … FOR UPDATE` on series row or DB sequence per series). Unique constraint `(series_id, remito_number)` (or on the formatted number).
- **R-21** Drafts MAY hold a provisional number and receive the definitive series number only at `PREPARED` / first print (§26 — fiscal gapless policy).
- **R-21a** Never expose bare bigint ids on printed docs, barcodes, or customer-facing QR payloads (QR may use opaque signed token + remito_number).

---

## 9. Fleet assignment

Each remito (except customer-pickup / some adjustments) SHOULD carry full crew and timing:

| Field                   | Purpose                                                |
| ----------------------- | ------------------------------------------------------ |
| `vehicle_id`            | Camión                                                 |
| `driver_id`             | Chofer                                                 |
| `helper_id`             | Ayudante (optional)                                    |
| `route_id`              | Ruta                                                   |
| `scheduled_delivery_at` | Hora prevista                                          |
| `departure_at`          | Hora salida (set on `IN_TRANSIT`)                      |
| `arrival_at`            | Hora llegada (set when delivery starts / stop arrived) |

- **R-84** Assign endpoint body MUST accept vehicle, driver, helper, route, and scheduled ETA together; partial updates allowed while `PREPARED`/`ASSIGNED`.
- **R-85** Route-level defaults (vehicle/driver/helper for the day) MAY cascade onto remitos when adding a stop; remito-level override wins.
- **R-86** Capacity check: sum of line weights / package counts vs vehicle capacity SHOULD warn; MAY hard-block if configured.
- **R-87** Driver productivity reports (§19) use scheduled vs actual departure/arrival deltas.

---

## 10. Cylinder tracking & traceability

- **R-22** Preserve: previous/current owner, warehouse, truck, customer, delivery/return dates, last remito, last inspection, hydro test, certification expiration.
- **R-23** `cylinder_inspection` table + cylinder attrs `last_hydro_test_at`, `hydro_next_due`, `cert_expires_at`.
- **R-24** Dispatch/load guards reject expired cert/hydro (medical = hard-block; others configurable).
- **R-25** Cylinder history projection: remitos + movements + inspections; no second writable custody ledger (BR-16).
- **R-26** Identity remains `(owner, serial_number)` (BR-02).

---

## 11. Scanning (QR / barcode / serial)

Phone-camera scanning is a first-class control to prevent manual typing errors — both in the warehouse (pick/load) and in the field (delivery/return).

### 11.1 What can be scanned

| Code kind | Typical use                                                    |
| --------- | -------------------------------------------------------------- |
| `QR`      | Cylinder/accessory label or remito document QR                 |
| `BARCODE` | Remito number (Code128) or cylinder barcode                    |
| `SERIAL`  | OCR / typed-fallback of serial (discouraged; capability-gated) |

### 11.2 Scan contexts

| Context   | When                | Gate                                             |
| --------- | ------------------- | ------------------------------------------------ |
| `PICK`    | Warehouse preparing | Advances `picked_qty`                            |
| `LOAD`    | Loading truck       | Required before `LOADED`                         |
| `DELIVER` | At customer         | Required before `DELIVERED` for serialized lines |
| `RETURN`  | Collecting returns  | Matches return lines                             |
| `VERIFY`  | Ad-hoc check        | No state change                                  |

- **R-88** `remito_scan_event` `(id, remito_id, line_id null, context, code_kind, raw_value, matched bool, matched_line_id, device_id, geo, scanned_by, scanned_at, request_id)`.
- **R-89** For serialized cylinder lines, a successful `LOAD` and `DELIVER` scan MUST match the expected `serial_number` / barcode / QR. Unexpected codes → incident + block transition.
- **R-90** Field and warehouse apps MUST prefer camera scan; manual serial entry requires `remitos:scan:manual` and is audited as higher-risk.
- **R-91** Remito document barcode/QR on the PDF MUST resolve to the remito for quick open in web/field.

---

## 12. Geolocation checkpoints

Persist GPS at operational milestones — critical for claims (`reclamos`).

| Kind             | When recorded                                           |
| ---------------- | ------------------------------------------------------- |
| `DEPARTURE`      | Remito / route leaves warehouse (`IN_TRANSIT`)          |
| `DELIVERY_START` | Driver starts the stop / begins handover                |
| `SIGN`           | Customer (or refusal) signature captured                |
| `CLOSE`          | Aggregate closed (device or server IP/geo if available) |
| `INCIDENT`       | Optional, with incident record                          |

- **R-92** `remito_geo_event` `(id, remito_id, kind, lat, lng, accuracy_m, captured_at, device_id, source [DEVICE|MANUAL|DERIVED])`.
- **R-93** `DELIVERED`/`SIGNED`/`CLOSED` transitions SHOULD require the corresponding geo event when the device can provide location; offline queue stores last-known fix with accuracy.
- **R-94** Destination `delivery_geo` remains the planned coordinate; geo events are actuals. Distance-from-destination MAY be shown on claims review.
- **R-95** Geo events are append-only and audited.

---

## 13. Signatures, photos & proof of delivery

### 13.1 Signatures

- **R-27** Capture `DRIVER` and `CUSTOMER` signatures (or documented refusal).
- **R-28** `remito_signature`: role, signer name, document id (DNI/CUIT), image ref, hash, timestamp, GPS, device, IP.

### 13.2 Phased photographic evidence

| `attachment_kind`    | Meaning                                          |
| -------------------- | ------------------------------------------------ |
| `BEFORE`             | Before unloading / before intervention           |
| `DURING`             | During handover / loading                        |
| `AFTER`              | After delivery completed                         |
| `CYLINDER_CONDITION` | Close-up of cylinder state (damage, seal, valve) |
| `CUSTOMER_SITE`      | Customer premises / reception area               |
| `ID_PHOTO`           | Identity document photo                          |
| `SIGNATURE`          | Signature image (if stored as attachment)        |
| `INCIDENT_PHOTO`     | Tied to an incident                              |
| `DOCUMENT`           | Other docs                                       |

- **R-29** `remito_attachment` includes `kind`, optional `line_id` / `incident_id`, object refs, mime, size, checksum, `captured_at`, geo, device.
- **R-30** Offline media queued and uploaded on sync; `SIGNED` blocked until required proof present.
- **R-31** Object storage only; virus/size/mime checks; thumbnails via `pg-boss`.
- **R-32** Signatures/photos append-only after `SIGNED`.
- **R-96** Configurable required photo set per remito type (default for delivery: at least one `BEFORE` or `CUSTOMER_SITE`, one `AFTER` or `CYLINDER_CONDITION`, plus signatures).

---

## 14. Rental automation chain

When a remito delivers or returns a **rentable** cylinder, the commercial chain MUST be automatic:

```
Remito (RENTAL_DELIVERY / DELIVERY with is_rental)
   ↓  CLOSE (Aggregate confirm)
MovementEvent  (custody — BR-16)
   ↓
Rental cycle open  (delivery_date = remito delivered_at / movement date)
   ↓
Monthly / period billing run  (specs/009 → Invoice + ChargeLine)
```

```
Remito (RENTAL_PICKUP / CYLINDER_RETURN with open rental)
   ↓  CLOSE
MovementEvent (RETURN)
   ↓
Rental cycle close  (return_date set → rental_days finalized)
   ↓
Next billing run charges closed days
```

- **R-97** On `CLOSED`, for each line with `is_rental = true` and ownership basis that accrues rental (`OURS`/`SUPPLIER` per BR-08 / `specs/009`):
  - Delivery-like types → **open** rental cycle linked to `movement_event_id` + `remito_line_id`.
  - Return-like types → **close** the open rental for that cylinder/customer; set return date.
- **R-98** Remito MUST NOT compute rental days or money; it only opens/closes the cycle. Day count and charges remain `specs/009` (DRY).
- **R-99** Accessory rentable lines similarly open/close `accessory_rental` rows.
- **R-100** `CUSTOMER`-owned / `REFILL` lines NEVER open rental (BR-08); gas fill charges follow `specs/014`.
- **R-101** Cancellation after close MUST reverse rental open/close symmetrically with compensating movements.
- **R-102** Billing UI / runs (`specs/009` W20) consume closed movements; remito provides the documentary trail and `invoice_id` link when the period invoice is approved.

---

## 15. Printable document (PDF) & reprints

### 15.1 Commercial document layout (A4)

- **R-33** Server-side A4 PDF (library choice §26).
- **R-34** MUST include:
  - Company **logo** and fiscal data (legal name, CUIT, address, IIBB).
  - **Número y punto de emisión** (`A-00001234`), type, issue date/time.
  - Customer name, **CUIT**, address; billing customer if different.
  - Fecha/hora; chofer, ayudante, vehículo (patente).
  - Cylinder table: tipo/envase, gas, capacidad+unidad, serie, estado/condición, presión, alquiler flag.
  - Accessories table.
  - **Total de bultos** and **peso** (if applicable).
  - Observations.
  - Signature blocks (cliente + chofer) — images if captured.
  - QR (ERP verify link) + barcode (remito number).
  - Legal legend (configurable).
  - Page numbering (`Página X de Y`); repeated header/footer on continuations.
- **R-35** Fit A4 margins; multi-page continuation.
- **R-36** Deterministic from snapshots; cache by `(remito_id, content_version, copy_kind)`.
- **R-37** Batch route sheets via `pg-boss`.
- **R-38** Shared QR/barcode service.

### 15.2 Controlled reprints

| `print_copy_kind` | Label on PDF   |
| ----------------- | -------------- |
| `ORIGINAL`        | ORIGINAL       |
| `DUPLICADO`       | DUPLICADO      |
| `TRIPLICADO`      | TRIPLICADO     |
| `REIMPRESION`     | REIMPRESIÓN #N |

- **R-103** Every PDF generation/print MUST append `remito_print_log` `(id, remito_id, copy_kind, reprint_seq null, reason null, printed_by, printed_at, pdf_object_ref)`.
- **R-104** `REIMPRESION` REQUIRES a non-empty `reason` and auto-increments `reprint_seq` per remito (`#1`, `#2`, `#3`…).
- **R-105** Watermark / banner MUST show copy kind and, for reprints, date + reason on each page.
- **R-106** Capability `remitos:pdf`; reprint of closed/invoiced docs MAY require `remitos:pdf:reprint`.

---

## 16. Mobile / field experience (offline)

Built into `apps/field` (Next.js PWA, MUI, `idb-keyval`).

- **R-39** Driver (and helper on shared device) MUST be able to:
  - Open assigned remitos for route/day.
  - **Scan** QR / barcode / serial with the phone camera (§11).
  - Take phased photos (§13).
  - Collect signatures.
  - Work offline and sync later.
  - View route; navigate with Google Maps to `delivery_geo`.
  - Record geo checkpoints (§12).
  - Mark delivered (incl. partial); record incidents.
- **R-40** Offline cache + durable queue with `request_id`.
- **R-41** `POST /remitos/sync` batch, idempotent.
- **R-42** Server authoritative on conflict.
- **R-43** Media uploaded opportunistically; `SIGNED` waits for required media.
- **R-44** Optimistic UI + clear sync indicator.

---

## 17. Incident management

- **R-45** Support recording incidents against a remito (and optionally a line): `CUSTOMER_ABSENT`, `CYLINDER_DAMAGED`, `WRONG_QUANTITY`, `LEAK`, `WRONG_GAS`, `WRONG_SERIAL`, `DELIVERY_REJECTED`, `LATE_DELIVERY`, `OTHER`.
- **R-46**–**R-50** Severity, status, photos, comments, resolution; critical incidents block `CLOSED`; recordable offline.

---

## 18. Audit

- **R-51** Every change to header, lines, picking, scans, geo, signatures, attachments, incidents, and print log MUST be recorded via `fn_audit()` + `remito_status_history`.
- **R-52** Capture who / when / before / after / role / source.
- **R-53** Extend GUCs with IP / device / GPS for field ops (`specs/005` additive).
- **R-54**–**R-55** Status history complements audit_log; `audit:read` for MANAGER/ADMIN.
- Fix gap: add `delivery_note` and all new child tables to the audit trigger list.

---

## 19. Reports

Base set (daily/pending deliveries, returned/delivered cylinders, cylinder history, driver/warehouse productivity, incidents, customer history, rental balance) plus:

| Report           | Contents                                    |
| ---------------- | ------------------------------------------- |
| Picking backlog  | PENDING/PREPARING by warehouse              |
| Load vs plan     | LOADED / short-picks / scan mismatches      |
| On-time delivery | scheduled vs arrival/departure              |
| Scan compliance  | % lines with required LOAD/DELIVER scans    |
| Reprint audit    | reprints by reason / user                   |
| Geo claims pack  | geo events + photos for a remito (reclamos) |

- **R-57** Rental balance derives from `specs/009` (DRY).

---

## 20. Search

Search by remito number, customer, cylinder serial, barcode, driver, **helper**, truck / plate, gas, status, **picking_status**, **emission point / series**, date range, scan raw value. Server-side, paginated, territory-scoped (D-2).

---

## 21. Permissions (RBAC)

| Capability                                                             | Purpose                    |
| ---------------------------------------------------------------------- | -------------------------- |
| `remitos:read`                                                         | List/view                  |
| `remitos:write`                                                        | Create/edit drafts         |
| `remitos:pick`                                                         | Picking PENDING→…→COMPLETE |
| `remitos:prepare`                                                      | DRAFT→PREPARED             |
| `remitos:assign`                                                       | Fleet / route / ETA        |
| `remitos:load`                                                         | → LOADED                   |
| `remitos:dispatch`                                                     | → IN_TRANSIT               |
| `remitos:deliver` / `remitos:sign` / `remitos:close`                   | Field + confirm            |
| `remitos:invoice` / `remitos:archive`                                  | Accounting                 |
| `remitos:cancel` / `:elevated` / `reopen:elevated` / `adjust:elevated` | Exceptions                 |
| `remitos:scan:manual`                                                  | Manual serial entry        |
| `remitos:pdf` / `remitos:pdf:reprint`                                  | Print / reprint            |
| `remitos:incident`                                                     | Incidents                  |

Role mapping: Warehouse → pick/load/prepare; Dispatcher → assign/dispatch; Driver → deliver/sign/scan; Billing → invoice; Admin → elevated; Manager → read + reports. Territory scope D-2 unchanged.

---

## 22. REST API

Additive under `/remitos` (keep `/delivery-notes` during migration).

**Lifecycle:** `prepare`, `assign`, `pick/*`, `load`, `dispatch`, `deliver`, `sign`, `close`, `invoice`, `archive`, `cancel`, `reopen`.

**Fleet assign body:** `{ vehicle_id, driver_id, helper_id?, route_id?, scheduled_delivery_at }`.

**Scanning:** `POST /remitos/{id}/scans` `{ context, code_kind, raw_value, line_id?, geo?, request_id }`.

**Geo:** `POST /remitos/{id}/geo-events` `{ kind, lat, lng, accuracy_m?, captured_at, device_id? }`.

**Media / signatures / incidents:** phased `attachment_kind`.

**PDF:** `GET /remitos/{id}/pdf?copy=ORIGINAL|DUPLICADO|TRIPLICADO|REIMPRESION&reason=` → streams PDF and writes `remito_print_log`.

**Sync / assigned / routes / warehouses / vehicles / drivers** as supporting endpoints.

Idempotency `request_id` + optimistic `version` on all mutating endpoints.

---

## 23. Database schema

### 23.1 New / extended enums

```
remito_status    : DRAFT, PREPARED, ASSIGNED, LOADED, IN_TRANSIT, DELIVERED,
                   SIGNED, CLOSED, INVOICED, ARCHIVED, CANCELLED (+ LEGACY)
picking_status   : PENDING, PREPARING, COMPLETE, LOADED
geo_event_kind   : DEPARTURE, DELIVERY_START, SIGN, CLOSE, INCIDENT
scan_context     : PICK, LOAD, DELIVER, RETURN, VERIFY
scan_code_kind   : QR, BARCODE, SERIAL
print_copy_kind  : ORIGINAL, DUPLICADO, TRIPLICADO, REIMPRESION
attachment_kind  : BEFORE, DURING, AFTER, CYLINDER_CONDITION, CUSTOMER_SITE,
                   ID_PHOTO, SIGNATURE, INCIDENT_PHOTO, DOCUMENT
```

(+ remito_type, priority, line_kind, signature_role, incident_*)

### 23.2 Key tables (additive)

Header extensions on `delivery_note`: `series_id`, `type`, `status`, `picking_status`, company/branch/warehouses, `scheduled_delivery_at`, `departure_at`, `arrival_at`, `delivered_at`, `closed_at`, `driver_id`, `helper_id`, `vehicle_id`, `route_id`, billing customer, address snapshot, `delivery_geo`, phone, sales order, `invoice_id`, observations, priority, territory, `total_packages`, `total_weight_kg`, cancel_reason, version, audit columns.

```
remito_series (code, branch_id, emission_point_label, pad_width, next_number, …)
remito_line   (+ picked_qty, weight_kg, rental_cycle_ref, …)
remito_status_history
remito_signature
remito_attachment
remito_incident
remito_geo_event
remito_scan_event
remito_print_log
warehouse / vehicle / driver_profile / route / route_stop
cylinder_inspection
```

- **R-74** All new tables on `fn_audit()` (including `delivery_note`).
- **R-75** Indexes for search + `(series_id, remito_number)`, scan raw_value, geo by remito.
- **R-76** Soft delete; unique indexes `WHERE deleted_at IS NULL`.
- **C-7** Custody only via `movement_event` (BR-16).

### 23.3 Invariants

- **I-1** `CLOSED` cylinder lines have non-null `movement_event_id`.
- **I-2** `delivered_qty ≤ qty` and `returned_qty ≤ qty`.
- **I-3** Transfer types: distinct origin/destination warehouses.
- **I-4** `remito_number` unique within series.
- **I-5** `INVOICED` requires `invoice_id`.
- **I-6** Checks added to `db/tests/invariants.sql`.
- **I-7** Document `LOADED` implies `picking_status = LOADED`.
- **I-8** Rentable lines on close have open/closed rental link as required by type.
- **I-9** `REIMPRESION` print log rows have non-null `reason` and `reprint_seq`.
- **I-10** Formatted `remito_number` matches series code + padded sequence.

---

## 24. Non-functional requirements

Prior NFRs retained (offline, fast search, responsive, optimistic updates, audit, RBAC, soft delete, version history, PDF/QR/barcode, image uploads, e-remitos future, quality gates, security, reliability, i18n). Additions:

- **NFR-18 Scan-first UX** — camera scan is the default path; manual entry is exception.
- **NFR-19 Geo privacy** — retain geo per policy; restrict claim packs to authorized roles.
- **NFR-20 Reprint integrity** — every copy logged; watermarked; reason mandatory for reimpresión.
- **NFR-21 Aggregate transactional close** — movements + rental + audit in one DB transaction (or documented saga with compensating actions).

---

## 25. Implementation phases (milestones)

- **M0 — Foundations** — enums (incl. picking/geo/scan/print), header extensions (helper, times), series `A-00001234`, lines, status history, warehouse/vehicle/driver, audit triggers, domain transitions + Aggregate close skeleton.
- **M1 — CRUD + lifecycle + picking** — back-office remitos, picking list UI, prepare/assign/load gates.
- **M2 — Types, transfers, incidents, rental open/close on close** — §14 automation wired to `specs/009`.
- **M3 — PoD: signatures, phased photos, geo checkpoints** — object storage.
- **M4 — PDF + controlled reprints + QR/barcode** — Original/Duplicado/Triplicado/Reimpresión #N.
- **M5 — Field offline: camera scan, route, Maps, sync** — scan contexts LOAD/DELIVER.
- **M6 — Invoicing handoff, reports (picking/on-time/scan/reprint/geo claims), search hardening, cert guards**.
- **M7 — Hardening + e-remito scaffolding**.

---

## 26. Open questions & decisions to ratify

Prior questions retained (warehouse granularity, company/branch, fiscal gapless numbering, e-remito, PDF lib, object storage, deprecation, notifications, cert enforcement, signature legal validity). New:

11. **Helper model** — reuse `driver_profile` with `is_helper_eligible`, or separate helper entity / role?
12. **Required photo set** — which phases mandatory per remito type / medical gas?
13. **Geo required vs best-effort** — hard-block transitions without GPS, or warn + allow with reason?
14. **Scan strictness** — hard-block LOADED/DELIVERED without 100% scan match, or configurable per territory?
15. **Rental open timing** — open rental at `DELIVERED`, at `SIGNED`, or only at `CLOSED`? (Spec default: **CLOSED** for atomicity with movement post.)
16. **Emission point codes** — confirm real prefixes (`A`, `B`, `CH`, …) per branch.

---

## 27. Changelog vs. prior draft

Incorporated from senior-ERP peer review:

| Addition                                                              | Where               |
| --------------------------------------------------------------------- | ------------------- |
| Warehouse **picking** sub-lifecycle PENDING→PREPARING→COMPLETE→LOADED | §6, status `LOADED` |
| Fleet: **helper (ayudante)**, hora prevista / salida / llegada        | §9, header          |
| **Geo checkpoints** start / sign / close (+ departure)                | §12                 |
| Phased photos before / during / after / cylinder / customer site      | §13                 |
| First-class **camera scan** QR / barcode / serial with contexts       | §11                 |
| **Rental automation** Remito→Movement→Rental→monthly Invoice          | §14, §4.1           |
| Controlled **reprints** Original/Duplicado/Triplicado/Reimpresión #N  | §15.2               |
| Emission-point numbering `A-00001234`                                 | §8.6                |
| PDF totals (bultos/peso), emission point, helper                      | §15.1               |
| Explicit **Aggregate Root** confirmation side effects                 | §4.1                |

_End of specification. Awaiting approval before creating numbered implementation specs and beginning M0._
