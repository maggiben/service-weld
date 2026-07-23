# 010 — Testing

> Testing strategy proving every business rule (`001`) and workflow (`W1`–`W20`). The DB invariant suite has already been executed successfully against PostgreSQL 16 (see `README.md` verification table) — reproduce it in CI.

## Purpose

Guarantee that the implementation enforces the domain rules, that the API honors its contract, that the UIs (incl. offline sync) behave correctly, and that migration is safe — with automated, repeatable tests gating every change.

## Requirements

- R1. **Database invariant tests** (integration, real Postgres): assert each BR is enforced — single-custody blocked, `rental_days`=67, refill-on-ours blocked, return-before-delivery blocked, future-date blocked, bad-CUIT blocked, duplicate-serial-per-owner blocked, audit rows written, SCD-2 history + version bump. (These exact checks were verified on PG16.)
- R2. **Unit tests** for domain services and pure functions: rate resolution precedence, rental/accrual math, CUIT validation, gas-alias normalization, state-transition guards.
- R3. **API contract tests**: use the **NestJS testing utilities** (`@nestjs/testing`) + `supertest` (e2e) against a real DB; validate requests/responses against the **Zod** schemas; assert the **Swagger-emitted** OpenAPI matches `openapi_specification.md` (parity test); error codes match §6; verify pagination/filter/sort/idempotency/`If-Match` behaviors. **JWT/guard tests** cover RBAC denials, territory scoping, and MFA gating (`005`).
- R4. **Workflow/E2E tests**: each `W1`–`W20` exercised end-to-end (register→deliver→return→bill; refill; swap; sell; loss; replace; supplier loop; transfer; reconciliation; medical cycle).
- R5. **Offline-sync tests** (field app): queue offline, sync, idempotent replay, and conflict resolution (cylinder taken meanwhile → `409` to conflict queue).
- R6. **Migration tests**: run the importer on representative legacy fixtures; assert clean vs flagged counts, dual-book merge, no dropped movements, correct exception classification (`011`).
- R7. **Reporting reconciliation tests**: revenue report equals billing charge lines; float/aging equals open-movement counts.
- R8. **Auth tests**: RBAC denials, territory scoping, MFA gating, medical-data hiding.
- R9. **Global coverage gate ≥80%**: every workspace package (`apps/api`, `apps/web`, `apps/field`, `apps/www`, `packages/domain`, `packages/schemas`, `packages/api-client`) MUST meet **≥80%** coverage on **lines, branches, functions, and statements**. Enforced by `pnpm run test:coverage` (`scripts/check-coverage.mjs`; override only via `COVERAGE_THRESHOLD`, default `80`). This is a hard gate — not aspirational.
- R10. **Local git quality gates** (see `012` R8 / `docs/DEVELOPMENT.md`):
  - **pre-commit** (`.husky/pre-commit`): `check:secrets` → `check:deps` → `check:id-length` (value bindings ≥2 chars; only `_` allowed short) → lint-staged (Prettier on staged files) → `typecheck`.
  - **pre-push** (`.husky/pre-push`): `test:coverage` (≥80% global gate).
  - Agents and humans MUST run the same checks before creating a commit; never bypass hooks (`--no-verify`) unless the user explicitly requests it.

## Constraints

- C1. Integration/DB tests run against a **real PostgreSQL** (ephemeral container), not mocks, so constraints/triggers are exercised.
- C2. Tests are deterministic: inject the "as-of"/clock; no reliance on wall-clock for rental math.
- C3. CI runs the full suite on every change (format, typecheck, unit tests, **coverage ≥80%**, build) plus schema load + invariants; migrations tested on a copy-shaped dataset.
- C4. Coverage target: 100% of business rules (`001`) have at least one passing positive + negative test.
- C5. The **80% global metric gate** (R9) is independent of C4: BR/workflow proof is qualitative completeness; line/branch/function/statement % is quantitative and applies to every package listed in R9.

## Acceptance Criteria

- AC1. Loading `schema.sql` into a fresh Postgres exits 0 in CI.
- AC2. Every BR-01…BR-20 has a passing enforcement test (negative case rejected with the mapped error).
- AC3. All 20 workflow E2E tests pass.
- AC4. Contract tests fail the build if the API diverges from the OpenAPI document.
- AC5. Offline-sync test proves no data loss and correct conflict routing.
- AC6. Migration test proves row-count reconciliation and exception-queue population on dirty fixtures.
- AC7. `pnpm run test:coverage` exits 0; any package below 80% lines/branches/functions/statements fails the gate (CI job + pre-push hook).
- AC8. A commit that would fail secrets check, Prettier on staged files, or typecheck is rejected by the pre-commit hook.

## Edge Cases

- Same-day deliver+return (rental_days 0); multi-year open rental accrual.
- Cross-owner duplicate serial handling.
- Idempotent replay of a create with the same key.
- Concurrency: two updates racing → one gets `409 VERSION_CONFLICT`.
- Dirty migration fixtures: 2047/2048 dates, ERROR cells, `buroni`-in-date, multi-serial cells, near-duplicate client names.

## Dependencies

- All specs (tests validate them). Tooling: container runtime for Postgres, a contract-test runner driven by the OpenAPI doc, an E2E driver for the web/field apps.

## Implementation Notes

- Provide **test data builders/factories** for parties, cylinders, movements, rates to keep tests readable.
- Reuse the verified DB smoke suite as the seed of the invariant test file; expand to all 20 BRs.
- Tag tests by BR/workflow id so coverage maps directly to `001`/`workflows.md`.
- Keep a small, curated **legacy fixture set** (a few real-shaped sheets, anonymized) for migration tests.
- **Before every commit:** run (or rely on) the pre-commit hook checks — `pnpm run check:secrets`, Prettier on touched files, `pnpm run typecheck`. **Before every push:** ensure `pnpm run test:coverage` passes (≥80% per package). Do not create a git commit until those checks pass; do not use `--no-verify` to skip them.
- Coverage tooling: Node `--experimental-test-coverage` for non-API packages; Jest `--coverage` + `coverageThreshold.global` (80) for `@weld/api`. The monorepo gate is `scripts/check-coverage.mjs`.
