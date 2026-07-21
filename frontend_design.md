# Frontend Design

## Cylinder Custody, Circulation & Rental Management — UI/UX Specification

**Version:** 1.0
**Companion docs:** `domain.md`, `workflows.md`, `product_requirements_document.md`, `sdd.md`, `openapi_specification.md`.
**Legend:** roles by code (`CLERK, DRIVER, PLANT, INVENTORY, BILLING, MANAGER, SUBDIST, ADMIN, MEDICAL, CLIENT`); `Wnn` = workflow; `US-nn` = story.

---

## 1. Architecture & Surfaces

Two front-end surfaces share one design system and API:

1. **Back-office Web App** (desktop-first SPA) — Clerk, Inventory, Billing, Manager, Admin, Medical, Sub-distributor. Dense data tables, forms, reports.
2. **Field App** (mobile-first, **offline-capable** PWA) — Driver and field Sub-distributor. Fast deliver/return/swap capture on a route; queues writes offline and syncs (idempotency keys, `409` conflict resolution).

**Stack (mandated):**

- **UI framework:** React + **MUI (Material UI)** as the component library and theming/design-system foundation.
- **Data tables:** **MUI X Data Grid — Community edition** (`@mui/x-data-grid`) for every list/table across both apps.
- **Charts:** **MUI X Charts** (`@mui/x-charts`) for every chart, KPI sparkline, gauge, and dashboard visualization — no other charting library.
- **Dates/pickers:** MUI X Date Pickers with a locale-aware date adapter (Day.js or date-fns) for all date inputs.
- **i18n:** **react-i18next** with two locales — **Spanish (`es`, default/fallback)** and **English (`en`)** — plus MUI's own localization packs (core, Data Grid, Date Pickers). `es-AR` formatting: `dd/mm/yyyy`, ARS currency.
- **Client state:** **Zustand** for all app/UI/session/offline state (auth session, locale, theme, territory scope, offline outbox, filters/saved views, selection, toasts).
- **Forms:** **react-hook-form** for every form (with a schema resolver, MUI `Controller` bindings, `useFieldArray` for repeaters).
- Typed API client generated from the OpenAPI spec; a thin **data-fetching/server-cache layer** for API reads/mutations (server data), distinct from Zustand (client state); optimistic UI with `ETag`/`If-Match`; background sync + IndexedDB cache for the field app.

---

## 2. Global Conventions (referenced by every screen)

### 2.1 Design system (MUI)

- **Foundation:** a single **MUI `ThemeProvider`** wraps both apps. All primitives are MUI components (`AppBar`, `Drawer`, `Dialog`, `Snackbar`, `Autocomplete`, `TextField`, `Select`, `Tabs`, `Card`, `Chip`, `Badge`, `Skeleton`, `Alert`, `LinearProgress`, `Stepper`, `Menu`, `Tooltip`). Icons: `@mui/icons-material`.
- **Theme tokens:** MUI `createTheme` with light/dark `palette.mode`; MUI 8-pt spacing; typography scale; custom palette extensions for domain semantics (below). Density handled via MUI Data Grid density (`standard`/`compact`/`comfortable`) and component `size`.
- **Domain color semantics** are declared as **custom theme palette keys** (so they adapt to light/dark and stay consistent in Data Grid cells, Chips, and Charts):
  - **Gas** (chart series + chips): O2 = blue, O2_MED = teal, CO2 = grey, N2 = violet, AR/AR_50 = green, ATAL = orange, ACET = red, mixes = amber, HELIUM = pink.
  - **State badges** (MUI `Chip` color/variant): OPEN = warning, CLOSED = success, SWAPPED = info, LOST = error, BROKEN = error(outlined), SOLD = default, VOID = default(struck-through). Cylinder: AT_CLIENT = warning, IN_STOCK_* = success, terminal = default/error.
  - **Ownership chips:** OURS (filled), SUPPLIER:Linde/Intergas/… (outlined + brand tint), CUSTOMER (outlined dashed).
- **Localization packs:** apply MUI core (`esES`/`enUS`), Data Grid (`@mui/x-data-grid/locales`), and Date Pickers (`@mui/x-date-pickers/locales`) locale objects to the theme, switched with the app language (see §2.10).

### 2.2 App shell (web)

- **Top bar** (MUI `AppBar` + `Toolbar`): app logo, global search (`/`), territory switcher (`Select`, scoped roles), notifications bell (`Badge` + `IconButton` → Alerts), theme toggle, user menu (`Menu`: profile, role, logout), **language switcher** (ES/EN, §2.10).
- **Left sidebar** (MUI `Drawer`, collapsible): Dashboard, Clients, Cylinders, Batteries, Movements, Sales, Accessories, Supplier Loans, Transfers, Routes, Billing, Reports, Admin. Items are **role-filtered** (hidden if no capability).
- **Command palette (`⌘K`):** fuzzy actions + entity jump ("Deliver cylinder", "Open TORRES AMERICANAS", "New client").
- **Breadcrumbs** (MUI `Breadcrumbs`) under top bar; **contextual action bar** (right-aligned primary `Button`s).
- **Toasts** (MUI `Snackbar` + `Alert`) for success/inline errors; **right-side drawers** (`Drawer` anchor=right) for create/edit; **center modals** (`Dialog`) for confirmations/destructive actions.

### 2.3 Shared List/Table pattern — MUI X Data Grid (Community)

Every list uses `<DataGrid>` (`@mui/x-data-grid`, Community edition) run in **server mode** so the API remains the source of truth for sorting/filtering/pagination.

- **Server-driven grid:** `sortingMode="server"`, `filterMode="server"`, `paginationMode="server"`. Grid change events (`onSortModelChange`, `onFilterModelChange`, `onPaginationModelChange`) map to API query params; the grid only renders and emits.
- **Cursor pagination:** the API is cursor-based, so use MUI X `paginationMeta={{ hasNextPage }}` + `estimatedRowCount` (row count is an estimate, not exact) with a prev/next / "load more" footer rather than a jump-to-page total. `pageSize` maps to the API `limit` (≤200).
- **Toolbar (`GridToolbar`):** **column chooser** (`columnVisibilityModel` + columns panel), **density selector**, and **CSV export** (`GridToolbarExport` — Community). PDF/Excel export is custom/server-side (Excel export is a Premium grid feature, so it is _not_ done in the grid).
- **Selection & bulk actions:** `checkboxSelection` (Community); a custom bulk-action bar appears above the grid on selection.
- **Row actions:** right-most `GridActionsCellItem` column (Open / Edit / context menu). **Note:** column _pinning_ is a Pro feature and is **not** used; the actions column relies on horizontal scroll on narrow widths, or a per-row overflow `Menu`.
- **Sorting:** single-column server sort per the API sort whitelist (multi-column sort is a Pro feature — not used; if a compound order is needed it is expressed as an API default sort).
- **Filtering:** a **custom filter bar** above the grid (MUI `Chip`s + an advanced `Popover`/`Drawer` panel) is the primary filter UX mapped to the API `filter[...]` grammar; the grid's built-in single-item filter panel MAY mirror it. **Saved views** = our own persistence of `{ sortModel, filterModel, columnVisibilityModel, density, pageSize }` (read/written via `apiRef` state), not a Pro grid feature.
- **Cell rendering:** status via `Chip` (theme state colors §2.1), gas via colored `Chip`, dates via locale formatter (§2.10), money via ARS formatter. `renderCell` for links to detail.
- **Loading:** grid `loading` prop shows the built-in overlay; first paint uses `Skeleton` rows; `LinearProgress` on refetch. Column layout preserved across loads.
- **Error:** custom `error` overlay (`slots.noRowsOverlay`/error boundary) with `request_id` + Retry; `Snackbar` for background failures.
- **Empty:** custom `slots.noRowsOverlay` — illustration + primary CTA ("No clients yet — Create client") or "No results — Clear filters".
- **Keyboard:** DataGrid's built-in cell/row keyboard nav (arrows, `Enter`, `Space` select, `Home/End`, `PageUp/Down`) plus app shortcuts `n` new, `f` focus filter, `[`/`]` prev/next page.

### 2.4 Shared Form pattern — react-hook-form + MUI

Every form (drawers and pages) is a **react-hook-form** `useForm` instance bound to MUI inputs.

- **Bindings:** MUI `TextField`/`Select`/`Autocomplete`/`DatePicker` are wired via `Controller` (controlled) or `register` (native). Repeaters (client contacts, battery members) use **`useFieldArray`**.
- **Validation:** a **schema resolver** (e.g. `zodResolver`) enforces field rules (required, CUIT `^\d{2}-\d{8}-\d$` + mod-11, date ordering, enum membership) — the same rules the API/DB enforce (`001`); `mode: 'onBlur'` inline + on-submit revalidation.
- **Server errors:** map API `422 details[]` onto fields via `setError(field, …)`; form-level banner for non-field errors; known `409` codes surface as localized messages.
- **Unsaved-changes guard:** driven by `formState.isDirty` (block navigation / confirm on close).
- **Draft autosave (field app):** persist the RHF values to the offline outbox (Zustand, §2.11) so a form survives app suspension.
- **Optimistic concurrency:** submit sends `If-Match`; on `409 VERSION_CONFLICT` → non-destructive "This record changed — review differences" merge modal, then `reset()` to server truth or re-apply user edits.
- **Submit lifecycle:** `handleSubmit` → disabled submit + spinner (`formState.isSubmitting`); on success → `reset(serverValues)` + toast + navigate/refresh; `⌘S` save, `Esc` cancel.

### 2.5 Permissions in the UI

- Nav items, buttons, and columns are **capability-gated**; forbidden actions are hidden (not just disabled) except where a disabled+tooltip aids discoverability. Server remains source of truth (`403` → toast "You don't have permission").
- **Territory scoping** (DRIVER, SUBDIST): lists pre-filtered to the user's territory; switcher limited to assigned territories.

### 2.6 Global keyboard shortcuts

`⌘K` palette · `/` search · `?` shortcuts help · `g d` Dashboard · `g c` Clients · `g y` Cylinders · `g m` Movements · `g b` Billing · `g r` Reports · `g a` Alerts · `Esc` close overlay.

### 2.7 Responsive breakpoints

`xs <480 · sm 480–767 · md 768–1023 · lg 1024–1279 · xl ≥1280`. Web app: sidebar auto-collapses < lg; tables → card lists < md; field app is xs/sm-first with bottom tab nav and thumb-reachable primary actions.

### 2.8 Offline (field app)

- Connectivity banner (online/offline/syncing); per-record sync badge (queued/synced/conflict); background sync; conflict queue screen.
- The **offline outbox** is a Zustand store (§2.11) persisted to **IndexedDB**, keyed by idempotency id; a background syncer drains it when online and moves conflicts to the conflict queue.

### 2.9 Charts (MUI X Charts)

All visualizations use **`@mui/x-charts`** exclusively; series colors come from the theme's gas/state palette keys (§2.1) so charts, chips, and grid cells stay visually consistent in light/dark.

- **`BarChart`** — fleet by state/gas/owner, loss by owner, rental revenue by territory/gas, aging buckets.
- **`PieChart`** — float donut (cylinders out vs in), fleet ownership split.
- **`LineChart`** — float/revenue trend over time, movements per day.
- **`SparkLineChart`** — inline trends inside KPI stat cards.
- **`Gauge`** — utilization / % fleet on hire, SLA-style indicators.
- **`ScatterChart`** (optional) — rental-days vs frequency for anomaly spotting.
- **Shared conventions:** each chart has a loading `Skeleton`, an error state (Retry), and an empty state ("No data for these parameters"); axes/tooltips are localized (numbers/dates/currency via §2.10); charts are responsive (fill container, legend wraps/stacks on small screens); every chart pairs with a drill-down DataGrid (§2.3).

### 2.10 Internationalization (i18n)

- **Framework:** **react-i18next**. Two locales bundled — **`es` (Spanish, default & fallback)** and **`en` (English)**. Missing keys fall back to `es`.
- **Namespaces:** `common`, `nav`, `clients`, `cylinders`, `movements`, `billing`, `reports`, `accessories`, `admin`, `enums`, `errors`, `validation`. Keys are stable identifiers; **no hard-coded user-facing strings** in components.
- **Domain vocabulary is translated, codes are stored:** gas types, states, roles, coverage, segments render via `enums` namespace labels (e.g. `enums.gas.O2` → "Oxígeno" / "Oxygen"; `enums.movementState.OPEN` → "Abierto" / "Open") while the canonical code is what the API stores (BR-15). Legacy Spanish terms (entrega, devolución, alquiler, remito, vacío/lleno) map to translation keys.
- **MUI localization:** the active language also selects MUI core (`esES`/`enUS`), Data Grid, and Date Pickers locale packs, applied in the theme so grid toolbars, pagination text, filter operators, and pickers are localized.
- **Formatting:** numbers/currency via `Intl.NumberFormat('es-AR', { style:'currency', currency:'ARS' })` (or `en` equivalent); dates via the MUI date adapter with the active locale — **`dd/mm/yyyy` for `es-AR`**. All formatting goes through shared helpers, never ad-hoc.
- **Language switch:** in the top bar and login; choice persisted (localStorage + user profile) and restored on load; **defaults to `es`** when unset. Switching is instant (no reload) and re-localizes grid, charts, and pickers.
- **Error/validation messages:** API `422 details[]` and known `409` codes map to localized messages via the `errors`/`validation` namespaces.
- **Direction:** both locales are LTR (no RTL work needed).

### 2.11 State management (Zustand)

**Zustand** owns all **client state**; server data lives in the data-fetching/cache layer (§1). Stores are small, typed slices with selector-based subscriptions (to minimize re-renders) and middleware where useful (`persist`, `subscribeWithSelector`, `immer`).

- **`sessionStore`** — auth tokens, current user, roles, **capabilities**, assigned territories, MFA status. Drives UI permission gating (§2.5) and API auth headers.
- **`uiStore`** — theme (`palette.mode`), **language** (`es`/`en`, `persist`ed → localStorage, default `es`), sidebar collapsed, active territory switcher value, command-palette open state.
- **`notificationStore`** — toast/snackbar queue and unread-alert count.
- **`gridStore`** — per-list saved views: `{ sortModel, filterModel, columnVisibilityModel, density, pageSize }` and current selection (`persist`ed).
- **`outboxStore`** (field app) — offline write queue keyed by idempotency id, per-item status (queued/synced/conflict), `persist`ed to **IndexedDB**; consumed by the background syncer and the conflict-queue screen (§4.18).
- **Conventions:** one store per concern (not one global blob); expose actions on the store; components read via narrow selectors; never store server-fetched entity data in Zustand (it belongs in the query cache) — Zustand holds derived/UI/session/offline state only.

---

## 3. Navigation Map

```mermaid
graph TD
  Login --> Shell
  Shell --> Dashboard
  Shell --> Clients
  Clients --> ClientDetail
  ClientDetail --> ClientLedger[Ledger tabs: Rentals/Refills/Accessories/Outstanding/History/Billing]
  Clients --> ClientForm[(Create/Edit drawer)]
  Shell --> Cylinders
  Cylinders --> CylinderDetail
  CylinderDetail --> CylLife[Life history]
  Cylinders --> CylForm[(Create/Edit)]
  CylinderDetail --> LossDlg[(Loss/Broken)]
  CylinderDetail --> ReplaceDlg[(Replace)]
  Shell --> Batteries --> BatteryDetail
  Shell --> Movements
  Movements --> MovementDetail
  Movements --> DeliverForm[(New delivery/refill)]
  MovementDetail --> ReturnDlg[(Return)]
  MovementDetail --> SwapDlg[(Swap)]
  MovementDetail --> VoidDlg[(Void)]
  Shell --> Sales --> SaleForm[(New sale)]
  Shell --> Accessories
  Accessories --> AccRentals
  AccRentals --> RentDlg[(Rent/Return)]
  Shell --> SupplierLoans --> LoanDetail --> AdvanceDlg[(Advance stage)]
  Shell --> Transfers --> TransferForm[(New transfer)]
  Shell --> Routes
  Routes --> RoutePlan[Plan route]
  Routes --> FieldRoute[(Mobile) Route run]
  FieldRoute --> FieldCapture[(Mobile) Deliver/Return]
  FieldRoute --> SyncQueue[(Mobile) Conflicts]
  Shell --> Billing
  Billing --> BillingRuns --> RunDetail --> Invoice
  Billing --> MedicalStatement
  Shell --> Reports
  Reports --> RFleet & RFloat & ROutstanding & RRental & RLoss & RSupplier & RCylLife & RDataQuality
  Shell --> Admin
  Admin --> Users --> UserForm
  Admin --> Roles
  Admin --> MasterData[Gas types / Localities / Territories]
  Admin --> Migration[Exceptions queue]
  Admin --> AuditLog
  Admin --> AlertsAdmin
  Shell --> GlobalSearch
  Shell --> SysPages[403 / 404 / 500 / Offline]
```

### Route table

| Route                                              | Screen                | Primary roles                                          |
| -------------------------------------------------- | --------------------- | ------------------------------------------------------ |
| `/login`                                           | Login                 | all                                                    |
| `/`                                                | Dashboard             | all                                                    |
| `/clients` · `/clients/:id`                        | Clients list / detail | CLERK, INVENTORY, BILLING, MANAGER, MEDICAL, DRIVER(r) |
| `/cylinders` · `/cylinders/:id`                    | Fleet list / detail   | CLERK, PLANT, INVENTORY, MANAGER                       |
| `/batteries` · `/batteries/:id`                    | Batteries             | PLANT, CLERK, INVENTORY                                |
| `/movements` · `/movements/:id`                    | Movements             | CLERK, INVENTORY, BILLING, MANAGER                     |
| `/sales`                                           | Sales                 | CLERK, BILLING, MANAGER                                |
| `/accessories` · `/accessory-rentals`              | Accessories           | CLERK, PLANT, INVENTORY                                |
| `/supplier-loans` · `/:id`                         | Supplier loans        | CLERK, INVENTORY                                       |
| `/transfers`                                       | Transfers             | SUBDIST, CLERK, INVENTORY                              |
| `/routes` · `/routes/:id/run`                      | Dispatch / field run  | CLERK / DRIVER                                         |
| `/billing` · `/billing/runs/:id` · `/invoices/:id` | Billing               | BILLING, MANAGER                                       |
| `/billing/medical-statement`                       | Municipal statement   | MEDICAL, BILLING                                       |
| `/reports/*`                                       | Reports               | MANAGER, INVENTORY, BILLING                            |
| `/admin/*`                                         | Admin                 | ADMIN (audit: +MANAGER)                                |
| `/search`                                          | Global search         | all                                                    |

---

## 4. Screens

> Each screen lists: **Purpose · Components · Tables · Forms · Filters · Dialogs · Validation · Actions · Permissions · Loading · Error · Empty · Navigation · Responsive · Shortcuts.** Shared patterns (§2.3/§2.4) are referenced, not repeated.

---

### 4.1 Login

- **Purpose:** Authenticate; obtain tokens, roles, territories (W-auth).
- **Components:** brand panel, login card, MFA step, language toggle (ES/EN, default **ES**), "forgot password" link.
- **Tables:** none.
- **Forms:** `{ username, password }` → then `{ otp }` if MFA.
- **Filters:** none.
- **Dialogs:** account-locked modal.
- **Validation:** required fields; OTP 6 digits; generic failure message (no user enumeration).
- **Actions:** Sign in, Continue (MFA), Retry.
- **Permissions:** public.
- **Loading:** button spinner; disable inputs.
- **Error:** `401 INVALID_CREDENTIALS` inline; `403 MFA_REQUIRED` → step 2; `423 ACCOUNT_LOCKED` modal; offline banner.
- **Empty:** n/a.
- **Navigation:** success → last route or Dashboard.
- **Responsive:** single-column card on mobile.
- **Shortcuts:** `Enter` submit.

### 4.2 Dashboard (role-aware)

- **Purpose:** At-a-glance KPIs + worklists for the signed-in role — the reporting layer the spreadsheets never had.
- **Components:** KPI stat cards (with `SparkLineChart`); float-aging **`PieChart`** (donut); float trend **`LineChart`**; utilization **`Gauge`** — all MUI X Charts; **worklist widgets** (My alerts, Long-outstanding, Supplier returns due, Medical replenishment due, Migration exceptions) using DataGrid; quick actions ("New delivery", "New client").
- **Tables:** compact worklist tables (top 5 + "view all").
- **Forms:** none.
- **Filters:** territory + date-range chips (persist per user).
- **Dialogs:** none (widgets deep-link).
- **Validation:** n/a.
- **Actions:** drill into any KPI/worklist; dismiss/resolve alert inline.
- **Permissions:** widgets rendered per role (MANAGER sees revenue/loss; DRIVER sees today's route; BILLING sees period status; MEDICAL sees patients).
- **Loading:** per-widget skeletons (independent).
- **Error:** per-widget error card + Retry (one failing widget never blanks the page).
- **Empty:** "Nothing needs attention" state per widget.
- **Navigation:** hub → every module.
- **Responsive:** 4-col → 2-col → 1-col stack; widgets reorder by priority on mobile.
- **Shortcuts:** `g d`; number keys `1–6` jump to widgets.

### 4.3 Clients — List _(W1)_

- **Purpose:** Find, filter, and manage customers (incl. medical patients).
- **Components:** §2.3 list shell; fuzzy search box (name/CUIT/phone); "Has outstanding" toggle; segment/coverage facet chips.
- **Tables:** columns — Name, Territory, Locality, Coverage (badge), Segment, Outstanding count, Status, Updated. Row actions: Open, Edit, New delivery.
- **Forms:** Create client (drawer, §4.4).
- **Filters:** `q`, `territory_id`, `coverage`, `segment`, `status`, `has_outstanding`.
- **Dialogs:** possible-duplicate confirm (fuzzy match on create).
- **Validation:** filter whitelist.
- **Actions:** New client, Export CSV (MANAGER/BILLING), bulk set status (ADMIN).
- **Permissions:** view — CLERK/INVENTORY/BILLING/MANAGER/MEDICAL (medical clients visible to MEDICAL only), DRIVER read; create — CLERK/ADMIN.
- **Loading/Error/Empty:** §2.3 (empty CTA "Create client").
- **Navigation:** row → Client Detail; `n` → create.
- **Responsive:** table → client cards < md.
- **Shortcuts:** §2.3 + `n`.

### 4.4 Client — Create/Edit (drawer) _(W1, US-01/02/03)_

- **Purpose:** Onboard/maintain a client with master data.
- **Components:** sectioned form (Identity, Address, Commercial, Contacts repeater, Delivery instructions).
- **Forms:** `name*`, `cuit`, `address_street`, `locality_id`, `territory_id*`, `coverage*`, `segment`, `daily_rate_default` (BILLING/ADMIN only), `delivery_instructions`, `contacts[]{ name, phone, is_primary }`.
- **Filters:** locality/territory typeaheads.
- **Dialogs:** duplicate-CUIT block, possible-duplicate-name confirm (`?force=true`).
- **Validation:** name required; CUIT `^\d{2}-\d{8}-\d$` + mod-11 (live check → `cuit_valid` badge); ≤1 primary contact; phone format; enum/FK validity.
- **Actions:** Save (`⌘S`), Save & new, Cancel.
- **Permissions:** create/edit CLERK/ADMIN; rate fields BILLING/ADMIN.
- **Loading:** submit spinner. **Error:** `409 DUPLICATE_CUIT`, `422` field errors, `409 VERSION_CONFLICT` merge. **Empty:** n/a.
- **Navigation:** on save → Client Detail.
- **Responsive:** full-screen sheet on mobile.
- **Shortcuts:** `⌘S`, `Esc`, `Alt+A` add contact row.

### 4.5 Client — Detail / Ledger _(W1, W4–W11, W20)_

- **Purpose:** The full customer account — the modern replacement for a client worksheet, unified from one movement store.
- **Components:** header (name, CUIT, coverage/segment badges, territory, phones, delivery instructions, status); KPI strip (outstanding cylinders, accrued rental days, open accessories); **tabbed** body.
  - **Tab: Overview** — recent activity timeline, quick actions.
  - **Tab: Nuestra Propiedad (Rentals)** — rental movements table.
  - **Tab: Su Propiedad (Refills)** — refill movements table.
  - **Tab: Accessories** — accessory rentals.
  - **Tab: Outstanding** — open movements + accrued days (aging colors).
  - **Tab: History** — all movements incl. VOID/SWAPPED.
  - **Tab: Billing** — periods, charges, invoices.
- **Tables:** rentals (Delivery, Cylinder/serial, Gas, Return, Rental days, State); refills (Empty-in, Cylinder, Gas, Full-out, State); outstanding (Cylinder, Gas, Delivery, **Accrued days**, Action: Return).
- **Forms:** inline quick-return; opens Deliver/Refill drawer (§4.10).
- **Filters:** per-tab: kind, gas, date range, `open=true`.
- **Dialogs:** Return, Swap, Deliver, Rent accessory, Void.
- **Validation:** contextual (see dialogs).
- **Actions:** New delivery, New refill, Rent accessory, Close account (ADMIN; blocked if outstanding/accessories), Edit client.
- **Permissions:** view per role/coverage; write CLERK/DRIVER; billing tab BILLING/MANAGER.
- **Loading:** header skeleton + per-tab lazy skeletons. **Error:** per-tab card. **Empty:** per-tab ("No rentals yet").
- **Navigation:** breadcrumb Clients › {name}; cylinder cells → Cylinder Detail.
- **Responsive:** tabs → segmented dropdown < md; tables → cards.
- **Shortcuts:** `1–7` switch tabs; `n` new delivery; `r` return focused row.

### 4.6 Cylinders — List (Fleet) _(W2)_

- **Purpose:** Search/manage physical assets across owners.
- **Components:** §2.3 shell; serial search (trigram, disambiguates duplicate serials across owners); ownership + state facets.
- **Tables:** Serial, Owner (chip), Gas, Capacity, State (badge), Condition, Current holder, Territory, Updated.
- **Forms:** Register cylinder (§4.7).
- **Filters:** `q` (serial), `state`, `gas_code`, `owner_party_id`, `ownership_basis`, `territory_id`, `packaging`.
- **Dialogs:** none (from list); bulk export.
- **Validation:** filter whitelist.
- **Actions:** Register cylinder, Export (MANAGER/INVENTORY), bulk retire (ADMIN).
- **Permissions:** view CLERK/PLANT/INVENTORY/MANAGER (+DRIVER read); create PLANT/CLERK/ADMIN.
- **Loading/Error/Empty:** §2.3.
- **Navigation:** row → Cylinder Detail.
- **Responsive:** table → cards; owner/gas as pills.
- **Shortcuts:** §2.3.

### 4.7 Cylinder — Create/Edit + Detail (Life History) _(W2, W12, W13)_

- **Purpose:** Register a cylinder; view its complete circulation timeline; run loss/replace.
- **Components:** detail header (serial, owner, gas, capacity, packaging, current state/holder); **life-history timeline/table** (out → holder → in, gas, rental days) spanning years; battery membership panel; ownership/branding; action bar.
- **Tables:** circulation history (Delivery, Holder, Return, Gas, Rental days, State), filter by date/holder.
- **Forms:** Register/Edit — `owner_party_id*`, `serial_number*`, `gas_code`, `capacity_m3`, `ownership_basis*`, `home_territory_id`, `acquisition_date`.
- **Filters:** history date range, holder.
- **Dialogs:** **Loss/Broken** (`outcome`, client, date, note → supplier-liability alert if supplier-owned); **Replace** (pick replacement cylinder + client); **Sell** (link to §4.12).
- **Validation:** serial required, unique per owner (`409 DUPLICATE_SERIAL_FOR_OWNER`); capacity > 0; **owner⇄basis** consistency (`422 OWNER_BASIS_MISMATCH`); gas normalized; illegal state transitions blocked.
- **Actions:** Save, Report loss, Report broken, Replace, Sell, Retire, Edit.
- **Permissions:** register/edit PLANT/CLERK/ADMIN; loss INVENTORY/CLERK/ADMIN; delete ADMIN.
- **Loading:** header + timeline skeleton. **Error:** duplicate/mismatch banners; `409 ALREADY_TERMINAL`. **Empty:** "No movements yet — cylinder is new."
- **Navigation:** holder cells → Client Detail; breadcrumb Cylinders › {serial}.
- **Responsive:** timeline collapses to a vertical list on mobile.
- **Shortcuts:** `e` edit, `l` loss, `Esc` close.

### 4.8 Batteries — List & Detail _(W2)_

- **Purpose:** Manage manifold packs and their member cylinders.
- **Components:** list shell; detail with member grid + circulation history (battery moves as a unit).
- **Tables:** list (Code, Owner, Gas, Members, State); detail members (Serial, Gas, Added, active flag).
- **Forms:** Create battery — `battery_code*`, `owner_party_id*`, `gas_code`, `member_cylinder_ids[]` (≥2). Add/remove member.
- **Filters:** state, gas, `q` (code).
- **Dialogs:** add-member picker; remove-member confirm.
- **Validation:** ≥2 members (`422 TOO_FEW_MEMBERS`); member not already packed (`409 MEMBER_ALREADY_PACKED`); shared owner.
- **Actions:** Create, Add member, Remove member, Deliver battery (→ movement).
- **Permissions:** PLANT/CLERK/ADMIN (GET +INVENTORY/MANAGER).
- **Loading/Error/Empty:** §2.3; empty members → "Add cylinders to this battery".
- **Navigation:** member → Cylinder Detail.
- **Responsive:** member grid → list.
- **Shortcuts:** `n` new, `a` add member.

### 4.9 Movements — List & Detail _(W4–W9, W17)_

- **Purpose:** System-wide query of every delivery/return/swap; single canonical event (no dual books).
- **Components:** §2.3 shell; strong date-range + state filters; detail panel with linked cylinder/client, remito, swap link, audit trail.
- **Tables:** Delivery, Return, Cylinder/serial, Client, Kind (RENTAL/REFILL), Gas, Rental days, State, Origin node.
- **Forms:** none here (creation via §4.10 / field app).
- **Filters:** `cylinder_id`, `holder_party_id`, `state` (multi), `movement_kind`, `gas_code`, `delivery_date[gte/lte]`, `open=true`, `remito_id`.
- **Dialogs:** Return, Swap, Void (from detail).
- **Validation:** in dialogs.
- **Actions:** Return, Swap, Void, open cylinder/client, view audit.
- **Permissions:** view CLERK/INVENTORY/BILLING/MANAGER; write CLERK/DRIVER; void CLERK/ADMIN.
- **Loading/Error/Empty:** §2.3.
- **Navigation:** cells → cylinder/client; breadcrumb.
- **Responsive:** table → cards with state chip.
- **Shortcuts:** `r` return, `s` swap on focused row.

### 4.10 New Delivery / Refill (drawer) _(W4, W7)_

- **Purpose:** Record a rental delivery (Nuestra Propiedad) or a refill-in (Su Propiedad). Opened from Client Detail, Cylinder Detail, or field app.
- **Components:** cylinder picker (scan/serial typeahead showing owner/state), client picker (prefilled if launched from client), gas selector (defaults from cylinder), date picker, origin-node select (transfers), remito field, note.
- **Forms:** `cylinder_id*`, `holder_party_id*`, `movement_kind*` (auto-inferred from cylinder ownership), `gas_code`, `delivery_date*`, `origin_party_id`, `remito_number`, `note`.
- **Filters:** picker search.
- **Dialogs:** "Cylinder already out" conflict resolver (shows current holder + link).
- **Validation:** **single custody** (block if cylinder OPEN → `409 CYLINDER_ALREADY_OUT`); kind⇔ownership (`422 KIND_BASIS_MISMATCH`); date plausible (`422 DATE_OUT_OF_RANGE`); not terminal (`409 CYLINDER_TERMINAL`); gas normalized (`422 UNKNOWN_GAS`); origin must be a party (never free text).
- **Actions:** Save & close, Save & add another (keeps client), Scan next (field).
- **Permissions:** DRIVER/CLERK.
- **Loading:** submit spinner; picker debounce skeleton. **Error:** conflict/validation banners. **Empty:** picker "no matches — register cylinder?".
- **Navigation:** returns to origin context; rental clock starts.
- **Responsive:** full-screen on mobile; scan button prominent.
- **Shortcuts:** `⌘Enter` save, `⌥Enter` save & add another.

### 4.11 Return / Swap / Void (dialogs) _(W5, W9, W17)_

- **Return** — `{ return_date }`; **auto-computes & previews rental_days**; validation `return_date ≥ delivery_date` (`422 RETURN_BEFORE_DELIVERY`), plausible date, movement OPEN (`409 NOT_OPEN`). Action: Confirm return. Roles DRIVER/CLERK.
- **Swap** — `{ returned_cylinder_id, return_date }`; validates returned cylinder not busy (`409 RETURNED_CYLINDER_BUSY`); links both cylinders. Roles CLERK/DRIVER.
- **Void** — `{ reason* }`; blocked if already billed/exported (`409 ALREADY_BILLED`); keeps row as VOID (append-only). Roles CLERK/ADMIN; confirm modal with type-to-confirm.
- **Shared:** `If-Match` concurrency; loading spinner; success toast; `Esc` cancel, `⌘Enter` confirm.

### 4.12 Sales — List & New Sale _(W10)_

- **Purpose:** Record outright cylinder sales; browse sold cylinders.
- **Components:** list shell; sale form.
- **Tables:** Date, Cylinder/serial, Client, Gas, Capacity, Price, Locality.
- **Forms:** `cylinder_id*`, `client_party_id`, `sale_date*`, `gas_code`, `capacity_m3`, `price`, address/locality/phone snapshot.
- **Filters:** `sale_date[gte/lte]`, `client_party_id`, `gas_code`.
- **Dialogs:** confirm sale (irreversible/terminal).
- **Validation:** no OPEN rental on cylinder (`409 CYLINDER_OUT_ON_RENTAL`); not already sold (`409 ALREADY_SOLD`); price ≥ 0.
- **Actions:** New sale, Export.
- **Permissions:** CLERK/MANAGER/ADMIN; view +BILLING.
- **Loading/Error/Empty:** §2.3; empty "No sales in range".
- **Navigation:** cylinder cell → detail (now SOLD).
- **Responsive:** cards < md.
- **Shortcuts:** `n` new.

### 4.13 Accessories & Rentals _(W11)_

- **Purpose:** Manage regulators/adapters/mochilas and their loans.
- **Components:** two tabs — Accessories (inventory) and Accessory Rentals (loans).
- **Tables:** accessories (Type, Identifier, Owner, State); rentals (Accessory, Client, Qty, Start, End, Charge basis, State).
- **Forms:** register accessory; rent form `{ accessory_id*, client_party_id*, quantity, start_date*, charge_basis, remito_number, note }`; return `{ end_date }`.
- **Filters:** type, state, `open=true`, client.
- **Dialogs:** Rent, Return, mark In-repair/Lost.
- **Validation:** accessory not already ON_LOAN (`409 ACCESSORY_ALREADY_ON_LOAN`); qty ≥1; end ≥ start.
- **Actions:** Register, Rent, Return, Repair, Retire.
- **Permissions:** rent DRIVER/CLERK; manage PLANT/CLERK/ADMIN.
- **Loading/Error/Empty:** §2.3; empty "No accessories on loan".
- **Navigation:** rental → Client Detail.
- **Responsive:** cards < md.
- **Shortcuts:** `n` register, `r` rent.

### 4.14 Supplier Loans _(W14, W15)_

- **Purpose:** Track supplier cylinders' four-stage round-trip (Nordelta/Intergas) and overdue returns.
- **Components:** list + detail with **stage stepper** (Received → Out to client → Back → Returned to supplier).
- **Tables:** Cylinder, Supplier, Client, Received, Delivered, Client-return, Supplier-return, Stage.
- **Forms:** Start loan `{ cylinder_id*, supplier_party_id*, gas_code, received_from_supplier* }`; Advance `{ stage, date, client_party_id }`.
- **Filters:** supplier, stage, `open=true`.
- **Dialogs:** Advance-stage.
- **Validation:** supplier party is SUPPLIER; forward-only stages; dates non-decreasing (`422 STAGE_OUT_OF_ORDER` / `DATE_ORDER`).
- **Actions:** Start loan, Advance stage.
- **Permissions:** CLERK/INVENTORY/ADMIN (view +MANAGER).
- **Loading/Error/Empty:** §2.3; empty "No open supplier loans".
- **Navigation:** cylinder/client cells.
- **Responsive:** stepper vertical on mobile.
- **Shortcuts:** `n` new, `Enter` advance.

### 4.15 Transfers _(W16)_

- **Purpose:** Move cylinders between hubs/sub-distributor nodes.
- **Components:** list + create form (from-node → to-node picker).
- **Tables:** Cylinder, From, To, Date, Note.
- **Forms:** `{ cylinder_id*, from_party_id*, to_party_id*, transfer_date*, note }`.
- **Filters:** cylinder, to_party, date range.
- **Dialogs:** confirm.
- **Validation:** from ≠ to (`422 SAME_PARTY`); SUBDIST limited to own node (`403 NODE_SCOPE`).
- **Actions:** New transfer.
- **Permissions:** SUBDIST/CLERK/INVENTORY.
- **Loading/Error/Empty:** §2.3.
- **Navigation:** cylinder cell.
- **Responsive:** cards < md.
- **Shortcuts:** `n` new.

### 4.16 Routes — Planning (web) _(W3)_

- **Purpose:** Assemble a driver's route: stops + required cylinders/load manifest.
- **Components:** territory selector, requests/stops list, drag-order stops, **load manifest** panel (gas/size counts), assign driver, publish to field app.
- **Tables:** stops (Client, Locality, Requested gas/size/qty, Instructions), manifest (Gas, Size, Qty).
- **Forms:** add stop, set quantities, assign driver.
- **Filters:** territory, date, unassigned.
- **Dialogs:** publish confirm.
- **Validation:** at least one stop; driver assigned; stock availability warning.
- **Actions:** Build route, Reorder, Assign, Publish.
- **Permissions:** CLERK/MANAGER.
- **Loading/Error/Empty:** skeleton; empty "No requests — add stops".
- **Navigation:** publish → available in Field App.
- **Responsive:** two-pane → stacked.
- **Shortcuts:** `a` add stop, `⌘S` save.

### 4.17 Field App — Route Run & Capture (mobile) _(W3, W4, W5, W8)_

- **Purpose:** Driver executes stops; captures deliver/return/swap at the door; offline-first.
- **Components:** bottom tab nav (Route, Scan, Sync, Me); stop cards with instructions + contacts (tap-to-call); big **Scan** (barcode/serial) button; per-stop deliver/return list; sync banner.
- **Tables:** stop's cylinders (delivered/returned toggle rows).
- **Forms:** quick deliver (scan → gas prefilled → confirm), quick return (scan → rental days preview), swap, accessory rent.
- **Filters:** today / this route.
- **Dialogs:** conflict ("cylinder shows at another client — resolve"), offline-saved confirmation.
- **Validation:** same as §4.10/§4.11 but **deferred conflict** offline; idempotency keys prevent dup on retry.
- **Actions:** Scan, Deliver, Return, Swap, Complete stop, Sync now.
- **Permissions:** DRIVER (territory-scoped), field SUBDIST.
- **Loading:** optimistic (local write instant); sync spinner. **Error:** queued-with-error badge → Sync Queue. **Empty:** "Route complete 🎉".
- **Navigation:** Route → Stop → Capture; Sync tab for conflicts.
- **Responsive:** xs/sm only; thumb-zone actions; large tap targets.
- **Shortcuts:** hardware scanner enter = capture; volume-key scan (device-dependent).

### 4.18 Field App — Sync/Conflict Queue (mobile)

- **Purpose:** Resolve writes that conflicted on sync (e.g., cylinder taken by another movement).
- **Components:** queued items list (pending/synced/conflict), per-item diff, resolve actions.
- **Tables:** queued ops (Type, Cylinder, Client, Status).
- **Forms:** edit-and-retry.
- **Dialogs:** resolve conflict (keep mine / discard / edit).
- **Validation:** re-runs server rules on retry.
- **Actions:** Retry, Edit, Discard, Sync all.
- **Permissions:** DRIVER/SUBDIST.
- **Loading:** sync progress. **Error:** persistent conflict banner. **Empty:** "All synced".
- **Navigation:** from Sync tab / global banner.
- **Responsive:** mobile.
- **Shortcuts:** n/a (touch).

### 4.19 Delivery Notes (Remitos)

- **Purpose:** Register/lookup remito references linked to movements/accessory rentals.
- **Components:** list shell; quick-create.
- **Tables:** Remito #, Issued, Client, Linked movements.
- **Forms:** `{ remito_number*, issued_date, client_party_id }`.
- **Filters:** `q`, client.
- **Dialogs:** none.
- **Validation:** unique remito (`409 DUPLICATE_REMITO`).
- **Actions:** New remito.
- **Permissions:** CLERK/BILLING.
- **Loading/Error/Empty:** §2.3.
- **Navigation:** remito → linked movements.
- **Responsive:** cards.
- **Shortcuts:** `n`.

### 4.20 Rates

- **Purpose:** Manage effective-dated rental rates (default & per client/gas).
- **Components:** list; rate editor with timeline preview.
- **Tables:** Client (or Default), Gas, Period, Amount, Effective from/to.
- **Forms:** `{ client_party_id?, gas_code?, period, amount*, effective_from*, effective_to? }`.
- **Filters:** client, gas.
- **Dialogs:** overlap warning.
- **Validation:** amount ≥ 0; `effective_to ≥ from`; no overlapping active rate (`409 RATE_OVERLAP`).
- **Actions:** New rate, End rate.
- **Permissions:** BILLING/ADMIN.
- **Loading/Error/Empty:** §2.3; empty "Using default rate only".
- **Navigation:** from client Billing tab.
- **Responsive:** cards.
- **Shortcuts:** `n`.

### 4.21 Billing — Runs & Run Detail _(W20)_

- **Purpose:** Compute, review, approve, and export period charges.
- **Components:** runs list; run detail with per-client invoices + **charge lines traced to movements**; approve/export bar; export status.
- **Tables:** runs (Period, Status, Clients, Total); run detail invoices (Client, Rental days, Gas, Accessories, Total); charge lines (Source movement, Description, Qty, Unit price, Amount).
- **Forms:** New run `{ period_start*, period_end*, client_party_id? }`.
- **Filters:** run: status; detail: client.
- **Dialogs:** Approve (MFA), Export confirm, unresolved-lines block.
- **Validation:** `period_end ≥ start`; period not locked (`409 PERIOD_LOCKED`); all lines resolved (`409 UNRESOLVED_LINES`); export only if approved (`409 NOT_APPROVED`).
- **Actions:** New run, Approve, Export, Re-run.
- **Permissions:** BILLING (approve +MANAGER, MFA).
- **Loading:** async job progress bar (draft compute). **Error:** `503 EXPORT_UNAVAILABLE` retry; unresolved lines list. **Empty:** "No billable activity in period".
- **Navigation:** run → invoice → charge line → movement.
- **Responsive:** nested tables → accordions on mobile.
- **Shortcuts:** `a` approve, `x` export.

### 4.22 Invoice Detail

- **Purpose:** One client's period invoice, fully traceable to physical events.
- **Components:** header (client, period, status, total); charge-line table; source links; PDF/CSV export.
- **Tables:** charge lines (Source, Description, Qty×UnitPrice = Amount).
- **Forms:** none (adjustments via re-run/void source).
- **Filters:** none.
- **Dialogs:** cancel invoice (permissioned).
- **Validation:** n/a (derived).
- **Actions:** Export PDF/CSV, Open source movement.
- **Permissions:** BILLING/MANAGER; MEDICAL for medical clients.
- **Loading/Error/Empty:** skeleton; empty "No lines".
- **Navigation:** line → movement.
- **Responsive:** table → cards.
- **Shortcuts:** `Esc` back.

### 4.23 Medical / Municipal Statement _(W8, US-15)_

- **Purpose:** Per-patient O2 + accessory consumption for municipal-hospital billing; approve/dispute lines.
- **Components:** period + patient filter; per-patient sections; approve/dispute controls; consolidated municipal total.
- **Tables:** per patient — deliveries, rental days, regulator/mochila rentals; each line approvable.
- **Forms:** dispute note per line.
- **Filters:** `period`, `client_party_id`.
- **Dialogs:** dispute line, submit statement.
- **Validation:** period closed; each line reviewed.
- **Actions:** Approve line, Dispute line, Submit statement.
- **Permissions:** MEDICAL, BILLING.
- **Loading/Error/Empty:** skeleton; empty "No medical activity".
- **Navigation:** patient → Client Detail.
- **Responsive:** patient accordions on mobile.
- **Shortcuts:** `a` approve focused line, `d` dispute.

### 4.24 Reports Hub + Individual Reports _(W18 + gap closure)_

- **Purpose:** The reporting layer (fleet, float-aging, outstanding, rental/revenue, loss, supplier-returns, cylinder-life, data-quality).
- **Components:** report cards hub; each report = custom filter bar + **MUI X Charts** chart(s) + drill-down **DataGrid** + export (CSV via grid; PDF custom); saved report presets.
- **Tables:** report-specific (see `openapi_specification.md` §4.12); all drillable to entities.
- **Forms:** none (parameter filters).
- **Filters:** per report — period, territory, gas, owner, aging bucket, min-days, group-by.
- **Dialogs:** schedule/export.
- **Validation:** parameter whitelist (`422` on bad param).
- **Actions:** Run, Export CSV/PDF, Save preset, Drill.
- **Permissions:** MANAGER/INVENTORY/BILLING (data-quality +ADMIN; medical +MEDICAL).
- **Loading:** chart + table skeletons; long reports async with progress. **Error:** param error + card. **Empty:** "No data for these parameters".
- **Navigation:** hub → report → entity drill.
- **Responsive:** charts stack; tables → cards; horizontal scroll for wide tables.
- **Shortcuts:** `g r`; `e` export.

### 4.25 Global Search

- **Purpose:** Federated jump across clients, cylinders, movements, accessories (typo-tolerant).
- **Components:** command-style overlay + full results page; type facets; result rows with entity icon/label/score.
- **Tables:** grouped results by type.
- **Forms:** search box (`q`).
- **Filters:** `types`, territory.
- **Dialogs:** none.
- **Validation:** `q` ≥ 2 chars (`422 QUERY_TOO_SHORT`).
- **Actions:** open result, filter by type.
- **Permissions:** all (results scoped by role/territory; medical hidden from non-MEDICAL).
- **Loading:** inline result skeletons (debounced). **Error:** retry. **Empty:** "No matches for '{q}'".
- **Navigation:** `/` opens overlay; Enter → first result; result → detail.
- **Responsive:** full-screen overlay on mobile.
- **Shortcuts:** `/` open, `↑/↓` move, `Enter` open, `Esc` close.

### 4.26 Alerts / Notifications Center

- **Purpose:** Operational worklists — long-outstanding, supplier-overdue, supply-gap, migration exceptions, single-custody conflicts.
- **Components:** filter tabs by type/severity; alert cards with deep-links + resolve.
- **Tables:** Alert type, Entity, Severity, Created, Assigned role, Status.
- **Forms:** resolve note.
- **Filters:** `alert_type`, `severity`, `open=true`.
- **Dialogs:** resolve confirm.
- **Validation:** n/a.
- **Actions:** Open entity, Resolve, Snooze.
- **Permissions:** role-targeted (`assigned_role`); ADMIN sees all.
- **Loading/Error/Empty:** §2.3; empty "No open alerts".
- **Navigation:** bell → center; alert → entity.
- **Responsive:** cards.
- **Shortcuts:** `g a`; `Enter` open, `r` resolve.

### 4.27 Admin — Users & Roles

- **Purpose:** Manage users, roles, territory scopes.
- **Components:** users list; user drawer (roles multiselect, territories, MFA); roles reference table.
- **Tables:** users (Username, Email, Roles, Territories, Active, Last login).
- **Forms:** `{ username*, email, roles[]≥1, territories[], mfa_enabled }`.
- **Filters:** role, active.
- **Dialogs:** deactivate/reset MFA confirm.
- **Validation:** username unique (`409 DUPLICATE_USERNAME`); ≥1 role.
- **Actions:** New user, Edit, Deactivate, Reset MFA.
- **Permissions:** ADMIN (MFA).
- **Loading/Error/Empty:** §2.3.
- **Navigation:** Admin › Users.
- **Responsive:** table → cards.
- **Shortcuts:** `n`.

### 4.28 Admin — Master Data (Gas types, Localities, Territories)

- **Purpose:** Manage controlled vocabularies + **legacy-spelling aliases** (kills the `o/ox/oxigeno` chaos).
- **Components:** tabbed lists; gas-type editor with **alias manager**.
- **Tables:** gas types (Code, Name, Family, Medical, Active); aliases (Alias → Code); localities; territories.
- **Forms:** gas `{ code*, name*, family, is_medical, aliases[] }`; locality/territory forms.
- **Filters:** active, medical, `q`.
- **Dialogs:** merge/deactivate confirm.
- **Validation:** code unique (`409 DUPLICATE_CODE`); alias unique (`409 ALIAS_IN_USE`).
- **Actions:** New, Edit, Add alias, Deactivate.
- **Permissions:** GET all; write ADMIN.
- **Loading/Error/Empty:** §2.3.
- **Navigation:** Admin › Master Data.
- **Responsive:** cards.
- **Shortcuts:** `n`, `a` add alias.

### 4.29 Admin — Migration Exceptions Queue

- **Purpose:** Clean legacy dirt (impossible dates 2047/2048, ERROR cells, text-in-date `buroni`, orphan serials).
- **Components:** queue list; per-item raw-cell viewer + suggested fix + resolve form.
- **Tables:** Workbook, Sheet, Row, Reason, Status.
- **Forms:** resolve `{ status, resolution_note }`; inline fix mapping to real entities.
- **Filters:** `status`, `reason`, `workbook`.
- **Dialogs:** bulk resolve.
- **Validation:** resolution requires target entity or ignore reason.
- **Actions:** Resolve, Ignore, Create entity from raw.
- **Permissions:** ADMIN/INVENTORY.
- **Loading/Error/Empty:** §2.3; empty "Migration clean 🎉".
- **Navigation:** Admin › Migration.
- **Responsive:** cards.
- **Shortcuts:** `j/k`, `Enter` resolve.

### 4.30 Admin — Audit Log Viewer

- **Purpose:** Read the immutable audit trail (who/what/when, before/after).
- **Components:** filter bar; virtualized log table; JSON before/after diff panel.
- **Tables:** Occurred, Actor, Role, Action, Entity, Entity id, Source.
- **Forms:** none (read-only).
- **Filters:** `entity_table`, `entity_id`, `actor_user_id`, `occurred_at[gte/lte]`, `action`.
- **Dialogs:** diff detail.
- **Validation:** n/a.
- **Actions:** Open diff, jump to entity, export.
- **Permissions:** ADMIN, MANAGER (read-only — never writable).
- **Loading:** virtualized skeleton. **Error:** card. **Empty:** "No audit entries for filters".
- **Navigation:** Admin › Audit; entity → detail.
- **Responsive:** table → cards; diff full-screen.
- **Shortcuts:** `f` filter, `Enter` diff.

### 4.31 System Pages (403 / 404 / 500 / Offline)

- **Purpose:** Consistent handling of forbidden, missing, failed, and offline states.
- **Components:** illustration, message, `request_id` (500), primary CTA (Home / Retry / Back).
- **Permissions:** all. **Responsive:** centered single column. **Shortcuts:** `Enter` primary CTA. **Offline:** cached shell + "reconnect" banner; field app stays functional read/write-queued.

---

## 5. Screen → Workflow / Role / Endpoint Coverage

| Screen(s)                                     | Workflow(s)     | Key roles                 | Key endpoints                                |
| --------------------------------------------- | --------------- | ------------------------- | -------------------------------------------- |
| Clients list/detail/form                      | W1              | CLERK, MEDICAL            | `/clients*`                                  |
| Cylinders list/detail, Loss, Replace          | W2, W12, W13    | PLANT, CLERK, INVENTORY   | `/cylinders*`                                |
| Batteries                                     | W2              | PLANT                     | `/batteries*`                                |
| Movements, Deliver/Refill, Return, Swap, Void | W4–W9, W17      | DRIVER, CLERK             | `/movements*`                                |
| Sales                                         | W10             | CLERK, MANAGER            | `/sales*`                                    |
| Accessories & rentals                         | W11             | DRIVER, CLERK             | `/accessories*`, `/accessory-rentals*`       |
| Routes / Field app                            | W3, W8          | CLERK, DRIVER             | `/routes*`, `/movements*`                    |
| Medical statement                             | W8              | MEDICAL, BILLING          | `/reports/medical-statement`                 |
| Supplier loans                                | W14, W15        | CLERK, INVENTORY          | `/supplier-loans*`                           |
| Transfers                                     | W16             | SUBDIST, CLERK            | `/transfers*`                                |
| Reports hub, Alerts, Audit                    | W18, W17, W19   | MANAGER, INVENTORY, ADMIN | `/reports/*`, `/alerts*`, `/audit-logs`      |
| Billing, Invoices, Rates                      | W20             | BILLING, MANAGER          | `/billing/*`, `/invoices*`, `/rental-rates*` |
| Admin, Master data, Migration                 | platform / gaps | ADMIN                     | `/admin/*`, `/gas-types*`, `/migration/*`    |
| Global search                                 | platform        | all                       | `/search`                                    |

**Coverage:** every workflow W1–W20 has at least one screen; new screens (Dashboard, Reports, Alerts, Master Data, Migration, Audit) close the legacy gaps (no reporting, no vocab control, no audit).

---

## 6. Cross-cutting UX decisions (rationale)

- **One movement, two views** — Client ledger and Cylinder life-history read the same event; there is no "post twice" screen, eliminating the legacy dual-book divergence.
- **Rental days shown, never typed** — the return dialog previews the computed value; users can't produce ERROR cells.
- **Single-custody surfaced early** — the delivery picker flags an already-out cylinder before submit, turning a silent legacy inconsistency into an inline block.
- **Offline-first field capture** — drivers keep working without signal; conflicts are explicit and resolvable, never silent overwrites.
- **Role-shaped surfaces** — each role sees only its worklists and actions; medical/patient data is access-gated end to end.
- **One component system** — everything is MUI: lists are MUI X **Data Grid (Community, server-mode)**, charts are MUI X **Charts**, dates are MUI X **Date Pickers**; a single theme drives color, density, and localization so grid, charts, and pickers stay consistent in light/dark and in both languages.
- **Bilingual by default** — the whole UI runs through **react-i18next** with **Spanish (`es`) as the default** and English (`en`) available; domain enums are translated for display while canonical codes are stored, so language never affects data integrity.
- **Clear state/forms separation** — **Zustand** holds client/session/offline state (auth, locale, theme, saved views, offline outbox), the query/cache layer holds server data, and **react-hook-form** owns form state with schema validation mirroring the API rules; the three never overlap, which keeps re-renders low and offline capture reliable.
