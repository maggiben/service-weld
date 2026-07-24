# 002 — Domain Model

> Source: `domain.md`. Defines entities, aggregates, value objects, enumerations, and their invariants for the code model. Maps 1:1 to the database in `003`.

## Purpose

Provide the canonical object model the application layer implements, independent of transport (API) and storage (DB). Establish aggregate boundaries and the single-event design that eliminates the legacy dual-book duplication.

## Requirements

- R1. Implement these **aggregate roots**: `Cylinder`, `CylinderBattery`, `Client` (with `ClientAccount`), `Accessory`, `CylinderSale`, `Party`, `DispatchTerritory`.
- R2. Implement the central transactional entity **`MovementEvent`** (one delivery→return cycle) with two read projections: client-account view and cylinder-history view. There is exactly **one** stored event per physical movement (BR-16).
- R3. Implement supporting entities: `AccessoryRental`, `SupplierLoanCycle`, `StockTransfer`, `DeliveryNote`, `RentalRate`, `Invoice`+`ChargeLine`.
- R4. Model **value objects**: `CylinderSerialNumber`, `Capacity(value, unit)` where unit ∈ `{M3, KG}` (D-18), `RentalPeriod(days)`, `CUIT`, `Address`, `Locality`, `Contact`, `Money(ARS)`, `OwnershipTag`, `DeliveryInstruction`, `DateStamp`.
- R5. Model **enumerations** exactly as in `003`/`schema.sql`: `party_type, ownership_basis, cylinder_state, cylinder_cond, packaging_kind, movement_kind, movement_state, accessory_type, accessory_state, accessory_rental_state, charge_basis, client_coverage, client_status, client_segment, loan_stage, rate_period, invoice_status, capacity_unit`.
- R6. Encode entity **relationships**: Party owns Cylinders; Client extends Party (1:1); ClientAccount composes MovementEvents & AccessoryRentals; Cylinder composes its circulation history; Battery composes member Cylinders.
- R7. Encode entity **lifecycles/states** and expose valid transitions (see `008` inventory state machine and `sdd.md` state diagrams).

## Constraints

- C1. `MovementEvent` and the legacy "CirculationEntry" are the **same event** — do not create two writable records (BR-16).
- C2. Cylinder identity is `(owner, serial_number)` (BR-02), not serial alone.
- C3. Aggregate consistency boundaries: invariants that must hold transactionally live inside one aggregate (e.g., single-custody is enforced at the Cylinder/movement boundary — see `003` for the DB mechanism).
- C4. Value objects are immutable and self-validating (e.g., `CUIT` validates format + check digit on construction).
- C5. Money is decimal, never float; capacity is decimal magnitude with an explicit unit (`M3` or `KG`, D-18) — never convert between units.

## Acceptance Criteria

- AC1. The code model exposes every entity, VO, and enum listed above with names matching `003`.
- AC2. Constructing an invalid value object (bad CUIT, negative capacity, negative money) fails fast.
- AC3. A `MovementEvent` can be projected to both a client-account row and a cylinder-history row without a second persisted record.
- AC4. State-transition helpers reject illegal transitions (e.g., delivering a `SOLD` cylinder).
- AC5. Ownership/property-basis consistency (BR-07/BR-08) is expressible and validated in the model.

## Edge Cases

- Battery treated as a unit for movement while retaining member identity (BR-13).
- A cylinder whose gas changes over its life (re-purposed) — gas is a mutable attribute with history (see `003` SCD-2).
- Customer-owned cylinders (`ownership_basis = CUSTOMER`) participate only in `REFILL` movements. Full Su Propiedad refill module: spec `014`.
- Parties that are both counterparties and owners (sub-distributors) — single `Party` supertype handles this.

## Dependencies

- `001` business rules (invariants), `003` database (persistence mapping), `009`/`008` (behavior using the model).

## Implementation Notes

- Prefer a thin domain layer: entities + value objects + domain services (e.g., `deliverCylinder`, `returnCylinder`, `computeRentalDays`) with the DB enforcing hard invariants.
- Implement the domain as framework-light TypeScript (entities, value objects, domain services) consumed by **NestJS providers**; keep it decoupled from transport. Define API **transport DTOs as Zod schemas** (`004`, `nestjs-zod`), separate from domain types, to avoid coupling; the Swagger-emitted OpenAPI is derived from those Zod DTOs.
- Keep enums as a single shared definition consumed by domain, API, and DB seed to prevent drift (BR-15).
- Do not embed billing money in `MovementEvent`; billing is derived (see `009`).
