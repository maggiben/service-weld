# Migration exceptions — customer note

This note explains what the legacy Excel → Weld import could and could not recover, and what still needs human review. It is meant for Service Weld / ops when explaining gaps after cutover.

## What we fixed in this pass

| Issue                                                          | What you may have seen                                                  | What we did                                                                                                                                                                                                                                                          |
| -------------------------------------------------------------- | ----------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Clients only named on cylinder sheets (`CILINDROS PROPIOS`)    | Person/company appeared in cylinder history but not in the Clients list | Importer now creates **provisional clients** from those holder names and imports the related movements when possible. Marked in-app with delivery instructions _“Provisional: created from CILINDROS PROPIOS…”_ and queued as `CLIENT_PROVISIONAL_FROM_CIRCULATION`. |
| Same sheet name in Junín **and** Chacabuco (`BASILE`, `LOPEZ`) | Second territory’s client “missing”                                     | Second book is imported as **`Name (Territory)`** (e.g. `BASILE (Chacabuco)`). Flagged as `CROSS_TERRITORY_NAME_COLLISION` for merge/rename review.                                                                                                                  |
| Hospital / municipal patients                                  | Missing for Billing users                                               | Billing can now see `MUNICIPAL_HOSPITAL` clients (per product rule D-3). Medical/Admin already could.                                                                                                                                                                |
| Industrial “municipal” names (e.g. corralón)                   | Wrongly treated as hospital patients and hidden from non-medical roles  | Coverage detection no longer treats bare “municipal” as hospital; requires an explicit hospital cue (`Hosp.Munic.`, etc.).                                                                                                                                           |
| Cylinder capacity (m³) missing or wrong                        | Almost no cylinders showed size in the Cylinders list (~1–2%)           | Improved PROPIOS/header parser (see below) + safe DB backfill. Own cylinders with a clear size in the sheet now carry `capacity_m3`; garbage values from the first import were cleared.                                                                              |

Provisional clients and collision renames should be reviewed in **Admin → Migration exceptions** / data-quality and merged or corrected in master data.

## By design (not bugs)

These are intentional product rules, not import failures:

1. **Hospital / municipal patients (`MUNICIPAL_HOSPITAL`)**  
   Hidden from global client search for roles that are not Medical, Admin, or Billing. Clerks/drivers may only see a patient when they have a direct operational link (route/movement), not in the full client directory.

2. **Territory-scoped users** (Driver, Clerk, Inventory, Subdist)  
   Only see clients in their assigned territories (Junín / Chacabuco).

3. **Ceres / Ezequiel sheets**  
   Treated as **sub-distributors**, not customers. They will not appear in the Clients list.

4. **Soft-deleted masters**  
   Deleted clients stay out of lists until undeleted.

## Remaining exceptions that need human review

The importer **never drops a row silently**: anything it cannot import cleanly lands in `migration_exception` (and the data-quality report). Typical remaining buckets:

| Reason (examples)                                                              | Meaning                                                                                                | Customer action                                                                                                           |
| ------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------- |
| `CLIENT_PROVISIONAL_FROM_CIRCULATION`                                          | Client invented from free-text on a cylinder sheet (name may be incomplete, misspelled, or a nickname) | Confirm identity, merge with the real client if it already exists, set territory/CUIT/address, clear the provisional note |
| `CROSS_TERRITORY_NAME_COLLISION`                                               | Same name in both route books                                                                          | Decide if one person/company or two; rename/merge                                                                         |
| `MISSING_DELIVERY_DATE` / `UNPARSEABLE_DATE` / dates before 2000 or far future | Legacy blank or garbage date cells                                                                     | Correct in Weld or leave historical gap                                                                                   |
| `UNPARSEABLE_SERIAL` / `UNKNOWN_GAS` / `PH_PREFIX_PROVISIONAL`                 | Serial or gas text the importer could not normalize                                                    | Map gas aliases or fix the cylinder master                                                                                |
| `OVERLAPPING_CUSTODY`                                                          | Dirty legacy timeline (two “out” periods for the same cylinder)                                        | Ops decides which span is correct; system refused to violate single-custody                                               |
| `RETURN_BEFORE_DELIVERY`                                                       | Return date earlier than delivery in the sheet                                                         | Correct dates                                                                                                             |
| `LOAN_FAILED` / `MOVEMENT_CHECK_FAILED` / `SALE_*`                             | Row violated a DB rule (FK, check, capacity)                                                           | Fix masters (cylinder/owner) then re-enter or leave flagged                                                               |
| Near-duplicate names (`MASTANTUONO` / `MANSTANTUONO`, nicknames, surname-only) | Spec expects human merge; fuzzy match reduces but does not eliminate this                              | Merge in master data after review                                                                                         |

## What cannot be fully automated

Please set expectations with the customer on these **unfixable / partial** cases:

1. **Free-text identity in Excel**  
   Cylinder sheets often use short names (`WRIGHT`, `lynch`, `casasa`), nicknames, or notes mixed into the “client” cell. The system can create a provisional client and attach history, but **only people who know the route** can say whether that is the same as an existing ledger sheet.

2. **Two people, one name (or one person, two spellings)**  
   Excel allowed ambiguous naming across books. Weld enforces unique customer display names; collisions are renamed for import and left for merge.

3. **Broken or incomplete historical timelines**  
   Overlapping custody, returns before deliveries, and impossible dates cannot be “fixed” without inventing history. Those rows stay in the exception queue so billing/ops can decide case by case.

4. **Gas tokens with unknown business meaning** (e.g. legacy `PH` prefix)  
   Imported with a provisional mapping and flagged until the business confirms the canonical gas.

5. **Workbook-specific cleanups**  
   Full production cutover still expects ops follow-up on the exception queue and provisional clients; the automated importer is best-effort over dirty source data.

6. **Cylinder capacity in m³ (incomplete in source Excel)**  
   Capacity is an attribute of the cylinder master (`capacity_m3`). It is **not** on every sheet, and when present it is written inconsistently. This is a source-data limitation first; the importer can only recover what the workbooks actually say.

   | Source / situation                           | What the sheets usually contain                                                                  | Import outcome                                                    |
   | -------------------------------------------- | ------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------- |
   | `CILINDROS PROPIOS` header                   | Sometimes `6 mt` / `10 mts` / `6 m` / bare `6` or `10`; often weight (`10 KG`, `25 k`, `20 kgr`) | Volume → `M3`; weight → `KG` (D-18); prefer volume if both appear |
   | Header layout `gas \| serial \| capacity`    | Serial echoed next to size (e.g. `atal \| 14 \| 6 mt`)                                           | Size taken from the volume cell, not from the serial echo         |
   | Client route books (Junín / Chacabuco)       | `METROS` column is usually **rental days**, not cylinder size (ambiguous in legacy)              | **Not** used to set cylinder capacity                             |
   | Customer-owned cylinders (`Su Propiedad`)    | Serial appears on the client ledger only — no size master                                        | Created without capacity (0% unless filled later in Weld)         |
   | Supplier stock lists (e.g. Intergas N-PROPI) | Serial + gas; rarely size                                                                        | Usually no capacity                                               |
   | `CILINDROS VENDIDOS` (`METROS` column)       | Often a real size for that sale                                                                  | Used to enrich the cylinder master when still blank               |

   **What we already automated (ops):** re-run capacity backfill after parser fixes without reloading all movements:

   ```bash
   pnpm migrate:xls:backfill-capacity
   ```

   After that pass on a typical loaded DB: on the order of **~25–30% of own (`OURS`) cylinders** have a reliable size; overall still a minority of all cylinders because customer/supplier masters seldom carry size in Excel. Values outside known sizes (2, 3, 4, 5, 6, 7, 10, 20, 40 m³, plus a few observed variants) are discarded so serials are not stored as m³.

   **Locality aliases / junk from Excel headers**

   Legacy `DOMICILIO` cells often put CPA+town, street fragments, or the next-column label (`telefono:`) into the locality slot. The importer now normalizes to the seeded town list (BR-15: `COLON`→`Colón`, `6740 CHACABUCO`→`Chacabuco`) and rejects phones/addresses. To repair an already-loaded DB without a full re-import:

   ```bash
   pnpm migrate:xls:backfill-localities
   ```

   **Customer conversation points**

   - Ask whether size should be mandatory going forward in Weld for new cylinders / rates by size.
   - For historical gaps: ops can complete capacity on high-value cylinders in the UI, or the customer can provide a size list (serial → m³) for a second load.
   - Do not expect the Excel import to invent capacity where the sheet only has weight, days, or a blank header.

## Suggested customer message (short)

> We imported both route books and the cylinder workbook. Clients that only appeared as free-text on cylinder sheets are now in the system as **provisional** records so their history is not lost — please review and merge those. Two names that existed in both Junín and Chacabuco were imported with a territory suffix. Rows with impossible dates, overlapping cylinder custody, or unreadable serials/gas codes remain in the **migration exceptions** queue for manual correction; the system will not silently invent history that would break custody or billing rules. Cylinder **capacity (m³)** was recovered only where `CILINDROS PROPIOS` (or the sales sheet) clearly stated a volume; many headers omit size or only list weight (kg). Customer-owned and most supplier cylinders have no size in Excel — those masters stay blank until completed in Weld or via a serial→m³ list you provide.

## Pointers for ops

- Reconciliation report: `migration/reconciliation_report.json`
- Exception table: `migration_exception` (reason + workbook/sheet/row)
- Capacity re-parse (safe on a loaded DB): `pnpm migrate:xls:backfill-capacity`
- Specs: `specs/011-migrations.md`, medical visibility `specs/DECISIONS.md` (D-3)
