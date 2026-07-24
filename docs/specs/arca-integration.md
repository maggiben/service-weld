# ARCA Integration Wizard — Architecture Specification

> Status: **IMPLEMENTED (v1 wizard)** — foundations through UI landed. Spec remains the authority for behavior; follow-ups in §21 still open (multi-company, expiry alerts, SUPER_ADMIN).
>
> Scope: a guided, admin-only onboarding wizard that configures ARCA (ex-AFIP) X.509 credentials for electronic invoicing, for **Homologation** and **Production** environments, without exposing cryptography terminology to the operator. Built on `@arcasdk/core` for WSAA authentication and WSFE connectivity — **no third-party SaaS**.
>
> Conventions: `MUST` / `SHOULD` / `MAY` per RFC 2119. Requirements are numbered `R-nn`, constraints `C-nn`, non-functional `NFR-nn`, invariants `I-nn`. Cross-references: `BR-nn` (business rules, `specs/001`), `D-nn` (ADRs, `specs/DECISIONS.md`). This spec must stay consistent with `specs/001`–`014` and `docs/specs/remitos.md`; on conflict, the numbered `specs/` and `DECISIONS.md` win until updated.

---

## Table of contents

1. [Business goals & context](#1-business-goals--context)
2. [Glossary & terminology](#2-glossary--terminology)
3. [Current state & gap analysis](#3-current-state--gap-analysis)
4. [Target architecture overview](#4-target-architecture-overview)
5. [Onboarding lifecycle (state machine)](#5-onboarding-lifecycle-state-machine)
6. [Wizard flow (UI)](#6-wizard-flow-ui)
7. [Key & CSR generation](#7-key--csr-generation)
8. [Certificate upload & validation](#8-certificate-upload--validation)
9. [Environment & testing mode](#9-environment--testing-mode)
10. [Connection test (WSAA + WSFE)](#10-connection-test-wsaa--wsfe)
11. [Dashboard](#11-dashboard)
12. [Domain model & storage](#12-domain-model--storage)
13. [Security & secret handling](#13-security--secret-handling)
14. [Backend structure](#14-backend-structure)
15. [REST API](#15-rest-api)
16. [Permissions (RBAC)](#16-permissions-rbac)
17. [Non-functional requirements](#17-non-functional-requirements)
18. [Implementation phases (milestones)](#18-implementation-phases-milestones)
19. [Future extensions](#19-future-extensions)
20. [Acceptance criteria](#20-acceptance-criteria)
21. [Open questions & decisions to ratify](#21-open-questions--decisions-to-ratify)

---

## 1. Business goals & context

### 1.1 Purpose

ARCA (Agencia de Recaudación y Control Aduanero, ex-AFIP) requires **X.509 certificates** for authentication through **WSAA** before any business web service (e.g. **WSFE** — factura electrónica) can be consumed. Obtaining those certificates is a multi-step, jargon-heavy process (key pair, CSR / PKCS#10, WSASS for homologation, "Administrador de Certificados Digitales" + "Administrador de Relaciones de Clave Fiscal" for production).

This module gives an administrator a **single guided wizard** that automates every step the ERP can automate, so the only manual actions left are:

1. Generate keys (one click in the ERP).
2. Download the CSR.
3. Log in to ARCA.
4. Paste the CSR.
5. Download the issued certificate.
6. Upload the certificate back into the ERP.

Everything else — key generation, CSR construction with the correct Distinguished Name, validation, encrypted storage, WSAA login, WSFE connectivity check — is handled by the backend.

### 1.2 Business goals

- **G-1** An admin can configure a working ARCA connection (Homologation or Production) in **under 10 minutes** without technical knowledge.
- **G-2** The private key **never** leaves the backend and is **never** returned to the frontend.
- **G-3** Certificates and private keys are stored **encrypted at rest** (AES-256-GCM); encryption keys come from ENV / KMS / Vault, never hardcoded.
- **G-4** Homologation and Production credentials are strictly isolated; a Production certificate can never be used in Homologation mode and vice-versa.
- **G-5** A **Testing Mode** switch guarantees that no accidental real fiscal invoices are generated, even when Production credentials exist.
- **G-6** The wizard uses **plain language** — no `PKCS#10`, `OpenSSL`, `PEM`, `Distinguished Name`, `SOAP`, or `WSAA` exposed to the user.
- **G-7** The architecture is ready to extend to multiple companies / CUITs / certificates / points of sale / web services without destructive migrations.
- **G-8** Reuses existing platform invariants: capability-based RBAC (`specs/005`), audit trigger (`fn_audit`), additive migrations (D-4), Kysely data access, Zod single-source schemas, `@weld/domain` for business rules (DRY / SOLID per `engineering-principles`).

### 1.3 Actors

| Actor               | Role code(s)                                | Uses ARCA wizard to…                                                                                                     |
| ------------------- | ------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------ |
| Administrator       | `ADMIN` (and future `SUPER_ADMIN`, §21 Q-1) | Generate keys, download CSR, upload & validate certificate, switch environment, toggle testing mode, run connection test |
| Manager / read-only | `MANAGER`                                   | View dashboard / status only (no mutations) — optional, §16                                                              |
| Operator            | any operational role                        | **No access** — module is never visible                                                                                  |

---

## 2. Glossary & terminology

Internal / spec vocabulary (left) vs. what the **UI shows the operator** (right). The UI column is authoritative for user-facing copy (G-6).

| Internal term                              | UI wording                                |
| ------------------------------------------ | ----------------------------------------- |
| RSA private key                            | Secret access key (managed automatically) |
| CSR / PKCS#10 request                      | **Access Request**                        |
| X.509 certificate (PEM/CRT)                | **Access Certificate**                    |
| Distinguished Name (`serialNumber=CUIT …`) | (hidden)                                  |
| WSAA authentication                        | **Secure login to ARCA**                  |
| WSFE                                       | **Electronic invoicing service**          |
| WSASS                                      | **ARCA homologation certificate portal**  |
| Homologation environment                   | **Testing environment**                   |
| Production environment                     | **Live environment**                      |
| Fingerprint / thumbprint                   | **Certificate ID**                        |

- **ARCA** — the Argentine tax authority (ex-AFIP). ARCA and AFIP are used interchangeably in external docs; the UI uses **ARCA**.
- **CUIT** — Argentine tax id of the company; embedded in the CSR Distinguished Name as `serialNumber=CUIT <n>`.
- **WSAA** — Web Service de Autenticación y Autorización; issues a **Login Ticket (TA)** from a signed **Login Ticket Request (TRA)** using the certificate + private key.
- **WSFE** — Web Service de Facturación Electrónica; requires a valid WSAA ticket scoped to `wsfe`.
- **WSASS** — self-service portal used **only** to obtain homologation (testing) certificates; must first be enabled via "Administrador de Relaciones de Clave Fiscal" with a **personal** Clave Fiscal.
- **Homologation** — ARCA testing environment (`production=false` in `@arcasdk/core`).
- **Production** — ARCA live environment (`production=true`).
- **Testing Mode** — an ERP-level override (independent of the ARCA environment) that forces all invoicing through Homologation regardless of stored credentials (§9).

---

## 3. Current state & gap analysis

### 3.1 What exists today

- No ARCA / AFIP / fiscal-invoicing integration anywhere in the stack.
- `apps/api` (NestJS 11) uses feature modules under `apps/api/src/<feature>/` (controller + service + repository + dto), Kysely over `schema.sql`, capability guard (`specs/005`), `TransactionInterceptor` (audit GUCs, D-9), and `fn_audit()` trigger.
- `apps/web` (Next.js 16 App Router, MUI) has a **capability-gated** sidebar (`AppShell.tsx` `NAV_ITEMS`, filtered by `hasCapability`), i18n via `react-i18next` (`es`/`en`), TanStack Query + Zustand + RHF.
- `packages/schemas` (Zod) is the single source of DTOs and enums; `packages/domain` holds framework-light business rules and state machines (e.g. `remito-transitions.ts`).
- `system_setting` table + Settings API/UI already exist for org-wide runtime config (D-13, D-17) — the natural home for the Testing Mode flag.
- RBAC roles (`packages/schemas/src/enums.ts`): `CLERK, DRIVER, PLANT, INVENTORY, BILLING, MANAGER, SUBDIST, ADMIN, MEDICAL, CLIENT`. **There is no `SUPER_ADMIN` role** (see §16, §21 Q-1).
- Precedent for encrypted secrets: `app_user.mfa_secret` (encrypted TOTP secret, D-8) — the same crypto approach is reused/extended here.

### 3.2 Gaps to close

| Gap                          | Target                                                              |
| ---------------------------- | ------------------------------------------------------------------- |
| No fiscal credential storage | `arca_credentials` table (encrypted), §12                           |
| No key/CSR generation        | Backend RSA-2048 + PKCS#10 CSR with CUIT DN, §7                     |
| No certificate validation    | X.509 / PEM / expiry / key-match / CUIT / environment checks, §8    |
| No WSAA/WSFE client          | `@arcasdk/core`-backed WSAA + WSFE services, §10                    |
| No environment isolation     | `arca_environment` enum + guards, §9                                |
| No testing-mode guard        | `system_setting.arca_testing_mode` + invoicing guard, §9            |
| No admin ARCA page           | Wizard UI under Administration, §6                                  |
| No ARCA capabilities         | `arca:read` / `arca:manage`, §16                                    |
| No encryption-at-rest util   | AES-256-GCM crypto submodule, key from ENV/KMS/Vault, §13           |
| No audit on credentials      | `fn_audit()` on `arca_credentials` (no secret columns in diff), §13 |

### 3.3 Migration & backward compatibility

- **C-1** All schema changes MUST be additive per D-4 / `specs/011`/`012`: additive `db/migrations/00NN_arca_credentials.up.sql` + paired `.down.sql`, and mirrored into `schema.sql` baseline.
- **C-2** The module is **self-contained and opt-in**: absence of ARCA credentials MUST NOT affect any existing flow. Invoicing that consumes ARCA (future) MUST treat "not configured" as a first-class, non-error state.
- **C-3** `system_setting` receives one additive row (`arca_testing_mode`, default `true` — fail-safe to testing).

---

## 4. Target architecture overview

Aligns with the existing layered architecture:

```
┌───────────────────────────────────────────────────────────────────────┐
│  apps/web (Next.js 16 back-office)                                       │
│  - Administration → ARCA wizard page (MUI stepper/cards)                 │
│  - arcaLogic.ts (view/form helpers: status derivation, step gating)     │
│  - Never receives private key or decrypted secrets                      │
└───────────────────────────────┬───────────────────────────────────────┘
                                 │  @weld/api-client (typed HTTP)
┌───────────────────────────────▼───────────────────────────────────────┐
│  apps/api (NestJS 11) — ArcaModule                                       │
│  controller → service, sub-services:                                    │
│    certificate (parse/validate)  crypto (AES-256-GCM at rest)           │
│    csr (RSA-2048 + PKCS#10)      wsaa (login ticket)  wsfe (connectivity)│
│    storage (repository/Kysely)                                          │
│  CapabilitiesGuard (arca:read / arca:manage) + TransactionInterceptor    │
└───────────────────────────────┬───────────────────────────────────────┘
        @weld/domain (onboarding state machine, validation rules)
        @weld/schemas (Zod DTOs + enums)     @arcasdk/core (WSAA/WSFE)
┌───────────────────────────────▼───────────────────────────────────────┐
│  PostgreSQL 15+ (schema.sql + db/migrations, Kysely types)              │
│  - arca_credentials (certificateEncrypted, privateKeyEncrypted, …)     │
│  - system_setting.arca_testing_mode                                     │
│  - audit_log (fn_audit on arca_credentials, secrets excluded)          │
└─────────────────────────────────────────────────────────────────────────┘
```

- **R-1** ARCA business rules (onboarding transitions, environment ↔ certificate matching, validation checks, testing-mode override) MUST live in `@weld/domain` (`arca-onboarding.ts`, `arca-validation.ts`) and be enforced by the service; controllers orchestrate, they do not own rules (SOLID/DRY).
- **R-2** Transport DTOs MUST be Zod schemas in `@weld/schemas` (`arca.ts`), consumed via `nestjs-zod`; Swagger-emitted OpenAPI derives from them (D-10) and drives `@weld/api-client`.
- **R-3** Web view/form helpers MUST live in `apps/web/src/features/arca/arcaLogic.ts` with unit tests, not copy-pasted across the wizard steps.
- **R-4** All cryptographic material handling (key gen, CSR, cert parse, encryption) MUST use maintained Node.js primitives (`node:crypto`) and/or a maintained PKI library — **never** shell out to OpenSSL and **never** require the operator to install it (§7).
- **R-5** The ARCA SDK integration MUST be isolated behind the `wsaa`/`wsfe` sub-services so `@arcasdk/core` is the only place the SDK is imported (dependency inversion; swappable if the package changes — §21 Q-2).

---

## 5. Onboarding lifecycle (state machine)

Each `(company, environment)` credential row has a derived **onboarding status**. It is computed from stored fields (not free-typed), so the wizard and dashboard share one source of truth.

```
        ┌────────────────┐
        │  NOT_STARTED   │  no row / no key
        └───────┬────────┘
                ▼ Generate Keys
        ┌────────────────┐
        │  KEY_READY     │  private key + CSR generated (key stored encrypted)
        └───────┬────────┘
                ▼ Download CSR → (manual ARCA steps) → Upload Certificate
        ┌────────────────┐
        │  CERT_UPLOADED │  certificate stored, not yet validated
        └───────┬────────┘
                ▼ Validate Certificate
        ┌────────────────┐
        │  VALIDATED     │  all checks pass (§8)
        └───────┬────────┘
                ▼ Test Connection
        ┌────────────────┐
        │  CONNECTED     │  WSAA + WSFE OK (§10)
        └───────┬────────┘
                ▼ (cert nears/at expiry)
        ┌────────────────┐
        │  EXPIRED       │  validUntil ≤ now (or renew requested)
        └────────────────┘

  Any state → NOT_STARTED via Delete Certificate (arca:manage, audited).
```

- **R-6** Status is derived in `@weld/domain` (`deriveArcaStatus(row)`), never stored as a mutable free field; the DB stores facts (`certificateFingerprint`, `validUntil`, `lastValidation`, `lastAuthentication`), the domain computes the label.
- **R-7** Allowed transitions and their guards:

| From                    | To              | Trigger / capability                 | Guard (MUST hold)                                                           |
| ----------------------- | --------------- | ------------------------------------ | --------------------------------------------------------------------------- |
| `NOT_STARTED`           | `KEY_READY`     | Generate Keys (`arca:manage`)        | CUIT configured for company; RSA-2048 + CSR generated; key encrypted-stored |
| `KEY_READY`             | `CERT_UPLOADED` | Upload Certificate (`arca:manage`)   | File ≤ 100 KB; `.crt`/`.pem`; parses as X.509                               |
| `CERT_UPLOADED`         | `VALIDATED`     | Validate Certificate (`arca:manage`) | All checks in §8 pass                                                       |
| `VALIDATED`             | `CONNECTED`     | Test Connection (`arca:manage`)      | WSAA login ticket obtained + WSFE reachable (§10)                           |
| `*`                     | `NOT_STARTED`   | Delete Certificate (`arca:manage`)   | Reason recorded; secrets wiped; audited                                     |
| `VALIDATED`/`CONNECTED` | `EXPIRED`       | derived / scheduled check            | `validUntil ≤ now()`                                                        |

- **R-8** Illegal transitions (e.g. Validate before a certificate exists) → HTTP 409 with a friendly message; the UI disables the corresponding button instead of relying only on the server error.
- **R-9** Re-generating keys while a valid certificate exists MUST warn the operator (the existing certificate will no longer match the new key) and requires explicit confirmation.

---

## 6. Wizard flow (UI)

### 6.1 Location & visibility

- **R-10** Add an **Administration → ARCA** entry. Because the sidebar is capability-gated (`AppShell.tsx` `NAV_ITEMS`), add a nav item `{ to: "/admin/arca", labelKey: "nav.arca", capability: "arca:read" }`. It is therefore visible only to roles granted `arca:read` (ADMIN; §16). Operators never see it.
- **R-11** Route: `apps/web/src/app/admin/arca/` (App Router, Client Component). Page component in `apps/web/src/views/ArcaPage.tsx` with helpers in `features/arca/arcaLogic.ts`.

### 6.2 Layout

A single guided wizard (MUI `Card`s / `Stepper`), matching the ERP's Material UI design (`specs/006`):

```
ARCA Configuration

Environment
  ( ) Testing (Homologation)
  ( ) Live (Production)

Status
  ✓ Secret key
  ✓ Access Request (CSR)
  ✗ Certificate
  ✗ Validation

[ Generate Keys ]
[ Download Access Request ]
[ Upload Certificate ]
[ Validate Certificate ]

Testing
  ☑ Enable Testing Mode

Connection
  ● Not Configured

```

- **R-12** The Status panel MUST render four derived checks (Secret key, Access Request, Certificate, Validation) as ✓/✗ from `deriveArcaStatus` (§5), never technical jargon.
- **R-13** Buttons MUST be **progressively enabled**: each action is enabled only when its guard (R-7) is satisfiable; disabled buttons show a tooltip explaining the prerequisite in plain language.
- **R-14** The Connection indicator reflects the last `Test Connection` result: `Not Configured` / `Connected` / `Failed` with a friendly reason.
- **R-15** UI copy MUST follow the glossary (§2) — e.g. "Generate Access Request", never "Generate PKCS#10 CSR".
- **R-16** Responsive (mobile → desktop), light/dark theme aware, i18n keys added to `apps/web/src/locales/{es,en}/common.json` under `arca.*` and `nav.arca` (Spanish primary, D-17).

### 6.3 Step instructions

- **R-17** Between "Download Access Request" and "Upload Certificate" the wizard MUST show numbered instructions adapted to the selected environment:
  - **Homologation:** 1) Log in to ARCA · 2) Open **WSASS** (enable it first in "Administrador de Relaciones de Clave Fiscal" with your **personal** Clave Fiscal) · 3) Create a new certificate · 4) Paste the Access Request · 5) Download the certificate · 6) Return to the ERP and upload it.
  - **Production:** same, but via **"Administrador de Certificados Digitales"** and authorize the target web service (WSFE) in **"Administrador de Relaciones de Clave Fiscal"**.

---

## 7. Key & CSR generation

- **R-18** `POST /arca/keys` (per selected environment) MUST generate on the backend:
  - An **RSA 2048** private key.
  - A **PKCS#10 CSR** whose Distinguished Name contains the company identity required by ARCA, including `serialNumber=CUIT <cuit>` plus `CN` (company alias) and `O` (legal name) as required by the certificate process.
- **R-19** Generation MUST use Node.js `crypto` (`generateKeyPairSync('rsa', { modulusLength: 2048 })`) and a maintained PKI library for the CSR (candidate `@peculiar/x509` / `node-forge`, ratified in §21 Q-3). **Never** shell out to OpenSSL; the operator MUST NOT need OpenSSL installed (G-6, R-4).
- **R-20** The private key MUST be encrypted (§13) and stored in `arca_credentials.privateKeyEncrypted` immediately; it is **never** written to disk unencrypted and **never** returned in any API response (G-2, R-4b in §13).
- **R-21** The CSR is not secret; it is stored (or regenerated deterministically from the key) and offered for download at `GET /arca/csr` as `company.csr` (see §15). The generated logical file names are `private.key` (backend-only, encrypted at rest) and `request.csr`.
- **R-22** The CUIT used in the DN MUST come from the configured company record (§12), not from user input at generation time, so the CSR always matches the CUIT the certificate will be validated against (§8).

---

## 8. Certificate upload & validation

### 8.1 Upload

- **R-23** `POST /arca/certificate` accepts a single file, content types `application/x-x509-ca-cert` / `application/x-pem-file` / text, extensions `.crt` / `.pem`, **max 100 KB** (hard reject larger with a friendly message).
- **R-24** On upload the certificate is parsed; if it parses as X.509 it is encrypted and stored (`certificateEncrypted`), status → `CERT_UPLOADED`. Parse failure → friendly "This file doesn't look like a valid certificate."

### 8.2 Validation checks

- **R-25** `POST /arca/certificate/validate` MUST verify, in order, and return a structured result per check:

| Check               | Rule                                                                                            | Friendly failure message                                                                   |
| ------------------- | ----------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------ |
| Valid X.509         | Parses as an X.509 certificate                                                                  | "The certificate cannot be read."                                                          |
| Correct PEM         | Proper PEM/DER encoding                                                                         | "Invalid certificate format."                                                              |
| Not expired         | `notAfter > now` (and `notBefore ≤ now`)                                                        | "This certificate has expired."                                                            |
| Private key matches | Cert public key ↔ stored private key                                                            | "This certificate does not match the generated key. Please generate a new Access Request." |
| Belongs to CUIT     | DN `serialNumber` / subject CUIT == configured CUIT                                             | "This certificate belongs to a different CUIT."                                            |
| Environment matches | Certificate issuer / chain corresponds to the selected environment (Homologation vs Production) | "This is a Live certificate but you selected Testing (or vice-versa)."                     |

- **R-26** All validation logic MUST live in `@weld/domain` (`arca-validation.ts`) as pure functions over parsed cert data, so it is unit-testable without I/O and reused by any future automated re-validation job.
- **R-27** On full success: set `certificateFingerprint` (SHA-256 thumbprint), `validUntil` (= `notAfter`), `lastValidation = now()`; status → `VALIDATED`.
- **R-28** Environment/CUIT mismatches MUST be **hard blocks** (G-4): a Production cert can never be validated under Homologation and vice-versa; a wrong-CUIT cert is rejected.

---

## 9. Environment & testing mode

### 9.1 Environment selector

- **R-29** Introduce enum `arca_environment ('HOMOLOGATION','PRODUCTION')` (single-sourced: `@weld/schemas` `ArcaEnvironment` + PG ENUM in `schema.sql`, BR-15).
- **R-30** Credentials are stored **per environment**: unique `(company_id, environment)`. Switching the selector switches which credential set the wizard/dashboard operate on.
- **R-31** The stored environment maps to `@arcasdk/core`: `HOMOLOGATION → production=false`, `PRODUCTION → production=true`. This mapping MUST be the only place the boolean is derived (`@weld/domain`).
- **R-32** Invoicing (future consumer) MUST select credentials by the **effective environment** (§9.2), never by ad-hoc booleans.

### 9.2 Testing mode

- **R-33** Add `system_setting.arca_testing_mode boolean` (default **`true`**, fail-safe), editable only with `arca:manage` (or `admin:write`), surfaced as the wizard's "Enable Testing Mode" switch.
- **R-34** **Effective environment** = `HOMOLOGATION` whenever `arca_testing_mode = true`, **regardless** of whether Production credentials exist. Only when testing mode is `false` may `PRODUCTION` credentials be used for real invoicing.
- **R-35** When testing mode is enabled, the app MUST display a persistent banner (in the ARCA page and, when invoicing exists, near invoice actions):

```
====================================
TESTING MODE ENABLED
No real fiscal invoices will be generated.
====================================
```

- **R-36** Enabling/disabling testing mode is audited (who/when). Disabling it (going live) SHOULD require an explicit confirmation and valid `PRODUCTION` credentials in `CONNECTED` state.

---

## 10. Connection test (WSAA + WSFE)

- **R-37** `POST /arca/connection-test` MUST, using the decrypted credentials for the selected environment and `@arcasdk/core`:
  1. Build and sign a **Login Ticket Request (TRA)** and authenticate to **WSAA**.
  2. Obtain a **Login Ticket (TA)** scoped to `wsfe`.
  3. Connect to **WSFE**.
  4. Fetch the **last authorized voucher** (e.g. `FECompUltimoAutorizado`) for a configured point of sale to prove end-to-end auth.
- **R-38** The response MUST be a structured checklist so the UI can show ✓/✗ per step:

```
✓ WSAA OK
✓ Login Ticket Generated
✓ WSFE Connected
✓ Authentication Successful
```

or the corresponding failures with friendly copy: `Authentication Failed`, `Service Not Authorized` (WSFE not authorized for this CUIT — see §17 instructions), `Certificate Invalid`, `Connection Error`.

- **R-39** On success, set `lastAuthentication = now()` and cache the WSAA ticket until its `expirationTime`; a valid cached ticket MUST be reused (ARCA rate-limits TRA requests) — ticket cache lives server-side only, keyed by `(company, environment, service)`.
- **R-40** All WSAA/WSFE access MUST be isolated in the `wsaa`/`wsfe` sub-services (R-5); no other module imports `@arcasdk/core`.
- **R-41** Decrypted credentials exist only in memory for the duration of the call and are never logged (§13).

---

## 11. Dashboard

- **R-42** The ARCA page MUST show a status dashboard for the selected environment:

| Field                        | Source                                               |
| ---------------------------- | ---------------------------------------------------- |
| Certificate Status           | `deriveArcaStatus` (§5)                              |
| Certificate Expiration       | `validUntil`                                         |
| Environment                  | `environment`                                        |
| CUIT                         | company CUIT                                         |
| Certificate ID (fingerprint) | `certificateFingerprint`                             |
| Last Validation              | `lastValidation`                                     |
| Last Authentication          | `lastAuthentication`                                 |
| Last Invoice / Last CAE      | invoicing module (future — shown as "—" until wired) |
| Point of Sale                | configured POS (future / §19)                        |
| Connection Status            | last connection-test result                          |

- **R-43** Fields that depend on the (future) invoicing module (Last Invoice, Last CAE, Point of Sale) MUST render a neutral placeholder until that module exists — never an error (C-2).

---

## 12. Domain model & storage

### 12.1 `arca_credentials`

One row per `(company_id, environment)`.

| Column                      | Type               | Notes                                                                    |
| --------------------------- | ------------------ | ------------------------------------------------------------------------ |
| `id`                        | bigint PK          | internal identity                                                        |
| `company_id`                | FK / int           | issuing company (§21 Q-4: no company table yet — default single company) |
| `environment`               | `arca_environment` | HOMOLOGATION \| PRODUCTION                                               |
| `cuit`                      | text (11 digits)   | snapshot of company CUIT at generation                                   |
| `certificate_encrypted`     | bytea/text         | AES-256-GCM ciphertext (+ iv + tag), never plaintext                     |
| `private_key_encrypted`     | bytea/text         | AES-256-GCM ciphertext (+ iv + tag), never returned                      |
| `csr_pem`                   | text null          | non-secret; may be stored for re-download                                |
| `certificate_fingerprint`   | text null          | SHA-256 thumbprint                                                       |
| `valid_until`               | timestamptz null   | cert `notAfter`                                                          |
| `last_validation`           | timestamptz null   | last successful validate                                                 |
| `last_authentication`       | timestamptz null   | last successful WSAA login                                               |
| `created_at` / `updated_at` | timestamptz        | audit columns                                                            |
| `created_by` / `updated_by` | FK app_user        | actor                                                                    |
| `deleted_at`                | timestamptz null   | soft delete (Delete Certificate)                                         |

- **R-44** Unique `(company_id, environment) WHERE deleted_at IS NULL`.
- **R-45** Enum `arca_environment` created additively (idempotent `DO $$ … CREATE TYPE`, matching the `remito_status` migration pattern).
- **R-46** `arca_credentials` MUST be registered on the `fn_audit()` trigger, but the audit diff MUST exclude the encrypted secret columns (record that they changed, not their values) — §13, R-53.
- **R-47** Kysely types added to `apps/api/src/database/schema.types.ts`; mirror the migration into `schema.sql`.

### 12.2 Enums & schemas (single source)

- **R-48** New Zod in `@weld/schemas/src/arca.ts`: `ArcaEnvironment`, `ArcaOnboardingStatus`, `ArcaStatusPanel`, `GenerateKeysRequest`, `UploadCertificateResult`, `ValidateCertificateResult` (per-check booleans + messages), `ConnectionTestResult` (per-step), `ArcaDashboard`. Exported from `@weld/schemas/src/index.ts`.
- **R-49** No DTO ever includes a private key or decrypted certificate field (enforced by schema shape, I-3).

---

## 13. Security & secret handling

- **R-50** Secrets (private key, certificate) MUST be encrypted at rest with **AES-256-GCM**. The encryption key MUST come from ENV (`ARCA_ENCRYPTION_KEY`, base64 32 bytes) or a KMS / Vault provider — **never hardcoded**, never committed (aligns with `check:secrets` gate).
- **R-51** Crypto MUST be a dedicated submodule (`apps/api/src/arca/crypto/`) exposing `encryptSecret` / `decryptSecret` (random 96-bit IV per record, auth tag stored alongside). This reuses/extends the approach already used for `app_user.mfa_secret` (D-8) — DRY; if a shared crypto util is extracted, both consumers use it.
- **R-52** The private key MUST NEVER be returned to the frontend or included in any DTO, log, error, or audit value (G-2). Static-analysis-friendly: the response schemas simply have no such field (R-49).
- **R-53** Audit: record insert/update/delete on `arca_credentials` via `fn_audit()`, but redact the encrypted secret columns from the recorded before/after (store a marker like `«redacted»` or omit those keys) so secrets never land in `audit_log`.
- **R-54** Decrypted material lives only in memory for the minimum duration (generation, validation, connection test) and is never persisted decrypted.
- **R-55** Key rotation: the crypto submodule SHOULD support a key id / versioned envelope so `ARCA_ENCRYPTION_KEY` can be rotated by re-encrypting rows, without a schema change (§19).
- **R-56** All mutating ARCA endpoints require `arca:manage` and are audited with actor via the existing GUC/`TransactionInterceptor` path (D-9).

---

## 14. Backend structure

Requested layout `src/modules/arca/*` is mapped onto the repo's existing NestJS convention (`apps/api/src/<feature>/`), keeping the requested sub-boundaries:

```
apps/api/src/arca/
  arca.module.ts
  arca.controller.ts          # HTTP surface (§15), capability-guarded
  arca.service.ts             # orchestration only (SOLID: thin)
  dto/arca.dto.ts             # nestjs-zod DTOs from @weld/schemas
  certificate/                # parse + validate (delegates rules to @weld/domain)
  crypto/                     # AES-256-GCM encrypt/decrypt (§13)
  csr/                        # RSA-2048 keygen + PKCS#10 CSR (§7)
  wsaa/                       # @arcasdk/core WSAA login + ticket cache (§10)
  wsfe/                       # @arcasdk/core WSFE connectivity (§10)
  storage/                    # arca.repository.ts (Kysely) (§12)
```

Shared, framework-light rules live outside the app:

```
packages/domain/src/arca-onboarding.ts     # state machine (§5) + guards
packages/domain/src/arca-validation.ts     # pure validation checks (§8)
packages/schemas/src/arca.ts               # Zod DTOs + enums (§12.2)
```

- **R-57** `arca.service.ts` MUST NOT embed cryptography, SDK calls, or validation rules directly — it composes the sub-services and domain functions (single responsibility, dependency inversion).

---

## 15. REST API

All routes under `/arca`, capability-guarded (§16), idempotent where creating, audited.

| Method & path                     | Capability    | Purpose                                | Returns                               |
| --------------------------------- | ------------- | -------------------------------------- | ------------------------------------- |
| `GET /arca?environment=`          | `arca:read`   | Dashboard + derived status             | `ArcaDashboard` (no secrets)          |
| `POST /arca/keys`                 | `arca:manage` | Generate RSA-2048 + CSR (§7)           | `ArcaStatusPanel` (no key)            |
| `GET /arca/csr?environment=`      | `arca:read`   | Download CSR                           | `company.csr` (text/plain attachment) |
| `POST /arca/certificate`          | `arca:manage` | Upload cert (≤100 KB, .crt/.pem)       | `UploadCertificateResult`             |
| `POST /arca/certificate/validate` | `arca:manage` | Run validation checks (§8)             | `ValidateCertificateResult`           |
| `DELETE /arca/certificate`        | `arca:manage` | Delete cert + key (soft), wipe secrets | `ArcaStatusPanel`                     |
| `POST /arca/connection-test`      | `arca:manage` | WSAA + WSFE test (§10)                 | `ConnectionTestResult`                |
| `GET /arca/testing-mode`          | `arca:read`   | Read testing-mode flag                 | `{ enabled }`                         |
| `PATCH /arca/testing-mode`        | `arca:manage` | Toggle testing mode (§9)               | `{ enabled }`                         |

- **R-58** `POST /arca/keys`, `/certificate`, `/certificate/validate`, `/connection-test` MUST accept the generic `Idempotency-Key` header (D-6) and use optimistic concurrency where a row version applies.
- **R-59** No endpoint returns the private key or decrypted certificate (R-49/R-52). `GET /arca/csr` returns only the non-secret CSR.
- **R-60** OpenAPI is emitted from the Zod DTOs (D-10); `@weld/api-client` gains typed methods (`arca.*`).

---

## 16. Permissions (RBAC)

- **R-61** Two capabilities (`resource:action` per `specs/005`): `arca:read` (view page/dashboard/CSR) and `arca:manage` (generate keys, upload/delete certificate, switch environment, run connection test, toggle testing/production).
- **R-62** Grant both to `ADMIN` in `ROLE_CAPABILITIES` (`apps/api/src/auth/capabilities.ts`). Optionally grant `arca:read` to `MANAGER` (read-only dashboard) — decision Q-5.
- **R-63** Operators (CLERK, DRIVER, PLANT, INVENTORY, MEDICAL, SUBDIST, CLIENT) MUST NOT receive either capability — the nav item and all routes are hidden/denied for them (fail-closed).
- **R-64** The following actions require `arca:manage`: Generate Keys, Upload Certificate, Delete Certificate, Switch Environment, Run Connection Test, Enable Production (disable testing mode).

> **Note (Q-1):** the request names `ADMIN` and `SUPER_ADMIN`, but the codebase has no `SUPER_ADMIN` role (`RoleCode`, `enums.ts`). This spec maps "admin-only" to the capability pair above, granted to the existing `ADMIN`. If a `SUPER_ADMIN` role is desired, it is an additive change to the `RoleCode` enum + `ROLE_CAPABILITIES` (§21 Q-1).

---

## 17. Non-functional requirements

- **NFR-1 No jargon** — user-facing copy follows the glossary (§2); technical terms (PKCS#10, PEM, DN, SOAP, WSAA, OpenSSL) never appear in the UI (G-6).
- **NFR-2 <10 min onboarding** — the happy path (generate → download → upload → validate → test) is completable in under 10 minutes (G-1); buttons are progressively enabled with inline guidance.
- **NFR-3 Secret safety** — private key never leaves the backend, never logged, encrypted at rest (§13); verified by tests asserting no secret fields in any response schema.
- **NFR-4 Environment isolation** — production/homologation credentials never cross (G-4); enforced in domain + validation (§8, §9).
- **NFR-5 Fail-safe testing** — testing mode defaults on; only an explicit, audited action with connected production credentials allows real invoicing (§9).
- **NFR-6 Resilience** — WSAA/WSFE calls have timeouts, typed error mapping to friendly messages, and reuse cached tickets (§10); ARCA outages surface as `Connection Error`, not stack traces.
- **NFR-7 Quality gates (D-16)** — `@weld/domain`, `@weld/schemas`, `@weld/api`, `@weld/web` keep **≥80%** coverage; identifier length ≥2; Prettier + typecheck before commit; coverage before push.
- **NFR-8 i18n & theme** — Spanish primary (D-17), English secondary; responsive; light/dark (`specs/006`).
- **NFR-9 Auditability** — every mutating action recorded via `fn_audit()` (secrets redacted) + actor GUC (D-9).

---

## 18. Implementation phases (milestones)

- **M0 — Foundations** — `arca_environment` enum, `arca_credentials` table (+ audit trigger, secrets redacted), `system_setting.arca_testing_mode`, Kysely types, Zod schemas, `@weld/domain` onboarding state machine + validation stubs, capabilities `arca:read`/`arca:manage`.
- **M1 — Keys & CSR** — RSA-2048 keygen + PKCS#10 CSR with CUIT DN; encrypt-at-rest crypto submodule; `POST /arca/keys`, `GET /arca/csr`.
- **M2 — Upload & validation** — `POST /arca/certificate` (≤100 KB), `POST /arca/certificate/validate` with all six checks; fingerprint/validUntil persistence.
- **M3 — Environment & testing mode** — selector, testing-mode switch + banner, effective-environment resolution, delete-certificate.
- **M4 — Connection test** — `@arcasdk/core` WSAA login + ticket cache + WSFE last-voucher; structured checklist result.
- **M5 — Wizard UI + dashboard** — `apps/web` Administration → ARCA page, `arcaLogic.ts`, i18n, responsive MUI; nav entry; dashboard fields.
- **M6 — Hardening** — error-mapping polish, expiry detection/status, key-rotation envelope, tests to ≥80%, docs/runbook.

---

## 19. Future extensions

Architecture MUST NOT preclude (design for, do not build now):

- **Multiple companies / CUITs** — `company_id` already keys `arca_credentials`; requires a `company` table (§21 Q-4) and company selector.
- **Multiple certificates / renewal** — soft-delete + fingerprint history enables keeping superseded certs; renewal reminders and **automatic expiration alerts** ride the existing `alert` table (D-15) driven by `valid_until`.
- **Multiple Points of Sale** — POS list per company/environment; connection test and invoicing parameterized by POS.
- **Multiple ARCA web services** — WSAA ticket cache is already keyed by service; add `wsfe`, `padron`, `wsmtxca`, etc. behind the same `wsaa` sub-service and per-service authorization.
- **Encryption key rotation** — versioned crypto envelope (R-55) supports rotating `ARCA_ENCRYPTION_KEY` / KMS keys without schema change.

---

## 20. Acceptance criteria

- **AC-1** ARCA page exists under Administration, visible only to `arca:read` holders (ADMIN); never to operators.
- **AC-2** Simple wizard UI with Environment selector, Status panel (✓/✗), action buttons, Testing switch, Connection indicator — no cryptography jargon.
- **AC-3** "Generate Keys" produces an RSA-2048 key + CSR on the backend; key stored encrypted, never returned.
- **AC-4** CSR contains the correct DN including `serialNumber=CUIT …` and is downloadable as `company.csr`.
- **AC-5** Certificate upload accepts `.crt`/`.pem` ≤ 100 KB; oversize/invalid files rejected with friendly copy.
- **AC-6** Validation verifies valid X.509, correct PEM, not expired, private-key match, CUIT match, environment match — with friendly failure messages.
- **AC-7** Certificates and private keys are stored encrypted (AES-256-GCM); key from ENV/KMS/Vault, never hardcoded.
- **AC-8** Homologation/Production selector isolates credentials; cross-environment use is hard-blocked.
- **AC-9** Testing Mode switch forces Homologation for all invoicing and shows the banner; defaults on.
- **AC-10** Connection test performs WSAA auth + WSFE connectivity and returns a per-step ✓/✗ checklist.
- **AC-11** Dashboard shows status, expiration, environment, CUIT, fingerprint, last validation, last authentication, connection status (invoicing fields placeholdered until wired).
- **AC-12** No secret (private key / decrypted cert) is exposed to the frontend in any response, log, or audit value.
- **AC-13** Responsive, Material UI, i18n (es/en), consistent with the rest of the ERP.
- **AC-14** Integrates with `@arcasdk/core` (only in `wsaa`/`wsfe` sub-services) with no third-party SaaS dependency.
- **AC-15** All new packages meet the ≥80% coverage gate (D-16).

---

## 21. Open questions & decisions to ratify

1. **Q-1 — `SUPER_ADMIN` role.** The request names `ADMIN` + `SUPER_ADMIN`, but only `ADMIN` exists (`RoleCode`). Ratify: (a) capability-only, granted to `ADMIN` (spec default), or (b) add a new `SUPER_ADMIN` role (additive enum + `ROLE_CAPABILITIES`).
2. **Q-2 — `@arcasdk/core` API surface & version.** Confirm the exact package, version, and WSAA/WSFE method names (`FECompUltimoAutorizado`, ticket shape). If unavailable/unstable, ratify the fallback (a maintained AFIP/ARCA SOAP client) behind the same `wsaa`/`wsfe` boundary (R-5).
3. **Q-3 — PKI library for CSR.** `@peculiar/x509` vs `node-forge` vs pure `node:crypto`. Decide based on maintenance + PKCS#10/DN support (must set `serialNumber=CUIT`). No OpenSSL dependency (R-4).
4. **Q-4 — Company model.** There is no `company` table yet (also flagged in `docs/specs/remitos.md` §26). Ratify a single-company default (config-driven CUIT/legal name) for v1 vs. introducing a `company` table now to key `arca_credentials.company_id`.
5. **Q-5 — Read-only access for `MANAGER`.** Grant `arca:read` to `MANAGER` for dashboard visibility, or keep the module strictly `ADMIN`?
6. **Q-6 — Encryption key provider for v1.** ENV (`ARCA_ENCRYPTION_KEY`) only, or wire KMS/Vault from the start? Ratify the rotation envelope format (R-55).
7. **Q-7 — Point of sale source.** Which POS number(s) to use for the WSFE last-voucher probe until the POS model (§19) lands?
8. **Q-8 — Expiry alerting.** Reuse the `alert` table (D-15) for renewal reminders now, or defer to a later phase?

_End of specification. Awaiting approval before creating numbered implementation specs (`specs/015-arca-integration.md`) and beginning M0._
