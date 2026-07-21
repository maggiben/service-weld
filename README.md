# Gas-Cylinder Distribution — Reverse-Engineering & System Design

[![CI](https://github.com/maggiben/service-weld/actions/workflows/ci.yml/badge.svg?branch=main)](https://github.com/maggiben/service-weld/actions/workflows/ci.yml)
[![Coverage](https://img.shields.io/badge/coverage-%E2%89%A580%25-brightgreen)](./scripts/check-coverage.mjs)
[![Node](https://img.shields.io/badge/node-24.18-blue)](./.nvmrc)
[![pnpm](https://img.shields.io/badge/pnpm-10.8-blue)](./package.json)

This repository reverse-engineers a real, spreadsheet-run business — a regional **industrial & medical gas-cylinder distributor/refiller** in northwest Buenos Aires Province, Argentina — and specifies the software system to replace it.

The entire operation lives today in **three Excel workbooks** (~2,140 sheets, ~180,000 movement rows). These documents decode that business and turn it into an implementable design.

---

## The legacy source (what was analysed)

| Workbook                                       | Sheets | One sheet =                                                                        |
| ---------------------------------------------- | ------ | ---------------------------------------------------------------------------------- |
| `CILINDRO CLIENT REPARTO …(Autoguardado)….xls` | 291    | one **client** (Junín delivery route)                                              |
| `CILINDROS CLIENTES CHACABUCO.xls`             | 366    | one **client** (Chacabuco route; many `HOSP.MUNIC.` = municipal-hospital patients) |
| `CILINDROS PROPIOS.xls`                        | 1,483  | one **physical cylinder** (by serial)                                              |

Each client ledger has two panes — **NUESTRA PROPIEDAD** (cylinders we own, rented out) and **SU PROPIEDAD** (client-owned cylinders we refill). The cylinder workbook tracks every serial's full circulation history (2004→2026). Gas types: O2 (incl. medical/laser), CO2, N2, Argon (incl. 5.0), ATAL (Ar/CO₂ mix), acetylene, MAPAX30, helium, thermolene. Cylinder pool is multi-owner: **ours, Linde, Intergas, Nordelta, DSJ**, and customer-owned.

---

## Documents (read in this order)

| #   | File                                   | What it is                                                                                                                                                                                                                                              |
| --- | -------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | **`domain.md`**                        | Complete domain model — 16 entities (attributes, keys, relationships, validation, lifecycle, states), aggregates, value objects, enumerations, ER diagram, invariants.                                                                                  |
| 2   | **`workflows.md`**                     | Every business workflow (W1–W20) with Goal, Trigger, Actors, Preconditions, Happy path, Alternative flows, Error cases, Postconditions.                                                                                                                 |
| 3   | **`product_requirements_document.md`** | PRD — 10 user roles (R1–R10), 34 user stories (`As a / I want / So that`) with Gherkin acceptance criteria, traceability to every workflow.                                                                                                             |
| 4   | **`sdd.md`**                           | Software Design Document — functional/non-functional reqs, business rules (BR-01…BR-20), state & sequence diagrams, data flow, API/auth/authorization/audit, rental logic, edge cases, error handling, future improvements.                             |
| 5   | **`database.md`**                      | PostgreSQL database design — every table (columns, types, constraints, FKs, indexes, unique constraints) with rationale, plus partitioning, audit, soft-delete, history, and optimistic-locking strategy.                                               |
| 6   | **`schema.sql`**                       | Runnable DDL implementing `database.md` (verified — see below).                                                                                                                                                                                         |
| 7   | **`openapi_specification.md`**         | OpenAPI 3.1 REST API — ~60 endpoints across 15 tags, each with method, URL, purpose, auth, request/response JSON, validation, error codes, pagination, filtering, sorting, permissions.                                                                 |
| 8   | **`frontend_design.md`**               | Frontend UI/UX — back-office web app + offline mobile field app; every screen (purpose, components, tables, forms, filters, dialogs, validation, actions, permissions, loading/error/empty states, navigation, responsive, shortcuts) + navigation map. |
| 9   | **`specs/`**                           | Agent-ready implementation specifications (000–012), each with Purpose · Requirements · Constraints · Acceptance Criteria · Edge Cases · Dependencies · Implementation Notes. See `specs/README.md`.                                                    |
| 10  | **`docs/DEVELOPMENT.md`**              | Dev setup + **quality gates** (pre-commit / pre-push / CI; **≥80% coverage**; never commit without checks).                                                                                                                                             |
| 11  | **`AGENTS.md`**                        | Short agent policy: hooks, coverage threshold, do not commit until checks pass.                                                                                                                                                                         |

Everything is cross-referenced: workflows `Wnn` → stories `US-nn` → rules `BR-nn` → tables/constraints → API endpoints.

---

## Key business facts (decoded from the data)

- **Rental billed per day-on-hire.** The column labelled `METROS` is actually a computed day-count (`return − delivery`); one sheet renames it `ALQUILER` with `alquiler $85 por día`. Verified 373/373 rows in one client.
- **Two commercial models:** rent-out our cylinders (gas + rental) vs refill customer-owned cylinders (gas only, no rental).
- **Medical home-oxygen line:** named `HOSP.MUNIC.` patients with near-daily O2 swaps, portable `mochila` units and rented regulators, billed to the municipality.
- **Cylinder identity is `(owner, serial)`** — the same serial recurs across different owners (e.g. Linde `309817` vs ours).
- **Supplier loan loops** (Nordelta/Intergas) tracked as a 4-stage round-trip.
- **No reporting, no integrity, dual manual posting, and formula ERROR cells** are the legacy system's core failures — all designed out here.

---

## Using `schema.sql`

```bash
# any PostgreSQL 15+ instance
createdb weld
psql -d weld -v ON_ERROR_STOP=1 -f schema.sql
```

The script is transactional (all-or-nothing) and self-contained: extensions, enum types, ~25 tables, indexes, the single-custody exclusion constraint, generated `rental_days` column, audit/history/optimistic-lock triggers, and seed reference data (roles, territories, gas types + legacy-spelling aliases, our own party + suppliers/sub-distributors).

Before writes, set the session context so the audit trail captures the actor:

```sql
SET app.current_user_id = '12';
SET app.current_role_code = 'CLERK';
SET app.source = 'web';
```

### Verification status

`schema.sql` was **loaded into PostgreSQL 16 with zero errors**, and the domain invariants were exercised and confirmed:

| Invariant                               | Enforcement                         | Verified     |
| --------------------------------------- | ----------------------------------- | ------------ |
| Rental days = return − delivery         | generated column                    | ✓ (67 days)  |
| Single custody (no 2 open per cylinder) | `ex_move_no_overlap` gist exclusion | ✓ blocked    |
| Refill ⇔ customer-owned                 | `ck_move_kind_basis`                | ✓ blocked    |
| Return ≥ delivery                       | `ck_move_dates`                     | ✓ blocked    |
| Plausible dates (≤ today+30)            | trigger                             | ✓ blocked    |
| CUIT format                             | `ck_client_cuit_format`             | ✓ blocked    |
| Serial unique per owner                 | `uq_cyl_owner_serial`               | ✓ blocked    |
| Generic audit capture                   | `fn_audit` trigger                  | ✓ logged     |
| SCD-2 history + version bump            | history + touch triggers            | ✓ 2 versions |

---

## Open questions carried forward

- **`PH` gas prefix** (`ph o2`, `ph atal`) meaning is unresolved — confirm with the business during migration.
- **Hydrostatic re-certification / cylinder expiry** is _not_ tracked in the legacy data — flagged as a high-priority Phase-2 safety feature in `sdd.md`.

---

_Analysis method: the `.xls` workbooks were parsed with Python/`xlrd`; findings labelled `» observed` are grounded in actual cells, `INFERRED` are reconstructions. See `sdd.md` §Executive Summary for the full narrative._
