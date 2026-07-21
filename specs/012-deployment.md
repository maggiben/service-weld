# 012 — Deployment & Operations

> How to run, secure, schedule, observe, and back up the system in production. Source: `sdd.md` (non-functional requirements), `database.md` (partitioning/backups).

## Purpose

Define the deployment topology, configuration, scheduled jobs, observability, and operational runbook needed to run the system reliably for a small distributor with offline field users.

## Requirements

- R1. Deploy components: **API service** (NestJS on Node LTS; serves REST + Swagger UI at `/api/docs`), **web app** (Next.js App Router), **field app** (Next.js App Router PWA), **PostgreSQL 15+**, **scheduler/worker** (NestJS scheduler or separate worker), **object store** (exports/backups), **notification gateway** (email/SMS/push). Reverse proxy with TLS in front.
- R2. Provide environment configuration for: DB connection/pool, identity provider/secrets, business timezone, rental rounding/min-day policy, alert thresholds (long-outstanding days, supplier-overdue days), export/accounting endpoint.
- R3. Implement **scheduled jobs** (worker): pre-create next month's `audit_log` partition; nightly aging + accrual snapshots for `007`; alert generation (long-outstanding, supplier-overdue, medical replenishment-due, pending owner returns); export retries.
- R4. Implement **backups**: daily base backup + WAL for point-in-time recovery; periodic restore drills; export artifacts retained per fiscal policy.
- R5. Implement **observability**: structured logs with `request_id` correlation across API/audit/notifications, metrics (request latency, error rates, job durations, sync backlog), health/readiness checks, and alerting on failures.
- R6. Implement **CI/CD**: run the full test suite (`010`) incl. schema load + invariant tests, format/typecheck, unit tests, and the **≥80% global coverage gate** (`pnpm run test:coverage`); apply DDL migrations on deploy; zero-downtime rollout where possible.
- R7. Enforce **security** in ops: TLS everywhere, secrets in a manager (never in images), least-privilege DB roles (app role has no `UPDATE/DELETE` on `audit_log`), MFA for privileged users.
- R8. Enforce **local git hooks** (Husky, `core.hooksPath=.husky`, installed via `prepare` / `scripts/install-hooks.mjs`) that mirror CI intent:
  - **pre-commit:** `pnpm run check:secrets` → lint-staged (Prettier) → `pnpm run typecheck`.
  - **pre-push:** `pnpm run test:coverage` (≥80% lines/branches/functions/statements on every workspace package — `010` R9).
  - Commits MUST NOT be created without these checks having passed; `--no-verify` / skipping hooks is forbidden unless the user explicitly requests a bypass.

## Constraints

- C1. PostgreSQL is the single source of truth; app instances are stateless (session GUCs set per request/transaction).
- C2. The field app must remain usable during API/DB outages (offline cache + queue) and sync on recovery.
- C3. Accounting/AFIP export is an **external dependency**; failures are retriable and alertable, and must not corrupt billing state (stay "approved, not exported").
- C4. Schema evolution is additive; never destructive to ledger tables (`003` C4).
- C5. Business timezone (Argentina) is configured centrally and used for all "today"/period boundaries.
- C6. Local hooks and CI MUST stay aligned: a change that passes locally but would fail CI (or vice versa) is a process bug — fix the gate, do not weaken it.

## Acceptance Criteria

- AC1. A fresh environment can be provisioned from config + `schema.sql` + migrations and pass a smoke test (login, create client, deliver, return, report).
- AC2. The scheduler creates the upcoming `audit_log` partition before month rollover; a missing month never causes insert failure (DEFAULT partition safety net).
- AC3. A simulated accounting-export outage leaves billing in "approved, not exported" and raises an alert; retry succeeds after recovery.
- AC4. A restore drill recovers the DB to a chosen point in time.
- AC5. Logs for a single request correlate across API, audit, and any triggered notification via `request_id`.
- AC6. CI blocks deploy if the schema fails to load, any invariant/contract test fails, or coverage falls below 80% on any gated package.
- AC7. After `pnpm install`, git hooks are active (`core.hooksPath=.husky`); committing without secrets/Prettier/typecheck passing fails; pushing without coverage ≥80% fails.

## Edge Cases

- Clock skew across app instances → rely on DB `now()`/business-tz config for business dates, not instance clocks.
- Connection pooling leaking session GUCs → use `SET LOCAL` within the transaction.
- Large migration run → run out-of-band with elevated resources; throttle to avoid impacting live traffic.
- Notification gateway down → queue and retry; never block a business operation on a notification.
- Growth of `movement_event` → follow `003` C2 partitioning plan (introduce `cylinder_open_holding` before partitioning).

## Dependencies

- All specs; especially `003` (schema/partitions/backups), `005` (secrets/identity), `007` (snapshot jobs), `010` (CI gates), `011` (migration run environment).

## Implementation Notes

- Containerize each service; run PostgreSQL managed or containerized with persistent volumes and tuned pooling.
- Keep the DDL baseline (`schema.sql`) plus incremental migration files under version control; apply via a migration tool in the deploy pipeline.
- Schedule partition creation and snapshot jobs with idempotent, observable workers; alert on job failure.
- Document a runbook: deploy, rollback, backup/restore, partition maintenance, and migration re-run procedures.
- **Quality gates (local ↔ CI):** `.husky/pre-commit`, `.husky/pre-push`, `.github/workflows/ci.yml`, and `scripts/check-coverage.mjs` are the source of truth for what must pass. Agents: never commit until secrets + format + typecheck pass; never push until `test:coverage` passes. See `docs/DEVELOPMENT.md` § Quality gates.
