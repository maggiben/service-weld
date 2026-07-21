# Migration exceptions — customer note

This note explains what the legacy Excel → Weld import could and could not recover, and what still needs human review. It is meant for Service Weld / ops when explaining gaps after cutover.

## What we fixed in this pass

| Issue                                                          | What you may have seen                                                  | What we did                                                                                                                                                                                                                                                          |
| -------------------------------------------------------------- | ----------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Clients only named on cylinder sheets (`CILINDROS PROPIOS`)    | Person/company appeared in cylinder history but not in the Clients list | Importer now creates **provisional clients** from those holder names and imports the related movements when possible. Marked in-app with delivery instructions _“Provisional: created from CILINDROS PROPIOS…”_ and queued as `CLIENT_PROVISIONAL_FROM_CIRCULATION`. |
| Same sheet name in Junín **and** Chacabuco (`BASILE`, `LOPEZ`) | Second territory’s client “missing”                                     | Second book is imported as **`Name (Territory)`** (e.g. `BASILE (Chacabuco)`). Flagged as `CROSS_TERRITORY_NAME_COLLISION` for merge/rename review.                                                                                                                  |
| Hospital / municipal patients                                  | Missing for Billing users                                               | Billing can now see `MUNICIPAL_HOSPITAL` clients (per product rule D-3). Medical/Admin already could.                                                                                                                                                                |
| Industrial “municipal” names (e.g. corralón)                   | Wrongly treated as hospital patients and hidden from non-medical roles  | Coverage detection no longer treats bare “municipal” as hospital; requires an explicit hospital cue (`Hosp.Munic.`, etc.).                                                                                                                                           |

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

## Suggested customer message (short)

> We imported both route books and the cylinder workbook. Clients that only appeared as free-text on cylinder sheets are now in the system as **provisional** records so their history is not lost — please review and merge those. Two names that existed in both Junín and Chacabuco were imported with a territory suffix. Rows with impossible dates, overlapping cylinder custody, or unreadable serials/gas codes remain in the **migration exceptions** queue for manual correction; the system will not silently invent history that would break custody or billing rules.

## Pointers for ops

- Reconciliation report: `migration/reconciliation_report.json`
- Exception table: `migration_exception` (reason + workbook/sheet/row)
- Specs: `specs/011-migrations.md`, medical visibility `specs/DECISIONS.md` (D-3)
