# 005 — Authentication & Authorization

> Source: `sdd.md` (Authentication/Authorization/Audit) and `openapi_specification.md` §2.1–2.4.

## Purpose

Authenticate users, authorize actions via role-based access control with territory scoping, support the offline field app, and ensure every mutation is attributable in the audit trail.

## Mandated stack

- **Passport** is the authentication framework, integrated via **`@nestjs/passport`** (with `@nestjs/jwt` for signing/verifying). All auth flows go through Passport **strategies** — no hand-rolled auth.
- **Strategies (Passport):**
  - `LocalStrategy` (`passport-local`) — validates username/password (+ MFA step) for `POST /auth/login`.
  - `JwtStrategy` (`passport-jwt`) — validates the Bearer access token from `Authorization: Bearer` and builds the request principal (`sub`, roles, capabilities, territories, mfa).
  - `JwtRefreshStrategy` (`passport-jwt`, separate secret + refresh-token extractor) — validates refresh tokens for `POST /auth/refresh`.
- **Guards:** `PassportAuthGuard('local')` on login, a **global** `PassportAuthGuard('jwt')` (with `@Public()` to opt out login/refresh), `PassportAuthGuard('jwt-refresh')` on refresh; plus authorization guards `CapabilitiesGuard` (`@RequireCapabilities()`), `TerritoryScopeGuard`, and `MfaGuard`.
- `PassportModule` + `JwtModule` are registered in the `AuthModule`. Token/credential schemas validated with **Zod** (per `004`); auth endpoints documented in **Swagger**.

## Requirements

- R1. Implement **Bearer JWT** auth **through Passport strategies**: short-lived access tokens (~15 min) + longer refresh tokens; endpoints `POST /auth/login` (`LocalStrategy`), `/auth/refresh` (`JwtRefreshStrategy`), `/auth/logout`, `GET /auth/me` (`JwtStrategy`). Access-token claims carry `sub` (user id), `roles`, `capabilities`, `territories`, and `mfa` status; the `JwtStrategy.validate()` verifies signature/expiry and returns the request principal that Nest attaches to `request.user`.
- R2. Implement **RBAC** for the 10 roles (`CLERK, DRIVER, PLANT, INVENTORY, BILLING, MANAGER, SUBDIST, ADMIN, MEDICAL, CLIENT`) with a capability matrix; deny-by-default.
- R3. Implement **territory scoping**: `DRIVER`/`SUBDIST` see and act only within their assigned `dispatch_territory`(ies); the server enforces scope on every read and write.
- R4. Require **MFA** for privileged roles (`BILLING`, `MANAGER`, `ADMIN`) and privileged operations (billing approve/export, user/rate/master-data admin, void, loss write-off).
- R5. On each authenticated request, set the DB session GUCs (`app.current_user_id`, `app.current_role_code`, `app.source`) so `003` audit captures the actor.
- R6. Support the **offline field app**: authenticate once, cache a signed session for offline capture; re-validate queued writes at sync; reject stale/expired queues.
- R7. Restrict **medical/patient data** to `MEDICAL` (and explicitly authorized roles); hide it from search/reports for others.

## Constraints

- C1. Passwords stored only as strong hashes (e.g. argon2/bcrypt); JWTs signed with a rotated secret/keypair; tokens over TLS; refresh tokens revocable (lost-device / revocation list).
- C2. Authorization is centralized in **NestJS guards** + a policy/capability service; controllers never hand-roll checks (they only declare `@RequireCapabilities(...)`).
- C3. The UI hides forbidden actions, but the server is authoritative (`403 FORBIDDEN`).
- C4. Segregation of duties: movement posting (`CLERK`/`DRIVER`) is separate from rate/billing approval (`BILLING`) and user/config admin (`ADMIN`).
- C5. JWTs are stateless for access; refresh tokens are tracked server-side for revocation. Never put secrets/PII beyond ids/roles/scopes in the token.

## Acceptance Criteria

- AC1. A user without a required capability receives `403 FORBIDDEN`; the action is not performed and is not audited as success.
- AC2. A `DRIVER` scoped to "Junín" cannot read or write "Chacabuco" clients/movements.
- AC3. Privileged operations without a valid MFA session are rejected.
- AC4. Every successful mutation has an `audit_log` row whose `actor_user_id`/`actor_role` match the caller.
- AC5. An expired access token → `401 UNAUTHENTICATED`; refresh issues a new token; revoked refresh → `401 INVALID_REFRESH`.
- AC6. Medical patient data does not appear in a non-`MEDICAL` user's search or reports.
- AC7. Authentication is performed exclusively by **Passport strategies**: `POST /auth/login` runs `LocalStrategy`, protected routes run the global `JwtStrategy` guard, and `POST /auth/refresh` runs `JwtRefreshStrategy`; a request with no/invalid Bearer token is rejected by the `jwt` `AuthGuard` with `401` before reaching the controller.

## Edge Cases

- Offline capture then role/territory change before sync → server re-authorizes at sync; unauthorized queued writes are rejected to the conflict queue, not silently applied.
- Concurrent sessions/devices for one user → independent tokens; logout revokes the presented refresh token.
- Service-to-service (Billing→Accounting export, Scheduler) uses signed service credentials, not user tokens.
- A CLIENT self-service user (Phase 2) may only see their own held cylinders.

## Dependencies

- `003` (session GUC for audit), `004` (endpoint enforcement), `006` (UI gating), `012` (identity provider / secrets).

## Implementation Notes

- **NestJS + Passport structure:** an `AuthModule` wiring `PassportModule`, `JwtModule`, the three **Passport strategies** (`LocalStrategy`, `JwtStrategy`, `JwtRefreshStrategy`), and `AuthService` (credential check, token issue/rotate/revoke). Each strategy's `validate()` returns the principal; `@nestjs/passport` `AuthGuard('<name>')` wraps them. The `jwt` guard is registered **globally** with a `@Public()` decorator to exempt `login`/`refresh`. Authorization guards (`CapabilitiesGuard` reading `@RequireCapabilities('movements:write')`, `TerritoryScopeGuard`) run after authentication.
- Represent capabilities as `resource:action` strings (e.g., `movements:write`, `billing:approve`); map roles→capabilities in one shared module consumed by the guards and returned to the UI.
- Put territory scope in the JWT claims and enforce it in the repository/query layer (append a territory predicate) to avoid leaks — the guard checks route access, the repository enforces row scope.
- **Audit actor:** a `TransactionInterceptor` (from `004`) sets `SET LOCAL app.current_user_id`, `app.current_role_code`, `app.source` from the authenticated principal inside each write transaction, so `003` audit rows are attributable and GUCs never leak across pooled connections.
- **MFA:** enforce via a `MfaGuard` (or an `mfa` claim + capability check) on privileged routes; login returns an MFA-required step when needed.
- Validate all auth request/response bodies with **Zod** DTOs; document them in **Swagger**.
- Return `capabilities` and `territories` from `/auth/me` so the UI (`006`) gates without guessing.
