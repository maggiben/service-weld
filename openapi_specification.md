# OpenAPI Specification

## Cylinder Custody, Circulation & Rental Management API

**Version:** 1.0 · **OpenAPI:** 3.1 · **Base path:** `/api/v1`
**Companion docs:** `domain.md`, `workflows.md`, `sdd.md`, `database.md`, `product_requirements_document.md`.
**Legend:** `» observed` = grounded in the legacy workbooks. Roles `R1..R10` and rules `BR-xx` are defined in `sdd.md`/`product_requirements_document.md`.

---

## 1. Document header

```yaml
openapi: 3.1.0
info:
  title: Cylinder Custody, Circulation & Rental Management API
  version: 1.0.0
  description: >
    Single system of record replacing the three legacy Excel workbooks.
    One canonical movement event, enforced domain invariants, deterministic
    rental-day computation, and full reporting.
  contact: { name: Platform Team }
servers:
  - url: https://api.gascylinders.example.com/api/v1
    description: Production
  - url: https://staging.api.gascylinders.example.com/api/v1
    description: Staging
tags:
  - { name: Auth }
  - { name: Clients }
  - { name: Cylinders }
  - { name: Batteries }
  - { name: Movements }
  - { name: Sales }
  - { name: Accessories }
  - { name: SupplierLoans }
  - { name: Transfers }
  - { name: DeliveryNotes }
  - { name: Rates }
  - { name: Billing }
  - { name: Reports }
  - { name: Search }
  - { name: MasterData }
  - { name: Settings }
  - { name: Admin }
```

---

## 2. Global Conventions

### 2.1 Authentication

- **Scheme:** OAuth2 / OIDC **Bearer JWT**. Every call (except `/auth/login`, `/auth/refresh`) requires `Authorization: Bearer <access_token>`.
- **Access token** short-lived (~15 min); **refresh token** longer. Mobile field app authenticates once and caches a signed session for offline capture; queued writes are re-validated at sync.
- **MFA required** for privileged roles (R5 Billing, R6 Manager, R8 Admin).

### 2.2 Authorization (RBAC)

Every endpoint lists **Permissions** (allowed roles). Deny-by-default; territory-scoped roles (R2 Driver, R7 Sub-distributor) only see their `dispatch_territory`. Sensitive actions (sale, loss, void, rate change, delete, migration) require elevated roles and are audited.

| Role                    | Code        |
| ----------------------- | ----------- |
| R1 Administrative Clerk | `CLERK`     |
| R2 Delivery Driver      | `DRIVER`    |
| R3 Plant Operator       | `PLANT`     |
| R4 Inventory Controller | `INVENTORY` |
| R5 Billing Clerk        | `BILLING`   |
| R6 Manager              | `MANAGER`   |
| R7 Sub-Distributor      | `SUBDIST`   |
| R8 System Admin         | `ADMIN`     |
| R9 Hospital Coordinator | `MEDICAL`   |
| R10 Client (Phase 2)    | `CLIENT`    |

### 2.3 Idempotency (offline sync)

All **POST** creating resources accept an `Idempotency-Key: <uuid>` header. A retried key returns the original result (`200` with same body) instead of creating a duplicate. **Why:** drivers submit movements offline and retry on reconnect `» observed`.

### 2.4 Optimistic concurrency

Every mutable resource returns an `ETag` (= `version`). **PATCH/PUT/DELETE** must send `If-Match: "<version>"`. A stale version → `409 VERSION_CONFLICT`. **Why:** multi-user + offline editing; avoids lost updates without long locks.

### 2.5 Pagination (cursor-based)

- Query params: `limit` (default `50`, max `200`), `cursor` (opaque).
- Response envelope:

```json
{
  "data": [/* items */],
  "page": {
    "limit": 50,
    "next_cursor": "eyJpZCI6MTIzfQ==",
    "has_more": true,
    "total_estimate": 1663
  }
}
```

- Reports/exports may additionally accept `offset`/`page` for tabular UIs.
  **Why cursor:** stable pagination over large, frequently-appended tables (movements ≈ 180k rows `» observed`).

### 2.6 Filtering

- Simple equality: `?filter[field]=value` (repeatable for `IN`: `?filter[state]=OPEN&filter[state]=SWAPPED`).
- Ranges: `?filter[delivery_date][gte]=2025-01-01&filter[delivery_date][lte]=2025-03-31`.
- Boolean flags: `?open=true`.
- Each collection endpoint documents its **allowed filter fields** (whitelist; unknown → `422`).

### 2.7 Sorting

- `?sort=field` (asc) or `?sort=-field` (desc); multiple: `?sort=-delivery_date,serial_number`.
- Each endpoint documents its **allowed sort fields** (whitelist; unknown → `422`).

### 2.8 Standard error envelope

```json
{
  "error": {
    "code": "VALIDATION_FAILED",
    "message": "One or more fields are invalid.",
    "details": [
      { "field": "return_date", "issue": "must be >= delivery_date" }
    ],
    "request_id": "req_01HW…"
  }
}
```

### 2.9 Standard error codes (apply to all endpoints)

| HTTP | `code`                 | When                                            |
| ---- | ---------------------- | ----------------------------------------------- |
| 400  | `BAD_REQUEST`          | Malformed JSON / query.                         |
| 401  | `UNAUTHENTICATED`      | Missing/invalid/expired token.                  |
| 403  | `FORBIDDEN`            | Role/territory not permitted.                   |
| 404  | `NOT_FOUND`            | Resource/id does not exist.                     |
| 409  | `VERSION_CONFLICT`     | `If-Match` version stale.                       |
| 409  | `INVARIANT_CONFLICT`   | Business invariant violated (see per-endpoint). |
| 409  | `IDEMPOTENCY_MISMATCH` | Same key, different payload.                    |
| 422  | `VALIDATION_FAILED`    | Field/whitelist validation failed.              |
| 429  | `RATE_LIMITED`         | Too many requests.                              |
| 500  | `INTERNAL_ERROR`       | Unexpected server error.                        |
| 503  | `SERVICE_UNAVAILABLE`  | Dependency/export down.                         |

---

## 3. Reusable Components

```yaml
components:
  securitySchemes:
    bearerAuth: { type: http, scheme: bearer, bearerFormat: JWT }
  parameters:
    limit:  { name: limit,  in: query, schema: { type: integer, default: 50, maximum: 200 } }
    cursor: { name: cursor, in: query, schema: { type: string } }
    sort:   { name: sort,   in: query, schema: { type: string } }
    IfMatch:{ name: If-Match, in: header, required: true, schema: { type: string } }
    IdempotencyKey: { name: Idempotency-Key, in: header, schema: { type: string, format: uuid } }
  schemas:
    Error:
      type: object
      properties:
        error:
          type: object
          required: [code, message, request_id]
          properties:
            code: { type: string }
            message: { type: string }
            details:
              type: array
              items: { type: object, properties: { field: {type: string}, issue: {type: string} } }
            request_id: { type: string }
    PageMeta:
      type: object
      properties:
        limit: { type: integer }
        next_cursor: { type: string, nullable: true }
        has_more: { type: boolean }
        total_estimate: { type: integer, nullable: true }
    Money: { type: number, format: decimal, description: "ARS, 2 decimals" }
    GasCode: { type: string, enum: [O2, O2_MED, O2_LASER, CO2, N2, AR, AR_50, ATAL, MIX20, MIX22, MAPAX30, ACET, HELIUM, THERMOLENE] }
    Client:
      type: object
      properties:
        id: { type: integer }
        name: { type: string }
        cuit: { type: string, nullable: true, pattern: '^\d{2}-\d{8}-\d$' }
        cuit_valid: { type: boolean }
        address_street: { type: string, nullable: true }
        locality_id: { type: integer, nullable: true }
        territory_id: { type: integer }
        coverage: { type: string, enum: [PRIVATE, MUNICIPAL_HOSPITAL] }
        segment: { type: string, nullable: true }
        delivery_instructions: { type: string, nullable: true }
        daily_rate_default: { $ref: '#/components/schemas/Money', nullable: true }
        status: { type: string, enum: [ACTIVE, DORMANT, INACTIVE] }
        version: { type: integer }
        created_at: { type: string, format: date-time }
    Cylinder:
      type: object
      properties:
        id: { type: integer }
        owner_party_id: { type: integer }
        serial_number: { type: string }
        gas_code: { $ref: '#/components/schemas/GasCode' }
        capacity_m3: { type: number, nullable: true }
        ownership_basis: { type: string, enum: [OURS, SUPPLIER, CUSTOMER] }
        packaging: { type: string, enum: [SINGLE, BATTERY, BATTERY_MEMBER] }
        state: { type: string, enum: [IN_STOCK_EMPTY, IN_STOCK_FULL, AT_CLIENT, AT_SUPPLIER, SOLD, LOST, BROKEN, RETURNED_TO_SUPPLIER, RETIRED] }
        condition: { type: string, enum: [EMPTY, FULL] }
        version: { type: integer }
    MovementEvent:
      type: object
      properties:
        id: { type: integer }
        cylinder_id: { type: integer }
        holder_party_id: { type: integer }
        movement_kind: { type: string, enum: [RENTAL, REFILL] }
        property_basis: { type: string, enum: [OURS, SUPPLIER, CUSTOMER] }
        gas_code: { $ref: '#/components/schemas/GasCode' }
        delivery_date: { type: string, format: date }
        return_date: { type: string, format: date, nullable: true }
        rental_days: { type: integer, nullable: true, description: "Generated = return_date - delivery_date; null while open" }
        accrued_days: { type: integer, nullable: true, description: "today - delivery_date while OPEN" }
        origin_party_id: { type: integer, nullable: true }
        swap_with_cyl_id: { type: integer, nullable: true }
        remito_id: { type: integer, nullable: true }
        state: { type: string, enum: [OPEN, CLOSED, SWAPPED, LOST, SOLD, VOID] }
        note: { type: string, nullable: true }
        version: { type: integer }
  responses:
    Unauthorized: { description: Missing/invalid token, content: { application/json: { schema: { $ref: '#/components/schemas/Error' } } } }
    Forbidden:    { description: Not permitted, content: { application/json: { schema: { $ref: '#/components/schemas/Error' } } } }
    NotFound:     { description: Not found, content: { application/json: { schema: { $ref: '#/components/schemas/Error' } } } }
    Validation:   { description: Validation failed, content: { application/json: { schema: { $ref: '#/components/schemas/Error' } } } }
    Conflict:     { description: Conflict, content: { application/json: { schema: { $ref: '#/components/schemas/Error' } } } }
security:
  - bearerAuth: []
```

---

## 4. Endpoints

> Each endpoint lists: **Method · URL · Purpose · Authentication · Request JSON · Response JSON · Validation · Error Codes · Pagination · Filtering · Sorting · Permissions.** Global error codes (§2.9) apply everywhere and are not repeated; only **endpoint-specific** codes are listed.

---

### 4.1 Auth

#### POST `/auth/login`

- **Purpose:** Exchange credentials for tokens.
- **Authentication:** None (public).
- **Permissions:** Any user.
- **Request JSON:**

```json
{ "username": "clerk.ana", "password": "••••••", "otp": "123456" }
```

- **Response JSON (200):**

```json
{
  "access_token": "eyJ…",
  "refresh_token": "eyJ…",
  "expires_in": 900,
  "roles": ["CLERK"],
  "territories": ["Chacabuco"]
}
```

- **Validation:** `username`, `password` required; `otp` required if MFA enabled.
- **Error Codes:** `401 INVALID_CREDENTIALS`, `403 MFA_REQUIRED`, `423 ACCOUNT_LOCKED`.
- **Pagination / Filtering / Sorting:** N/A.

#### POST `/auth/refresh`

- **Purpose:** Rotate access token. **Auth:** valid refresh token in body. **Permissions:** any.
- **Request:** `{ "refresh_token": "eyJ…" }` · **Response (200):** same shape as login (minus refresh unless rotated).
- **Validation:** refresh token valid & not revoked. **Errors:** `401 INVALID_REFRESH`. N/A pagination/filter/sort.

#### POST `/auth/logout`

- **Purpose:** Revoke tokens/session. **Auth:** Bearer. **Permissions:** any authenticated.
- **Request:** `{ "refresh_token": "eyJ…" }` · **Response (204):** empty. **Errors:** global only.

#### GET `/auth/me`

- **Purpose:** Current user, roles, territories, capabilities. **Auth:** Bearer. **Permissions:** any authenticated.
- **Response (200):** `{ "id": 12, "username": "clerk.ana", "roles": ["CLERK"], "territories": ["Chacabuco"], "capabilities": ["movements:write", "clients:write"] }`
- N/A request/pagination/filter/sort. **Errors:** global.

---

### 4.2 Clients _(W1)_

#### GET `/clients`

- **Purpose:** List/search clients.
- **Authentication:** Bearer. **Permissions:** `CLERK, DRIVER, INVENTORY, BILLING, MANAGER, MEDICAL` (DRIVER/SUBDIST territory-scoped).
- **Request JSON:** N/A (query only).
- **Response JSON (200):**

```json
{
  "data": [
    {
      "id": 501,
      "name": "TORRES AMERICANAS",
      "territory_id": 2,
      "coverage": "PRIVATE",
      "status": "ACTIVE",
      "version": 3
    }
  ],
  "page": {
    "limit": 50,
    "next_cursor": null,
    "has_more": false,
    "total_estimate": 1
  }
}
```

- **Validation:** query whitelist; `limit ≤ 200`.
- **Error Codes:** global.
- **Pagination:** cursor (`limit`, `cursor`).
- **Filtering:** `q` (fuzzy name/CUIT/phone), `filter[territory_id]`, `filter[coverage]`, `filter[segment]`, `filter[status]`, `has_outstanding=true`.
- **Sorting:** `name`, `-created_at`, `territory_id` (default `name`).

#### POST `/clients`

- **Purpose:** Create a client (onboard). **Auth:** Bearer + `Idempotency-Key`. **Permissions:** `CLERK, ADMIN`.
- **Request JSON:**

```json
{
  "name": "TORRES AMERICANAS",
  "cuit": "30-64401913-2",
  "address_street": "Av. R.S. Peña 1160",
  "locality_id": 5,
  "territory_id": 2,
  "coverage": "PRIVATE",
  "segment": "METALWORKING",
  "delivery_instructions": "PASAR POR BALANZA Y PARAR",
  "daily_rate_default": 85.0,
  "contacts": [{ "name": "Juan", "phone": "2474-555446", "is_primary": true }]
}
```

- **Response JSON (201):** full `Client` + `ETag: "1"`, `Location: /clients/501`.
- **Validation:** `name` required; `cuit` matches `^\d{2}-\d{8}-\d$` **and** passes mod-11 (`cuit_valid`); `territory_id`, `locality_id`, `coverage` valid FKs/enums; at most one `is_primary` contact.
- **Error Codes:** `409 DUPLICATE_CUIT` (BR-17), `422 VALIDATION_FAILED` (bad CUIT), `409 POSSIBLE_DUPLICATE` (fuzzy-name; override with `?force=true`).
- **Pagination/Filtering/Sorting:** N/A.

#### GET `/clients/{id}`

- **Purpose:** Client master + summary. **Auth:** Bearer. **Permissions:** as list (MEDICAL only for medical clients).
- **Response (200):** `Client` incl. `contacts[]`, `outstanding_count`, `open_accessory_count`. **Errors:** `404`. N/A pag/filter/sort.

#### PATCH `/clients/{id}`

- **Purpose:** Update master data. **Auth:** Bearer + `If-Match`. **Permissions:** `CLERK, ADMIN` (rate fields: `BILLING, ADMIN`).
- **Request JSON:** partial `Client` (e.g. `{ "delivery_instructions": "…", "status": "DORMANT" }`).
- **Response (200):** updated `Client`, new `ETag`.
- **Validation:** same field rules; enum/FK checks; version match.
- **Error Codes:** `409 VERSION_CONFLICT`, `409 DUPLICATE_CUIT`, `403` if changing rate without BILLING/ADMIN.
- N/A pag/filter/sort.

#### DELETE `/clients/{id}`

- **Purpose:** Soft-delete (sets `deleted_at`). **Auth:** Bearer + `If-Match`. **Permissions:** `ADMIN`.
- **Response (204).** **Validation:** account must have **no OPEN movements** and **no ON_LOAN accessories** (BR-10).
- **Error Codes:** `409 HAS_OPEN_MOVEMENTS`, `409 HAS_OPEN_ACCESSORIES`. N/A pag/filter/sort.

#### GET `/clients/{id}/account`

- **Purpose:** Full ledger view (rental + refill) with outstanding & accrued rental days. **Auth:** Bearer. **Permissions:** as list.
- **Response (200):**

```json
{
  "client_id": 501,
  "outstanding": [
    {
      "movement_id": 88,
      "cylinder_id": 14,
      "serial": "80086",
      "gas_code": "ACET",
      "delivery_date": "2013-05-20",
      "accrued_days": 4515
    }
  ],
  "rental_summary": { "open_count": 3, "closed_days_last_period": 210 }
}
```

- **Filtering:** `filter[kind]=RENTAL|REFILL`, `filter[delivery_date][gte|lte]`, `open=true`. **Sorting:** `-delivery_date`. **Pagination:** cursor on movements. **Errors:** `404`.

---

### 4.3 Cylinders _(W2, W12, W13)_

#### GET `/cylinders`

- **Purpose:** List/search the fleet. **Auth:** Bearer. **Permissions:** `CLERK, PLANT, INVENTORY, MANAGER` (+DRIVER read).
- **Response (200):** page of `Cylinder`.
- **Validation:** whitelist. **Errors:** global.
- **Pagination:** cursor. **Filtering:** `q` (serial fuzzy), `filter[state]`, `filter[gas_code]`, `filter[owner_party_id]`, `filter[ownership_basis]`, `filter[territory_id]`, `filter[packaging]`. **Sorting:** `serial_number`, `-updated_at`, `state`.

#### POST `/cylinders`

- **Purpose:** Register a cylinder. **Auth:** Bearer + `Idempotency-Key`. **Permissions:** `PLANT, CLERK, ADMIN`.
- **Request JSON:**

```json
{
  "owner_party_id": 1,
  "serial_number": "1837",
  "gas_code": "O2",
  "capacity_m3": 6,
  "ownership_basis": "OURS",
  "home_territory_id": 3,
  "acquisition_date": "2013-05-17"
}
```

- **Response (201):** `Cylinder`.
- **Validation:** `serial_number` required; **unique per `(owner_party_id, serial_number)`** (BR-02); `gas_code` in `GasType` (aliases normalized); `capacity_m3 > 0`; `ownership_basis` consistent with owner party type (BR-07 owner⇄basis).
- **Error Codes:** `409 DUPLICATE_SERIAL_FOR_OWNER`, `422 OWNER_BASIS_MISMATCH`, `422 UNKNOWN_GAS`.
- N/A pag/filter/sort.

#### GET `/cylinders/{id}`

- **Purpose:** Cylinder detail + current holder/state. **Auth:** Bearer. **Permissions:** as list. **Response (200):** `Cylinder` + `current_movement`. **Errors:** `404`.

#### PATCH `/cylinders/{id}`

- **Purpose:** Correct attributes (gas/capacity/owner). **Auth:** Bearer + `If-Match`. **Permissions:** `CLERK, PLANT, ADMIN`.
- **Request:** partial `Cylinder`. **Response (200):** updated.
- **Validation:** cannot mutate to a terminal `state` here (use loss/sale endpoints); version match. **Errors:** `409 VERSION_CONFLICT`, `422 ILLEGAL_STATE_TRANSITION`.

#### DELETE `/cylinders/{id}`

- **Purpose:** Soft-delete an erroneously created cylinder. **Auth:** Bearer + `If-Match`. **Permissions:** `ADMIN`.
- **Validation:** no movement history and not terminal-with-sale. **Errors:** `409 HAS_HISTORY`. **Response (204).**

#### GET `/cylinders/{id}/history`

- **Purpose:** Full circulation timeline (asset view). **Auth:** Bearer. **Permissions:** `INVENTORY, CLERK, MANAGER`.
- **Response (200):** page of movement rows `{ delivery_date, return_date, holder, gas_code, rental_days, state }`.
- **Pagination:** cursor. **Filtering:** `filter[delivery_date][gte|lte]`, `filter[holder_party_id]`. **Sorting:** `-delivery_date` (default). **Errors:** `404`.

#### POST `/cylinders/{id}/loss`

- **Purpose:** Flag lost/broken (W12). **Auth:** Bearer + `If-Match`. **Permissions:** `INVENTORY, CLERK, ADMIN`.
- **Request JSON:** `{ "outcome": "LOST", "client_party_id": 88, "occurred_on": "2024-03-15", "note": "PERDIDO IG" }`
- **Response (200):** `Cylinder` (state `LOST`/`BROKEN`) + generated `alert` for supplier-liability if supplier-owned (BR-12).
- **Validation:** `outcome ∈ {LOST,BROKEN}`; if cylinder is at a client, its OPEN movement is closed as `LOST`.
- **Error Codes:** `409 ALREADY_TERMINAL`. N/A pag/filter/sort.

#### POST `/cylinders/{id}/replace`

- **Purpose:** Issue a replacement serial (W13). **Auth:** Bearer + `If-Match`. **Permissions:** `CLERK, PLANT, ADMIN`.
- **Request JSON:** `{ "replacement_cylinder_id": 999, "client_party_id": 501, "occurred_on": "2024-04-01", "note": "en reemplazo" }`
- **Response (201):** new `MovementEvent` for the replacement + link back to original.
- **Validation:** original flagged terminal or being replaced; replacement is `IN_STOCK`. **Errors:** `409 REPLACEMENT_NOT_AVAILABLE`.

---

### 4.4 Batteries _(W2)_

#### GET `/batteries` · POST `/batteries` · GET `/batteries/{id}` · PATCH `/batteries/{id}`

- **Purpose:** Manage manifold packs and members. **Auth:** Bearer. **Permissions:** `PLANT, CLERK, ADMIN` (GET also `INVENTORY, MANAGER`).
- **POST Request JSON:**

```json
{
  "battery_code": "11002",
  "owner_party_id": 1,
  "gas_code": "O2",
  "member_cylinder_ids": [169454, 169455, 169456, 169457]
}
```

- **Response (201):** battery + members.
- **Validation:** ≥2 members; **no member already in an active battery** (BR-13); members share owner. **Errors:** `409 MEMBER_ALREADY_PACKED`, `422 TOO_FEW_MEMBERS`.
- **Pagination/Filtering/Sorting (GET list):** cursor; `filter[state]`, `filter[gas_code]`, `q` (code); sort `battery_code`.

#### POST `/batteries/{id}/members` · DELETE `/batteries/{id}/members/{cylinderId}`

- **Purpose:** Add/remove a member. **Permissions:** `PLANT, ADMIN`. **Validation:** BR-13. **Errors:** `409 MEMBER_ALREADY_PACKED`, `404`.

---

### 4.5 Movements — core _(W4, W5, W6, W7, W9)_

#### POST `/movements`

- **Purpose:** Record a **delivery** (rental, _Nuestra Propiedad_) or a **refill-in** (_Su Propiedad_, empty received). Opens a movement. (W4/W7)
- **Authentication:** Bearer + `Idempotency-Key`. **Permissions:** `DRIVER, CLERK` (territory-scoped for DRIVER).
- **Request JSON:**

```json
{
  "cylinder_id": 14,
  "holder_party_id": 501,
  "movement_kind": "RENTAL",
  "gas_code": "ATAL",
  "delivery_date": "2016-08-08",
  "origin_party_id": null,
  "remito_number": "1475",
  "note": "por cambio"
}
```

- **Response JSON (201):** `MovementEvent` (state `OPEN`, `return_date=null`, `rental_days=null`) + `ETag`.
- **Validation:**
  - `cylinder_id`, `holder_party_id`, `movement_kind`, `delivery_date` required.
  - **Single custody (BR-01):** cylinder must have no OPEN movement → else `409`.
  - `movement_kind='REFILL'` ⇔ cylinder `ownership_basis='CUSTOMER'` (BR-08); `RENTAL` ⇔ OURS/SUPPLIER.
  - `delivery_date` within `[2000-01-01, today+30d]` (BR-05).
  - cylinder not in a terminal state (BR-06).
  - `gas_code` valid (aliases normalized); `origin_party_id` must be a party (never free text — BR-14).
- **Error Codes:** `409 CYLINDER_ALREADY_OUT`, `409 CYLINDER_TERMINAL`, `422 KIND_BASIS_MISMATCH`, `422 DATE_OUT_OF_RANGE`, `422 UNKNOWN_GAS`.
- **Pagination/Filtering/Sorting:** N/A.

#### GET `/movements`

- **Purpose:** Query movements across the system. **Auth:** Bearer. **Permissions:** `CLERK, INVENTORY, BILLING, MANAGER`.
- **Response (200):** page of `MovementEvent`.
- **Pagination:** cursor. **Filtering:** `filter[cylinder_id]`, `filter[holder_party_id]`, `filter[state]` (repeatable), `filter[movement_kind]`, `filter[gas_code]`, `filter[delivery_date][gte|lte]`, `open=true`, `filter[remito_id]`. **Sorting:** `-delivery_date` (default), `delivery_date`, `rental_days`.

#### GET `/movements/{id}`

- **Purpose:** Single movement. **Auth:** Bearer. **Permissions:** as list. **Response (200):** `MovementEvent`. **Errors:** `404`.

#### PATCH `/movements/{id}/return`

- **Purpose:** Close a rental/refill; **auto-compute `rental_days`** (W5). **Auth:** Bearer + `If-Match`. **Permissions:** `DRIVER, CLERK`.
- **Request JSON:** `{ "return_date": "2016-09-08" }`
- **Response (200):**

```json
{
  "id": 88,
  "state": "CLOSED",
  "delivery_date": "2016-08-08",
  "return_date": "2016-09-08",
  "rental_days": 31,
  "version": 2
}
```

- **Validation:** movement is `OPEN`; `return_date ≥ delivery_date` (BR-04); date plausible (BR-05); `rental_days` computed by DB (never errors — replaces the legacy ERROR cells `» observed`).
- **Error Codes:** `409 NOT_OPEN`, `422 RETURN_BEFORE_DELIVERY`, `422 DATE_OUT_OF_RANGE`, `409 VERSION_CONFLICT`.
- **Pagination/Filtering/Sorting:** N/A.

#### PATCH `/movements/{id}/swap`

- **Purpose:** Return a **different** serial than delivered (W9). **Auth:** Bearer + `If-Match`. **Permissions:** `CLERK, DRIVER`.
- **Request JSON:** `{ "returned_cylinder_id": 5567, "return_date": "2016-09-08" }`
- **Response (200):** original movement `state=SWAPPED` (`swap_with_cyl_id` set) + updated custody for `returned_cylinder_id`.
- **Validation:** both cylinders exist; original `OPEN`; returned cylinder not already OPEN elsewhere. **Errors:** `409 RETURNED_CYLINDER_BUSY`, `404`.

#### POST `/movements/{id}/void`

- **Purpose:** Reverse a mistaken movement (append-only correction). **Auth:** Bearer + `If-Match`. **Permissions:** `CLERK, ADMIN`.
- **Request JSON:** `{ "reason": "duplicate entry" }`
- **Response (200):** movement `state=VOID` (retained for audit; never deleted).
- **Validation:** `reason` required; downstream billing not yet exported. **Errors:** `409 ALREADY_BILLED`.

---

### 4.6 Sales _(W10)_

#### POST `/sales`

- **Purpose:** Sell a cylinder outright. **Auth:** Bearer + `Idempotency-Key`. **Permissions:** `CLERK, MANAGER, ADMIN`.
- **Request JSON:**

```json
{
  "cylinder_id": 469,
  "client_party_id": 77,
  "sale_date": "2013-10-01",
  "gas_code": "O2",
  "capacity_m3": 6,
  "price": 3025.0
}
```

- **Response (201):** sale record; cylinder → `SOLD` (terminal).
- **Validation:** cylinder has **no OPEN movement** (BR-09); not already sold (`uq_sale_cylinder`, BR-06); `price ≥ 0`.
- **Error Codes:** `409 CYLINDER_OUT_ON_RENTAL`, `409 ALREADY_SOLD`.

#### GET `/sales` · GET `/sales/{id}`

- **Purpose:** List/detail sales. **Auth:** Bearer. **Permissions:** `CLERK, BILLING, MANAGER`.
- **Pagination:** cursor. **Filtering:** `filter[sale_date][gte|lte]`, `filter[client_party_id]`, `filter[gas_code]`. **Sorting:** `-sale_date`.

---

### 4.7 Accessories & Rentals _(W11)_

#### GET `/accessories` · POST `/accessories` · GET `/accessories/{id}` · PATCH `/accessories/{id}`

- **Purpose:** Manage regulators/adapters/mochilas. **Auth:** Bearer. **Permissions:** `CLERK, PLANT, ADMIN` (GET +`INVENTORY, MANAGER`).
- **POST Request JSON:** `{ "accessory_type": "REGULATOR", "identifier": null, "owner_party_id": 1 }`
- **Validation:** `accessory_type` enum; unique `(type, identifier)` if identifier present. **Errors:** `409 DUPLICATE_ACCESSORY`.
- **Pagination/Filtering/Sorting:** cursor; `filter[accessory_type]`, `filter[state]`; sort `-updated_at`.

#### POST `/accessory-rentals`

- **Purpose:** Rent/loan an accessory to a client (W11). **Auth:** Bearer + `Idempotency-Key`. **Permissions:** `DRIVER, CLERK`.
- **Request JSON:**

```json
{
  "accessory_id": 12,
  "client_party_id": 501,
  "quantity": 1,
  "start_date": "2018-05-04",
  "charge_basis": "RENTAL",
  "remito_number": "1475",
  "note": "1 regulador en alquiler"
}
```

- **Response (201):** rental (state `ON_LOAN`).
- **Validation:** accessory not already `ON_LOAN` (`uq_acc_one_open`); `quantity ≥ 1`; `charge_basis ∈ {RENTAL, FREE_LOAN}`.
- **Error Codes:** `409 ACCESSORY_ALREADY_ON_LOAN`.

#### PATCH `/accessory-rentals/{id}/return`

- **Purpose:** Return the accessory. **Auth:** Bearer + `If-Match`. **Permissions:** `DRIVER, CLERK`.
- **Request:** `{ "end_date": "2018-06-30" }` · **Response (200):** state `RETURNED`.
- **Validation:** `end_date ≥ start_date`; must be `ON_LOAN`. **Errors:** `409 NOT_ON_LOAN`, `422 BAD_DATE`.

#### GET `/accessory-rentals`

- **Purpose:** List rentals. **Permissions:** `CLERK, BILLING, INVENTORY, MANAGER`.
- **Pagination:** cursor. **Filtering:** `filter[client_party_id]`, `filter[state]`, `filter[accessory_type]`, `open=true`. **Sorting:** `-start_date`.

---

### 4.8 Supplier Loans _(W14, W15)_

#### POST `/supplier-loans`

- **Purpose:** Start tracking a supplier cylinder loop (Nordelta/Intergas). **Auth:** Bearer + `Idempotency-Key`. **Permissions:** `CLERK, INVENTORY, ADMIN`.
- **Request JSON:** `{ "cylinder_id": 3011, "supplier_party_id": 4, "gas_code": "ARGON", "received_from_supplier": "2022-07-13" }`
- **Response (201):** loan cycle (stage `RECEIVED`). **Validation:** supplier party is `SUPPLIER`; date valid.

#### PATCH `/supplier-loans/{id}/advance`

- **Purpose:** Advance a stage (delivered→returned→to-supplier). **Auth:** Bearer + `If-Match`. **Permissions:** `CLERK, INVENTORY`.
- **Request JSON:** `{ "stage": "OUT_TO_CLIENT", "date": "2022-06-22", "client_party_id": 501 }`
- **Response (200):** updated cycle.
- **Validation:** stage order forward-only; dates non-decreasing (BR-11). **Errors:** `422 STAGE_OUT_OF_ORDER`, `422 DATE_ORDER`.

#### GET `/supplier-loans`

- **Purpose:** List loops; overdue report driver. **Permissions:** `CLERK, INVENTORY, MANAGER`.
- **Pagination:** cursor. **Filtering:** `filter[supplier_party_id]`, `filter[stage]`, `open=true` (no return-to-supplier). **Sorting:** `received_from_supplier`.

---

### 4.9 Transfers _(W16)_

#### POST `/transfers`

- **Purpose:** Move a cylinder between nodes/hubs (Ceres/Buroni/…). **Auth:** Bearer + `Idempotency-Key`. **Permissions:** `SUBDIST, CLERK, INVENTORY`.
- **Request JSON:** `{ "cylinder_id": 14, "from_party_id": 7, "to_party_id": 1, "transfer_date": "2023-01-05", "note": "HAY QUE DEVOLVER A BURONI" }`
- **Response (201):** transfer record; cylinder location updated.
- **Validation:** `from_party_id ≠ to_party_id`; SUBDIST limited to own node.
- **Error Codes:** `422 SAME_PARTY`, `403 NODE_SCOPE`.
- **GET `/transfers`:** cursor; `filter[cylinder_id]`, `filter[to_party_id]`, `filter[transfer_date][gte|lte]`; sort `-transfer_date`.

---

### 4.10 Delivery Notes (Remitos) & Rates

#### GET `/delivery-notes` · POST `/delivery-notes`

- **Purpose:** Register/lookup remito references. **Permissions:** `CLERK, BILLING`. **POST:** `{ "remito_number": "1475", "issued_date": "2018-05-04", "client_party_id": 501 }`. **Validation:** unique `remito_number`. **Errors:** `409 DUPLICATE_REMITO`. **Filtering:** `filter[client_party_id]`, `q`. **Sorting:** `-issued_date`.

#### GET `/rental-rates` · POST `/rental-rates`

- **Purpose:** Manage effective-dated rental rates. **Permissions:** `BILLING, ADMIN`.
- **POST:** `{ "client_party_id": 501, "gas_code": null, "period": "DAILY", "amount": 85.00, "effective_from": "2025-01-01" }`
- **Validation:** `amount ≥ 0`; `effective_to ≥ effective_from`; no overlapping active rate for same `(client, gas)`. **Errors:** `409 RATE_OVERLAP`.
- **Filtering:** `filter[client_party_id]`, `filter[gas_code]`. **Sorting:** `-effective_from`.

---

### 4.11 Billing _(W20)_

#### POST `/billing/runs`

- **Purpose:** Compute charges for a period (rental days × rate + gas + accessories). **Auth:** Bearer. **Permissions:** `BILLING`.
- **Request JSON:** `{ "period_start": "2025-04-01", "period_end": "2025-04-30", "client_party_id": null }`
- **Response (202):** `{ "run_id": 55, "status": "DRAFT" }` (async job).
- **Validation:** `period_end ≥ period_start`; period not already finalized. **Errors:** `409 PERIOD_LOCKED`.

#### GET `/billing/runs/{id}`

- **Purpose:** Draft charge lines per client. **Permissions:** `BILLING, MANAGER`.
- **Response (200):** invoices + `charge_line[]` with `source_table/source_id` traceability.
- **Pagination:** cursor over invoices. **Filtering:** `filter[client_party_id]`. **Sorting:** `client_party_id`.

#### POST `/billing/runs/{id}/approve`

- **Purpose:** Approve draft → `APPROVED`. **Permissions:** `BILLING, MANAGER` (MFA). **Response (200).** **Validation:** all lines resolved; no `VOID`-pending movements. **Errors:** `409 UNRESOLVED_LINES`.

#### GET `/billing/runs/{id}/export`

- **Purpose:** Export approved charges to accounting/e-invoicing. **Permissions:** `BILLING`. **Response (200):** export payload / job handle. **Errors:** `409 NOT_APPROVED`, `503 EXPORT_UNAVAILABLE`.

#### GET `/invoices` · GET `/invoices/{id}`

- **Permissions:** `BILLING, MANAGER, MEDICAL` (medical clients only for MEDICAL).
- **Pagination:** cursor. **Filtering:** `filter[client_party_id]`, `filter[status]`, `filter[period_start][gte]`. **Sorting:** `-period_start`.

---

### 4.12 Reports _(closes the legacy no-reports gap)_

All report endpoints: **Auth** Bearer; **Response** tabular JSON `{ "data": [...], "generated_at": "…", "page": {…} }`; support **offset or cursor** pagination, documented **filtering** and **sorting**; **Validation** = param whitelist; **Errors** = global + `422` bad params.

| Endpoint                          | Purpose                                         | Permissions                 | Key Filters                                                  | Sort             |
| --------------------------------- | ----------------------------------------------- | --------------------------- | ------------------------------------------------------------ | ---------------- |
| GET `/reports/fleet`              | Cylinders by state/gas/owner/territory          | `MANAGER, INVENTORY`        | `group_by`, `filter[owner_party_id]`, `filter[gas_code]`     | `count`          |
| GET `/reports/float-aging`        | Cylinders out, aging buckets (>30/90/180/365)   | `MANAGER, INVENTORY, CLERK` | `filter[territory_id]`, `bucket`                             | `-days_out`      |
| GET `/reports/outstanding`        | Open movements per client                       | `CLERK, INVENTORY, BILLING` | `filter[client_party_id]`, `min_days`                        | `-accrued_days`  |
| GET `/reports/rental`             | Rental days & revenue                           | `BILLING, MANAGER`          | `filter[period]`, `filter[territory_id]`, `filter[gas_code]` | `-revenue`       |
| GET `/reports/loss`               | Lost/broken by owner (liability vs charge-back) | `MANAGER, INVENTORY`        | `filter[period]`, `filter[owner_party_id]`                   | `-count`         |
| GET `/reports/supplier-returns`   | Open supplier loops aging                       | `CLERK, INVENTORY`          | `filter[supplier_party_id]`, `min_days`                      | `-days_open`     |
| GET `/reports/cylinder-life/{id}` | Full life history of a serial                   | `INVENTORY, MANAGER`        | `filter[date][gte\|lte]`                                     | `-delivery_date` |
| GET `/reports/medical-statement`  | Per-patient O2 + accessories (municipal)        | `MEDICAL, BILLING`          | `filter[period]`, `filter[client_party_id]`                  | `client`         |
| GET `/reports/data-quality`       | To-verify serials, mismatches, bad dates        | `INVENTORY, ADMIN`          | `filter[type]`                                               | `-created_at`    |

---

### 4.13 Search

#### GET `/search`

- **Purpose:** Federated search across clients, cylinders, movements, accessories.
- **Authentication:** Bearer. **Permissions:** any authenticated (results filtered by role/territory scope; medical hidden from non-MEDICAL).
- **Request JSON:** N/A. **Query:** `q` (required, ≥2 chars), `types` (e.g. `clients,cylinders`), `limit`.
- **Response JSON (200):**

```json
{
  "results": [
    {
      "type": "cylinder",
      "id": 14,
      "label": "Serial 80086 · O2 · owner US",
      "score": 0.98
    },
    {
      "type": "client",
      "id": 501,
      "label": "TORRES AMERICANAS · Chacabuco",
      "score": 0.91
    }
  ]
}
```

- **Validation:** `q` length ≥ 2; `types` whitelist. **Errors:** `422 QUERY_TOO_SHORT`.
- **Pagination:** cursor (per-type capped). **Filtering:** `types`, `filter[territory_id]`. **Sorting:** by `score` (fixed); typo-tolerant (`pg_trgm`) to surface near-duplicate names (`MASTANTUONO`/`MANSTANTUONO` `» observed`).

---

### 4.14 Master Data

#### GET/POST `/gas-types` · GET/POST `/localities` · GET/POST `/territories`

- **Purpose:** Manage controlled vocabularies. **Auth:** Bearer. **Permissions:** GET any authenticated; POST/PATCH `ADMIN`.
- **`/gas-types` POST:** `{ "code": "MAPAX30", "name": "MAPAX 30", "family": "mix", "is_medical": false, "aliases": ["mapax 30","mapax30"] }`
- **Validation:** `code` unique; aliases unique across map. **Errors:** `409 DUPLICATE_CODE`, `409 ALIAS_IN_USE`.
- **Pagination:** cursor. **Filtering:** `filter[is_active]`, `filter[is_medical]`, `q`. **Sorting:** `code`.

---

### 4.14b Settings

#### GET `/settings` · PATCH `/settings`

- **Purpose:** Read/update org operational settings stored in `system_setting` (D-13 / D-14 / D-17 / US-21). **Auth:** Bearer.
- **Permissions:** GET `supplier_loans:read`; PATCH `supplier_loans:write`. Web Configuración form gated to `admin:write`.
- **Response / body fields** (`@weld/schemas` `SystemSettings`):
  - `supplier_loan_overdue_days` — int 1–3650 (default 120)
  - `business_timezone` — IANA timezone string (default `America/Argentina/Buenos_Aires`)
  - `rental_min_days` — int 0–365 (default 0 = exact calendar days)
  - `primary_language` — `es` | `en` (default `es`)
  - `version` — aggregate optimistic-concurrency token (`max` of row versions)
- **PATCH:** partial body allowed (at least one field). Send `If-Match: {version}` → `409 VERSION_CONFLICT` on stale write.
- **Validation:** Zod (`BusinessTimezone`, `RentalMinDays`, `PrimaryLanguage`, `SupplierLoanOverdueDays`). **Errors:** `409 VERSION_CONFLICT`, `422 VALIDATION_FAILED`.

---

### 4.15 Admin

#### GET/POST `/admin/users` · PATCH `/admin/users/{id}` · POST `/admin/users/{id}/roles`

- **Purpose:** Manage users/roles/scopes. **Permissions:** `ADMIN` (MFA).
- **POST user:** `{ "username": "driver.leo", "email": "leo@…", "roles": ["DRIVER"], "territories": ["Junín"] }`
- **Validation:** `username` unique; ≥1 role. **Errors:** `409 DUPLICATE_USERNAME`. **Filtering:** `filter[role]`, `filter[is_active]`. **Sorting:** `username`.

#### GET `/migration/exceptions` · PATCH `/migration/exceptions/{id}`

- **Purpose:** Work the migration-cleanup queue (bad dates, ERROR cells, orphan serials). **Permissions:** `ADMIN, INVENTORY`.
- **PATCH:** `{ "status": "RESOLVED", "resolution_note": "fixed year 2047→2017" }`
- **Pagination:** cursor. **Filtering:** `filter[status]`, `filter[reason]`, `filter[workbook]`. **Sorting:** `-created_at`.

#### GET `/alerts` · PATCH `/alerts/{id}/resolve`

- **Purpose:** Operational worklists (long-outstanding, supplier-overdue, supply-gap). **Permissions:** role-targeted (`assigned_role`).
- **Pagination:** cursor. **Filtering:** `filter[alert_type]`, `open=true`, `filter[severity]`. **Sorting:** `-created_at`, `-severity`.

#### GET `/audit-logs`

- **Purpose:** Read the immutable audit trail. **Permissions:** `ADMIN, MANAGER` (read-only; never writable via API).
- **Pagination:** cursor. **Filtering:** `filter[entity_table]`, `filter[entity_id]`, `filter[actor_user_id]`, `filter[occurred_at][gte|lte]`, `filter[action]`. **Sorting:** `-occurred_at`.

---

## 5. Endpoint → Workflow Coverage

| Tag / Endpoints                                            | Workflow(s)              |
| ---------------------------------------------------------- | ------------------------ |
| Clients                                                    | W1                       |
| Cylinders, Batteries                                       | W2, W12, W13             |
| Movements (POST/return/swap/void)                          | W4, W5, W6, W7, W9, W17  |
| Sales                                                      | W10                      |
| Accessories & rentals                                      | W11                      |
| Movements (medical filters) + Reports/medical-statement    | W8                       |
| Supplier loans                                             | W14, W15                 |
| Transfers                                                  | W16                      |
| Reports/outstanding, float-aging, data-quality; audit-logs | W18, W17                 |
| Alerts, sub-distributor transfers/dispositions             | W19                      |
| Billing, Rates, Invoices                                   | W20                      |
| Search, Master data, Settings, Admin, Migration            | (platform / gaps closed) |

---

## 6. Appendix — Consolidated Error Catalog

| `code`                                       | HTTP | Meaning                      |
| -------------------------------------------- | ---- | ---------------------------- |
| `UNAUTHENTICATED`                            | 401  | No/invalid token             |
| `INVALID_CREDENTIALS`                        | 401  | Bad login                    |
| `MFA_REQUIRED`                               | 403  | OTP needed                   |
| `FORBIDDEN` / `NODE_SCOPE`                   | 403  | Role/territory not allowed   |
| `NOT_FOUND`                                  | 404  | Unknown id                   |
| `VERSION_CONFLICT`                           | 409  | Stale `If-Match`             |
| `INVARIANT_CONFLICT`                         | 409  | Generic business-rule breach |
| `CYLINDER_ALREADY_OUT`                       | 409  | Single-custody (BR-01)       |
| `CYLINDER_TERMINAL`                          | 409  | Terminal state (BR-06)       |
| `CYLINDER_OUT_ON_RENTAL`                     | 409  | Sale blocked (BR-09)         |
| `ALREADY_SOLD`                               | 409  | Sold once (BR-06)            |
| `DUPLICATE_SERIAL_FOR_OWNER`                 | 409  | Identity (BR-02)             |
| `DUPLICATE_CUIT`                             | 409  | Client uniqueness (BR-17)    |
| `MEMBER_ALREADY_PACKED`                      | 409  | Battery integrity (BR-13)    |
| `ACCESSORY_ALREADY_ON_LOAN`                  | 409  | One open loan                |
| `STAGE_OUT_OF_ORDER` / `DATE_ORDER`          | 422  | Supplier loop (BR-11)        |
| `KIND_BASIS_MISMATCH`                        | 422  | REFILL⇔CUSTOMER (BR-08)      |
| `RETURN_BEFORE_DELIVERY`                     | 422  | Date monotonic (BR-04)       |
| `DATE_OUT_OF_RANGE`                          | 422  | Plausibility (BR-05)         |
| `UNKNOWN_GAS`                                | 422  | Not in gas catalogue (BR-15) |
| `VALIDATION_FAILED`                          | 422  | Field/whitelist error        |
| `IDEMPOTENCY_MISMATCH`                       | 409  | Reused key, new payload      |
| `RATE_LIMITED`                               | 429  | Throttled                    |
| `INTERNAL_ERROR`                             | 500  | Server fault                 |
| `SERVICE_UNAVAILABLE` / `EXPORT_UNAVAILABLE` | 503  | Dependency down              |
