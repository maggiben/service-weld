# 001 — Business Rules

> The canonical, testable rules of the domain. Every other spec references these by ID. Source: `sdd.md` §Business Rules, verified against legacy data.

## Purpose

Define the invariants and terminology that govern all cylinder custody, rental, refill, and billing behavior, so that they are enforced consistently at the **database**, **API**, and **UI** layers and are independently testable.

## Requirements

Implement and enforce the following rules. Each is a `MUST`.

- **BR-01 Single custody.** A cylinder (or battery) has at most one `OPEN` movement at any instant; its custody intervals never overlap.
- **BR-02 Cylinder identity.** A cylinder is uniquely identified by `(owner, serial_number)`; the same serial MAY exist under different owners.
- **BR-03 Rental days.** `rental_days = return_date − delivery_date` (calendar days), computed by the system; while `OPEN`, accrued days = `today − delivery_date`. Never manually entered; never an error value.
- **BR-04 Date monotonicity.** For any movement `delivery_date ≤ return_date`; supplier-loan four dates are non-decreasing.
- **BR-05 Plausible dates.** Movement dates within `[2000-01-01, today + 30 days]`.
- **BR-06 Terminal exclusivity.** After `SOLD | LOST | BROKEN | RETURNED_TO_SUPPLIER | RETIRED`, no new rental movement may be created for that cylinder.
- **BR-07 Owner⇔basis.** `OURS`⇒owner is the SELF party; `SUPPLIER`⇒owner is a SUPPLIER/SUBDISTRIBUTOR party; `CUSTOMER`⇒owner is a CUSTOMER party.
- **BR-08 Refill⇔customer.** `movement_kind = REFILL` iff `property_basis = CUSTOMER`; otherwise `RENTAL`. Rental accrues only on `RENTAL`.
- **BR-09 Sale precondition.** A cylinder with an `OPEN` rental cannot be sold; a cylinder is sold at most once.
- **BR-10 Accessory recovery.** A client account cannot be closed while it holds an accessory `ON_LOAN`.
- **BR-11 Supplier loop order.** Loan stages advance forward-only with non-decreasing dates: received → out-to-client → back-from-client → returned-to-supplier.
- **BR-12 Loss liability routing.** Loss of a supplier-owned cylinder raises a supplier-liability alert; loss of ours proposes a client charge-back.
- **BR-13 Battery integrity.** A cylinder belongs to at most one active battery and cannot circulate independently while packed; a battery has ≥2 members.
- **BR-14 Structured origin.** Movement origin is a structured party reference, never free text in a date field.
- **BR-15 Controlled vocabularies.** `gas_type`, states, `accessory_type`, `coverage`, `locality` map to defined enumerations/reference data; legacy variants normalized via alias map.
- **BR-16 Single-event posting.** A physical movement is recorded once and projected to both client and cylinder views; the two never diverge.
- **BR-17 CUIT validity.** If present, CUIT matches `^\d{2}-\d{8}-\d$` and passes mod-11; client uniqueness by CUIT.
- **BR-18 Medical coverage billing.** `MUNICIPAL_HOSPITAL` clients route to the municipal billing profile.
- **BR-19 Rate application.** `rental_charge = accrued_days × effective_rate`, using the rate in force at the time (rate history preserved).
- **BR-20 Outstanding = open.** A movement with no return date means the cylinder is still at the client (float).

**Terminology (ubiquitous language):** cilindro/tubo=cylinder, batería=battery pack, cliente=client, Nuestra Propiedad (N/P)=OURS/rental, Su Propiedad (S/P)=CUSTOMER/refill, entrega=delivery, devolución=return, vacío/lleno=empty/full, alquiler=rental, cambio=swap, remito=delivery note, regulador/adaptador/mochila=accessories, vendido/perdido/roto/reemplazado=sold/lost/broken/replaced, reparto=route/territory.

## Constraints

- Rules `MUST` be enforced at the **database layer** where expressible (constraints, triggers — see `003`), re-validated at the **API layer**, and surfaced proactively in the **UI** (block before submit).
- Rule violations `MUST` produce the mapped API error code (see `004`/`openapi_specification.md` §6), e.g. `CYLINDER_ALREADY_OUT` (BR-01), `KIND_BASIS_MISMATCH` (BR-08).
- Rules are versioned with the spec; changing a rule requires updating tests in `010`.

## Acceptance Criteria

- AC1. Each BR has at least one automated test that asserts a valid case passes and an invalid case is rejected with the correct error.
- AC2. Attempting a second overlapping `OPEN` movement for a cylinder is rejected (BR-01).
- AC3. Returning a rental computes `rental_days` matching `return−delivery` for 100% of sampled rows (BR-03) — reference value: 2013-05-20→2013-07-26 = 67.
- AC4. A `REFILL` on an `OURS` cylinder is rejected (BR-08); a `RENTAL` accrues rental, a `REFILL` does not (BR-08/BR-19). Gas fill pricing and billing for REFILL: see `014` / D-19.
- AC5. Selling a cylinder that is `AT_CLIENT` is rejected (BR-09).
- AC6. An invalid CUIT (format or check digit) is rejected (BR-17).

## Edge Cases

- Same-day deliver-and-return → `rental_days = 0`, valid (BR-03/BR-05); half-open intervals allow a new same-day delivery.
- Cylinder ownership reclassification (e.g. discovered to be customer's) → correction path, not a silent flip (BR-07/BR-08).
- Legacy free-text in date column (`buroni`) → must become a structured origin party (BR-14).
- Open rentals older than expected → still `OPEN`, surfaced by reports, not auto-closed (BR-20).

## Dependencies

- `002` domain model (entities the rules constrain), `003` database (enforcement mechanisms), `009` rental system (BR-03/19), `008` inventory (BR-01/06/13), `007` reporting (BR-20), `010` testing.

## Implementation Notes

- Keep a single machine-readable **rules registry** (id → description → enforcement point → error code → test id) so agents can trace each rule end-to-end.
- Enforcement priority: DB constraint > DB trigger > API validation > UI guard. Prefer the strongest available layer; never rely on UI alone.
- BR-05 upper bound cannot be a DB `CHECK` (`CURRENT_DATE` is not immutable) → enforce via trigger + API validation (see `003`).
