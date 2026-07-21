# Development Guide

Monorepo for the Cylinder Custody, Circulation & Rental Management System.
Specs live in `/specs` (authoritative); architecture decisions in `/specs/DECISIONS.md`.

## Prerequisites

- Node `20.16.x` (`.nvmrc`), pnpm `10.x` (via `corepack enable`)
- Docker (local Postgres 16)

## Layout

```
apps/api          NestJS API + worker (004/005/007)
apps/web          Back-office — Next.js 16 App Router + React 19 + MUI (006, D-12)
apps/field        Field PWA shell — Next.js 16 App Router + React 19 + MUI (006, D-12)
packages/schemas  Shared Zod schemas (API DTOs + UI resolvers)
packages/domain   Framework-light domain model (002)
packages/api-client  Typed HTTP client (OpenAPI codegen later per D-10)
db/               schema.sql baseline + migrations + invariant tests (003)
migration/        Legacy .xls importer (011) — Phase 7
specs/            Authoritative specifications
```

## Implementation phases (status)

| Phase | Scope                                                                                                   | Status          |
| ----- | ------------------------------------------------------------------------------------------------------- | --------------- |
| **0** | DB baseline (`schema.sql`), migrations, invariants, CI                                                  | **Done**        |
| **1** | Auth + Clients API + web login/shell/clients                                                            | **Done**        |
| **2** | Inventory core: domain, cylinders, movements (deliver/return/swap/void), loss, Next.js web+field shells | **Done** (core) |
| **3** | Rental rates + billing draft → approve → export (`009`)                                                 | **Done**        |
| **4** | Inventory extensions: batteries, replace, loans, transfers, reconciliation                              | **Done**        |
| **5** | Accessories (W11) + in-app alerts (D-15)                                                                | **Done**        |
| **6** | Field offline PWA (outbox, sync, conflicts)                                                             | **Done** (core) |
| **7** | Legacy `.xls` migration run (`011`)                                                                     | **Done** (core) |
| **8** | Reporting suite (`007`) + deployment (`012`)                                                            | **Done** (core) |

Phase 2 **core** = custody loop needed for billing. Remaining inventory items (batteries, replace, supplier loans, transfers, reconciliation) are Phase 4 — they do not block rates/billing.

Phase 3 = effective rates + billing draft/approve/export. Accessory charges and hard MFA-on-approve remain follow-ups.

Phase 4 = batteries (BR-13), replace (W13), supplier loans (W14/BR-11), transfers (W16/BR-14), reconciliation (W18 outstanding + physical count).

Phase 5 = accessories inventory/rentals (W11) + in-app alert worklist (**D-15**; AppBar bell, summary poll, Snackbar toasts).

Phase 6 **core** = field login, IndexedDB `outboxStore`, capture deliver/return → queue, sync drain on reconnect, conflict retry/discard, web manifest. Full service-worker asset cache / barcode scan / route stops remain follow-ups.

Phase 7 **core** = Python `.xls` importer (`migration/weld_migration`), dry-run + load CLI (`pnpm migrate:xls[:dry]`), exceptions → `migration_exception`, reconciliation report. Full production cutover / workbook-specific cleanups remain ops follow-ups.

Phase 8 **core** = report endpoints (`fleet`, `float-aging`, `rental`, `loss`, `supplier-returns`, `cylinder-life`, `medical-statement`, `data-quality`) + web `/reports`. Outstanding stays on reconciliation. Deployment: container stubs + compose sketch; full scheduler/backups/observability remain follow-ups.

```
# Web: /alerts (bell + toasts) · /reports · Field: :3002 login → captura → sync
# Migration: pnpm migrate:xls:dry && pnpm migrate:xls
```

```
pnpm db:migrate   # includes 0002_billing_run
# Web: /rates (global or per-client) · /billing (draft → approve → export)
```

## First-time setup

```
corepack enable
pnpm install
cp .env.example .env
pnpm db:up                     # start Postgres (docker-compose.dev.yml)
export DATABASE_URL=postgres://postgres:test@localhost:5432/weld
pnpm db:load                   # apply baseline schema.sql
pnpm db:migrate                # apply additive migrations (db/migrations)
pnpm db:invariants             # run the BR enforcement smoke suite (must exit 0)
```

## Everyday

```
pnpm db:up
pnpm --filter @weld/schemas build && pnpm --filter @weld/domain build
pnpm --filter @weld/api bootstrap:admin   # once
pnpm --filter @weld/api dev               # :3000 — loads ../../.env; Swagger /api/docs
pnpm --filter @weld/web dev               # :3001 — back-office (HMR)
pnpm --filter @weld/field dev             # :3002 — field shell (HMR)
```

API reads the repo-root `.env` even when started from `apps/api` via pnpm.

Sign in with `BOOTSTRAP_ADMIN_USER` / `BOOTSTRAP_ADMIN_PASSWORD`. MEDICAL territory
scope is **global** (D-2). Business timezone / rental min-day defaults: **D-13 / D-14**.

## Database is authoritative

`schema.sql` is the baseline and the last line of defense for business rules (001).
DDL migrations under `db/migrations` are **additive only** (003 C4). The app never
lets an ORM own or sync the schema/constraints/triggers (004).

ESLint packages are deferred — see `docs/ESLINT.md`.
