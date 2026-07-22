# 003 — Database

> Source: `database.md` + `schema.sql` (verified on PostgreSQL 16). The DDL is the authoritative artifact; this spec governs how agents apply, evolve, and depend on it.

## Purpose

Provision and evolve the PostgreSQL schema that stores all domain data and enforces the hard invariants (single custody, computed rental days, ownership consistency, audit, history, optimistic locking).

## Requirements

- R1. Apply `schema.sql` as the baseline schema (transactional, idempotent per fresh DB). All object names in code/API `MUST` match it.
- R2. Provide the tables: reference (`gas_type`, `gas_alias`, `locality`, `dispatch_territory`), auth (`app_user`, `role`, `user_role`, `user_territory_scope`), master (`party`, `client`, `client_contact`, `cylinder`, `cylinder_battery`, `battery_member`, `accessory`, `delivery_note`, `rental_rate`), transactional (`movement_event`, `cylinder_sale`, `supplier_loan_cycle`, `stock_transfer`, `accessory_rental`), billing (`invoice`, `charge_line`), ops (`audit_log`, `client_history`, `cylinder_history`, `migration_exception`, `alert`, `system_setting`).
- R3. Enforce constraints per `001`: `ex_move_no_overlap` (BR-01), `uq_cyl_owner_serial` (BR-02), generated `movement_event.rental_days` (BR-03), `ck_move_dates`/`ck_loan_order`/`ck_acc_dates`/`ck_rate_range` (BR-04/11), `ck_move_lowerdate` + future-guard trigger (BR-05), `uq_sale_cylinder` (BR-06/09), owner⇔basis trigger (BR-07), `ck_move_kind_basis` (BR-08), `uq_member_one_active_battery` (BR-13), `ck_client_cuit_format`+`uq_client_cuit` (BR-17).
- R4. Provide the generic **audit** trigger (JSONB before/after, actor from session GUC), **SCD-2 history** triggers for `client`/`cylinder`, and **optimistic-lock touch** triggers (bump `version`, set `updated_at`).
- R5. Provide the index set from `database.md` §9.2, especially partial indexes on open movements and trigram indexes for search.
- R6. Manage schema changes via versioned additive migrations under `db/migrations/*.up.sql` (applied by `pnpm db:migrate` / CI `psql` loop; pair with local-only `*.down.sql`). See `011` for data migration; DDL stays additive (`C4`).
- R7. Seed and document **`system_setting`** keys used by ops/billing UI (D-13 / D-14 / D-17 / US-21): `supplier_loan_overdue_days`, `business_timezone`, `rental_min_days`, `primary_language`.

## Constraints

- C1. PostgreSQL **15+**; extensions `citext`, `pg_trgm`, `btree_gist`, `pgcrypto` required.
- C2. **Do not partition `movement_event` yet** — the single-custody exclusion/partial-unique index requires the partition key otherwise; partition only when it reaches tens of millions of rows, moving single-custody to a `cylinder_open_holding` current-state table.
- C3. `audit_log` is **partitioned monthly** and **append-only** (`REVOKE UPDATE, DELETE` from the application role).
- C4. Soft delete (`deleted_at`) applies to master data only; ledger tables (`movement_event`, `cylinder_sale`, `supplier_loan_cycle`, `audit_log`) are append-only — corrections via `VOID`.
- C5. The application `MUST` set session GUCs before writes so audit captures the actor: `app.current_user_id`, `app.current_role_code`, `app.source`.
- C6. Money `numeric(14,2)`; capacity magnitude `numeric(5,2)` in column `capacity_m3` (legacy name) paired with `capacity_unit` ENUM `('M3','KG')` default `'M3'` on `cylinder` / `rental_rate` / `cylinder_sale` (D-18); business dates `date`; system timestamps `timestamptz`.

## Acceptance Criteria

- AC1. `psql -v ON_ERROR_STOP=1 -f schema.sql` on a fresh DB exits 0 (verified on PG16).
- AC2. Invariant tests pass (reference the verified suite in `010`): single-custody blocked, `rental_days`=67, refill-on-ours blocked, return-before-delivery blocked, future-date blocked, bad-CUIT blocked, duplicate-serial-per-owner blocked.
- AC3. Any INSERT/UPDATE/DELETE on core tables produces an `audit_log` row with correct actor (when GUC set) and before/after JSON.
- AC4. Updating a `client`/`cylinder` writes a `*_history` row and increments `version`.
- AC5. Attempting `UPDATE`/`DELETE` on `audit_log` from the application role fails.

## Edge Cases

- Same-day return then redeliver: exclusion constraint uses half-open ranges (`[)`) so it does not falsely conflict.
- `rental_days` when `return_date` is NULL → NULL (accrual computed in queries, not stored).
- Generic audit id resolution: entity id read as `id` or `party_id` from the JSON (tables with composite/alternate PKs).
- Cross-owner duplicate serials permitted by `(owner, serial)` uniqueness.
- Monthly audit partitions must exist ahead of time; a `DEFAULT` partition prevents insert failures if a month is missing.

## Dependencies

- `001` (rules to enforce), `002` (entities), `011` (data import + DDL migration ordering), `005` (session GUC actor), `012` (partition creation & backups).

## Implementation Notes

- Build order handles two forward references (`cylinder.battery_id`, `*_by → app_user`): create `cylinder_battery`/`app_user`/reference tables first or add those FKs last (see `schema.sql` header note).
- Connection handling: set the three session GUCs per request/transaction (a middleware/interceptor), so every write is attributable.
- Add a scheduled job to pre-create next month's `audit_log` partition (see `012`).
- Prefer additive migrations; never rewrite the ledger. New computed needs → new columns/tables, not mutation of history.
- `system_setting` is a key/value store (`key` PK, `value` text, per-row `version` for optimistic concurrency). Aggregate API `version` = `max(row.version)` across known keys. Seeded keys and defaults live in `schema.sql` + migration `0007_system_setting_business_config`.
