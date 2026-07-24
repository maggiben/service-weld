# 006 — Frontend

> Source: `frontend_design.md` (full UI/UX, navigation map, per-screen specs) and `product_requirements_document.md` (roles, stories).

## Purpose

Build the two user-facing applications: a desktop-first **back-office web app** and an offline-capable **mobile field app**, sharing one design system and the generated API client, covering all 31 screens and all workflows `W1`–`W20`.

## Mandated stack

- **Back-office (`apps/web`) and field (`apps/field`):** **Next.js 16+ App Router** + **React 19** (D-12) — not Vite SPAs. Field stays offline-first PWA (R3) on that stack.
- **MUI (Material UI)** is the component library and theming/design-system foundation for both apps (single `ThemeProvider`, light/dark `palette.mode`, `@mui/icons-material`).
- **MUI X Data Grid — Community edition** (`@mui/x-data-grid`) is used for **every** list/table.
- **MUI X Charts** (`@mui/x-charts`) is used for **every** chart, sparkline, and gauge — no other charting library.
- **MUI X Date Pickers** + a locale date adapter (Day.js or date-fns) for all date inputs.
- **react-i18next** for i18n with **`es` (default/fallback)** and **`en`** locales.
- **Zustand** is the client-state library (session, UI, offline outbox, saved views) — no other global-state library.
- **react-hook-form** is the form library for **every** form (with a schema resolver + MUI `Controller` bindings) — no other form library.
- Server data is fetched/cached via a thin data-fetching layer (query client), kept **separate** from Zustand.

## Requirements

- R1. Implement all screens in `frontend_design.md` §4 with their specified components, tables, forms, filters, dialogs, validation, actions, permissions, and loading/error/empty states, built with **MUI** primitives.
- R2. Implement the **app shell** (MUI `AppBar`/`Drawer`/`Menu`, role-filtered sidebar, `⌘K` command palette, `Breadcrumbs`, `Snackbar` toasts, drawers, `Dialog` modals, language switcher) and the **navigation map** (`frontend_design.md` §3).
- R3. Implement the **field app** as an offline-first PWA: local write queue, background sync, idempotency keys, connectivity + per-record sync badges, and the conflict-resolution queue screen.
- R4. Enforce **role-/territory-based visibility** in the UI (hide forbidden nav/actions), backed by `GET /auth/me` capabilities.
- R5. Implement the shared **list pattern** using **`<DataGrid>` (Community) in server mode** (`sortingMode`/`filterMode`/`paginationMode="server"`) driven by a custom filter bar; `GridToolbar` for column chooser, density, and CSV export; `checkboxSelection` + custom bulk-action bar; cursor pagination via `paginationMeta.hasNextPage` + `estimatedRowCount`; **saved views persisted in a Zustand `gridStore`**. Implement the **form pattern with react-hook-form**: `useForm` bound to MUI inputs via `Controller`, `useFieldArray` for repeaters (contacts, battery members), a **schema resolver** (e.g. `zodResolver`) mirroring the API/DB rules (`001`), server `422 details[]` mapped to fields via `setError`, unsaved-changes guard via `formState.isDirty`, and optimistic-concurrency merge on `409`.
- R9. Implement **client state with Zustand**: small typed slice stores — `sessionStore` (tokens, user, capabilities, territories), `uiStore` (theme, **language** persisted, sidebar, territory switcher), `notificationStore` (toasts/unread), `gridStore` (saved views + selection), and `outboxStore` (offline write queue, persisted to IndexedDB). Use selector-based subscriptions; do **not** store server-fetched entities in Zustand.
- R6. Implement the **keyboard shortcut** system and **responsive breakpoints** from `frontend_design.md` §2.6/§2.7 (align with MUI breakpoints).
- R7. Implement **i18n** with **react-i18next**: locales **`es` (default & fallback)** and **`en`**; namespaced keys; **no hard-coded user-facing strings**; translate domain vocabulary/enums (gas, states, roles, coverage, segments) via an `enums` namespace while storing canonical codes (BR-15); apply MUI localization packs (core `esES`/`enUS`, Data Grid, Date Pickers) tied to the active language; format numbers/currency (ARS) and dates (`dd/mm/yyyy` for `es-AR`) through shared `Intl`/adapter helpers; language switcher persisted, **defaulting to `es`** (org default also stored as `primary_language` in system settings — D-17).
- R8. Implement all charts with **MUI X Charts** (`BarChart`, `LineChart`, `PieChart`, `SparkLineChart`, `Gauge`, `ScatterChart`), sourcing series colors from the theme's gas/state palette keys.
- R10. Implement the **Configuración** (`/settings`) screen: appearance (`ThemePicker`), personal UI language (`uiStore`), and — for `admin:write` — operational system settings via `GET/PATCH /settings` (business timezone, rental min days, primary language, supplier-loan overdue days).
- R11. Implement **Recargas** (`/refills`, `014`): REFILL-only DataGrid (serial/client ledger links, entry/exit, gas, size, owner, city, sortable), actions devolver/canjear/anular, deliver drawer defaulting to REFILL; capability `movements:read` / `movements:write` / `movements:void`.
- R12. Extend **Tarifas** (`/rates`) with a **Recargas / rellenado** tab for `refill_rate` CRUD (gas × size) alongside rental rates (`014` R16).
- R13. Management **Dashboard** (`/dashboard`) includes refill revenue KPI and a quantity/revenue chart from `GET /reports/refill` (`014` R14 / `007`).

## Constraints

- C1. Consume the API strictly via `packages/api-client`, which is **generated from the Swagger-emitted OpenAPI JSON** (`/api/docs-json`) — the runtime contract (D-10). `openapi_specification.md` is the design/parity checklist, not the codegen source. No ad-hoc endpoint shapes.
- C2. Never block the field app on connectivity; never silently overwrite on sync conflict.
- C3. Rental days are **displayed, never typed** — the return dialog previews the computed value.
- C4. Single-custody is surfaced **before submit** (delivery picker flags an already-out cylinder).
- C5. Medical/patient screens gated to `MEDICAL`; billing screens to `BILLING`/`MANAGER`.
- C6. Accessibility: keyboard-navigable, focus management in drawers/modals, sufficient contrast in light/dark (MUI a11y defaults + verified).
- C7. **Data Grid Community-tier only** — do **not** rely on Pro/Premium features (column pinning, multi-column sort, multi-filter logic, tree data/row grouping/aggregation, Excel export). Since sort/filter/pagination run in server mode against the API, Community is sufficient; features that would need Pro are implemented via the custom filter bar/server sort or explicitly deferred.
- C8. All charting is **MUI X Charts**; introducing any other charting dependency is out of spec.
- C9. Locale is resolved once (persisted in `uiStore` → default `es`) and drives react-i18next, MUI locale packs, and the date adapter together so grid, charts, and pickers localize consistently.
- C10. **State separation is mandatory:** Zustand = client/session/UI/offline state only; server data = query/cache layer; form state = react-hook-form. Server entities are never duplicated into Zustand; form values live in RHF, not global state.
- C11. **react-hook-form for all forms** and **Zustand for all client state** — no competing form or global-state libraries in the bundle.

## Acceptance Criteria

- AC1. Each screen renders its loading (skeleton), error (retry + `request_id`), and empty (CTA) states.
- AC2. A driver completes deliver/return offline; entries show "queued", then "synced", and conflicts route to the conflict queue.
- AC3. Creating a client with a duplicate CUIT surfaces the `409 DUPLICATE_CUIT` inline; a possible-duplicate name prompts confirm.
- AC4. Attempting to deliver an already-out cylinder is blocked in-UI with the current-holder link before the request is sent (and still handled if the server returns `409`).
- AC5. Forbidden nav items/actions are absent for the role; a forbidden direct navigation shows the 403 page.
- AC6. The return dialog shows the correct `rental_days` preview and disables submit on invalid dates.
- AC7. Switching the language between `es` and `en` re-localizes all UI, DataGrid toolbar/pagination text, chart axes/tooltips, and date pickers with no reload and no hard-coded strings remaining; a fresh session with no stored preference defaults to `es`.
- AC8. Every list renders in a MUI X `DataGrid` (Community) and every chart is a MUI X Charts component; no other grid/chart library is bundled.
- AC9. Every form is a react-hook-form instance; a `422 details[]` response maps errors onto the correct fields, and closing a dirty form prompts an unsaved-changes guard.
- AC10. Client state (session, language, theme, saved views, offline outbox) is served from Zustand stores; a page reload restores persisted `uiStore`/`gridStore`/`outboxStore` state; no server entity data is held in Zustand.

## Edge Cases

- Optimistic UI rollback when a mutation fails; concurrency `409` opens a non-destructive merge modal.
- Very large lists (movements) → virtualization + cursor pagination; wide tables → horizontal scroll or card fallback < md.
- Duplicate-serial search results disambiguated by owner.
- Same-day medical deliver+return in the field app.
- Offline session expiry mid-route → allow queued capture, require re-auth at sync.

## Dependencies

- `004` (API contract + client), `005` (auth/capabilities/scoping), `007` (report/dashboard data), `009` (rental previews), `014` (refills UI).

## Implementation Notes

- Two apps `SHOULD` share one **MUI theme** + component library and the `enums`/translation resources; the field app is a separate build optimized for xs/sm and touch (still MUI + DataGrid + Charts).
- **DataGrid server mode:** map `onSortModelChange`/`onFilterModelChange`/`onPaginationModelChange` to API query params; feed rows + `paginationMeta.hasNextPage` + `estimatedRowCount` back; do not use client-side sort/filter for server-backed lists. Persist `{ sortModel, filterModel, columnVisibilityModel, density, pageSize }` for saved views.
- **DataGrid + tabs:** never keep a server-mode DataGrid mounted under `display: none` (or equivalent zero-size hide). The grid measures layout while hidden and can render an **empty viewport** after the tab is shown again, even when the query cache has rows. Prefer **conditional mount** of the active tab panel. If a tab must stay selected across navigation/refresh, put it in the URL (e.g. `/rates?tab=refill` — see `014` R16).
- **Charts:** wrap MUI X Charts in small presentational components that read series colors from `theme.palette` domain keys; provide shared loading/empty/error wrappers.
- **i18n setup:** initialize react-i18next with `fallbackLng: 'es'`, `supportedLngs: ['es','en']`, lazy-loaded namespace bundles; a single `LocaleProvider` composes react-i18next + MUI `esES`/`enUS` + Date Picker `LocalizationProvider` adapterLocale so one switch updates everything. Add a CI lint to catch untranslated literals.
- **State architecture:** three non-overlapping layers — (1) **query/cache layer** for server data (invalidate on mutations), (2) **Zustand** slice stores for client/session/UI/offline state, (3) **react-hook-form** for in-progress form values. Keep them decoupled; sync only at boundaries (e.g., `sessionStore` provides the auth token to the fetch layer; a successful mutation invalidates the query cache and may update `notificationStore`).
- **Zustand setup:** one store per concern via the slices pattern; `persist` middleware for `uiStore` (localStorage) and `outboxStore` (IndexedDB storage); `subscribeWithSelector` where background reactions are needed; expose actions on stores and read via narrow selectors to avoid re-renders.
- **react-hook-form setup:** central schema definitions (shared with validation messages in the `validation` i18n namespace); `Controller` wrappers for MUI `Select`/`Autocomplete`/`DatePicker`; a reusable `useServerErrors` helper to map `422 details[]` → `setError`; `reset(serverValues)` after successful save; `isDirty` drives the navigation guard.
- The offline outbox (field app) is the `outboxStore` keyed by idempotency id; a background syncer drains it and routes conflicts to the conflict-queue screen.
- Wire error mapping to render field-level `422 details[]` and map known `409` codes to friendly, **localized** messages (`errors` namespace).
- Drive shortcuts and command palette from a single action registry so they stay in sync with permissions.
- **Version pinning:** pin `@mui/material`, `@mui/x-data-grid`, `@mui/x-charts`, `@mui/x-date-pickers` to compatible major versions (cursor-pagination `paginationMeta`/`estimatedRowCount` require MUI X v7.23+); confirm the Data Grid features used are Community-tier.
