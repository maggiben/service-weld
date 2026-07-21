# 000 — Project Overview

> Implementation spec for AI coding agents. Read this first, then the numbered specs it indexes. Companion analysis lives in the repo root: `domain.md`, `workflows.md`, `product_requirements_document.md`, `sdd.md`, `database.md`, `schema.sql`, `openapi_specification.md`, `frontend_design.md`.
> **Convention:** `MUST` = mandatory, `SHOULD` = strong default, `MAY` = optional. `» observed` = grounded in the legacy data. `Wnn`=workflow, `BR-nn`=business rule, `US-nn`=user story.

## Purpose

Build a single system of record that replaces three manual Excel workbooks (~2,140 sheets, ~180,000 movement rows) used by a regional Argentine **industrial & medical gas-cylinder distributor/refiller**. The system tracks every cylinder, every custody movement, every rental day, and every party (clients, suppliers, sub-distributors), enforces the domain invariants automatically, computes rental billing deterministically, and provides the reporting the spreadsheets never had.

## Requirements

- R1. Deliver two front-end surfaces: a **back-office web app** and an **offline-capable mobile field app** (spec `006`).
- R2. Implement the domain, database, API, auth, reporting, inventory, and rental subsystems per specs `001`–`009`.
- R3. Support the 10 user roles (`CLERK, DRIVER, PLANT, INVENTORY, BILLING, MANAGER, SUBDIST, ADMIN, MEDICAL, CLIENT`) and cover all workflows `W1`–`W20`.
- R4. Migrate legacy workbook data into the new model (spec `011`) with a cleanup/exceptions pipeline.
- R5. Enforce the 20 canonical business rules (`spec 001`) at the database, API, and UI layers.
- R6. Provide test coverage that proves every business rule and workflow (spec `010`).
- R7. Be deployable and operable (spec `012`), including scheduled accrual snapshots and alert generation.

## Constraints

- C1. Locale **Spanish (Argentina)**; dates `dd/mm/yyyy`; currency **ARS**; **CUIT** tax-id validation.
- C2. Primary datastore **PostgreSQL 15+** (schema verified on PG16). No alternative RDBMS.
- C3. Single tenant / single company; multi-**territory** (Junín, Chacabuco, Ceres) and multi-node (sub-distributors).
- C4. Accounting / AFIP e-invoicing is **external**; the system provides billing data via export/API only.
- C5. **Cylinder hydrostatic re-certification is out of scope for v1** (Phase-2 safety feature; see `sdd.md`).
- C6. Field app **MUST** function offline and sync later; never lose or silently overwrite field data.
- C7. No hard deletes of ledger data; corrections are append-only (`VOID`).

## Acceptance Criteria

- AC1. Every numbered spec (`001`–`012`) is implemented and its own acceptance criteria pass.
- AC2. A cylinder can be registered, delivered, returned (rental days auto-computed), refilled, swapped, sold, lost, and replaced end-to-end through the API and both UIs.
- AC3. Legacy data migrates with a reconciliation report distinguishing clean vs flagged rows; no movement is dropped silently.
- AC4. All 20 business rules have passing automated tests; the DB rejects each violation.
- AC5. Reports (fleet, float/aging, outstanding, rental/revenue, loss, supplier-returns, cylinder-life, medical statement, data-quality) return correct results on migrated data.
- AC6. A driver completes a route offline and syncs with conflicts surfaced, not lost.

## Edge Cases

- E1. Same serial number under different owners (Linde `309817` vs ours) — identity is `(owner, serial)`.
- E2. Near-daily medical O2 cycles incl. same-day deliver-and-return.
- E3. Legacy dual-book entries (client sheet + cylinder sheet) representing one event → merge to a single movement.
- E4. Dirty legacy data: impossible years (2047/2048), formula ERROR cells, node names typed into date cells (`buroni`), multi-serial cells (`6035 -169432 -192072`).
- E5. Supplier-owned cylinders that must round-trip back to the supplier.

## Dependencies

- Internal: this spec indexes all others. Build order in Implementation Notes.
- External: PostgreSQL 15+, an OIDC/OAuth2 identity provider (or built-in), an object/file store for exports, a notification gateway (email/SMS/push), a container runtime for deployment.

## Implementation Notes

- **Recommended build order:** `002` domain → `003` database (+`011` migration scaffolding) → `005` auth → `004` API → `009` rental + `008` inventory logic → `007` reporting → `006` frontend → `010` testing (continuous) → `011` migration run → `012` deployment.
- **Mandated stack:** **Backend** = NestJS + Zod (`nestjs-zod`) + OpenAPI via `@nestjs/swagger` + **Passport** auth (`@nestjs/passport` with JWT: local/jwt/jwt-refresh strategies) on Node LTS/TypeScript, over PostgreSQL 15+ (`003`/`004`/`005`). **Frontend** = **Next.js 16+ App Router** + React 19 + MUI, MUI X Data Grid (Community), MUI X Charts, MUI X Date Pickers, react-i18next (`es` default/`en`), Zustand (client state), react-hook-form (forms) (`006`, D-12).
- **Repo layout (suggested):** `apps/api` (NestJS), `apps/web` (Next.js App Router back-office), `apps/field` (Next.js App Router field PWA), `packages/domain`, `packages/schemas` (shared Zod schemas), `packages/api-client` (generated from the **Swagger-emitted** OpenAPI JSON), `db/` (`schema.sql`, migrations), `migration/` (workbook importer), `specs/`.
- **Source of truth ordering:** if specs and the root analysis docs disagree, the numbered `specs/` win; flag the discrepancy.
- **Agent guidance:** each spec is self-contained with testable acceptance criteria; implement to the criteria, not to prose. Prefer generating the API client and types from the OpenAPI document to keep contracts in sync.
