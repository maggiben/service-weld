# 007 — Reporting & Dashboards

> Source: `sdd.md` (Reports), `openapi_specification.md` §4.12, `frontend_design.md` §4.2/§4.24. Closes the biggest legacy gap: the spreadsheets had no reporting layer.

## Purpose

Provide accurate, performant reporting and role-aware dashboards over cylinder circulation, float/aging, rental revenue, **refill (gas fill) revenue**, losses, supplier returns, medical consumption, and data quality — with drill-down to source events.

## Requirements

- R1. Implement the report endpoints: `fleet`, `float-aging`, `outstanding`, `rental`, `refill`, `loss`, `supplier-returns`, `cylinder-life/{id}`, `medical-statement`, `data-quality`.
- R2. Implement **role-aware dashboards** with worklist widgets (my alerts, long-outstanding, supplier returns due, medical replenishment due, migration exceptions) and KPI cards (fleet by state/gas/owner/locality/client, float, losses, rental revenue, **refill revenue/count**).
- R3. Compute **float/aging** from open movements (`return_date IS NULL`), bucketed `>30/>90/>180/>365` days (BR-20).
- R4. Compute **rental revenue** = Σ(`rental_days` × effective rate) for closed rentals in period + accrued-to-date for open rentals (BR-03/BR-19), grouped by client/gas/territory.
- R5. Provide **cylinder life history** = full ordered circulation of a serial across all holders and years.
- R6. Provide the **medical/municipal statement** per patient (O2 deliveries, rental days, accessory rentals) for `MEDICAL`/`BILLING` (BR-18).
- R7. Provide a **data-quality report** (to-verify serials, ownership mismatches, out-of-range dates, orphan references) fed partly by `migration_exception` and runtime validation.
- R8. All reports: documented filters/sorts, CSV/PDF export, and drill-down to the underlying entity.
- R9. Compute **refill revenue** = Σ(resolved `refill_rate` per REFILL delivery in period), grouped by client/gas (`014` R13); dashboard chart shows quantity and revenue (e.g. by gas).

## Constraints

- C1. Reports are **read-only**; they never mutate ledger data.
- C2. Expensive reports run **async** (job handle + polling); interactive ones return within performance budget (`< 2s` for common queries).
- C3. Reporting respects role/territory scoping and hides medical data from unauthorized roles (`005`).
- C4. Accrued-days for open rentals computed relative to a well-defined "as-of" date (default `today` in the business timezone).

## Acceptance Criteria

- AC1. Float/aging totals reconcile with the count of open movements per client/territory.
- AC2. Rental revenue for a client/period equals the sum of its charge lines for that period (cross-check with `009`/billing).
- AC3. Cylinder-life history for a serial returns every movement in chronological order with correct holders and rental days.
- AC4. The medical statement lists exactly the O2 deliveries and accessory rentals for each `MUNICIPAL_HOSPITAL` patient in the period.
- AC5. Data-quality report surfaces seeded anomalies (bad dates, mismatches) after migration.
- AC6. Report parameter validation rejects unknown params with `422`.
- AC7. Refill report revenue for a period equals the sum of `fill` charge lines for REFILL movements in that period when rates resolve (`014` AC6).

## Edge Cases

- Open rentals spanning the period boundary → count accrued days within the as-of window; document the convention.
- Timezone: use the business timezone for "today"/period boundaries consistently.
- Voided/swapped movements excluded from revenue but visible in life history.
- Cross-owner duplicate serials disambiguated in life-history lookups by `(owner, serial)`.
- Empty ranges → explicit "No data for these parameters" (not an error).

## Dependencies

- `003` (indexes: partial open-movement + composite date indexes), `004` (endpoints), `009` (rate/rental logic), `014` (refill rates/report), `011` (migration_exception feed), `005` (scoping).

## Implementation Notes

- Build reporting on **read models / materialized views** refreshed on domain events or on a schedule; keep them separate from the write path.
- Use the partial indexes (`WHERE return_date IS NULL AND state='OPEN'`) for float/aging to keep queries fast.
- Precompute nightly **aging snapshots** and **accrual snapshots** via the scheduler (`012`) so dashboards are instant and historically comparable.
- Reconcile revenue reports against billing charge lines in tests to prevent divergence.
- **Chart rendering** for dashboards/reports is done in the frontend with **MUI X Charts** (`BarChart`/`LineChart`/`PieChart`/`SparkLineChart`/`Gauge`) per `006`; report endpoints return chart-ready aggregates (labels, series values) plus drill-down rows for the MUI X `DataGrid`.
