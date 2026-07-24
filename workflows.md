# Business Workflows Represented by the Spreadsheets

> **Legend:** `» observed` = grounded in cells. **INFERRED** = reconstructed from data shape. Actors are inferred from a single-operator Excel system: **Clerk** (back-office data entry), **Driver** (reparto), **Plant Op** (filling), **Sub-distributor/Agent**, **Client**, **Supplier**, **Biller** (external).

The workflows fall into five groups:

- **A. Master-data** (W1–W2)
- **B. Core circulation** (W3–W8) — the daily engine
- **C. Exceptions & lifecycle events** (W9–W13)
- **D. Supplier & inter-node logistics** (W14–W16)
- **E. Control, reconciliation & billing** (W17–W20)

---

## GROUP A — Master Data

### W1 — Onboard Client / Create Account

- **Goal.** Establish a new customer with a ledger to track their cylinders.
- **Trigger.** A new customer requests gas/cylinders. **INFERRED**
- **Actors.** Clerk. (Client provides data.)
- **Preconditions.** Customer not already present in the route-book.
- **Happy path.** Clerk copies the client-sheet template into the correct route workbook (Junín/Chacabuco), renames the tab to the client name, fills header master data: `DOMICILIO`, locality, `CUIT`, phone(s), contacts, delivery notes (`PASAR POR BALANZA Y PARAR`). `» observed`
- **Alternative flows.** Medical patient → tagged `HOSP.MUNIC.`/`O2 MED`, address is a home. `» observed` · Client already exists in the other route-book → a second sheet is created (duplication accepted). `» observed`
- **Error cases.** Duplicate/near-duplicate name created (no uniqueness check); `CUIT` left blank (common); typos in name break later lookups.
- **Postconditions.** A client sheet exists; account is `OPEN` and ready for movements.

### W2 — Acquire & Register Cylinder

- **Goal.** Add a physical cylinder to the tracked fleet.
- **Trigger.** Cylinder bought, or received/branded from a supplier, or a customer cylinder first seen. **INFERRED**
- **Actors.** Clerk, Plant Op.
- **Preconditions.** Cylinder has a legible serial; ownership known.
- **Happy path.** Clerk creates a sheet in **WB3 (PROPIOS)** named by serial; header records `gas | serial | size (mt)`; ownership implied by tab context (`propio`) or inline tag (`linde`, `(intergas)`). `» observed`
- **Alternative flows.** **Battery/pack** → sheet suffixed `bat` listing member serials (e.g. `11002 bat` → 8 serials). `» observed` · Supplier-owned unit → registered under `INTERGAS N-PROPI` or `NORDELTA` instead. `» observed`
- **Error cases.** Serial collision across owners (a Linde `309817` vs own `309817`); mistyped serial creates a phantom asset.
- **Postconditions.** Cylinder is trackable; state `IN_STOCK`.

---

## GROUP B — Core Circulation (daily engine)

### W3 — Plan Route & Dispatch (Reparto)

- **Goal.** Load the truck and plan the day's deliveries/pickups.
- **Trigger.** Daily dispatch / accumulated orders. **INFERRED**
- **Actors.** Driver, Clerk.
- **Preconditions.** Full cylinders available; client requests known.
- **Happy path.** Driver loads full cylinders and drives the territory, using per-client delivery instructions (weighbridge stops, office locations, contact names). `» observed`
- **Alternative flows.** Cylinders sourced from a sub-distributor node (Ceres, Buroni) before the round. `» observed`
- **Error cases.** Instruction missing/outdated; wrong gas or size loaded.
- **Postconditions.** Truck loaded; deliveries executed → feed W4/W7.

### W4 — Deliver Cylinder (Rental — _Nuestra Propiedad_)

- **Goal.** Put a full, company-owned cylinder into a client's hands and start the rental clock.
- **Trigger.** Client order / exchange at the door. `» observed`
- **Actors.** Driver (hands over), Clerk (records).
- **Preconditions.** Cylinder is ours (or supplier-loaned), full, and `IN_STOCK`; client account exists.
- **Happy path.** New row in the client sheet **left pane**: `FECHA ENTREGA`, `NÚMEROS`, `GAS`; `DEVOLUCIÓN` left blank (still out). Mirror the "salida" in that cylinder's WB3 sheet. `» observed`
- **Alternative flows.** Delivered "por cambio" (exchange for an empty). `» observed` · Multiple cylinders / a battery delivered on one date (several serials in one cell: `6035 -169432 -192072`). `» observed`
- **Error cases.** Serial not written / illegible → `REVISAR N°`, `VER N° CUANDO VENGA`. `» observed` · Cylinder still shows open at a _previous_ client (double custody) — integrity breach.
- **Postconditions.** Cylinder state `AT_CLIENT`; movement `OPEN`; rental accrual begins.

### W5 — Return Cylinder (Rental) & Compute Rental Days

- **Goal.** Take back the empty and close the rental, capturing billable duration.
- **Trigger.** Client returns empty (usually at next delivery). `» observed`
- **Actors.** Driver, Clerk.
- **Preconditions.** An `OPEN` delivery row exists for that cylinder/client.
- **Happy path.** Clerk writes `FECHA DEVOLUCIÓN` on the matching row; the `METROS/ALQUILER` column **auto-computes days** `= DEVOLUCIÓN − ENTREGA` (verified 373/373; `» observed`). Mirror "entrada" date in WB3.
- **Alternative flows.** Returned cylinder has a _different_ serial than delivered → swap noted `241846(5567)` → triggers W9. `» observed`
- **Error cases.** Return date missing/blank → column shows **ERROR** (429/352 error cells across the books). `» observed` · Return recorded before delivery (date typos → impossible years 2047/2048). `» observed`
- **Postconditions.** Movement `CLOSED`; rental days finalized for billing (W20); cylinder returns to stock/refill.

### W6 — Rent Cylinder (Alquiler accrual) _(billing sub-workflow of W4/W5)_

- **Goal.** Charge the client for time-on-hire of a company cylinder.
- **Trigger.** A rental movement is `OPEN` and accruing. `» observed`
- **Actors.** Clerk, Biller.
- **Preconditions.** `propertyBasis = OURS/SUPPLIER` (never on client-owned refills). `» observed`
- **Happy path.** Days accrue continuously; rate applied per day (`alquiler $85 por día`, `ALQ $333,33`); some sheets flag `COBRAR ALQUILER OXIGENO LASER`. `» observed`
- **Alternative flows.** Accessory rental runs in parallel (W11). · Rate is monthly for some clients. **INFERRED**
- **Error cases.** Rate not recorded in-sheet (prices are stray notes only) → billed off-system from memory. `» observed`
- **Postconditions.** Accrued days available to invoicing; refill cylinders excluded.

### W7 — Refill Customer-Owned Cylinder (_Su Propiedad_: vacío → lleno)

- **Goal.** Fill a cylinder the client owns and return it — gas sale only, no rental.
- **Trigger.** Client hands over their own **empty** (`vacío`). `» observed`
- **Actors.** Driver, Plant Op (fills), Clerk.
- **Preconditions.** Cylinder is client property (`S/P` / `ownership_basis = CUSTOMER`).
- **Happy path.** Create `REFILL` movement (`POST /movements`); plant fills; close with `PATCH …/return` (cylinder stays `AT_CLIENT`/`FULL`) or exchange via `PATCH …/swap`. UI: **Recargas** (`/refills`). Rate from `refill_rate` (gas × size). Spec **`014`**. `» observed` (legacy right pane: `FECHA vacíos/ENTREGA`, `NÚMEROS`, `GAS`, then `FECHA llenos/DEVOLUCIÓN`; `METROS` blank).
- **Alternative flows.** Empty stays at plant for days before return (long `vacío→lleno` gap). `» observed`
- **Error cases.** A customer cylinder mistakenly logged as ours, or vice-versa (`devuelto a agronoble por ser de s/p`). `» observed` → API `422 KIND_BASIS_MISMATCH` (BR-08).
- **Postconditions.** Client cylinder returned full; gas charge queued via billing (`unit=fill`); no rental created.

### W8 — Medical Home-Oxygen Replenishment Cycle

- **Goal.** Keep a home-oxygen patient continuously supplied. **INFERRED** (distinct because of cadence/coverage)
- **Trigger.** Patient's cylinder near-empty (near-**daily**). `» observed` (GASTALDI: delivered 07-28 → returned 07-30 → out 07-30 → back 07-31…)
- **Actors.** Driver, Clerk; funded via **Municipal Hospital** (`HOSP.MUNIC.`). `» observed`
- **Preconditions.** Patient active on therapy; regulator/mochila provided (W11).
- **Happy path.** High-frequency W4/W5 loop of small O2 cylinders; a rented **regulador** and/or portable **mochila** stays with the patient. `» observed`
- **Alternative flows.** Portable backpack (`MOCHILA`) issued for mobility. `» observed` · Regulator swapped/repaired (`recambio regulador reparación`). `» observed`
- **Error cases.** Supply gap (patient safety risk); patient discharged/deceased but cylinder/regulator not recovered.
- **Postconditions.** Patient supplied; municipality billed; assets on continuous loan.

---

## GROUP C — Exceptions & Lifecycle Events

### W9 — Swap / Exchange Cylinder (Cambio)

- **Goal.** Substitute one cylinder for another during service.
- **Trigger.** Delivered/returned serial differs, or a swap-for-product is agreed. `» observed`
- **Actors.** Driver, Clerk.
- **Preconditions.** Both serials known.
- **Happy path.** Note the swap inline: `CAMBIO X CIL 172178`, `SE ENTREGO POR CAMBIO POR CO2`, or parenthetical `241846(5567)`; adjust both cylinders' WB3 timelines. `» observed`
- **Alternative flows.** Swap across gas types (return CO2, take ATAL). `» observed`
- **Error cases.** Only one side updated → one cylinder shows wrong holder.
- **Postconditions.** Custody corrected on both cylinders; open/close states realigned.

### W10 — Sell Cylinder (Venta)

- **Goal.** Transfer ownership of a cylinder to the client permanently.
- **Trigger.** Client buys the cylinder outright. `» observed`
- **Actors.** Clerk, Client, Biller.
- **Preconditions.** Cylinder has no open rental.
- **Happy path.** Append to `CILINDROS VENDIDOS`: date, serial, client, gas, size, address, locality, phone; mark source sheet `vendido [mes/año]`. `» observed`
- **Alternative flows.** Sale price occasionally noted (`$3,025.-`). `» observed`
- **Error cases.** Sold cylinder still appears active in a client's rental pane (not withdrawn) → phantom rental.
- **Postconditions.** Cylinder state `SOLD` (terminal); leaves fleet; rental stops.

### W11 — Rent / Loan Accessory (Regulator, Adapter, Mochila)

- **Goal.** Provide and track a rentable device alongside gas.
- **Trigger.** Client (often medical) needs a regulator/adapter/portable unit. `» observed`
- **Actors.** Driver, Clerk.
- **Preconditions.** Accessory in stock.
- **Happy path.** Inline note in client sheet: `1 regulador en alquiler`, `ALQUILER DE REGULADOR`, `101294 mochila`, `1 adaptador prestado - rto 1475` (with remito ref). `» observed`
- **Alternative flows.** Free loan ("prestado") vs charged rental ("alquiler"). `» observed` · Repair/replacement of unit (`recambio regulador reparacion`). `» observed`
- **Error cases.** Not recovered on account closure; quantity/serial not recorded.
- **Postconditions.** Accessory `ON_LOAN`; rental accrues; must be recovered at end.

### W12 — Report Lost / Broken Cylinder

- **Goal.** Flag an asset that will not return to circulation.
- **Trigger.** Cylinder lost at client / damaged / unaccounted. `» observed`
- **Actors.** Clerk, Driver.
- **Preconditions.** Cylinder was `OPEN` at a client or unlocated.
- **Happy path.** Annotate `PERDIDO`, `PERDIDO IG` (Intergas), or `(roto)`; leave movement unclosed or mark terminal. `» observed`
- **Alternative flows.** Loss of a **supplier-owned** unit (`IG`) → liability to that supplier. `» observed`
- **Error cases.** No charge-back recorded; asset silently disappears from counts.
- **Postconditions.** Cylinder state `LOST`/`BROKEN`; candidate for replacement (W13) and client charge.

### W13 — Replace Cylinder (Reemplazo)

- **Goal.** Issue a substitute for a lost/broken/retired unit.
- **Trigger.** Follows W12, or planned retirement (`RETIRADO`). `» observed`
- **Actors.** Clerk, Plant Op.
- **Preconditions.** Original flagged; replacement available.
- **Happy path.** New serial recorded `567872 (en reemplazo)` in **both** the client sheet and the new cylinder's WB3 sheet. `» observed`
- **Alternative flows.** `reemplazado` / `RETIRADO` for end-of-life units. `» observed`
- **Error cases.** Only one ledger updated → mismatch (see W17).
- **Postconditions.** Replacement circulating; original terminal.

---

## GROUP D — Supplier & Inter-Node Logistics

### W14 — Supplier Cylinder Intake & Onward Loan (Nordelta / Intergas loop)

- **Goal.** Take supplier-owned cylinders into custody, lend to clients, and round-trip them back.
- **Trigger.** Supplier delivers cylinders/packs (e.g. Nordelta pack). `» observed`
- **Actors.** Clerk, Driver, Supplier.
- **Preconditions.** Supplier consignment received.
- **Happy path.** Record 4-stage life in `NORDELTA`/`INTERGAS N-PROPI`: `entrada (from supplier) → entrega cliente → devolución cliente → devolución a supplier`. `» observed`
- **Alternative flows.** Client keeps the unit long (loop stays open); cylinder tagged `(Intergas)` in client sheets too. `» observed`
- **Error cases.** Supplier unit sold/lost while on loan → liability; loop never closed.
- **Postconditions.** Supplier asset accounted for through full round-trip.

### W15 — Return Cylinder to Owner/Supplier

- **Goal.** Send a cylinder back to its rightful owner (supplier or another party).
- **Trigger.** Consignment ends, wrong-owner unit found, or reconciliation. `» observed`
- **Actors.** Clerk, Driver, Supplier/Owner.
- **Preconditions.** Cylinder identified as not-ours (`linde`, `DSJ`, `s/p`).
- **Happy path.** Annotate disposition: `devuelto propiedad DSJ`, `HAY QUE DEVOLVER A BURONI`, `devuelto a agronoble por ser de s/p`; close its record. `» observed`
- **Alternative flows.** Returned via a sub-distributor rather than directly. `» observed`
- **Error cases.** "Must return" note lingers unactioned (`HAY QUE DEVOLVER…`). `» observed`
- **Postconditions.** Cylinder leaves our custody; owner's book credited.

### W16 — Stock Transfer Between Routes / Sub-Distributors

- **Goal.** Move cylinders between hubs/agents (Junín ⇄ Chacabuco ⇄ Ceres/Pantiga/Ezequiel/Tito/Buroni).
- **Trigger.** Rebalancing or sourcing for a route. `» observed`
- **Actors.** Clerk, Driver, Sub-distributor.
- **Preconditions.** Source node holds the cylinders.
- **Happy path.** Delivery row shows a **node as origin** instead of a date (e.g. `buroni` in the ENTREGA column); or sub-distributor registries updated (`tubos propiedad Ezequiel`). `» observed`
- **Alternative flows.** Disposition at a node: `devuelto a ceres anibal y entregado a hugo blanco`. `» observed`
- **Error cases.** Origin `buroni` in the date column makes the day-formula **ERROR**. `» observed`
- **Postconditions.** Cylinder relocated; node registries adjusted.

---

## GROUP E — Control, Reconciliation & Billing

### W17 — Cross-Ledger Synchronization (Dual Posting)

- **Goal.** Keep the client book and cylinder book in agreement for every movement.
- **Trigger.** Any delivery/return/swap/replacement. `» observed`
- **Actors.** Clerk.
- **Preconditions.** A movement was recorded in one book.
- **Happy path.** The same event is hand-entered in **both** the client sheet (movement) and the cylinder's WB3 sheet (salida/entrada) — proven: `567872 (en reemplazo)` appears in both. `» observed`
- **Alternative flows.** —
- **Error cases.** Second posting forgotten → the two books diverge (structural weakness of the system). **INFERRED**
- **Postconditions.** Client-centric and asset-centric views reconciled.

### W18 — Inventory Reconciliation / Outstanding-Cylinder Audit

- **Goal.** Verify who really holds what; recover un-returned cylinders.
- **Trigger.** Periodic check, dispute, or unknown serial. `» observed`
- **Actors.** Clerk, Driver.
- **Preconditions.** Ledgers exist to compare.
- **Happy path.** Blank `DEVOLUCIÓN` = still out; clerk scans for open rows; flags items to verify: `VER N° CUANDO VENGA, NO FIGURA EN N/P`, `REVISAR N°`, `*NO FIGURA POR CILINDRO`. `» observed`
- **Alternative flows.** Physical count at a sub-distributor node vs its registry. **INFERRED**
- **Error cases.** No automated totals → done by eye/Ctrl-F; long-open rows (years) missed; no aging report exists.
- **Postconditions.** Discrepancies flagged; recovery/charge actions raised (W12/W13/W15).

### W19 — Sub-Distributor Stock Disposition (Ceres list)

- **Goal.** Resolve the status of cylinders parked at an agent/outpost.
- **Trigger.** Periodic review of the `ceres`/`ezequiel` registries. `» observed`
- **Actors.** Clerk, Sub-distributor.
- **Preconditions.** Node holds a stock list.
- **Happy path.** Each cylinder gets a disposition note: `vendido`, `devuelto propiedad DSJ`, `devuelto a ceres anibal y entregado a hugo blanco`, `lastra`. `» observed`
- **Alternative flows.** Re-issue to another client (`entregado a hugo blanco`). `» observed`
- **Error cases.** Ambiguous free-text disposition; no owner field.
- **Postconditions.** Node stock resolved (sold/returned/re-issued).

### W20 — Rental & Gas Billing (Monthly) — _external_

- **Goal.** Convert physical movements into invoices.
- **Trigger.** Billing period close. **INFERRED** (no accounting fields in these books).
- **Actors.** Biller, Clerk.
- **Preconditions.** Rental days computed (W5/W6); gas deliveries/refills logged (W4/W7); accessories (W11).
- **Happy path.** Biller reads per-client accrued **rental days × rate** + **gas fill charges** (`refill_rate` / `014`) + accessory rentals, and issues invoices in the separate accounting system; medical patients billed to the municipality. Draft billing run emits `day` lines for RENTAL and `fill` lines for REFILL. **INFERRED** from `alquiler $/día` notes + day-count column. `» observed` (day counts)
- **Alternative flows.** Monthly flat rental for some clients; sale invoices from W10. **INFERRED**
- **Error cases.** Prices live only as stray notes → billed from memory; `ERROR`/blank return dates make some rentals un-billable until fixed. `» observed`
- **Postconditions.** Invoices issued; the spreadsheets remain the physical-custody source of truth, not the financial record.

---

## Summary map

| #   | Workflow                    | Primary source in the files                   |
| --- | --------------------------- | --------------------------------------------- |
| W1  | Onboard client              | client-sheet headers (WB1/WB2)                |
| W2  | Register cylinder           | WB3 sheet creation                            |
| W3  | Route / dispatch            | delivery-instruction notes                    |
| W4  | Deliver (rental)            | left pane ENTREGA                             |
| W5  | Return + day-count          | left pane DEVOLUCIÓN + METROS/ALQUILER        |
| W6  | Rental accrual              | `alquiler $/día` + day column                 |
| W7  | Refill customer cylinder    | right pane vacío→lleno                        |
| W8  | Medical O2 cycle            | HOSP.MUNIC / O2 MED / mochila                 |
| W9  | Swap (cambio)               | `CAMBIO X CIL`, `A(B)` notes                  |
| W10 | Sell                        | `CILINDROS VENDIDOS`                          |
| W11 | Accessory rental            | regulador/adaptador/mochila notes             |
| W12 | Lost/broken                 | `PERDIDO`, `(roto)`                           |
| W13 | Replace                     | `en reemplazo` (both books)                   |
| W14 | Supplier loan loop          | `NORDELTA`, `INTERGAS N-PROPI`                |
| W15 | Return to owner             | `devuelto propiedad DSJ`, `devolver a buroni` |
| W16 | Inter-node transfer         | node-as-origin, agent registries              |
| W17 | Dual posting                | mirrored client↔cylinder rows                 |
| W18 | Reconciliation/audit        | `VER N°`, `NO FIGURA`, `REVISAR`              |
| W19 | Sub-distributor disposition | `ceres` list notes                            |
| W20 | Billing (external)          | day-counts + price notes                      |
