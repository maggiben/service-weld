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

## Constraints

- C1. Integration/DB tests run against a **real PostgreSQL** (ephemeral container), not mocks, so constraints/triggers are exercised.
- C2. Tests are deterministic: inject the "as-of"/clock; no reliance on wall-clock for rental math.
- C3. CI runs the full suite on every change; migrations tested on a copy-shaped dataset.
- C4. Coverage target: 100% of business rules (`001`) have at least one passing positive + negative test.

## Acceptance Criteria

- AC1. Loading `schema.sql` into a fresh Postgres exits 0 in CI.
- AC2. Every BR-01…BR-20 has a passing enforcement test (negative case rejected with the mapped error).
- AC3. All 20 workflow E2E tests pass.
- AC4. Contract tests fail the build if the API diverges from the OpenAPI document.
- AC5. Offline-sync test proves no data loss and correct conflict routing.
- AC6. Migration test proves row-count reconciliation and exception-queue population on dirty fixtures.

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
