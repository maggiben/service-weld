# Architecture Decision Log (ADR)

> Records decisions made during architecture review, **before implementation**. Where a decision resolves or overrides an ambiguous passage in a numbered spec, it is authoritative until that spec is updated in Phase 0. Status: **PENDING ROADMAP APPROVAL** (no code until approved).

Legend: **D-n** decision · resolves inconsistency **I-n** / missing **M-n** from the review.

---

## Approved by product owner (this session)

### D-1 — CLIENT role deferred to Phase 2 _(resolves I-1)_

- v1 ships the **9 staff roles**; CLIENT self-service is **Phase 2**.
- **Schema now (additive):** add nullable `app_user.party_id → party(id)` so a future portal user links to a client without a later destructive migration. No CLIENT UI/endpoints in v1.
- Guards still recognize the `CLIENT` capability set but no user is granted it in v1.

### D-2 — Territory scoping: operational roles scoped _(resolves I-3)_

- **Scoped roles** (must have ≥1 `user_territory_scope` row; every read/write filtered to those territories): `DRIVER`, `SUBDIST`, `CLERK`, `INVENTORY`.
- **Global roles** (see all territories): `MANAGER`, `ADMIN`, `BILLING`.
- **`MEDICAL` = global by default** (oversees medical supply across territories). Confirmed for Phase 1 walking skeleton — flip to scoped if medical coverage is later defined per-territory.
- **Enforcement:** `TerritoryScopeGuard` sets the caller's territory set on the request; the data layer appends a territory predicate to scoped queries (guard checks route access, repository enforces row scope — `005` impl note). A scoped user with zero territories is denied (fail-closed).

### D-3 — Medical privacy: operational-visible, analytics-restricted _(resolves I-2)_

- `MUNICIPAL_HOSPITAL` client (patient) **identity is visible in operational contexts** — a user who has a **direct operational link** to the patient (their route stop, or a movement/account they are servicing) may see the record enough to deliver/return.
- Patient identity is **excluded for non-`MEDICAL` users** from: global search results, dashboards, and cross-client/analytical reports.
- `MEDICAL` (and `BILLING` for the municipal statement) see full patient data.
- **Enforcement:** a `patientVisibility` predicate in search/report queries (`WHERE coverage <> 'MUNICIPAL_HOSPITAL' OR :isMedical OR :hasOperationalLink`). Documented as a reusable data-access rule; covered by `005` AC6 tests.

### D-4 — Backend infrastructure: Postgres-only _(resolves infra open items)_

- **Data access:** **Kysely** (typed SQL builder) over the authoritative `schema.sql`; **no ORM schema ownership** (`004` impl note). Transactions pinned to a single connection (see D-9).
- **Async jobs / scheduler:** **pg-boss** (Postgres-backed queue) — **no Redis**; honors single-datastore constraint (`012` C1).
- **DDL migrations:** additive `db/migrations/*.up.sql` only (applied by `pnpm db:migrate` / CI `psql` loop); `schema.sql` remains the baseline (`003`/`012`). Pair each change with a local-only `*.down.sql` for rollback.
- **Frontend server cache:** **TanStack Query** as the "data-fetching/cache layer" (`006` names it generically), kept separate from Zustand and react-hook-form.

---

## Engineering defaults (architect's call — documented; object before Phase 1 if needed)

### D-5 — Battery movement representation _(resolves I-4)_

- A battery delivery/return creates **one `movement_event` per member cylinder**, grouped by a new nullable **`movement_event.movement_group_id uuid`** and tagged with the battery via `origin`/a `battery_id` reference on the group.
- Single-custody (BR-01) stays enforced **per member cylinder** by `ex_move_no_overlap`.
- The same `movement_group_id` also models legacy **multi-serial cells** (`6035 -169432 -192072`) as one grouped delivery.
- Additive schema change; the domain service treats a battery as an atomic group (all members move together, one transaction).

### D-6 — Generic idempotency store _(resolves I-5)_

- New table **`idempotency_key`** (`key`, `user_id`, `endpoint`, `request_hash`, `response_snapshot jsonb`, `status_code`, `created_at`, `expires_at`). An interceptor short-circuits duplicate `Idempotency-Key` POSTs across **all** creating endpoints and returns the stored response.
- `movement_event.request_id` remains the domain-level dedup for movements (belt and suspenders).

### D-7 — Async job model _(resolves I-7 / M-3)_

- Reports/exports/billing that exceed the interactive budget return **`202 { job_id }`**; `GET /jobs/{id}` polls status; completed export artifacts are fetched via `GET /jobs/{id}/result` (redirect to object-store URL).
- Backed by pg-boss (queue) + a lightweight `job` projection for status; worker process executes and writes artifacts to the object store.

### D-8 — Auth persistence _(resolves M-1)_

- New table **`refresh_token`** (`id`, `user_id`, `token_hash`, `issued_at`, `expires_at`, `revoked_at`, `user_agent`, `ip`) for refresh rotation + revocation (`005` C1/C5).
- Add **`app_user.mfa_secret`** (encrypted TOTP secret) + `mfa_enrolled_at`; new table **`mfa_recovery_code`** (`user_id`, `code_hash`, `used_at`). MFA enrollment flow under `ADMIN`/self-service.
- All additive.

### D-9 — Transaction/GUC connection pinning _(mitigates risk R-4/R-5)_

- The `TransactionInterceptor` acquires **one** pooled connection, runs `BEGIN`, `SET LOCAL app.current_user_id/current_role_code/source`, executes the whole unit of work on that connection, then `COMMIT`. Kysely transaction API guarantees single-connection scope. Never use a transaction-pooling proxy in a mode that breaks `SET LOCAL`.

### D-10 — OpenAPI source of truth _(resolves I-6)_

- The **Swagger-emitted OpenAPI JSON is the runtime contract**; `packages/api-client` is generated from it. `openapi_specification.md` is the **design checklist** the parity test enforces (endpoint set, params, status/error codes) — not a byte-diff. Spec `006` C1 wording to be aligned in Phase 0.

### D-11 — Admin bootstrap _(resolves M-2)_

- A one-shot, idempotent **seed CLI** creates the first `ADMIN` from environment secrets (`BOOTSTRAP_ADMIN_USER`/`_PASSWORD`), forced to enroll MFA on first login. Documented in the `012` runbook.

### D-12 — Front-end apps are Next.js App Router _(product owner)_

- **`apps/web` and `apps/field` are Next.js 16+ with the App Router** — **not** Vite SPAs / React Router client apps.
- Public marketing lives in a separate **`apps/www`** (`@weld/www`) so designers can change the landing without the back-office (013). Production: **`serviceweld.com`** → www; **`app.serviceweld.com`** → web.
- Stack: **Next.js 16.x** (App Router only; no Pages Router), **React 19.x** (latest peer-compatible with that Next major), Turbopack for dev/build defaults.
- Interactive screens remain Client Components (`'use client'`) with MUI (and on web: TanStack Query / Zustand / RHF) as before (`006`); route segments, layouts, and future server-friendly boundaries live under `app/`.
- Field remains an **offline-first PWA** product (006 R3); service worker / outbox land in Phase 6 on the Next build — same App Router shell as web.
- Dev ports: API `:3000`, web `:3001`, field `:3002`, www `:3003`.
- Do **not** use root `pnpm.overrides` to force React/`@types/react` — align versions per app `package.json` and rely on hoist patterns in `.npmrc`.
- Specs `000` / `006` / `DEVELOPMENT.md` updated to match; any prior Vite SPA wording is superseded by this decision.

### D-13 — Business timezone _(resolves M-6)_

- Default civil timezone: **`America/Argentina/Buenos_Aires`**.
- Runtime source of truth: `system_setting.business_timezone` (IANA), editable via `GET/PATCH /settings` and the web **Configuración** screen (`admin:write` UI). Env `BUSINESS_TIMEZONE` remains the boot-time default when the row is missing.
- All "today" / accrual / aging / BR-05 plausibility windows use that configured timezone.
- Domain helper `businessTodayIso(now?, timeZone?)` accepts an injectable timezone; the API supplies the configured value at the edge (supplier loans, alerts; other call sites follow).

### D-14 — Rental day / min-day policy _(resolves M-5 for v1)_

- Default: bill **exact calendar days** from the DB generated column / `RentalPeriod` (`return − delivery`); **no minimum day** (`rental_min_days = 0`).
- Same-day deliver+return → **0** billable days when min-days is `0` (matches generated `rental_days`).
- Runtime override: `system_setting.rental_min_days` (0–365), editable via Settings API/UI. Env `RENTAL_MIN_DAYS` is the boot-time default when the row is missing. Product owner may raise the floor without a schema change (009 C2 / edge case).
- Monthly rates: convert to a daily equivalent as `amount / 30` for charge lines (documented; adjustable later).

### D-17 — Org primary language _(Settings)_

- Org default language: `system_setting.primary_language` ∈ `{es, en}` (default `es`, matches 000 C1 / 006 R7).
- Editable via Settings API/UI. Per-user UI locale remains in `uiStore` (persisted); saving primary language as admin also updates the admin's session locale.
- Does not replace per-user language switching in the shell.

---

## Open questions (needed by the phase that consumes them)

| Ref     | Question                                                                                                                        | Needed by           |
| ------- | ------------------------------------------------------------------------------------------------------------------------------- | ------------------- |
| ~~M-5~~ | ~~Rental rounding / min-day~~ → **D-14**                                                                                        | Phase 3             |
| ~~M-6~~ | ~~Business timezone~~ → **D-13**                                                                                                | Phase 3             |
| M-7     | **Supplier-side accounting** — is what _we_ owe suppliers for their cylinders' time in scope, or out (client-side rental only)? | Phase 4+            |
| M-8     | **Notification** channels/provider (email/SMS/push) and any templates.                                                          | Phase 5 → **D-15**  |
| M-11    | Meaning of the legacy **`PH`** gas prefix (`ph o2`, `ph atal`).                                                                 | Phase 7 (migration) |
| —       | ~~Confirm **MEDICAL = global** territory scope (D-2 assumption).~~ **Confirmed global for Phase 1.**                            | Phase 1             |

---

## Engineering defaults (continued)

### D-15 — Phase 5 notifications = in-app alerts only _(resolves M-8 for v1)_

- Phase 5 ships the existing `alert` table as an **operational worklist** (`GET /alerts`, resolve, refresh for overdue loans / long-outstanding).
- **No** email/SMS/push gateway in v1. External channels remain an open product choice; when chosen, wire a gateway behind the same alert creation points without changing the ledger.
- Web: `notificationStore` holds unread count / toasts only (006); server alerts are TanStack Query data.
- Shell polls `GET /alerts/summary` (60s) for the AppBar/nav badge; resolve/refresh push Snackbar toasts.

### D-16 — Quality gates: hooks + ≥80% coverage _(process)_

- **Test runner:** **Vitest** only for first-party suites (`010` R0 / C6 / AC9). No Jest / `node:test` in workspace packages. Coverage via `@vitest/coverage-v8`; gate script `scripts/check-coverage.mjs`.
- **Coverage:** every workspace package MUST stay at **≥80%** lines, branches, functions, and statements. Gate: `pnpm run test:coverage`. Same threshold in CI and in the **pre-push** hook.
- **pre-commit:** secrets scan → dependency advisories → **identifier length ≥2** (`check:id-length`) → Prettier (lint-staged) → typecheck. **pre-push:** coverage gate.
- **Identifier length:** value bindings (locals, params, catch vars, value imports, function names) in `apps/` and `packages/` MUST be ≥2 characters (single-letter names forbidden); only `_` is allowed as a short unused placeholder. Prefer contextual names (`event`, `row`, `state`); two-letter idioms (`id`, `db`) are OK — do not invent numbered clones (`database2`). Type-only constructs are exempt. Enforced by `scripts/check-id-length.mjs` on every commit.
- **Policy:** do not create a commit until pre-commit checks pass; do not push until coverage passes; do not skip hooks (`--no-verify`) unless the operator explicitly requests a bypass. Specs `010` / `012` / `000` and `docs/DEVELOPMENT.md` are authoritative.

### D-18 — Cylinder capacity units: m³ and kg _(product)_

- Cylinder nameplate size is a **(magnitude, unit)** pair. Units: **`M3`** (cubic metres) and **`KG`** (kilograms).
- **Why:** compressed gases are typically sized in m³; liquefied / weight-sold gases (and many legacy workbook cells) are sized in kg. Route workbooks report both; the app must store and display both without converting between them.
- **Persistence:** keep the numeric column `capacity_m3` as the **magnitude** (legacy name; value is in `capacity_unit`, not always m³). Add PostgreSQL ENUM `capacity_unit ('M3','KG')` and column `capacity_unit NOT NULL DEFAULT 'M3'` on `cylinder`, `rental_rate`, and `cylinder_sale`.
- **Semantics:** null magnitude = unknown size; when magnitude is set, `capacity_unit` is required (default `M3` for backfill). Rate wildcards (`capacity_m3 IS NULL`) ignore unit. Rate match and overlap keys are `(client, gas, magnitude, unit)`.
- **No conversion:** do not invent m³↔kg factors; treat units as incomparable categories.
- **UI:** every capacity cell/form shows the unit label (`m³` / `kg`). Forms expose a unit selector when capturing size.
- **Import (011):** parse explicit weight cells (`10 KG`, `25 k`, …) into magnitude + `KG` instead of discarding them; prefer explicit volume over weight when both appear.
- Specs updated: `002` (Capacity VO), `003` (ENUM/columns), `008`/`009` (inventory/rates), `011` (importer).

### D-19 — Refill / gas fill pricing _(product — 009 R2)_

- **REFILL** movements (Su Propiedad / `ownership_basis = CUSTOMER`) accrue **no rental days**; they produce a **per-fill gas charge** instead.
- **Table** `refill_rate`: `(gas_code?, capacity_m3?, capacity_unit, amount, effective_from, effective_to?)` — specificity gas > size (not client-specific); amount = ARS **per fill** (no `period`). DB may retain a nullable `client_party_id` column unused by the product.
- **Billing:** draft runs emit charge lines with `unit = "fill"`, `quantity = 1`, description `Recarga <serial> · <gas> · <size>`. Period mode bills REFILL by `delivery_date` in window; history bills open REFILL rows.
- **Close:** returning a REFILL closes the movement without putting the cylinder into our stock (`AT_CLIENT` / `FULL`); canje (swap) remains available.
- **UI:** Tarifas tab “Recargas”; nav “Recargas”; dashboard refill count + revenue chart via `GET /reports/refill`.
- **Canonical spec:** `014-refill-system.md` (requirements, ACs, implementation map). Cross-links: `003`, `004`, `006`, `007`, `009`, `workflows.md` W7/W20.

---

## Deviations from spec (flagged)

- None outstanding. D-1 aligns the CLIENT-role ambiguity to Phase 2; D-2/D-3 make the under-specified scoping/privacy rules concrete; all schema changes (D-1, D-5, D-6, D-8) are **additive** and consistent with `003` C4 (append-only ledger, additive evolution).
