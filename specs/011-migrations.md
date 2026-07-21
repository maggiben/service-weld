# 011 — Data Migration (Legacy Workbooks → System)

> Source: `sdd.md` (migration), `database.md` (`migration_exception`, `gas_alias`). Imports the three legacy `.xls` workbooks into the new model, cleaning and reconciling as it goes. Distinct from DDL/schema migrations (which are additive and tracked separately).

## Purpose

Ingest the legacy data — `CILINDRO CLIENT REPARTO` (291 client sheets, Junín), `CILINDROS CLIENTES CHACABUCO` (366 client sheets), `CILINDROS PROPIOS` (1,483 cylinder sheets) — into the normalized schema, merging the dual books into single movement events, normalizing vocabularies, and quarantining bad rows for human review.

## Requirements

- R1. Parse the `.xls` workbooks (BIFF) sheet by sheet: client ledgers (two panes: Nuestra Propiedad/rental, Su Propiedad/refill) and per-cylinder circulation sheets, plus special sheets (`CILINDROS VENDIDOS`, `INTERGAS N-PROPI`, `NORDELTA`, `ceres`, `ezequiel`).
- R2. Create **parties** (SELF, suppliers Linde/Intergas/Nordelta/DSJ, sub-distributors Ceres/Pantiga/Ezequiel/Tito/Buroni), **clients** (from sheet headers: name, CUIT, address, locality, phones, coverage `HOSP.MUNIC.`→MUNICIPAL_HOSPITAL), and **cylinders** (from `PROPIOS`, keyed `(owner, serial)`; ownership inferred from tags `propio`/`linde`/`(intergas)`).
- R3. Create **movement events** from client-ledger rows; **merge** the mirror rows in the cylinder sheets into the same event (BR-16) — do not create duplicates.
- R4. Normalize **gas types** via `gas_alias` (`o/ox/oxigeno`→O2, `elio/helio`→HELIUM, `at/ata`→ATAL, etc.); unknown → exception + provisional mapping.
- R5. **Recompute** rental days from dates (do not trust legacy cells); never import ERROR/derived values.
- R6. Create **sales** (`CILINDROS VENDIDOS`), **supplier loan cycles** (`NORDELTA`, `INTERGAS N-PROPI`), **accessory rentals** (regulator/adapter/mochila notes), and **batteries** (from `bat` sheets + member serials).
- R7. Route every unparseable/suspect row to **`migration_exception`** with a reason; produce a **reconciliation report** (rows read, imported clean, flagged, by reason).
- R8. Be **idempotent** and **re-runnable** (dry-run mode + resumable), keyed so re-imports don't duplicate.

## Constraints

- C1. Migration `MUST NOT` drop a movement silently; every source row is either imported or in the exceptions queue.
- C2. Respect all `001` invariants; rows that would violate them (e.g., overlapping custody from dirty data) go to exceptions, not force-inserted.
- C3. Bulk load with audit/history triggers considered — either capture migration under `app.source='migration'` or load with triggers disabled and backfill history deliberately (document the choice).
- C4. Dates outside `[2000-01-01, today+30]` (e.g., 2047/2048) are flagged, not imported as-is.
- C5. Free-text-in-date-cell (`buroni`) becomes a structured origin party or an exception.

## Acceptance Criteria

- AC1. Row-count reconciliation: `read = imported_clean + flagged` for every workbook; report emitted.
- AC2. A movement present in both a client sheet and a cylinder sheet results in exactly **one** `movement_event`.
- AC3. Gas variants are normalized to canonical codes; unmapped variants appear in exceptions.
- AC4. Cross-owner duplicate serials import as distinct cylinders under different owners.
- AC5. Re-running the importer produces no duplicates (idempotent).
- AC6. Seeded dirty rows (bad dates, ERROR cells, multi-serial cells, near-duplicate clients) land in `migration_exception` with correct reasons.

## Edge Cases

- Multi-serial cell (`6035 -169432 -192072`) → split into linked movements or a battery.
- `A(B)` swap notation (`241846(5567)`) → SWAPPED movement with linkage.
- Near-duplicate client names across the two route-books → dedup/merge with human confirmation; same client may legitimately exist in both territories.
- Blank return dates → import as open movements (still-out), not fabricated returns.
- `PH` gas prefix (unresolved meaning) → provisional mapping + exception flag for business clarification.

## Dependencies

- `003` (target schema + `migration_exception` + `gas_alias`), `002` (entity mapping), `010` (migration tests), `012` (run environment). Parsing tooling capable of reading legacy BIFF `.xls`.

## Implementation Notes

- Two-phase: **extract+stage** (raw rows → staging tables/JSON) then **transform+load** (validate, map, merge, insert) so re-runs and diffs are cheap.
- Maintain an explicit **mapping table** (legacy token → canonical id) for gas, party names, localities; grow it as exceptions are resolved.
- Provide a `--dry-run` that produces the reconciliation report without writing, and a resumable checkpoint per sheet.
- Feed unresolved exceptions into the `007` data-quality report and the `frontend_design.md` §4.29 migration-exceptions UI for human cleanup.
