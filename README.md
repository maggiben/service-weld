<!-- prettier-ignore-start -->
<div align="center">
<br>
<p align="center">
<img src="apps/web/public/service-weld-remove-bg-bw.webp" alt="ServiceWeld" height="124" />
</p>

# Gas-Cylinder Distribution ERP

**Service Weld** — cylinder custody, circulation, rental & billing for industrial and medical gas distributors.

[![CI](https://github.com/maggiben/service-weld/actions/workflows/ci.yml/badge.svg?branch=main)](https://github.com/maggiben/service-weld/actions/workflows/ci.yml)
[![Coverage](https://img.shields.io/badge/coverage-%E2%89%A580%25-brightgreen?logo=jest&logoColor=white)](./scripts/check-coverage.mjs)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.x-3178C6?logo=typescript&logoColor=white)](https://www.typescriptlang.org/)
[![Node](https://img.shields.io/badge/node-24.18-339933?logo=nodedotjs&logoColor=white)](./.nvmrc)
[![pnpm](https://img.shields.io/badge/pnpm-10.8-F69220?logo=pnpm&logoColor=white)](./package.json)
[![NestJS](https://img.shields.io/badge/NestJS-API-E0234E?logo=nestjs&logoColor=white)](./apps/api)
[![Next.js](https://img.shields.io/badge/Next.js-16-000000?logo=nextdotjs&logoColor=white)](./apps/web)
[![PostgreSQL](https://img.shields.io/badge/PostgreSQL-16-4169E1?logo=postgresql&logoColor=white)](./db)
[![License](https://img.shields.io/badge/license-Proprietary-red)](./LICENSE)
[![GitHub stars](https://img.shields.io/github/stars/maggiben/service-weld?style=flat&logo=github)](https://github.com/maggiben/service-weld/stargazers)
[![GitHub forks](https://img.shields.io/github/forks/maggiben/service-weld?style=flat&logo=github)](https://github.com/maggiben/service-weld/network/members)
[![GitHub issues](https://img.shields.io/github/issues/maggiben/service-weld?logo=github)](https://github.com/maggiben/service-weld/issues)
[![GitHub pull requests](https://img.shields.io/github/issues-pr/maggiben/service-weld?logo=github)](https://github.com/maggiben/service-weld/pulls)
[![Last commit](https://img.shields.io/github/last-commit/maggiben/service-weld?logo=git&logoColor=white)](https://github.com/maggiben/service-weld/commits/main)
[![Commit activity](https://img.shields.io/github/commit-activity/m/maggiben/service-weld?logo=github)](https://github.com/maggiben/service-weld/graphs/commit-activity)
[![Contributors](https://img.shields.io/github/contributors/maggiben/service-weld)](https://github.com/maggiben/service-weld/graphs/contributors)
[![Repo size](https://img.shields.io/github/repo-size/maggiben/service-weld?logo=github)](https://github.com/maggiben/service-weld)
[![Code size](https://img.shields.io/github/languages/code-size/maggiben/service-weld?logo=github)](https://github.com/maggiben/service-weld)
[![Top language](https://img.shields.io/github/languages/top/maggiben/service-weld)](https://github.com/maggiben/service-weld)
[![Locale](https://img.shields.io/badge/locale-es--AR-blue)](./docs/DEVELOPMENT.md)
[![Made with](https://img.shields.io/badge/made%20with-%E2%9D%A4%EF%B8%8F%20in%20Argentina-74acdf)](https://github.com/maggiben/service-weld)

</div>
<!-- prettier-ignore-end -->

---

## What it is

**Gas-Cylinder Distribution ERP** (product name: **Service Weld**) is a single system of record for a regional Argentine **industrial & medical gas-cylinder distributor/refiller**. It tracks every cylinder, custody movement, rental day, and party (clients, suppliers, sub-distributors), enforces domain invariants automatically, computes rental billing deterministically, and delivers the reporting the old process never had.

Locale: **Spanish (Argentina)** · dates `dd/mm/yyyy` · currency **ARS** · CUIT validation · multi-territory (Junín, Chacabuco, Ceres).

## What it replaces

The entire operation previously lived in **three Excel workbooks** (~2,140 sheets, ~180,000 movement rows):

| Legacy workbook                                | Sheets | One sheet =                                            |
| ---------------------------------------------- | ------ | ------------------------------------------------------ |
| `CILINDRO CLIENT REPARTO …(Autoguardado)….xls` | 291    | one **client** (Junín delivery route)                  |
| `CILINDROS CLIENTES CHACABUCO.xls`             | 366    | one **client** (Chacabuco / municipal hospital routes) |
| `CILINDROS PROPIOS.xls`                        | 1,483  | one **physical cylinder** (by serial)                  |

Those workbooks had dual manual posting, no integrity checks, formula `ERROR` cells, and almost no reporting. This ERP replaces them with one event model, database-enforced rules, migration tooling, and operational UIs.

---

## Features

| Area                    | Capabilities                                                                                                                          |
| ----------------------- | ------------------------------------------------------------------------------------------------------------------------------------- |
| **Clients & parties**   | Client master data, ledgers, territories, CUIT validation, multi-node / sub-distributor support                                       |
| **Cylinder inventory**  | Serial identity as `(owner, serial)`, multi-owner pool (ours, Linde, Intergas, Nordelta, DSJ, customer-owned), life & status tracking |
| **Movements**           | Deliver, return, refill, swap, void — single-custody enforcement, rental days auto-computed                                           |
| **Rental & billing**    | Per-day-on-hire rates (global or per-client), draft → approve → export hand-off (AFIP accounting remains external)                    |
| **Medical O₂**          | High-frequency home-oxygen cycles, municipal (`HOSP.MUNIC.`) statements                                                               |
| **Accessories**         | Regulators, portable units, and related rentals                                                                                       |
| **Batteries & replace** | Battery inventory and cylinder replacement workflows                                                                                  |
| **Supplier loans**      | Multi-stage round-trips with suppliers / sub-distributors                                                                             |
| **Transfers**           | Inter-node stock transfers with reconciliation                                                                                        |
| **Alerts**              | In-app worklist, AppBar bell, toasts                                                                                                  |
| **Reporting**           | Fleet, float/aging, rental/revenue, loss, supplier returns, cylinder life, medical statement, data quality                            |
| **Field PWA**           | Offline-capable driver app: capture deliver/return → outbox → sync with conflict handling                                             |
| **Migration**           | Import legacy `.xls` workbooks with dry-run, exceptions pipeline, and reconciliation report                                           |
| **Auth & audit**        | JWT auth, role-based access (10 roles), immutable audit trail                                                                         |
| **Marketing site**      | Public corporate landing (`apps/www` → serviceweld.com)                                                                               |

---

## Architecture

```
apps/api          NestJS API + worker          → :3000  (Swagger /api/docs)
apps/web          Back-office (Next.js + MUI)  → :3001  app.serviceweld.com
apps/field        Field PWA (Next.js + MUI)    → :3002
apps/www          Marketing site               → :3003  serviceweld.com
packages/schemas  Shared Zod schemas
packages/domain   Domain model
packages/api-client  Typed HTTP client
db/               schema.sql + additive migrations + invariant tests
migration/        Legacy .xls importer (Python)
specs/            Authoritative implementation specs (000–013)
```

**Stack:** Node 24 · pnpm · TypeScript · NestJS · Next.js 16 · React 19 · MUI · PostgreSQL 15+ · Zod · Passport JWT · Turbo monorepo.

---

## Prerequisites

- **Node** `24.18.x` (see [`.nvmrc`](./.nvmrc))
- **pnpm** `10.x` (`corepack enable`)
- **Docker** (local Postgres 16)
- **Python 3** (only for legacy `.xls` migration)
- **psql** client (for `pnpm db:invariants`)

---

## Build, run & test

### First-time setup

```bash
corepack enable
pnpm install
cp .env.example .env

pnpm db:up                                          # Postgres via docker-compose.dev.yml
export DATABASE_URL=postgres://postgres:test@localhost:5432/weld
pnpm db:load                                        # baseline schema.sql
pnpm db:migrate                                     # additive migrations
pnpm db:invariants                                  # business-rule smoke suite (must exit 0)

pnpm --filter @weld/schemas build && pnpm --filter @weld/domain build
pnpm --filter @weld/api bootstrap:admin             # once — creates BOOTSTRAP_ADMIN_* user
```

### Run (development)

```bash
pnpm db:up
pnpm --filter @weld/api dev      # API :3000 — Swagger at /api/docs
pnpm --filter @weld/web dev      # Back-office :3001
pnpm --filter @weld/field dev    # Field PWA :3002
pnpm --filter @weld/www dev      # Marketing :3003
```

Sign in with `BOOTSTRAP_ADMIN_USER` / `BOOTSTRAP_ADMIN_PASSWORD` from `.env`.

Or from the repo root: `pnpm build` / `pnpm dev` (Turbo).

### Test

```bash
pnpm test                 # unit tests (Turbo)
pnpm run test:coverage    # ≥80% lines/branches/functions/statements per package (required before push)
pnpm db:invariants        # DB business-rule enforcement suite
```

### Quality gates

| Gate           | When                | Checks                                                                      |
| -------------- | ------------------- | --------------------------------------------------------------------------- |
| **pre-commit** | every `git commit`  | secrets → deps (audit + deprecated) → Prettier → typecheck                  |
| **pre-push**   | every `git push`    | `test:coverage` — **≥80%** on every workspace package                       |
| **CI**         | PR / push to `main` | format, typecheck, unit tests, coverage ≥80%, build, DB schema + invariants |

Manual check before commit:

```bash
pnpm run check:secrets
pnpm run check:deps
pnpm run format:check
pnpm run typecheck
pnpm run test:coverage   # required before push; recommended if tests/covered code changed
```

Full day-to-day notes: [`docs/DEVELOPMENT.md`](./docs/DEVELOPMENT.md).

### Legacy Excel migration

```bash
pnpm migrate:xls:dry     # dry-run → exceptions + reconciliation report
pnpm migrate:xls         # load into Postgres
```

Customer-facing exception language: [`docs/MIGRATION_EXCEPTIONS_CUSTOMER.md`](./docs/MIGRATION_EXCEPTIONS_CUSTOMER.md).

---

## Documentation

| Doc                                                                      | Purpose                                                             |
| ------------------------------------------------------------------------ | ------------------------------------------------------------------- |
| [`specs/`](./specs/)                                                     | Authoritative implementation specs (`000`–`013`) — start with `000` |
| [`docs/DEVELOPMENT.md`](./docs/DEVELOPMENT.md)                           | Setup, phases, quality gates                                        |
| [`AGENTS.md`](./AGENTS.md)                                               | Agent / contributor policy for hooks & coverage                     |
| [`domain.md`](./domain.md) · [`workflows.md`](./workflows.md)            | Domain model & business workflows (W1–W20)                          |
| [`product_requirements_document.md`](./product_requirements_document.md) | PRD, roles, user stories                                            |
| [`sdd.md`](./sdd.md) · [`database.md`](./database.md)                    | Design + PostgreSQL design                                          |
| [`schema.sql`](./schema.sql)                                             | Runnable baseline DDL                                               |
| [`openapi_specification.md`](./openapi_specification.md)                 | REST API contract                                                   |
| [`frontend_design.md`](./frontend_design.md)                             | UI/UX for web + field                                               |

---

## Contributing

This is **proprietary software**, not an open-source project. There is no public contribution license and no CLA that grants rights to redistribute the code.

If you (including future-you) need to change the product:

1. Work on a **feature branch**; keep `main` green.
2. Follow [`docs/DEVELOPMENT.md`](./docs/DEVELOPMENT.md) and the numbered specs under [`specs/`](./specs/). Specs win if prose docs disagree.
3. **Never** commit until pre-commit checks pass; **never** push until `pnpm run test:coverage` passes (≥80%). Do not use `--no-verify` unless you consciously choose to bypass.
4. Prefer small, reviewable PRs with a clear “why”; keep secrets out of the repo (`.env` stays local).
5. Match existing TypeScript / Nest / Next / MUI patterns; do not weaken coverage thresholds or DB invariants.
6. For agent-assisted work, read [`AGENTS.md`](./AGENTS.md) first.

External parties: contact the copyright holder for a written agreement before any use, fork, or distribution.

---

## Copyright & license

Copyright © 2026 **Benjamin Maggi**. All rights reserved.

This software is proprietary. See [`LICENSE`](./LICENSE) for the full notice. Unauthorized copying, modification, distribution, or use is prohibited except as expressly authorized in writing by the copyright holder.

---

_Reverse-engineered from the legacy “CILINDROS” Excel workbooks; analysis method and open questions live in the root design docs and `specs/`._
