# 009 — Rental & Billing System

> Source: `sdd.md` (Rental Logic), `workflows.md` (W5/W6/W11/W20), `database.md` (`rental_rate`, generated `rental_days`). This is the commercial core — the only computed value in the legacy system and the basis for billing.

## Purpose

Compute rental duration and charges deterministically for cylinders on hire and accessories on loan, apply the correct effective rates, and produce billing data for the external accounting system — replacing the legacy manual day-count that produced ERROR cells.

## Requirements

- R1. Compute **rental days** = `return_date − delivery_date` (calendar days) for `RENTAL` movements; for open rentals expose **accrued days** = `as_of − delivery_date` (BR-03).
- R2. Accrue rental **only** for `property_basis ∈ {OURS, SUPPLIER}`; `REFILL` (CUSTOMER-owned) accrues **no rental**, only a gas charge (BR-08/BR-02). Gas-charge pricing, custody close, and UI for Su Propiedad are specified in **`014`** (D-19).
- R3. Resolve the **effective rental rate** for a movement/period from `rental_rate` by most-specific match among active rows: null `gas_code` / `capacity_m3` act as wildcards (“any gas” / “any size”); when capacity is set, match both magnitude **and** `capacity_unit` (D-18 — m³ rates must not match kg cylinders); prefer client over gas over capacity; honor `effective_from/to` (rate history, BR-19).
- R4. Compute **rental charge** = accrued/closed days × effective daily rate; support monthly rates prorated to days.
- R5. Compute **accessory rental charges** (regulator/adapter/mochila) in parallel; `FREE_LOAN` accrues none (W11).
- R6. Implement **billing runs** (W20): for a period and optional client, produce invoices with charge lines traced to source movements/accessory rentals **and REFILL gas fills** (`unit=fill`, `014` R9–R11); support **draft → approve → export** with statuses.
- R7. Route **medical** (`MUNICIPAL_HOSPITAL`) clients to the municipal billing profile/statement (BR-18, `007`).
- R8. Stop accrual at movement `CLOSED/SWAPPED/SOLD/LOST`; on sale, convert remaining liability appropriately (BR-09).
- R9. Resolve **refill unit price** from `refill_rate` via the same specificity ladder as R3 (no period/daily conversion); see `014` R6–R8.

## Constraints

- C1. `rental_days` is authoritative from the DB generated column; the app never re-derives or overrides it (BR-03).
- C2. Money is `numeric(14,2)` ARS; rounding rules configurable and documented (e.g., min-day, same-day handling).
- C3. Billing is derived; the ledger holds no money on `movement_event`.
- C4. Historical invoices reprice at the **rate in force at the time**, not the current rate.
- C5. Exported/approved periods are locked; corrections require void + re-run (append-only).

## Acceptance Criteria

- AC1. A rental 2013-05-20→2013-07-26 yields `rental_days = 67`; charge = 67 × effective rate.
- AC2. A `REFILL` movement yields no rental charge; a gas charge is produced instead (details and ACs in `014`).
- AC3. For client with daily rate 85 and 44 accrued days, rental charge = 3740.
- AC4. Open rentals bill on accrued-to-date days; no rental is un-billable due to a missing return (no ERROR states).
- AC5. Rate change mid-history: an invoice for a past period uses the past rate.
- AC6. Billing run: draft totals equal Σ charge lines; approve requires MFA; export requires approved.

## Edge Cases

- Same-day deliver+return → `rental_days = 0`; apply configured min-day rule if any.
- Long-open rental (years) → accrues to as-of date; flagged by reports; still billable.
- Overlapping rate rows for same (client, gas, capacity) → rejected at rate creation (`409 RATE_OVERLAP`).
- Laser-O2 flagged for rental (`COBRAR ALQUILER OXIGENO LASER`) → normal rental accrual applies.
- Voiding a movement that fed a not-yet-exported draft → charge line removed on re-run; exported → blocked.

## Dependencies

- `003` (generated `rental_days`, `rental_rate`, `refill_rate`), `008` (movement custody effects), `007` (revenue reports reconcile), `004` (billing endpoints), `005` (MFA for approve/export), `014` (refill pricing + fill charge lines).

## Implementation Notes

- Keep rate resolution in one pure function (inputs: client, gas, capacity m³, date) with unit tests over the precedence matrix.
- Compute billing from a period query over movements (closed + open-accrued) + accessory rentals; attach `source_table/source_id` to every charge line for traceability.
- Define the "as-of" date and rounding / **min-day** policy in **system settings** (`business_timezone`, `rental_min_days` — D-13 / D-14); env vars are boot defaults only. Document defaults (`rental_min_days = 0`); test both same-day and multi-year rentals.
- Reconcile billing output against the rental report (`007`) in an integration test to prevent divergence.
