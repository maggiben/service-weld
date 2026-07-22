# 008 — Inventory & Cylinder Tracking

> Source: `workflows.md` (W2, W9, W12–W16, W18, W19), `domain.md`, `database.md`. Covers the physical-asset side: cylinders, batteries, accessories, custody, states, transfers, supplier loops, reconciliation.

## Purpose

Track every physical cylinder, battery, and accessory through its full lifecycle and location, guaranteeing single custody, correct ownership, and accurate stock counts derived from state.

## Requirements

- R1. Implement **cylinder registration** with `(owner, serial)` identity, gas, capacity as `(magnitude, capacity_unit ∈ {M3,KG})` (D-18), ownership basis, packaging, home territory (W2, BR-02/07). List/detail UIs MUST show the unit beside the magnitude.
- R2. Implement **custody transitions** driven by movements: `IN_STOCK_* ↔ AT_CLIENT ↔ AT_SUPPLIER`, terminal `SOLD/LOST/BROKEN/RETURNED_TO_SUPPLIER/RETIRED` (state machine in `sdd.md`).
- R3. Enforce **single custody** (BR-01): at most one open holding per cylinder.
- R4. Implement **batteries** (W2): create with ≥2 members, member cannot be in two active batteries or circulate independently (BR-13); a battery moves as a unit.
- R5. Implement **loss/broken** (W12): terminal state, supplier-liability alert if supplier-owned, client charge-back proposal if ours (BR-12).
- R6. Implement **replacement** (W13) as a single linked event updating both original and replacement.
- R7. Implement **supplier loan loops** (W14/W15): 4-stage tracking, forward-only, aging worklist for overdue returns (BR-11).
- R8. Implement **stock transfers** between nodes/territories (W16) with a **structured origin/destination party** (BR-14).
- R9. Implement **reconciliation** (W18): outstanding-cylinder lists (open movements), physical-count vs system variance, "to-verify" flags; and **sub-distributor disposition** (W19).
- R10. Implement **accessories** inventory + loans (W11): one active loan per unit; states `IN_STOCK/ON_LOAN/IN_REPAIR/LOST/BROKEN/RETIRED`.

## Constraints

- C1. Stock counts are **derived from cylinder state**, never manually tallied.
- C2. Ownership pool segregates OURS / SUPPLIER(named) / CUSTOMER for valuation and liability.
- C3. A cylinder in a terminal state accepts no new rentals (BR-06).
- C4. Custody changes and their reciprocal movement effects happen in one transaction (no partial updates).
- C5. Transfers and supplier returns never use free-text origins (BR-14).

## Acceptance Criteria

- AC1. Delivering a cylinder sets it `AT_CLIENT` and opens exactly one movement; a second delivery is rejected until return (BR-01).
- AC2. Returning sets it `IN_STOCK_EMPTY` and closes the movement.
- AC3. A battery member cannot be delivered independently while packed; adding a packed member to another battery is rejected (BR-13).
- AC4. Reporting a supplier cylinder lost raises a supplier-liability alert (BR-12).
- AC5. A supplier loan cannot record "returned to supplier" before "received from supplier" (BR-11).
- AC6. Outstanding list equals the set of cylinders with an open movement; physical-count reconciliation reports present-but-elsewhere and shown-here-but-absent.

## Edge Cases

- Swap on return where the returned serial differs (W9) — both cylinders' custody reconciled in one event.
- Cylinder discovered to be a different owner's (`devuelto por ser de s/p`) → correction to return-to-owner (W15).
- Multi-serial legacy delivery cells → several linked movements or a battery.
- Sub-distributor node holding stock with ambiguous disposition → explicit disposition (sold/returned/re-issued/retired) (W19).
- Node-as-origin (`buroni`) → structured origin party; does not corrupt rental-day math.

## Dependencies

- `001` (BR-01/06/07/11/12/13/14), `002` (entities/states), `003` (constraints/triggers), `009` (rental effects of movements), `007` (float/aging/loss reports).

## Implementation Notes

- Centralize custody transitions in a domain service so every path (API, field sync, migration) enforces the same rules and emits the same events.
- Consider a `cylinder_open_holding` current-state table if `movement_event` is later partitioned (see `003` C2) to keep single-custody O(1).
- Reconciliation import (physical count) should be idempotent and produce a variance report with actionable rows (raise loss/transfer/correction).
- Accessory recovery blocks client-account closure (BR-10) — enforce at the account-close operation.
