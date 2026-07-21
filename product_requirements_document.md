# Product Requirements Document (PRD)

## Cylinder Custody, Circulation & Rental Management System

### (Replacement for the three "CILINDROS" Excel workbooks)

**Version:** 1.0
**Status:** Draft for review
**Source of truth:** Reverse-engineered from `CILINDRO CLIENT REPARTO`, `CILINDROS CLIENTES CHACABUCO`, `CILINDROS PROPIOS` (see `domain.md` and `workflows.md`).
**Legend:** `» observed` = derived from real data. **INFERRED** = reconstructed. `US-n` = user story. Acceptance criteria are written in Gherkin.

---

## 1. Purpose & Vision

The business is a regional Argentine distributor and refiller of industrial and medical gas cylinders. Today it runs entirely on three manual Excel workbooks (~2,140 sheets, ~180,000 rows) with no integrity, no reporting, and error-prone double data entry.

**Vision:** a single system of record that tracks **every cylinder, every movement, every rental day, and every party** — replacing the dual-book manual process with one event model, enforcing the domain invariants, and producing the reports the spreadsheets never could.

**Primary goals**

1. One canonical **movement event** (eliminate client-book ↔ cylinder-book double posting).
2. Enforce **single-custody** and **ownership-basis** invariants automatically.
3. Auto-compute **rental days** and feed **billing** reliably (no ERROR cells, no lost rentals).
4. Give real-time visibility of **outstanding cylinders** per client and **fleet location**.
5. Support the **medical home-oxygen** high-frequency flow and municipal billing.

---

## 2. Scope

**In scope:** client & cylinder master data; deliveries, returns, rentals, refills, swaps, sales, losses, replacements; accessories; supplier loan loops; inter-node transfers; reconciliation; rental accrual & billing hand-off; reporting; migration from the legacy workbooks.

**Out of scope (integrations / later phases):** full financial accounting/AFIP e-invoicing (system provides billing data via export/API); cylinder hydrostatic re-certification tracking (noted as a **gap** to add in Phase 2); telematics/GPS routing optimization.

---

## 3. User Roles (Personas)

| Role                                      | Description                                                                         | Legacy actor                                |
| ----------------------------------------- | ----------------------------------------------------------------------------------- | ------------------------------------------- |
| **R1 — Administrative Clerk**             | Primary back-office operator: creates accounts, posts movements, manages cylinders. | Clerk `» observed`                          |
| **R2 — Delivery Driver (Repartidor)**     | Mobile field user: executes deliveries, pickups, returns, swaps on a route.         | Driver `» observed`                         |
| **R3 — Plant / Filling Operator**         | Manages empty/full stock, fills cylinders, marks damaged units.                     | Plant Op **INFERRED**                       |
| **R4 — Inventory / Warehouse Controller** | Reconciles ledgers, audits outstanding cylinders, runs stock transfers.             | Clerk (audit notes) `» observed`            |
| **R5 — Billing / Accounts Clerk**         | Turns rental days + gas + accessories into invoices; municipal billing.             | Biller (external) **INFERRED**              |
| **R6 — Business Owner / Manager**         | Oversight, dashboards, KPIs, loss/aging reports.                                    | Owner **INFERRED**                          |
| **R7 — Sub-Distributor / Agent**          | Runs a node (Ceres, Pantiga, Ezequiel, Tito, Buroni); holds & disposes stock.       | Sub-distributor `» observed`                |
| **R8 — System Administrator**             | Users, roles, config: gas types, rental rates, localities, territories; migration.  | (none — new)                                |
| **R9 — Municipal Hospital Coordinator**   | Counterpart for `HOSP.MUNIC.` patients; validates medical consumption for billing.  | Municipality `» observed` **INFERRED role** |
| **R10 — Client (self-service, Phase 2)**  | Optional portal: sees own held cylinders & requests deliveries.                     | Client `» observed` **INFERRED**            |

**Permission model (summary)**

```gherkin
Scenario: Role-based access enforcement
  Given each user is assigned exactly one primary role
  When the user attempts an action
  Then the system permits it only if the role grants that capability
  And every create/update/delete is written to an immutable audit log with user, timestamp, and before/after values
```

---

## 4. Epics → User Stories → Acceptance Criteria

> Traceability: each Epic maps to workflow(s) W1–W20 from `workflows.md`.

---

### EPIC A — Client Account Management _(W1)_

#### US-01 — Create a client account

**As an** Administrative Clerk
**I want** to create a client with address, locality, CUIT, phones, contacts, territory and delivery instructions
**So that** every cylinder movement can be attributed to a governed customer record.

```gherkin
Scenario: Create a valid client
  Given I am an Administrative Clerk
  And no active client exists with the same CUIT
  When I create a client with name "TORRES AMERICANAS", locality "Chacabuco", territory "Chacabuco"
  Then the client is saved with status "ACTIVE"
  And a unique clientId is assigned
  And an empty ClientAccount is created for the client

Scenario: Reject duplicate tax id
  Given an active client already exists with CUIT "30-70987724-7"
  When I try to create another client with CUIT "30-70987724-7"
  Then the system blocks the save
  And shows "A client with this CUIT already exists"

Scenario: Warn on near-duplicate name
  Given a client "MASTANTUONO ALFREDO" already exists
  When I create a client named "MASTANTUONO  ALFREDO" with no CUIT
  Then the system shows a possible-duplicate warning listing similar names
  And requires explicit confirmation before saving

Scenario: Validate CUIT check digit
  Given I enter CUIT "30-70987724-0"
  When I save
  Then the system rejects it with "Invalid CUIT check digit"
```

#### US-02 — Classify a client for coverage and segment

**As an** Administrative Clerk
**I want** to tag a client as PRIVATE or MUNICIPAL_HOSPITAL and assign a business segment
**So that** medical/municipal billing and reporting are handled correctly.

```gherkin
Scenario: Tag a municipal-hospital patient
  Given I am creating a home-oxygen patient
  When I set coverage to "MUNICIPAL_HOSPITAL" and segment to "MEDICAL_HOMECARE"
  Then invoices for this client are routed to the Municipal Hospital billing profile
  And the client appears in the medical patients list
```

#### US-03 — Capture per-client delivery instructions and multiple contacts

**As a** Delivery Driver
**I want** to see delivery notes and site contacts on the client record
**So that** I follow site rules (e.g., weighbridge) and reach the right person.

```gherkin
Scenario: Show delivery instructions on the route stop
  Given client "ARGEAVE (PELADERO)" has instruction "PASAR POR BALANZA Y PARAR" and contacts "JUAN", "DIEGO"
  When I open the client's stop on my route
  Then the instruction and all contacts are displayed prominently
```

---

### EPIC B — Cylinder Fleet Registry _(W2)_

#### US-04 — Register a cylinder

**As a** Plant Operator
**I want** to register a cylinder by serial, gas type, capacity and ownership
**So that** it becomes a trackable asset.

```gherkin
Scenario: Register an owned single cylinder
  Given serial "1837" is not registered for owner "US"
  When I register it with gas "O2", capacity "6 m³", ownership "OURS"
  Then the cylinder is created with state "IN_STOCK_EMPTY"

Scenario: Prevent duplicate serial per owner
  Given a cylinder serial "1837" already exists for owner "US"
  When I register another serial "1837" for owner "US"
  Then the system rejects it as a duplicate within the same owner

Scenario: Allow same serial for different owners
  Given serial "309817" exists for owner "US"
  When I register serial "309817" for owner "INTERGAS"
  Then both are accepted and disambiguated by (owner, serial)
```

#### US-05 — Register a cylinder battery (pack)

**As a** Plant Operator
**I want** to register a battery with its member serials
**So that** a manifold pack circulates as one unit while retaining its members.

```gherkin
Scenario: Create a battery with members
  Given member serials 169454,169455,169456,169457 are not in another active battery
  When I register battery "11002" with gas "O2" and those members
  Then the battery is created with 4 members
  And each member is flagged as "BATTERY_MEMBER" and cannot circulate independently

Scenario: Reject a member already packed
  Given serial 169454 is a member of an active battery
  When I add 169454 to a new battery
  Then the system rejects it with "Cylinder already belongs to an active battery"
```

#### US-06 — Record cylinder ownership and source

**As an** Administrative Clerk
**I want** each cylinder tagged with its owner (US / Supplier / Customer)
**So that** rental applicability and return-to-owner obligations are unambiguous.

```gherkin
Scenario Outline: Ownership drives rental eligibility
  Given a cylinder owned by "<owner>"
  When it is delivered to a client on rental
  Then rental accrual is "<rental>"

  Examples:
    | owner    | rental   |
    | US       | ENABLED  |
    | INTERGAS | ENABLED  |
    | CUSTOMER | DISABLED |
```

---

### EPIC C — Route Planning & Dispatch _(W3)_

#### US-07 — Build a delivery route

**As an** Administrative Clerk
**I want** to assemble a route of client stops with required cylinders
**So that** the driver loads the correct full cylinders.

```gherkin
Scenario: Generate a route load list
  Given open delivery requests for territory "Junín"
  When I build today's route
  Then the system lists each stop with requested gas, size and quantity
  And a consolidated load manifest of cylinders to take
```

#### US-08 — Execute a route on a mobile device

**As a** Delivery Driver
**I want** to see my stops and record deliveries/returns in the field
**So that** movements are captured at the point of exchange, not re-keyed later.

```gherkin
Scenario: Offline capture then sync
  Given I am on a route with no connectivity
  When I record deliveries and returns
  Then they are stored locally
  And synced to the server when connectivity returns
  And any conflict (e.g., cylinder now shown elsewhere) is flagged for the Clerk
```

---

### EPIC D — Deliver Cylinder (Rental, _Nuestra Propiedad_) _(W4)_

#### US-09 — Deliver an owned cylinder to a client

**As a** Delivery Driver
**I want** to record delivery of a full owned cylinder to a client
**So that** custody transfers and the rental clock starts.

```gherkin
Scenario: Successful rental delivery
  Given cylinder "1837" (owner OURS) is "IN_STOCK_FULL"
  And client "SOYCHU" has an active account
  When I record a delivery of "1837" with gas "AR" on 2022-08-22
  Then a movement is created with propertyBasis "OURS", deliveryDate 2022-08-22, returnDate empty
  And cylinder "1837" state becomes "AT_CLIENT"
  And the movement state is "OPEN"

Scenario: Enforce single custody
  Given cylinder "1837" already has an OPEN movement at client "SOYCHU"
  When I try to deliver "1837" to client "ARGEAVE"
  Then the system blocks it with "Cylinder is currently held by SOYCHU (not returned)"

Scenario: Deliver multiple cylinders / a battery in one visit
  Given I select cylinders 6035, 169432, 192072 for one client on one date
  When I confirm the delivery
  Then three linked movements (or one battery movement) are created with the same date
```

#### US-10 — Deliver by exchange (cambio)

**As a** Delivery Driver
**I want** to record a delivery that is an exchange for an empty picked up
**So that** the swap is captured as one operation.

```gherkin
Scenario: Delivery as exchange
  Given I deliver a full "ATAL" cylinder and collect an empty from the same client
  When I mark the delivery as "por cambio"
  Then the delivery movement is created
  And the collected empty is recorded as a return (see EPIC E)
```

---

### EPIC E — Return Cylinder & Compute Rental Days _(W5, W6)_

#### US-11 — Record a cylinder return and auto-compute rental days

**As an** Administrative Clerk
**I want** the system to compute rental days automatically on return
**So that** billing is accurate and no ERROR/blank values occur.

```gherkin
Scenario: Return closes the rental and computes days
  Given an OPEN rental movement for cylinder "TORRES/80086" with deliveryDate 2013-05-20
  When I record the return on 2013-07-26
  Then rentalDays is computed as 67
  And the movement state becomes "CLOSED"
  And cylinder state becomes "IN_STOCK_EMPTY"

Scenario: Prevent return before delivery
  Given a delivery on 2025-03-18
  When I enter a return date of 2025-03-01
  Then the system rejects it with "Return date cannot precede delivery date"

Scenario: Guard against impossible dates
  When I enter a return date in year 2047
  Then the system warns "Date outside plausible range" and requires confirmation

Scenario: No open-ended silent rentals
  Given a rental movement has been OPEN for more than 90 days
  Then it appears on the "Long-outstanding cylinders" report
```

#### US-12 — Accrue rental only on company/supplier cylinders

**As a** Billing Clerk
**I want** rental days to accrue only for OURS/SUPPLIER cylinders
**So that** customers are never charged rental on their own cylinders.

```gherkin
Scenario: Refill movement accrues no rental
  Given a movement with propertyBasis "CUSTOMER"
  When it is closed
  Then rentalDays is not computed and no rental charge is generated

Scenario: Continuous accrual while open
  Given an OPEN rental movement delivered 30 days ago
  When I view the client's current liability
  Then it shows 30 accrued rental days at the client's current daily rate
```

---

### EPIC F — Refill Customer-Owned Cylinder (_Su Propiedad_) _(W7)_

#### US-13 — Receive a customer empty and return it filled

**As a** Plant Operator
**I want** to log a customer-owned empty in and the filled cylinder out
**So that** we charge gas only, with no rental.

```gherkin
Scenario: Vacío → lleno cycle
  Given customer "LINARES" owns cylinder "47909"
  When I record "empty received" on 2025-05-13
  And later record "filled/returned" on 2025-05-28 with gas "CO2"
  Then a REFILL movement is created with those two dates
  And no rental is generated
  And a gas charge for "CO2" is queued for billing

Scenario: Detect misclassified ownership
  Given cylinder "241846" is recorded as OURS
  When a driver logs it as a customer refill
  Then the system flags an ownership mismatch for the Clerk to resolve
```

---

### EPIC G — Medical Home-Oxygen Replenishment _(W8)_

#### US-14 — Run a high-frequency medical oxygen cycle

**As a** Delivery Driver
**I want** to quickly swap near-empty medical O2 cylinders for patients
**So that** oxygen therapy is never interrupted.

```gherkin
Scenario: Near-daily O2 swap for a patient
  Given patient "GASTALDI MARIA" (coverage MUNICIPAL_HOSPITAL) holds O2 cylinder "1695"
  When I deliver a fresh O2 cylinder and collect the empty on the same visit
  Then the return closes the previous rental and a new delivery opens
  And both are attributed to the patient

Scenario: Supply-gap alert
  Given a medical patient's last delivered O2 cylinder is near depletion based on typical cycle length
  Then the patient appears on the "O2 replenishment due" list for the next route
```

#### US-15 — Validate municipal medical consumption for billing

**As a** Municipal Hospital Coordinator
**I want** to review each patient's monthly O2 deliveries and accessory rentals
**So that** the municipality is billed correctly.

```gherkin
Scenario: Monthly medical consumption statement
  Given the month has closed
  When I open the municipal statement
  Then I see, per patient, all O2 deliveries, rental days, and regulator/mochila rentals
  And I can approve or dispute each line before it is invoiced
```

---

### EPIC H — Swap / Exchange Cylinder _(W9)_

#### US-16 — Record a cylinder swap where the returned serial differs

**As an** Administrative Clerk
**I want** to record that a client returned a different serial than delivered
**So that** custody on both cylinders stays correct.

```gherkin
Scenario: Return a substitute serial
  Given cylinder "241846" was delivered to client "ALVAREZ"
  When the client returns serial "5567" instead
  Then movement of "241846" is closed as "SWAPPED" and linked to "5567"
  And "5567" custody/timeline is updated accordingly
  And both cylinders reconcile to a single physical exchange event
```

---

### EPIC I — Sell Cylinder _(W10)_

#### US-17 — Sell a cylinder outright

**As an** Administrative Clerk
**I want** to record the sale of a cylinder
**So that** it leaves the rental fleet permanently and billing switches to a sale.

```gherkin
Scenario: Sell a cylinder with no open rental
  Given cylinder "469" has no OPEN rental movement
  When I record a sale to client "guerrini" on 2013-10-01 with price 3025
  Then the cylinder state becomes "SOLD" (terminal)
  And it no longer appears as available fleet
  And a sale record is created with date, client, gas, size and address

Scenario: Block sale of a cylinder that is out on rental
  Given cylinder "469" is "AT_CLIENT" with an OPEN movement
  When I try to sell it
  Then the system requires the rental to be closed first
```

---

### EPIC J — Accessory Rental (Regulator / Adapter / Mochila) _(W11)_

#### US-18 — Rent or loan an accessory

**As an** Administrative Clerk
**I want** to track regulators, adapters and portable O2 backpacks on loan
**So that** they are billed and recovered.

```gherkin
Scenario: Rent a regulator
  Given client "ALEJANDRO JOSE HOSP MUN" needs a regulator
  When I record "1 regulator, alquiler" starting 2018-05-04 against remito "1475"
  Then an AccessoryRental is created with state "ON_LOAN"
  And a periodic regulator rental charge is generated

Scenario: Free loan vs charged rental
  Given an adapter is marked "prestado" (free loan)
  Then no charge is generated but it still appears as outstanding to recover

Scenario: Recover accessory at account closure
  Given a client account is being closed
  And the client holds an accessory ON_LOAN
  Then closure is blocked until the accessory is returned or written off
```

---

### EPIC K — Report Lost / Broken Cylinder _(W12)_

#### US-19 — Flag a lost or broken cylinder

**As an** Inventory Controller
**I want** to mark a cylinder LOST or BROKEN with the responsible party
**So that** charge-backs happen and counts stay accurate.

```gherkin
Scenario: Mark a cylinder lost at a client
  Given cylinder "2872653" (owner INTERGAS) is unrecovered
  When I mark it "LOST" against client "LA RIESTRA"
  Then the cylinder state becomes "LOST" (terminal)
  And a loss charge to the client is proposed
  And because the owner is INTERGAS, a supplier-liability alert is raised

Scenario: Broken cylinder returned
  When I mark a returned cylinder "(roto)" / BROKEN
  Then it is removed from circulation and routed to disposal/repair review
```

---

### EPIC L — Replace Cylinder _(W13)_

#### US-20 — Issue a replacement cylinder

**As an** Administrative Clerk
**I want** to record a replacement serial for a lost/broken/retired unit
**So that** the client keeps supply and both records stay consistent.

```gherkin
Scenario: Replace with a single event
  Given cylinder "X" is LOST at client "TORRES AMERICANAS"
  When I issue replacement "567872 (en reemplazo)"
  Then one event updates both the client account and cylinder "567872"
  And no separate manual posting in a second ledger is required
```

---

### EPIC M — Supplier Cylinder Intake & Onward Loan _(W14)_

#### US-21 — Track a supplier loan loop end-to-end

**As an** Administrative Clerk
**I want** to record a supplier cylinder's four-stage life (in → to client → back → to supplier)
**So that** we never lose or over-hold a supplier's asset.

```gherkin
Scenario: Full Nordelta loop
  Given cylinder "3570826" is received from supplier "Nordelta" on 2022-07-13
  When I deliver it to client "LESTAR" on 2022-06-22
  And the client returns it on 2022-09-08
  And I return it to Nordelta on 2022-09-09
  Then all four dates are recorded in order
  And the loop is CLOSED

Scenario: Enforce date ordering in the loop
  When I enter "returned to supplier" earlier than "received from supplier"
  Then the system rejects the out-of-order date

Scenario: Open-loop aging
  Given a supplier loan loop has no "returned to supplier" date after 120 days
  Then it appears on the "Supplier assets to return" report
```

---

### EPIC N — Return Cylinder to Owner / Supplier _(W15)_

#### US-22 — Return a not-ours cylinder to its owner

**As an** Inventory Controller
**I want** to record returns of Linde/DSJ/Intergas/customer cylinders to their owners
**So that** custody obligations close and pending actions don't linger.

```gherkin
Scenario: Return to owner with disposition note
  Given cylinder "X" is tagged owner "DSJ"
  When I record "devuelto propiedad DSJ" on a date
  Then the cylinder leaves our custody
  And the pending "must return" flag is cleared

Scenario: Outstanding must-return alert
  Given a cylinder is flagged "HAY QUE DEVOLVER A BURONI"
  And it has not been returned after 30 days
  Then it appears on the "Pending owner returns" worklist
```

---

### EPIC O — Stock Transfer Between Routes / Sub-Distributors _(W16)_

#### US-23 — Transfer stock between nodes

**As a** Sub-Distributor
**I want** to record cylinders moving between my node and the main hub or another node
**So that** each node's stock stays accurate.

```gherkin
Scenario: Transfer with node as origin
  Given cylinders are sourced from node "Buroni"
  When I record their delivery with origin "Buroni" (a node, not a date)
  Then the movement stores a structured origin node
  And rental-day computation is unaffected (no ERROR from text-in-date)

Scenario: Node disposition
  Given cylinders sit at node "Ceres"
  When I record "devuelto a Ceres Aníbal y entregado a Hugo Blanco"
  Then a structured transfer from Ceres to client "Hugo Blanco" is created
```

---

### EPIC P — Single Movement Model (eliminate dual posting) _(W17)_

#### US-24 — Post a movement once, see it everywhere

**As an** Administrative Clerk
**I want** a movement recorded once to update both the client and cylinder views
**So that** the two legacy books can never diverge again.

```gherkin
Scenario: One event, two projections
  When I record any delivery, return, swap, sale, loss or replacement
  Then it appears immediately in the client's account view
  And in the cylinder's circulation history view
  Without any second manual entry

Scenario: Reconciliation is automatic
  Given the legacy process required posting in two workbooks
  Then the new system exposes zero cases where client and cylinder views disagree
```

---

### EPIC Q — Inventory Reconciliation & Outstanding-Cylinder Audit _(W18)_

#### US-25 — See all outstanding cylinders per client

**As an** Inventory Controller
**I want** a live list of cylinders currently out (blank return) per client
**So that** I can chase returns and value the float.

```gherkin
Scenario: Outstanding list
  Given several movements have no return date
  When I open a client's account
  Then all OPEN cylinders are listed with days-out
  And the account total of outstanding cylinders is shown

Scenario: Unknown / to-verify serials
  Given a delivery was recorded with a missing or illegible serial (legacy "REVISAR N°")
  Then it is flagged "To verify" and blocks nothing but appears on the exceptions worklist
```

#### US-26 — Perform a physical stock count reconciliation

**As an** Inventory Controller
**I want** to reconcile a physical count against system stock
**So that** discrepancies (lost, mislocated, phantom) are found.

```gherkin
Scenario: Count vs system
  Given I scan/record cylinders physically present at the plant
  When I run reconciliation
  Then the system reports cylinders present-but-shown-elsewhere, and shown-here-but-absent
  And lets me raise loss/transfer actions from the results
```

---

### EPIC R — Sub-Distributor Stock Disposition _(W19)_

#### US-27 — Resolve the status of cylinders held at a node

**As a** Sub-Distributor
**I want** to set a disposition for each cylinder at my node
**So that** node stock is never ambiguous.

```gherkin
Scenario Outline: Disposition options
  Given a cylinder is parked at node "Ceres"
  When I set its disposition to "<disp>"
  Then its state and location update accordingly

  Examples:
    | disp                    |
    | SOLD                    |
    | RETURNED_TO_SUPPLIER    |
    | REISSUED_TO_CLIENT      |
    | RETIRED                 |
```

---

### EPIC S — Rental & Gas Billing _(W20)_

#### US-28 — Generate a client's monthly billing data

**As a** Billing Clerk
**I want** the system to produce rental-days + gas + accessory charges per client
**So that** invoices are complete and correct without reading the ledger by hand.

```gherkin
Scenario: Monthly billing run
  Given the billing period is April 2025
  When I run billing for client "LABORDE"
  Then I get total rental days across closed and still-open rentals in the period
  And gas charges for deliveries/refills
  And accessory rental charges
  And each line references its source movement

Scenario: Apply the client's daily rental rate
  Given client "LABORDE" has daily rental rate 85
  And a rental accrued 44 days in the period
  Then the rental charge is 44 × 85 = 3740

Scenario: No un-billable ERROR states
  Given the legacy system produced ERROR cells for missing return dates
  Then the new system never produces an un-computable rental
  And still-open rentals are billed on accrued-to-date days
```

#### US-29 — Export billing data to the accounting system

**As a** Billing Clerk
**I want** to export approved charges to accounting/e-invoicing
**So that** the system feeds invoicing without re-keying.

```gherkin
Scenario: Export approved charges
  Given billing lines are approved for a period
  When I export
  Then a structured file/API payload is produced per client with all charge lines and references
```

---

### EPIC T — Reporting & Dashboards _(new — closes the "no reports" gap)_

#### US-30 — Management dashboard

**As a** Business Owner / Manager
**I want** KPIs on fleet, circulation, outstanding float, losses and revenue
**So that** I can steer the business (which the spreadsheets never allowed).

```gherkin
Scenario: Fleet & float KPIs
  When I open the dashboard
  Then I see total cylinders by state, by gas, by owner
  And cylinders currently at clients (float) with aging buckets
  And losses/breakages this period
  And rental-days billed and gas volumes by territory

Scenario: Aging of outstanding cylinders
  Then I can view cylinders out >30/>90/>180/>365 days grouped by client and territory
```

#### US-31 — Cylinder life history (traceability)

**As an** Inventory Controller
**I want** the full circulation history of any cylinder
**So that** I can trace where it has been across all clients and years.

```gherkin
Scenario: Full history
  Given cylinder "14" has movements from 2004 to 2026
  When I open its history
  Then I see every holder with out/in dates and gas, in chronological order
```

---

### EPIC U — Master Data & System Administration

#### US-32 — Manage reference data

**As a** System Administrator
**I want** to manage gas types, capacities, localities, territories, owners and rental rates
**So that** free-text chaos (o/ox/oxigeno) is replaced by controlled vocabularies.

```gherkin
Scenario: Controlled gas type
  Given the gas type list is defined (O2, O2_MED, O2_LASER, CO2, N2, AR, AR_50, ATAL, MIX20, MIX22, MAPAX30, ACETYLENE, HELIUM, THERMOLENE)
  When a user records a movement
  Then gas must be chosen from the list
  And legacy variants are mapped to a canonical value

Scenario: Rate management
  Given rental rates can be per-day or per-month, per client or default
  When I set a client's rate
  Then billing uses that rate for future accrual
```

#### US-33 — Manage users and roles

**As a** System Administrator
**I want** to create users and assign roles/permissions
**So that** access is controlled and auditable.

```gherkin
Scenario: Assign role
  When I assign role "R2 Delivery Driver" to a user
  Then that user can record field deliveries/returns but cannot sell cylinders or manage rates
```

---

### EPIC V — Data Migration from Legacy Workbooks

#### US-34 — Migrate clients, cylinders and movements

**As a** System Administrator
**I want** to import the three workbooks into the new model
**So that** history is preserved and cleaned.

```gherkin
Scenario: Import with normalization
  Given the legacy workbooks contain ~657 client sheets and ~1,483 cylinder sheets
  When I run migration
  Then clients, cylinders, movements, sales, supplier loops and accessories are created
  And gas variants are normalized to canonical types
  And rental days are recomputed from dates (not trusted from legacy cells)

Scenario: Migration exception report
  Given some rows have impossible dates (2047/2048), ERROR cells, or text-in-date origins ("buroni")
  When migration runs
  Then those rows are imported into an "exceptions" queue for manual correction
  And a migration report quantifies clean vs flagged records

Scenario: Reconcile dual books during migration
  Given the same movement may exist in a client sheet and a cylinder sheet
  When migrating
  Then the two are merged into one canonical movement
  And conflicts between them are logged for review
```

---

## 5. Non-Functional Requirements

```gherkin
Scenario: Performance
  Given a fleet of 100k+ cylinders and 180k+ historical movements
  When a user opens any client or cylinder
  Then the view loads in under 2 seconds

Scenario: Auditability
  When any record is created or changed
  Then an immutable audit entry stores who, when, and before/after values

Scenario: Availability & offline
  Given drivers work with intermittent connectivity
  Then field capture works offline and syncs reliably with conflict handling

Scenario: Data integrity guarantees
  Then the system enforces: single-custody, ownership-basis consistency, date monotonicity,
    terminal-state exclusivity, and referential integrity for every movement

Scenario: Localization
  Then the UI is in Spanish (Argentina), dates dd/mm/yyyy, currency ARS, CUIT validation enabled

Scenario: Security
  Then access is role-based, credentials are protected, and personal/medical patient data is access-restricted
```

---

## 6. Assumptions & Constraints

- Billing/e-invoicing (AFIP) lives in an external accounting system; this product supplies structured billing data. **INFERRED**
- Cylinder **hydrostatic re-certification** is not tracked today; adding it is a **Phase-2 requirement** (safety gap noted). `» observed` gap
- The `PH` gas prefix meaning is unresolved and must be clarified with the business during migration. `» observed`
- Sub-distributors (Ceres/Aníbal, Pantiga, Ezequiel, Tito, Buroni) are treated as internal nodes/parties. `» observed`

---

## 7. Traceability Matrix (Story → Workflow → Primary Role)

| Story    | Workflow        | Role        |
| -------- | --------------- | ----------- |
| US-01–03 | W1              | R1, R2      |
| US-04–06 | W2              | R3, R1      |
| US-07–08 | W3              | R1, R2      |
| US-09–10 | W4              | R2          |
| US-11–12 | W5, W6          | R1, R5      |
| US-13    | W7              | R3          |
| US-14–15 | W8              | R2, R9      |
| US-16    | W9              | R1          |
| US-17    | W10             | R1          |
| US-18    | W11             | R1          |
| US-19    | W12             | R4          |
| US-20    | W13             | R1          |
| US-21    | W14             | R1          |
| US-22    | W15             | R4          |
| US-23    | W16             | R7          |
| US-24    | W17             | R1 (system) |
| US-25–26 | W18             | R4          |
| US-27    | W19             | R7          |
| US-28–29 | W20             | R5          |
| US-30–31 | (reporting gap) | R6, R4      |
| US-32–33 | (master data)   | R8          |
| US-34    | (migration)     | R8          |

**Coverage:** every workflow W1–W20 is covered by at least one user story, plus new stories for reporting, master data, administration and migration that the legacy spreadsheets lacked.
