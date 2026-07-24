# 014 — Refill / Rellenado (Su Propiedad)

> Source: `workflows.md` (W7, W20), `001` BR-08, `009` R2/AC2, D-19. Implements the gas-fill commercial path for **customer-owned** cylinders — the legacy right-pane _Su Propiedad (S/P)_ vacío→lleno cycle.

## Purpose

Track cylinders that clients bring for refill (their property), price the gas fill by gas and cylinder size, close or exchange the fill cycle without treating the unit as our stock, bill a **per-fill gas charge** (never rental days), and surface refill volume/revenue on the management dashboard.

## Requirements

### Domain & custody (W7)

- R1. A refill is a `movement_event` with `movement_kind = REFILL` and `property_basis = CUSTOMER` (BR-08 / `ck_move_kind_basis`). Rental days are **not** accrued (`rental_days` display/sort is null for REFILL).
- R2. `POST /movements` with `movement_kind = REFILL` delivers/registers the fill against a **customer-owned** cylinder (`ownership_basis = CUSTOMER`). Deliverability allows `AT_CLIENT` as well as plant stock states when `forRefill` (empty→full cycle while the client retains ownership).
- R3. **Close (devolver):** `PATCH /movements/{id}/return` on an OPEN REFILL sets `state = CLOSED`, `return_date`, and leaves the cylinder `AT_CLIENT` / `FULL` — **must not** move it to `IN_STOCK_EMPTY` (that path is only for our/supplier rental returns).
- R4. **Swap (canjear):** `PATCH /movements/{id}/swap` remains available for OPEN REFILL (empty-in / full-out exchange of customer serials).
- R5. **Void (anular):** `POST /movements/{id}/void` follows the same append-only rules as other movements; blocked when locked charge lines exist (`409 ALREADY_BILLED`).

### Pricing board (D-19)

- R6. Persist **per-fill** prices in `refill_rate` (migration `0011_refill_rate`):  
  `(gas_code?, capacity_m3?, capacity_unit, amount, effective_from, effective_to?)`.
  Null gas / capacity = wildcards. No client dimension. No `period` column — `amount` is ARS **per fill**.
- R7. Resolve price by specificity: gas (2) > capacity (1); capacity match requires magnitude **and** `capacity_unit` (D-18). Overlapping active windows on the same key → `409 RATE_OVERLAP`.
- R8. Expose CRUD: `GET/POST /refill-rates`, `PATCH /refill-rates/{id}` gated by `rates:read` / `rates:write` (same roles as rental rates).

### Billing (W20 / 009 R2)

- R9. Billing draft runs (`009` R6) MUST emit gas charge lines for non-`VOID` REFILL movements:
  - `source_table = "movement_event"`, `source_id = movement.id`
  - `unit = "fill"`, `quantity = 1`, `unit_price` / `amount` = resolved refill price
  - description shape: `Recarga <serial> · <gas> · <size>`
- R10. **Period mode:** bill REFILL rows whose `delivery_date` falls in `[period_start, period_end]`.  
  **History mode:** bill OPEN REFILL rows (`return_date IS NULL`) with `delivery_date ≤ today`.  
  Movements without a matching `refill_rate` increment `skipped_no_rate` (same counter as missing rental rates).
- R11. REFILL MUST NOT appear in the rental-days charge pass (`movement_kind = 'RENTAL'` only for day lines).

### API list enrichment

- R12. Movement list/detail MAY denormalize for grids: `capacity_m3`, `capacity_unit`, `locality_name`, `owner_party_id`, `owner_name`. Sort whitelist includes `capacity_m3`, `locality_name`, `owner_name` in addition to existing movement sorts.

### Reporting & dashboard (007)

- R13. `GET /reports/refill?period_start&period_end` (+ optional territory/gas/client filters) returns rows `{ client_party_id, client_name, gas_code, refill_count, revenue }` using `resolveRefillPrice` on each movement’s delivery date.
- R14. Management dashboard (`/dashboard`) MUST show refill KPI (count + revenue for the selected period) and a chart of quantity vs revenue (e.g. by gas), fed by `GET /reports/refill`.

### Web UI (006)

- R15. Nav item **Recargas** → `/refills` (capability `movements:read`): DataGrid of `filter[movement_kind]=REFILL`, columns serial (→ cylinder ledger), client (→ client ledger), entry/exit dates, gas, size, owner/provider, city, state; server sort; actions devolver / canjear / anular; create drawer defaults to REFILL.
- R16. **Tarifas** (`/rates`) MUST include a tab **Recargas / rellenado** for `refill_rate` CRUD (gas × size), distinct from rental day rates. Active tab MUST be reflected in the URL (`/rates?tab=refill`) so refresh / leave-and-return keeps Recargas selected.
- R17. Pure helpers live in `packages/domain` (`resolveRefillPrice`, `resolveRefillUnitPrice`, `refillChargeAmount`) and dashboard `*Logic.ts` with unit tests (≥80% coverage gate).
- R18. **Backfill** on the Recargas tab (`POST /refill-rates/backfill`, `rates:write` + `billing:write`): regenerate a history billing draft so OPEN REFILL movements reprice at current `refill_rate` rows (same affordance as rental backfill; no client daily defaults — refill rates are not client-scoped).

## Constraints

- C1. Never store money on `movement_event`; charges are derived at billing time (`009` C3).
- C2. `refill_rate` evolution is additive (`003` C4); apply via `pnpm db:migrate` (`0011_refill_rate`).
- C3. Do not reuse `rental_rate.period` for fills — keep day-rate semantics on `rental_rate` and fill-price on `refill_rate` (interface segregation / D-19).
- C4. Closing a REFILL must not invent our stock; customer keeps ownership.
- C5. Locale ARS / `dd/mm/yyyy`; capacity labels show `m³` / `kg` (D-18).

## Acceptance Criteria

- AC1. Creating a REFILL on an `OURS` cylinder returns `422 KIND_BASIS_MISMATCH`; on a `CUSTOMER` cylinder succeeds and opens custody without rental-day accrual.
- AC2. Returning an OPEN REFILL closes it (`CLOSED` + `return_date`) and leaves cylinder `AT_CLIENT`/`FULL`; returning a RENTAL still sets `IN_STOCK_EMPTY`.
- AC3. A billing draft for a period that includes a REFILL delivery produces a `fill` charge line equal to the resolved `refill_rate` and **zero** day lines for that movement.
- AC4. Overlapping `refill_rate` rows for the same (gas, capacity, unit) window return `409 RATE_OVERLAP`.
- AC5. `/refills` lists only REFILL movements; serial and client cells link to `/cylinders/{id}` and `/clients/{id}`; sort by gas/size/city/owner works via API sort params.
- AC6. Dashboard refill totals for a period equal Σ `GET /reports/refill` revenue and refill_count for that period.
- AC7. Tarifas → Recargas tab can create a global O2×10 m³ fill price; a subsequent REFILL for that gas/size resolves that amount in billing.

## Edge Cases

- Open REFILL with long vacío→lleno gap: still one gas charge on delivery date (period) or while open (history); no rental days.
- Missing refill rate: movement remains in ledger; billing skips with `skipped_no_rate`.
- Swap mid-cycle: original CLOSED as `SWAPPED`; new OPEN REFILL may bill separately when delivered.
- Capacity unit mismatch (m³ rate vs kg cylinder): rate does not apply (D-18).
- Void after draft: re-run removes charge line; after approve/export: void blocked.

## Dependencies

- `001` BR-08, `002` MovementEvent / OwnershipBasis, `003` (`refill_rate`, movement constraints), `004` movements + refill-rates + reports, `006` nav/screens, `007` dashboard/report, `009` billing engine, D-18 / D-19.

## Implementation Notes

- **DB:** `db/migrations/0011_refill_rate.up.sql` + baseline `schema.sql`; audit trigger `trg_audit_refill_rate`.
- **Domain:** `packages/domain/src/refill-rates.ts` (+ tests); export from package index.
- **Schemas:** `packages/schemas/src/refill-rate.ts`; movement optional denorm fields; `RefillReport*` in `reports.ts`. After editing schemas source, run `pnpm --filter @weld/schemas build` so API `createZodDto` / Nest do not keep a stale `dist` (e.g. old `client_party_id` on refill rates).
- **API:** `apps/api/src/refill-rates/` module; billing second pass in `billing.repository.ts`; `ReportsRepository.refill`; movement `closeRefill` vs `closeReturn`.
- **Web:** `RefillsPage`, `RefillRatesPanel` (Rates tabs), AppShell `NAV_ITEMS` `/refills`, dashboard refill KPI/chart via `dashboardLogic.refillTotals` / `refillChartByGas`.
- **Ops:** after deploy, run `pnpm db:migrate` before using Tarifas Recargas or billing gas lines.
- Cross-check: reconcile `GET /reports/refill` revenue against Σ approved `fill` charge lines in integration tests (same pattern as rental vs billing in `009`/`007`).

### Findings (Tarifas / Recargas UI — 2026-07-23)

Symptom: after creating refill rates manually, leaving Tarifas (or refreshing) made the rows “disappear” from the Recargas tab.

| Check        | Result                                                                                                                                                                                                                                                                                                |
| ------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Persistence  | **OK** — `POST /refill-rates` inserts into `refill_rate`; `GET /refill-rates` returns the rows.                                                                                                                                                                                                       |
| Root cause A | Tab lived only in React `useState("rental")`, so `/rates` always reopened on **Alquiler**. Fix: URL `?tab=refill` (`RatesPage` + `Suspense` around `useSearchParams`).                                                                                                                                |
| Root cause B | Keeping both tab panels mounted with `display: none` made MUI X **DataGrid** measure **0×0** while hidden; when Recargas was shown again the grid stayed empty even though React Query had data. Fix: **mount only the active tab** (conditional render), never hide a DataGrid with `display: none`. |

Do not treat an empty Recargas grid as a DB/API failure until `GET /api/v1/refill-rates` and `SELECT … FROM refill_rate` are checked.
