"""Transform + load staged records into PostgreSQL (011 R2–R8)."""

from __future__ import annotations

import uuid
from collections import Counter
from datetime import date
from typing import Any

import psycopg
from psycopg.rows import dict_row
from psycopg.types.json import Jsonb

from .normalize import (
    EXTRA_GAS_ALIASES,
    coverage_from_holder_name,
    fold_locality_key,
    fold_person_key,
    is_noise_holder_name,
    normalize_locality,
    person_token_set,
    request_id_for,
    resolve_gas,
    sanitize_capacity,
)
from .parse import ExtractResult, StagedClient, StagedCylinder, StagedMovement

# Canonical parties from schema.sql seed — restored after purge / missing DBs (011 R2).
SEED_SUPPLIERS = ("Linde", "Intergas", "Nordelta", "DSJ")
SEED_SUBDISTRIBUTORS = ("Ceres", "Pantiga", "Ezequiel", "Tito", "Buroni")


class _Savepoint:
    """Per-row savepoint so one bad insert doesn't abort the whole migration txn."""

    def __init__(self, conn: psycopg.Connection, name: str = "mig") -> None:
        self.conn = conn
        self.name = name

    def __enter__(self) -> _Savepoint:
        self.conn.execute(f"SAVEPOINT {self.name}")
        return self

    def __exit__(self, exc_type, exc, tb) -> bool:
        if exc_type is None:
            self.conn.execute(f"RELEASE SAVEPOINT {self.name}")
            return False
        if issubclass(exc_type, psycopg.Error):
            self.conn.execute(f"ROLLBACK TO SAVEPOINT {self.name}")
            self.conn.execute(f"RELEASE SAVEPOINT {self.name}")
            return False  # propagate to caller
        self.conn.execute(f"ROLLBACK TO SAVEPOINT {self.name}")
        self.conn.execute(f"RELEASE SAVEPOINT {self.name}")
        return False


class Loader:
    def __init__(self, dsn: str, dry_run: bool = False) -> None:
        self.dsn = dsn
        self.dry_run = dry_run
        self.stats: Counter[str] = Counter()
        self.reason_counts: Counter[str] = Counter()
        # caches
        self.party_by_name: dict[str, int] = {}
        self.party_type: dict[int, str] = {}
        self.territory_by_name: dict[str, int] = {}
        self.locality_by_name: dict[str, int] = {}
        self._locality_display: dict[str, str] = {}  # fold_key → canonical name in DB
        self.gas_alias: dict[str, str] = {}
        self.cylinder_id: dict[tuple[int, str], int] = {}  # (owner_id, serial) -> id
        self.client_id: dict[str, int] = {}  # display_name.casefold() -> party_id
        # (fold_person_key, territory_id|None) -> party_id for territory-aware resolve
        self.client_by_fold_territory: dict[tuple[str, int | None], int] = {}
        self.client_territory: dict[int, int | None] = {}  # party_id -> territory_id
        self.client_fold_index: dict[str, list[int]] = {}  # fold_key -> [party_ids]
        self.origin_parties: dict[str, int] = {}
        self._existing_request_ids: set[str] = set()
        # merge index: (serial, delivery_date) -> True once loaded from client book
        self._client_movement_keys: set[tuple[str, date]] = set()
        self._cyl_owner: dict[int, int] = {}  # cylinder_id -> owner_party_id

    def run(self, extracted: ExtractResult) -> dict[str, Any]:
        with psycopg.connect(self.dsn, row_factory=dict_row) as conn:
            self._bootstrap(conn)
            if not self.dry_run:
                try:
                    with conn.transaction():
                        conn.execute("SELECT set_config('app.source', 'migration', true)")
                        # Spec 011 C3: disable audit/history triggers for bulk load speed;
                        # business constraints (FKs, exclusion, CHECKs) stay enforced.
                        self._disable_audit_triggers(conn)
                        # Fresh exception queue per run (011 report is for this run).
                        conn.execute("TRUNCATE migration_exception RESTART IDENTITY")
                        self._ensure_gas_aliases(conn)
                        self._ensure_seed_parties(conn)
                        print("Loading cylinders…", flush=True)
                        self._load_cylinders(conn, extracted.cylinders)
                        print(
                            f"  cylinders inserted/seen: {self.stats['cylinder_inserted'] + self.stats['cylinder_exists']}",
                            flush=True,
                        )
                        print("Loading clients…", flush=True)
                        self._load_clients(conn, extracted.clients)
                        print(
                            f"  clients processed: {self.stats.get('client_inserted', 0) + self.stats.get('client_exists', 0)}",
                            flush=True,
                        )
                        print("Loading movements…", flush=True)
                        self._load_movements(conn, extracted.movements)
                        self._flush_exceptions(conn, extracted)
                        print("Load complete.", flush=True)
                        self._enable_audit_triggers(conn)
                except Exception:
                    # Ensure triggers are back even if the migration txn aborted.
                    with psycopg.connect(self.dsn) as conn2:
                        self._enable_audit_triggers(conn2)
                        conn2.commit()
                    raise
            else:
                # dry-run still computes what we would do
                self._simulate(extracted)

        report = {
            "dry_run": self.dry_run,
            "rows_read": extracted.stats.get("rows_read", 0)
            + extracted.stats.get("cyl_rows_read", 0),
            "rows_read_client": extracted.stats.get("rows_read", 0),
            "rows_read_circulation": extracted.stats.get("cyl_rows_read", 0),
            "imported_clean": self.stats["imported_clean"],
            "flagged": self.stats["flagged"] + len(extracted.exceptions),
            "by_reason": dict(self.reason_counts),
            "counts": dict(self.stats),
            "extract_stats": dict(extracted.stats),
            "pre_extract_exceptions": len(extracted.exceptions),
        }
        # AC1: read = imported_clean + flagged (approx; empty skips counted separately)
        report["reconciliation"] = {
            "read": report["rows_read"],
            "imported_clean": report["imported_clean"],
            "flagged": report["flagged"],
            "empty_skipped": extracted.stats.get("rows_empty", 0),
            "circulation_merged_skip": self.stats["circulation_merged"],
            "formula": "read ≈ imported_clean + flagged + empty_skipped + circulation_merged",
        }
        return report

    def _disable_audit_triggers(self, conn: psycopg.Connection) -> None:
        # Only audit (+ SCD history) — keep owner-basis / future-date guards (011 C2/C3).
        for trig, tbl in (
            ("trg_audit_party", "party"),
            ("trg_audit_client", "client"),
            ("trg_hist_client", "client"),
            ("trg_audit_cylinder", "cylinder"),
            ("trg_hist_cylinder", "cylinder"),
            ("trg_audit_battery", "cylinder_battery"),
            ("trg_audit_movement", "movement_event"),
            ("trg_audit_sale", "cylinder_sale"),
            ("trg_audit_loan", "supplier_loan_cycle"),
            ("trg_audit_transfer", "stock_transfer"),
            ("trg_audit_accrental", "accessory_rental"),
            ("trg_audit_accessory", "accessory"),
            ("trg_audit_rate", "rental_rate"),
        ):
            conn.execute(f"ALTER TABLE {tbl} DISABLE TRIGGER {trig}")

    def _enable_audit_triggers(self, conn: psycopg.Connection) -> None:
        for trig, tbl in (
            ("trg_audit_party", "party"),
            ("trg_audit_client", "client"),
            ("trg_hist_client", "client"),
            ("trg_audit_cylinder", "cylinder"),
            ("trg_hist_cylinder", "cylinder"),
            ("trg_audit_battery", "cylinder_battery"),
            ("trg_audit_movement", "movement_event"),
            ("trg_audit_sale", "cylinder_sale"),
            ("trg_audit_loan", "supplier_loan_cycle"),
            ("trg_audit_transfer", "stock_transfer"),
            ("trg_audit_accrental", "accessory_rental"),
            ("trg_audit_accessory", "accessory"),
            ("trg_audit_rate", "rental_rate"),
        ):
            conn.execute(f"ALTER TABLE {tbl} ENABLE TRIGGER {trig}")

    def _bootstrap(self, conn: psycopg.Connection) -> None:
        for row in conn.execute("SELECT id, name::text AS name FROM dispatch_territory"):
            self.territory_by_name[row["name"].casefold()] = row["id"]
        for row in conn.execute("SELECT id, name::text AS name FROM locality"):
            key = fold_locality_key(row["name"])
            if not key:
                continue
            self.locality_by_name[key] = row["id"]
            self._locality_display[key] = row["name"]
        for row in conn.execute(
            "SELECT id, display_name::text AS display_name, party_type::text AS party_type FROM party WHERE deleted_at IS NULL"
        ):
            self.party_by_name[row["display_name"].casefold()] = row["id"]
            self.party_type[row["id"]] = row["party_type"]
            if row["party_type"] in ("SUPPLIER", "SUBDISTRIBUTOR", "SELF"):
                self.origin_parties[row["display_name"].casefold()] = row["id"]
        for row in conn.execute("SELECT alias::text AS alias, gas_code FROM gas_alias"):
            self.gas_alias[row["alias"].casefold()] = row["gas_code"]
        for k, v in EXTRA_GAS_ALIASES.items():
            self.gas_alias.setdefault(k.casefold(), v)
        for row in conn.execute(
            "SELECT id, owner_party_id, serial_number::text AS serial_number FROM cylinder WHERE deleted_at IS NULL"
        ):
            self.cylinder_id[(row["owner_party_id"], row["serial_number"])] = row["id"]
            self._cyl_owner[row["id"]] = row["owner_party_id"]
        for row in conn.execute(
            """
            SELECT p.id, p.display_name::text AS display_name, c.territory_id
            FROM party p
            JOIN client c ON c.party_id = p.id
            WHERE p.deleted_at IS NULL AND c.deleted_at IS NULL
            """
        ):
            self._register_client(row["display_name"], row["id"], row["territory_id"])
        for row in conn.execute("SELECT request_id::text AS request_id FROM movement_event"):
            self._existing_request_ids.add(row["request_id"])
        for row in conn.execute(
            """
            SELECT c.serial_number::text AS serial_number, me.delivery_date
            FROM movement_event me
            JOIN cylinder c ON c.id = me.cylinder_id
            WHERE me.state <> 'VOID'
            """
        ):
            self._client_movement_keys.add((row["serial_number"], row["delivery_date"]))

    def _register_client(
        self, display_name: str, party_id: int, territory_id: int | None
    ) -> None:
        key = display_name.casefold()
        self.client_id[key] = party_id
        # Do not clobber SELF/SUPPLIER/SUBDISTRIBUTOR name keys — loan/cylinder
        # ownership resolves via party_by_name and must keep BR-07 owners.
        existing = self.party_by_name.get(key)
        if existing is None or self.party_type.get(existing) == "CUSTOMER":
            self.party_by_name[key] = party_id
        self.party_type[party_id] = "CUSTOMER"
        self.client_territory[party_id] = territory_id
        fold = fold_person_key(display_name)
        if fold:
            self.client_by_fold_territory[(fold, territory_id)] = party_id
            self.client_fold_index.setdefault(fold, [])
            if party_id not in self.client_fold_index[fold]:
                self.client_fold_index[fold].append(party_id)
            # Also index without territory for fallback resolve
            self.client_by_fold_territory.setdefault((fold, None), party_id)

    def _close_stale_opens(
        self, conn: psycopg.Connection, cyl_id: int, new_delivery: date
    ) -> int:
        """Close/truncate prior custody that blocks a later delivery.

        Handles:
        - OPEN rows with blank return (still-out in source, but later custody exists)
        - CLOSED/SOLD/LOST spans whose return extends past a later delivery
          (dirty long intervals in Excel that swallow intermediate rentals)
        """
        rows = conn.execute(
            """
            SELECT id, state, delivery_date, return_date
            FROM movement_event
            WHERE cylinder_id = %s
              AND state <> 'VOID'
              AND delivery_date < %s
              AND daterange(delivery_date, return_date, '[)') @> %s::date
            """,
            (cyl_id, new_delivery, new_delivery),
        ).fetchall()
        for row in rows:
            was_open = row["state"] == "OPEN" and row["return_date"] is None
            new_state = "CLOSED" if row["state"] == "OPEN" else row["state"]
            tag = "HEALED_STALE_OPEN" if was_open else "HEALED_TRUNCATE_SPAN"
            conn.execute(
                """
                UPDATE movement_event
                SET return_date = %s,
                    state = %s,
                    note = CASE
                      WHEN note IS NULL OR btrim(note) = '' THEN %s
                      WHEN note LIKE '%%' || %s || '%%' THEN note
                      ELSE note || '; ' || %s
                    END
                WHERE id = %s
                """,
                (new_delivery, new_state, tag, tag, tag, row["id"]),
            )
            self.stats["stale_open_healed" if was_open else "span_truncated"] += 1
        return len(rows)

    def _apply_return_from_circulation(
        self,
        conn: psycopg.Connection,
        movement_id: int,
        return_date: date | None,
    ) -> bool:
        """Enrich an open client-ledger movement with the return from the cylinder book."""
        if return_date is None:
            return False
        row = conn.execute(
            """
            SELECT delivery_date, return_date, state
            FROM movement_event
            WHERE id = %s
            """,
            (movement_id,),
        ).fetchone()
        if not row or row["return_date"] is not None:
            return False
        if return_date < row["delivery_date"]:
            return False
        new_state = "CLOSED" if row["state"] == "OPEN" else row["state"]
        conn.execute(
            """
            UPDATE movement_event
            SET return_date = %s,
                state = %s,
                note = CASE
                  WHEN note IS NULL OR btrim(note) = '' THEN 'CIRCULATION_RETURN_APPLIED'
                  WHEN note LIKE '%%CIRCULATION_RETURN_APPLIED%%' THEN note
                  ELSE note || '; CIRCULATION_RETURN_APPLIED'
                END
            WHERE id = %s AND return_date IS NULL
            """,
            (return_date, new_state, movement_id),
        )
        self.stats["circulation_return_applied"] += 1
        return True

    def _ensure_gas_aliases(self, conn: psycopg.Connection) -> None:
        for alias, code in EXTRA_GAS_ALIASES.items():
            conn.execute(
                """
                INSERT INTO gas_alias(alias, gas_code) VALUES (%s, %s)
                ON CONFLICT (alias) DO NOTHING
                """,
                (alias, code),
            )
            self.gas_alias[alias.casefold()] = code

    def _ensure_seed_parties(self, conn: psycopg.Connection) -> None:
        """Re-create schema seed suppliers/subdistributors if missing (post-purge)."""
        for party_type, names in (
            ("SUPPLIER", SEED_SUPPLIERS),
            ("SUBDISTRIBUTOR", SEED_SUBDISTRIBUTORS),
        ):
            for name in names:
                key = name.casefold()
                existing = self.origin_parties.get(key)
                if existing is not None and self.party_type.get(existing) == party_type:
                    continue
                try:
                    with self._sp(conn):
                        row = conn.execute(
                            """
                            INSERT INTO party(party_type, display_name)
                            VALUES (%s, %s)
                            RETURNING id
                            """,
                            (party_type, name),
                        ).fetchone()
                except psycopg.Error:
                    row = conn.execute(
                        """
                        SELECT id FROM party
                        WHERE party_type = %s
                          AND lower(display_name::text) = lower(%s)
                          AND deleted_at IS NULL
                        LIMIT 1
                        """,
                        (party_type, name),
                    ).fetchone()
                if not row:
                    continue
                pid = row["id"]
                self.party_by_name[key] = pid
                self.party_type[pid] = party_type
                self.origin_parties[key] = pid
                self.stats["seed_party_ensured"] += 1

    def _ensure_locality(
        self, conn: psycopg.Connection, name: str | None, territory_id: int | None
    ) -> int | None:
        """Resolve Excel locality text to a seeded/canonical locality id (BR-15).

        Never inserts raw street/phone/CPA junk as new locality rows.
        """
        if not name:
            return None
        known = list(self._locality_display.values())
        canonical = normalize_locality(name, known_names=known)
        if not canonical:
            return None
        key = fold_locality_key(canonical)
        if key in self.locality_by_name:
            return self.locality_by_name[key]
        if self.dry_run:
            return None
        row = conn.execute(
            """
            INSERT INTO locality(name, territory_id)
            VALUES (%s, %s)
            ON CONFLICT (name, province) DO UPDATE SET territory_id = COALESCE(locality.territory_id, EXCLUDED.territory_id)
            RETURNING id, name::text AS name
            """,
            (canonical, territory_id),
        ).fetchone()
        assert row
        self.locality_by_name[key] = row["id"]
        self._locality_display[key] = row["name"]
        return row["id"]

    def backfill_localities(self) -> dict[str, Any]:
        """Remap clients off garbage/alias localities onto canonical towns.

        Safe on a loaded DB: rewrites ``client.locality_id``, clears unrecoverable
        junk, and deletes orphan alias rows that no longer have clients.
        """
        with psycopg.connect(self.dsn, row_factory=dict_row) as conn:
            self._bootstrap(conn)
            localities = list(
                conn.execute("SELECT id, name::text AS name FROM locality")
            )
            known = [row["name"] for row in localities]
            remapped = 0
            cleared = 0
            deleted = 0
            unresolved: list[dict[str, Any]] = []

            preferred: dict[str, int] = {}
            for row in localities:
                canon = normalize_locality(row["name"], known_names=known)
                if canon is None:
                    continue
                key = fold_locality_key(canon)
                if key not in preferred or row["name"] == canon:
                    preferred[key] = row["id"]

            plan: list[tuple[int, int | None, str]] = []
            for row in localities:
                lid = row["id"]
                canon = normalize_locality(row["name"], known_names=known)
                if canon is None:
                    plan.append((lid, None, "clear"))
                    continue
                target_id = preferred.get(fold_locality_key(canon))
                if target_id is None:
                    unresolved.append({"id": lid, "name": row["name"], "canon": canon})
                    continue
                if target_id == lid:
                    continue
                plan.append((lid, target_id, canon))

            if self.dry_run:
                for lid, target_id, _action in plan:
                    n = conn.execute(
                        "SELECT count(*)::int AS n FROM client WHERE locality_id = %s AND deleted_at IS NULL",
                        (lid,),
                    ).fetchone()["n"]
                    if target_id is None:
                        cleared += n
                    else:
                        remapped += n
                return {
                    "mode": "backfill_localities",
                    "dry_run": True,
                    "clients_remapped": remapped,
                    "clients_cleared": cleared,
                    "orphan_localities_deleted": 0,
                    "unresolved": unresolved,
                    "plan_rows": len(plan),
                }

            with conn.transaction():
                conn.execute("SELECT set_config('app.source', 'migration', true)")
                for lid, target_id, _action in plan:
                    if target_id is None:
                        res = conn.execute(
                            """
                            UPDATE client SET locality_id = NULL, updated_at = now()
                            WHERE locality_id = %s AND deleted_at IS NULL
                            RETURNING party_id
                            """,
                            (lid,),
                        ).fetchall()
                        cleared += len(res)
                    else:
                        res = conn.execute(
                            """
                            UPDATE client SET locality_id = %s, updated_at = now()
                            WHERE locality_id = %s AND deleted_at IS NULL
                            RETURNING party_id
                            """,
                            (target_id, lid),
                        ).fetchall()
                        remapped += len(res)

                # Drop alias/junk localities that no longer have clients (keep seed rows
                # that normalize to themselves even with zero clients).
                for row in localities:
                    lid = row["id"]
                    canon = normalize_locality(row["name"], known_names=known)
                    is_canonical_row = (
                        canon is not None and row["name"] == canon
                    )
                    if is_canonical_row:
                        continue
                    still = conn.execute(
                        """
                        SELECT 1 FROM client
                        WHERE locality_id = %s AND deleted_at IS NULL
                        LIMIT 1
                        """,
                        (lid,),
                    ).fetchone()
                    if still:
                        continue
                    # Also skip if referenced by cylinder_sale snapshots only — those are text.
                    conn.execute("DELETE FROM locality WHERE id = %s", (lid,))
                    deleted += 1
                    self.stats["locality_orphan_deleted"] += 1

            return {
                "mode": "backfill_localities",
                "dry_run": False,
                "clients_remapped": remapped,
                "clients_cleared": cleared,
                "orphan_localities_deleted": deleted,
                "unresolved": unresolved,
            }

    def _self_party_id(self) -> int:
        for pid, pt in self.party_type.items():
            if pt == "SELF":
                return pid
        return self.party_by_name["nuestra empresa"]

    def _supplier_party_id(self, hint: str) -> int | None:
        """Resolve hint to a SUPPLIER/SUBDISTRIBUTOR party only (BR-07)."""
        key = hint.casefold()
        for table in (self.origin_parties, self.party_by_name):
            pid = table.get(key)
            if pid is not None and self.party_type.get(pid) in (
                "SUPPLIER",
                "SUBDISTRIBUTOR",
            ):
                return pid
        return None

    def _ensure_supplier(self, conn: psycopg.Connection, hint: str) -> int:
        """Return a SUPPLIER/SUBDISTRIBUTOR party id, creating the supplier if missing."""
        existing = self._supplier_party_id(hint)
        if existing is not None:
            return existing
        display = hint.strip() or "Nordelta"
        try:
            with self._sp(conn):
                row = conn.execute(
                    """
                    INSERT INTO party(party_type, display_name)
                    VALUES ('SUPPLIER', %s)
                    RETURNING id
                    """,
                    (display,),
                ).fetchone()
        except psycopg.Error:
            row = conn.execute(
                """
                SELECT id FROM party
                WHERE party_type IN ('SUPPLIER', 'SUBDISTRIBUTOR')
                  AND lower(display_name::text) = lower(%s)
                  AND deleted_at IS NULL
                LIMIT 1
                """,
                (display,),
            ).fetchone()
        if not row:
            raise RuntimeError(f"could not ensure supplier party for {display!r}")
        pid = row["id"]
        self.party_by_name[display.casefold()] = pid
        self.party_type[pid] = "SUPPLIER"
        self.origin_parties[display.casefold()] = pid
        self.stats["supplier_party_created"] += 1
        return pid

    def _owner_id(self, hint: str, *, basis: str | None = None) -> int:
        """Resolve owner party for a cylinder hint (BR-07-aware)."""
        if basis == "OURS":
            return self._self_party_id()
        if basis == "SUPPLIER":
            sid = self._supplier_party_id(hint)
            if sid is not None:
                return sid
            raise KeyError(f"supplier party not found for hint={hint!r}")
        key = hint.casefold()
        if key in self.party_by_name:
            return self.party_by_name[key]
        return self._self_party_id()

    def _load_cylinders(self, conn: psycopg.Connection, cylinders: list[StagedCylinder]) -> None:
        batteries: dict[str, StagedCylinder] = {}
        for cyl in cylinders:
            if cyl.packaging == "BATTERY":
                batteries[cyl.serial_number] = cyl

            if cyl.ownership_basis == "SUPPLIER":
                owner_id = self._ensure_supplier(conn, cyl.owner_hint)
            elif cyl.ownership_basis == "OURS":
                owner_id = self._self_party_id()
            else:
                owner_id = self._owner_id(cyl.owner_hint)
            key = (owner_id, cyl.serial_number)
            unit = cyl.capacity_unit if cyl.capacity_unit in ("M3", "KG") else "M3"
            parsed = sanitize_capacity(cyl.capacity_m3, unit)  # type: ignore[arg-type]
            capacity = parsed.value if parsed else None
            capacity_unit = parsed.unit if parsed else "M3"
            if key in self.cylinder_id:
                self.stats["cylinder_exists"] += 1
                self._maybe_backfill_capacity(
                    conn, self.cylinder_id[key], capacity, capacity_unit
                )
                continue

            gas_code, provisional, gas_reason = resolve_gas(cyl.gas_raw, self.gas_alias)
            if gas_reason and gas_code is None:
                self._flag(
                    conn,
                    cyl.workbook,
                    cyl.sheet,
                    "header",
                    gas_reason,
                    {"serial": cyl.serial_number, "gas_raw": cyl.gas_raw},
                )
            elif provisional and gas_reason:
                self._flag(
                    conn,
                    cyl.workbook,
                    cyl.sheet,
                    "header",
                    gas_reason,
                    {"serial": cyl.serial_number, "gas_raw": cyl.gas_raw, "mapped": gas_code},
                )

            packaging = cyl.packaging if cyl.packaging in ("SINGLE", "BATTERY", "BATTERY_MEMBER") else "SINGLE"
            battery_id = None
            if packaging == "BATTERY":
                bat = conn.execute(
                    """
                    SELECT id FROM cylinder_battery
                    WHERE owner_party_id = %s AND battery_code = %s AND deleted_at IS NULL
                    """,
                    (owner_id, cyl.battery_code or cyl.serial_number),
                ).fetchone()
                if not bat:
                    bat = conn.execute(
                        """
                        INSERT INTO cylinder_battery(battery_code, owner_party_id, gas_code, member_count)
                        VALUES (%s, %s, %s, %s)
                        RETURNING id
                        """,
                        (
                            cyl.battery_code or cyl.serial_number,
                            owner_id,
                            gas_code,
                            len(cyl.member_serials) or None,
                        ),
                    ).fetchone()
                battery_id = bat["id"] if bat else None

            try:
                with self._sp(conn):
                    row = conn.execute(
                        """
                        INSERT INTO cylinder(
                            owner_party_id, serial_number, gas_code, capacity_m3,
                            capacity_unit, ownership_basis, packaging, battery_id,
                            state, condition
                        ) VALUES (%s,%s,%s,%s,%s,%s,%s,%s,'IN_STOCK_EMPTY','EMPTY')
                        RETURNING id
                        """,
                        (
                            owner_id,
                            cyl.serial_number,
                            gas_code,
                            capacity,
                            capacity_unit,
                            cyl.ownership_basis,
                            packaging,
                            battery_id,
                        ),
                    ).fetchone()
            except psycopg.Error as e:
                existing = conn.execute(
                    """
                    SELECT id FROM cylinder
                    WHERE owner_party_id = %s AND serial_number = %s AND deleted_at IS NULL
                    """,
                    (owner_id, cyl.serial_number),
                ).fetchone()
                if existing:
                    row = existing
                    self.stats["cylinder_exists"] += 1
                    self._maybe_backfill_capacity(conn, existing["id"], capacity)
                else:
                    self._flag(
                        conn,
                        cyl.workbook,
                        cyl.sheet,
                        "header",
                        f"CYLINDER_INSERT_FAILED:{e}",
                        {"serial": cyl.serial_number},
                    )
                    continue

            if row:
                self.cylinder_id[key] = row["id"]
                self._cyl_owner[row["id"]] = owner_id
                self.stats["cylinder_inserted"] += 1
                self.stats["imported_clean"] += 1

            # Ensure member cylinders exist and link
            if cyl.member_serials and battery_id:
                for ms in cyl.member_serials:
                    mkey = (owner_id, ms)
                    if mkey not in self.cylinder_id:
                        try:
                            with self._sp(conn):
                                mrow = conn.execute(
                                    """
                                    INSERT INTO cylinder(
                                        owner_party_id, serial_number, gas_code, ownership_basis,
                                        packaging, battery_id, state, condition
                                    ) VALUES (%s,%s,%s,%s,'BATTERY_MEMBER',%s,'IN_STOCK_EMPTY','EMPTY')
                                    RETURNING id
                                    """,
                                    (owner_id, ms, gas_code, cyl.ownership_basis, battery_id),
                                ).fetchone()
                        except psycopg.Error:
                            mrow = conn.execute(
                                "SELECT id FROM cylinder WHERE owner_party_id=%s AND serial_number=%s AND deleted_at IS NULL",
                                (owner_id, ms),
                            ).fetchone()
                        if mrow:
                            self.cylinder_id[mkey] = mrow["id"]
                            self._cyl_owner[mrow["id"]] = owner_id
                    mid = self.cylinder_id.get(mkey)
                    if mid:
                        with self._sp(conn):
                            conn.execute(
                                """
                                INSERT INTO battery_member(battery_id, cylinder_id)
                                VALUES (%s, %s)
                                ON CONFLICT DO NOTHING
                                """,
                                (battery_id, mid),
                            )

    def _maybe_backfill_capacity(
        self,
        conn: psycopg.Connection,
        cylinder_id: int,
        capacity: float | None,
        capacity_unit: str = "M3",
    ) -> None:
        """Write capacity when missing, or replace prior garbage (non-known sizes)."""
        row = conn.execute(
            """
            SELECT capacity_m3, capacity_unit
            FROM cylinder WHERE id = %s AND deleted_at IS NULL
            """,
            (cylinder_id,),
        ).fetchone()
        if not row:
            return
        raw_current = float(row["capacity_m3"]) if row["capacity_m3"] is not None else None
        current_unit = row["capacity_unit"] or "M3"
        current_parsed = (
            sanitize_capacity(raw_current, current_unit)  # type: ignore[arg-type]
            if raw_current is not None
            else None
        )
        garbage = raw_current is not None and current_parsed is None

        if capacity is not None:
            if (
                current_parsed is not None
                and current_parsed.value == capacity
                and current_parsed.unit == capacity_unit
            ):
                return
            conn.execute(
                """
                UPDATE cylinder
                SET capacity_m3 = %s, capacity_unit = %s, updated_at = now()
                WHERE id = %s
                """,
                (capacity, capacity_unit, cylinder_id),
            )
            self.stats["cylinder_capacity_backfilled"] += 1
            return

        if garbage:
            conn.execute(
                "UPDATE cylinder SET capacity_m3 = NULL, updated_at = now() WHERE id = %s",
                (cylinder_id,),
            )
            self.stats["cylinder_capacity_cleared"] += 1

    def backfill_capacities(self, cylinders: list[StagedCylinder]) -> dict[str, Any]:
        """Re-parse PROPIOS capacities into an already-loaded DB (no truncate / movements)."""
        with psycopg.connect(self.dsn, row_factory=dict_row) as conn:
            self._bootstrap(conn)
            if self.dry_run:
                would = 0
                for cyl in cylinders:
                    unit = cyl.capacity_unit if cyl.capacity_unit in ("M3", "KG") else "M3"
                    parsed = sanitize_capacity(cyl.capacity_m3, unit)  # type: ignore[arg-type]
                    if parsed is None:
                        continue
                    if cyl.ownership_basis == "SUPPLIER":
                        owner_id = self._supplier_party_id(cyl.owner_hint) or -1
                    elif cyl.ownership_basis == "OURS":
                        owner_id = self._self_party_id()
                    else:
                        owner_id = self._owner_id(cyl.owner_hint)
                    cid = self.cylinder_id.get((owner_id, cyl.serial_number))
                    if cid is None:
                        matches = [
                            id_
                            for (_oid, s), id_ in self.cylinder_id.items()
                            if s == cyl.serial_number
                        ]
                        cid = matches[0] if len(matches) == 1 else None
                    if cid is not None:
                        would += 1
                self.stats["cylinder_capacity_backfilled"] = would
            else:
                with conn.transaction():
                    conn.execute("SELECT set_config('app.source', 'migration', true)")
                    for cyl in cylinders:
                        unit = (
                            cyl.capacity_unit
                            if cyl.capacity_unit in ("M3", "KG")
                            else "M3"
                        )
                        parsed = sanitize_capacity(
                            cyl.capacity_m3, unit  # type: ignore[arg-type]
                        )
                        capacity = parsed.value if parsed else None
                        capacity_unit = parsed.unit if parsed else "M3"
                        if cyl.ownership_basis == "SUPPLIER":
                            owner_id = self._supplier_party_id(cyl.owner_hint) or -1
                        elif cyl.ownership_basis == "OURS":
                            owner_id = self._self_party_id()
                        else:
                            owner_id = self._owner_id(cyl.owner_hint)
                        cid = self.cylinder_id.get((owner_id, cyl.serial_number))
                        if cid is None:
                            matches = [
                                id_
                                for (_oid, s), id_ in self.cylinder_id.items()
                                if s == cyl.serial_number
                            ]
                            cid = matches[0] if len(matches) == 1 else None
                        if cid is None:
                            self.stats["cylinder_capacity_unmatched"] += 1
                            continue
                        self._maybe_backfill_capacity(
                            conn, cid, capacity, capacity_unit
                        )

                    # Sales sheet METROS/KG column → cylinder master when still null.
                    sale_rows = conn.execute(
                        """
                        UPDATE cylinder c
                        SET capacity_m3 = s.capacity_m3,
                            capacity_unit = s.capacity_unit
                        FROM cylinder_sale s
                        WHERE s.cylinder_id = c.id
                          AND c.deleted_at IS NULL
                          AND c.capacity_m3 IS NULL
                          AND s.capacity_m3 IS NOT NULL
                          AND (
                            (s.capacity_unit = 'M3' AND s.capacity_m3::float IN (
                              1, 2, 3, 4, 4.5, 5, 6, 7, 8, 10, 20, 40
                            ))
                            OR
                            (s.capacity_unit = 'KG' AND s.capacity_m3::float IN (
                              5, 10, 15, 20, 25, 30, 40, 45, 50
                            ))
                          )
                        RETURNING c.id
                        """
                    ).fetchall()
                    self.stats["cylinder_capacity_from_sale"] += len(sale_rows)

                    # Sweep leftover garbage from the old parser (serials stored as m³).
                    cleared = conn.execute(
                        """
                        UPDATE cylinder
                        SET capacity_m3 = NULL
                        WHERE deleted_at IS NULL
                          AND capacity_m3 IS NOT NULL
                          AND NOT (
                            (capacity_unit = 'M3' AND capacity_m3::float IN (
                              1, 2, 3, 4, 4.5, 5, 6, 7, 8, 10, 20, 40
                            ))
                            OR
                            (capacity_unit = 'KG' AND capacity_m3::float IN (
                              5, 10, 15, 20, 25, 30, 40, 45, 50
                            ))
                          )
                        RETURNING id
                        """
                    ).fetchall()
                    self.stats["cylinder_capacity_cleared"] += len(cleared)

        return {
            "dry_run": self.dry_run,
            "mode": "backfill_capacity",
            "counts": dict(self.stats),
            "cylinders_parsed": len(cylinders),
            "with_capacity": sum(
                1
                for c in cylinders
                if sanitize_capacity(
                    c.capacity_m3,
                    c.capacity_unit if c.capacity_unit in ("M3", "KG") else "M3",  # type: ignore[arg-type]
                )
                is not None
            ),
        }

    def _load_clients(self, conn: psycopg.Connection, clients: list[StagedClient]) -> None:
        for cl in clients:
            key = cl.display_name.casefold()
            if cl.is_subdistributor:
                # already seeded as SUBDISTRIBUTOR parties
                if key in self.party_by_name:
                    self.stats["subdist_linked"] += 1
                    continue

            territory_id = self.territory_by_name.get((cl.territory or "").casefold())
            if territory_id is None and cl.territory:
                # normalize accents
                for tname, tid in self.territory_by_name.items():
                    if tname.startswith(cl.territory[:4].casefold()):
                        territory_id = tid
                        break

            # Same display name already imported — usually idempotent re-run.
            # Spec 011 edge case: same name may legitimately exist in both territories.
            if key in self.client_id:
                existing_id = self.client_id[key]
                existing_tid = self.client_territory.get(existing_id)
                if (
                    territory_id is not None
                    and existing_tid is not None
                    and territory_id != existing_tid
                ):
                    disambiguated = f"{cl.display_name} ({cl.territory})"
                    dkey = disambiguated.casefold()
                    if dkey in self.client_id:
                        self.stats["client_exists"] += 1
                        continue
                    self._flag(
                        conn,
                        cl.workbook,
                        cl.sheet,
                        "header",
                        "CROSS_TERRITORY_NAME_COLLISION",
                        {
                            "name": cl.display_name,
                            "territory": cl.territory,
                            "existing_party_id": existing_id,
                            "imported_as": disambiguated,
                        },
                    )
                    cl = StagedClient(
                        workbook=cl.workbook,
                        sheet=cl.sheet,
                        display_name=disambiguated,
                        territory=cl.territory,
                        address=cl.address,
                        locality=cl.locality,
                        cuit=cl.cuit,
                        phones=cl.phones,
                        coverage=cl.coverage,
                        is_subdistributor=cl.is_subdistributor,
                    )
                    key = dkey
                else:
                    # Refresh coverage from authoritative sheet header (fixes bare-"municipal").
                    if cl.coverage:
                        conn.execute(
                            "UPDATE client SET coverage = %s WHERE party_id = %s AND deleted_at IS NULL",
                            (cl.coverage, existing_id),
                        )
                    # Heal alias/junk localities on re-import (BR-15).
                    locality_id = self._ensure_locality(conn, cl.locality, territory_id)
                    if locality_id is not None:
                        conn.execute(
                            """
                            UPDATE client SET locality_id = %s, updated_at = now()
                            WHERE party_id = %s AND deleted_at IS NULL
                              AND locality_id IS DISTINCT FROM %s
                            """,
                            (locality_id, existing_id, locality_id),
                        )
                        self.stats["client_locality_refreshed"] += 1
                    self.stats["client_exists"] += 1
                    continue

            locality_id = self._ensure_locality(conn, cl.locality, territory_id)

            # CUIT may be invalid format — store null + flag
            cuit = cl.cuit
            if cuit:
                # schema CHECK: ^\d{2}-\d{8}-\d$
                import re

                if not re.match(r"^\d{2}-\d{8}-\d$", cuit):
                    self._flag(
                        conn,
                        cl.workbook,
                        cl.sheet,
                        "header",
                        "BAD_CUIT_FORMAT",
                        {"cuit": cuit},
                    )
                    cuit = None

            try:
                with self._sp(conn):
                    prow = conn.execute(
                        """
                        INSERT INTO party(party_type, display_name)
                        VALUES ('CUSTOMER', %s)
                        RETURNING id
                        """,
                        (cl.display_name,),
                    ).fetchone()
            except psycopg.Error:
                # unique (party_type, display_name)
                prow = conn.execute(
                    """
                    SELECT id FROM party
                    WHERE party_type = 'CUSTOMER' AND display_name = %s AND deleted_at IS NULL
                    """,
                    (cl.display_name,),
                ).fetchone()
            if not prow:
                self._flag(
                    conn, cl.workbook, cl.sheet, "header", "CLIENT_PARTY_FAILED", {"name": cl.display_name}
                )
                continue
            party_id = prow["id"]

            try:
                with self._sp(conn):
                    conn.execute(
                        """
                        INSERT INTO client(
                            party_id, legal_name, cuit, cuit_valid, address_street,
                            locality_id, territory_id, coverage, status
                        ) VALUES (%s,%s,%s,%s,%s,%s,%s,%s,'ACTIVE')
                        ON CONFLICT (party_id) DO UPDATE SET
                            coverage = EXCLUDED.coverage,
                            territory_id = COALESCE(client.territory_id, EXCLUDED.territory_id),
                            address_street = COALESCE(client.address_street, EXCLUDED.address_street),
                            locality_id = COALESCE(client.locality_id, EXCLUDED.locality_id)
                        """,
                        (
                            party_id,
                            cl.display_name,
                            cuit,
                            bool(cuit),
                            cl.address,
                            locality_id,
                            territory_id,
                            cl.coverage,
                        ),
                    )
            except psycopg.Error as e:
                # duplicate CUIT
                self._flag(
                    conn,
                    cl.workbook,
                    cl.sheet,
                    "header",
                    f"CLIENT_INSERT_FAILED:{type(e).__name__}",
                    {"name": cl.display_name, "cuit": cuit, "err": str(e)},
                )
                # retry without cuit
                with self._sp(conn):
                    conn.execute(
                        """
                        INSERT INTO client(
                            party_id, legal_name, address_street, locality_id, territory_id, coverage, status
                        ) VALUES (%s,%s,%s,%s,%s,%s,'ACTIVE')
                        ON CONFLICT (party_id) DO NOTHING
                        """,
                        (party_id, cl.display_name, cl.address, locality_id, territory_id, cl.coverage),
                    )

            self._register_client(cl.display_name, party_id, territory_id)
            # Alias the bare sheet name to this party when disambiguated, but only
            # for territory-aware resolve (exact key stays on first territory).
            if cl.display_name != cl.sheet and fold_person_key(cl.sheet):
                fold = fold_person_key(cl.sheet)
                self.client_by_fold_territory[(fold, territory_id)] = party_id
            self.stats["client_inserted"] += 1
            self.stats["imported_clean"] += 1

            for i, phone in enumerate(cl.phones[:3]):
                conn.execute(
                    """
                    INSERT INTO client_contact(client_party_id, phone, is_primary)
                    VALUES (%s, %s, %s)
                    """,
                    (party_id, phone, i == 0),
                )

    def _resolve_holder(self, name: str, territory: str | None = None) -> int | None:
        key = name.casefold().strip()
        if not key:
            return None

        territory_id = None
        if territory:
            territory_id = self.territory_by_name.get(territory.casefold())
            if territory_id is None and len(territory) >= 4:
                for tname, tid in self.territory_by_name.items():
                    if tname.startswith(territory[:4].casefold()):
                        territory_id = tid
                        break

        fold = fold_person_key(name)
        if fold and territory_id is not None:
            hit = self.client_by_fold_territory.get((fold, territory_id))
            if hit is not None:
                return hit
            # Disambiguated import: "NAME (Territory)"
            dis_key = f"{name} ({territory})".casefold()
            if dis_key in self.client_id:
                return self.client_id[dis_key]

        if key in self.client_id:
            return self.client_id[key]
        if fold and fold in self.client_fold_index:
            candidates = self.client_fold_index[fold]
            if territory_id is not None:
                for cid in candidates:
                    if self.client_territory.get(cid) == territory_id:
                        return cid
            return candidates[0]
        if key in self.party_by_name:
            return self.party_by_name[key]

        tokens = person_token_set(name)
        if tokens:
            best_id: int | None = None
            best_score = 0.0
            for fold_key, ids in self.client_fold_index.items():
                ct = person_token_set(fold_key)
                if not ct:
                    continue
                inter = len(tokens & ct)
                if inter == 0:
                    continue
                # Require solid overlap to avoid false merges (e.g. single short token).
                if inter == 1:
                    only = next(iter(tokens & ct))
                    if len(only) < 5 or (len(tokens) > 1 and len(ct) > 1):
                        continue
                score = inter / max(len(tokens), len(ct))
                if score < 0.5:
                    continue
                # Prefer same territory when known
                for cid in ids:
                    adj = score
                    if territory_id is not None and self.client_territory.get(cid) == territory_id:
                        adj += 0.05
                    if adj > best_score:
                        best_score = adj
                        best_id = cid
            if best_id is not None:
                return best_id

        # Legacy fuzzy: startswith / contains with length guard
        for cname, cid in self.client_id.items():
            cf = fold_person_key(cname)
            if not fold or not cf:
                continue
            if cf.startswith(fold) or fold.startswith(cf) or fold in cf or cf in fold:
                if abs(len(cf) - len(fold)) <= 8:
                    return cid
        return None

    def _looks_like_person_holder(self, name: str) -> bool:
        s = (name or "").strip()
        if len(s) < 3:
            return False
        low = s.casefold()
        if low in {"unknown", "x", "xx", "xxx", "????", "n/a", "na"}:
            return False
        if is_noise_holder_name(s):
            return False
        return True

    def _ensure_provisional_client(
        self,
        conn: psycopg.Connection,
        name: str,
        territory: str | None = None,
        workbook: str = "PROPIOS",
        sheet: str = "",
        row_ref: str = "circulation",
    ) -> int | None:
        """Create a reviewable client for circulation-only holders (011 C1)."""
        if not self._looks_like_person_holder(name):
            return None
        existing = self._resolve_holder(name, territory)
        if existing is not None:
            return existing

        territory_id = self.territory_by_name.get((territory or "Junín").casefold())
        if territory_id is None:
            territory_id = self.territory_by_name.get("junín") or self.territory_by_name.get("junin")
        # Prefer first active delivery territory
        if territory_id is None:
            territory_id = next(iter(self.territory_by_name.values()), None)

        display = name.strip()
        coverage = coverage_from_holder_name(display)
        # Unique display_name — suffix if collision
        base = display
        attempt = display
        n = 2
        while attempt.casefold() in self.client_id or attempt.casefold() in self.party_by_name:
            attempt = f"{base} (circulación {n})"
            n += 1
            if n > 20:
                return None
        display = attempt

        try:
            with self._sp(conn):
                prow = conn.execute(
                    """
                    INSERT INTO party(party_type, display_name)
                    VALUES ('CUSTOMER', %s)
                    RETURNING id
                    """,
                    (display,),
                ).fetchone()
        except psycopg.Error:
            prow = conn.execute(
                """
                SELECT id FROM party
                WHERE party_type = 'CUSTOMER' AND display_name = %s AND deleted_at IS NULL
                """,
                (display,),
            ).fetchone()
        if not prow:
            return None
        party_id = prow["id"]
        with self._sp(conn):
            conn.execute(
                """
                INSERT INTO client(
                    party_id, legal_name, territory_id, coverage, status, delivery_instructions
                ) VALUES (%s,%s,%s,%s,'ACTIVE',%s)
                ON CONFLICT (party_id) DO NOTHING
                """,
                (
                    party_id,
                    display,
                    territory_id,
                    coverage,
                    "Provisional: created from CILINDROS PROPIOS holder text — review/merge",
                ),
            )
        self._register_client(display, party_id, territory_id)
        # Also index original holder spelling
        fold = fold_person_key(name)
        if fold:
            self.client_by_fold_territory[(fold, territory_id)] = party_id
            self.client_fold_index.setdefault(fold, [])
            if party_id not in self.client_fold_index[fold]:
                self.client_fold_index[fold].append(party_id)
        self._flag(
            conn,
            workbook,
            sheet or display,
            row_ref,
            "CLIENT_PROVISIONAL_FROM_CIRCULATION",
            {"name": name, "imported_as": display, "party_id": party_id, "coverage": coverage},
        )
        self.stats["client_provisional"] += 1
        self.stats["client_inserted"] += 1
        return party_id

    def _ensure_customer_cylinder(
        self,
        conn: psycopg.Connection,
        holder_id: int,
        serial: str,
        gas_code: str | None,
    ) -> int | None:
        key = (holder_id, serial)
        if key in self.cylinder_id:
            return self.cylinder_id[key]
        # Prefer an existing OURS/SUPPLIER cylinder with this serial if present
        for (oid, s), cid in list(self.cylinder_id.items()):
            if s == serial:
                return cid
        row = None
        try:
            with self._sp(conn):
                row = conn.execute(
                    """
                    INSERT INTO cylinder(
                        owner_party_id, serial_number, gas_code, ownership_basis,
                        packaging, state, condition
                    ) VALUES (%s,%s,%s,'CUSTOMER','SINGLE','AT_CLIENT','EMPTY')
                    RETURNING id
                    """,
                    (holder_id, serial, gas_code),
                ).fetchone()
        except psycopg.Error:
            row = conn.execute(
                "SELECT id FROM cylinder WHERE owner_party_id=%s AND serial_number=%s AND deleted_at IS NULL",
                (holder_id, serial),
            ).fetchone()
        if row:
            self.cylinder_id[key] = row["id"]
            self._cyl_owner[row["id"]] = holder_id
            self.stats["customer_cylinder_created"] += 1
            return row["id"]
        return None

    def _find_cylinder(
        self,
        conn: psycopg.Connection,
        serial: str,
        pane: str,
        holder_id: int | None,
        gas_code: str | None,
    ) -> int | None:
        # Prefer SELF-owned, then any supplier, then customer
        self_id = self._self_party_id()
        if (self_id, serial) in self.cylinder_id:
            return self.cylinder_id[(self_id, serial)]
        matches = [(oid, cid) for (oid, s), cid in self.cylinder_id.items() if s == serial]
        if matches:
            # Prefer SUPPLIER owners for rental if not ours
            for oid, cid in matches:
                if self.party_type.get(oid) == "SUPPLIER":
                    return cid
            return matches[0][1]
        if pane == "REFILL" and holder_id:
            return self._ensure_customer_cylinder(conn, holder_id, serial, gas_code)
        # Unknown serial on RENTAL — create under SELF so movement can land (or flag)
        if pane in ("RENTAL", "SALE", "LOAN", "SUBDIST"):
            try:
                with self._sp(conn):
                    row = conn.execute(
                        """
                        INSERT INTO cylinder(
                            owner_party_id, serial_number, gas_code, ownership_basis,
                            packaging, state, condition
                        ) VALUES (%s,%s,%s,'OURS','SINGLE','IN_STOCK_EMPTY','EMPTY')
                        RETURNING id
                        """,
                        (self_id, serial, gas_code),
                    ).fetchone()
            except psycopg.Error:
                row = conn.execute(
                    "SELECT id FROM cylinder WHERE owner_party_id=%s AND serial_number=%s AND deleted_at IS NULL",
                    (self_id, serial),
                ).fetchone()
            if row:
                self.cylinder_id[(self_id, serial)] = row["id"]
                self._cyl_owner[row["id"]] = self_id
                self.stats["ours_cylinder_created_from_ledger"] += 1
                return row["id"]
        return None

    def _load_movements(self, conn: psycopg.Connection, movements: list[StagedMovement]) -> None:
        # Process client-ledger movements first, then circulation (merge-only), then sales/loans
        order = {"RENTAL": 0, "REFILL": 0, "ACCESSORY": 1, "SALE": 2, "LOAN": 3, "CIRCULATION": 4}
        ordered = sorted(movements, key=lambda m: (order.get(m.pane, 9), m.delivery_date or date.min))

        for mv in ordered:
            if mv.pane == "CIRCULATION":
                self._merge_circulation(conn, mv)
                continue
            if mv.pane == "ACCESSORY":
                self._load_accessory(conn, mv)
                continue
            if mv.pane == "SALE":
                self._load_sale(conn, mv)
                continue
            if mv.pane == "LOAN":
                self._load_loan(conn, mv)
                continue

            self._insert_ledger_movement(conn, mv)

    def _insert_ledger_movement(self, conn: psycopg.Connection, mv: StagedMovement) -> None:
        holder_id = self._resolve_holder(mv.holder_name, mv.territory)
        if holder_id is None:
            self._flag(
                conn,
                mv.workbook,
                mv.sheet,
                mv.row_ref,
                "UNKNOWN_HOLDER",
                {"holder": mv.holder_name, "serials": mv.serials},
            )
            return

        gas_code, provisional, gas_reason = resolve_gas(mv.gas_raw, self.gas_alias)
        if gas_reason and gas_code is None:
            self._flag(
                conn,
                mv.workbook,
                mv.sheet,
                mv.row_ref,
                gas_reason,
                {"gas_raw": mv.gas_raw, "serials": mv.serials},
            )
            return
        if provisional and gas_reason:
            self._flag(
                conn,
                mv.workbook,
                mv.sheet,
                mv.row_ref,
                gas_reason,
                {"gas_raw": mv.gas_raw, "mapped": gas_code},
            )

        group_id = uuid.uuid4() if len(mv.serials) > 1 else None
        origin_id = None
        if mv.origin_hint:
            origin_id = self.origin_parties.get(mv.origin_hint.casefold())

        # Use cached owner map (maintained as cylinders are inserted).
        for serial in mv.serials:
            cyl_id = self._find_cylinder(conn, serial, mv.pane, holder_id, gas_code)
            if cyl_id is None:
                self._flag(
                    conn,
                    mv.workbook,
                    mv.sheet,
                    mv.row_ref,
                    "CYLINDER_NOT_FOUND",
                    {"serial": serial, "holder": mv.holder_name},
                )
                continue

            if mv.pane == "REFILL":
                movement_kind = "REFILL"
                property_basis = "CUSTOMER"
            else:
                movement_kind = "RENTAL"
                owner_basis = "OURS"
                oid = self._cyl_owner.get(cyl_id)
                if oid is not None:
                    pt = self.party_type.get(oid, "SELF")
                    if pt in ("SUPPLIER", "SUBDISTRIBUTOR"):
                        owner_basis = "SUPPLIER"
                    elif pt == "CUSTOMER":
                        owner_basis = "CUSTOMER"
                        movement_kind = "REFILL"
                property_basis = owner_basis

            swap_id = None
            if mv.swap_with:
                swap_id = self._find_cylinder(conn, mv.swap_with, "RENTAL", holder_id, gas_code)

            state = "CLOSED" if mv.return_date else "OPEN"
            if mv.swap_with:
                state = "SWAPPED"
            note = mv.note
            if note and "perdido" in note.casefold():
                state = "LOST"
            if note and "vendido" in note.casefold():
                state = "SOLD"

            assert mv.delivery_date is not None
            rid = request_id_for(
                mv.workbook, mv.sheet, mv.row_ref, serial, mv.delivery_date.isoformat()
            )
            if str(rid) in self._existing_request_ids:
                self.stats["movement_idempotent_skip"] += 1
                self._client_movement_keys.add((serial, mv.delivery_date))
                continue

            same_day = conn.execute(
                """
                SELECT id, return_date FROM movement_event
                WHERE cylinder_id = %s AND delivery_date = %s AND state <> 'VOID'
                LIMIT 1
                """,
                (cyl_id, mv.delivery_date),
            ).fetchone()
            if same_day:
                if mv.return_date and same_day["return_date"] is None:
                    self._apply_return_from_circulation(conn, same_day["id"], mv.return_date)
                self.stats["movement_same_day_skip"] += 1
                self._client_movement_keys.add((serial, mv.delivery_date))
                continue

            try:
                with self._sp(conn):
                    self._close_stale_opens(conn, cyl_id, mv.delivery_date)
                    conn.execute(
                        """
                        INSERT INTO movement_event(
                            request_id, cylinder_id, holder_party_id, movement_kind,
                            property_basis, gas_code, delivery_date, return_date,
                            origin_party_id, swap_with_cyl_id, state, note,
                            movement_group_id
                        ) VALUES (
                            %s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s
                        )
                        """,
                        (
                            rid,
                            cyl_id,
                            holder_id,
                            movement_kind,
                            property_basis,
                            gas_code,
                            mv.delivery_date,
                            mv.return_date,
                            origin_id,
                            swap_id,
                            state,
                            note,
                            group_id,
                        ),
                    )
                    if state == "OPEN":
                        conn.execute(
                            "UPDATE cylinder SET state='AT_CLIENT', condition='FULL' WHERE id=%s",
                            (cyl_id,),
                        )
                    elif state == "SOLD":
                        conn.execute("UPDATE cylinder SET state='SOLD' WHERE id=%s", (cyl_id,))
                    elif state == "LOST":
                        conn.execute("UPDATE cylinder SET state='LOST' WHERE id=%s", (cyl_id,))
                self._existing_request_ids.add(str(rid))
                self._client_movement_keys.add((serial, mv.delivery_date))
                self.stats["movement_inserted"] += 1
                self.stats["imported_clean"] += 1
                if self.stats["movement_inserted"] % 5000 == 0:
                    print(
                        f"  … movements inserted: {self.stats['movement_inserted']}",
                        flush=True,
                    )
            except psycopg.Error as e:
                reason = "MOVEMENT_CONSTRAINT"
                msg = str(e).lower()
                if "ex_move_no_overlap" in msg or "exclusion" in msg or "23p01" in msg:
                    reason = "OVERLAPPING_CUSTODY"
                elif "ck_move" in msg or "23514" in msg:
                    reason = "MOVEMENT_CHECK_FAILED"
                self._flag(
                    conn,
                    mv.workbook,
                    mv.sheet,
                    mv.row_ref,
                    f"{reason}:{e.__class__.__name__}",
                    {
                        "serial": serial,
                        "delivery": mv.delivery_date.isoformat() if mv.delivery_date else None,
                        "return": mv.return_date.isoformat() if mv.return_date else None,
                        "err": str(e)[:300],
                    },
                )

    def _merge_circulation(self, conn: psycopg.Connection, mv: StagedMovement) -> None:
        """011 R3 / AC2: do not create duplicates; count as merged if client row exists."""
        serial = mv.serials[0] if mv.serials else None
        if not serial or not mv.delivery_date:
            self._flag(
                conn, mv.workbook, mv.sheet, mv.row_ref, "CIRCULATION_INCOMPLETE", mv.raw
            )
            return
        key = (serial, mv.delivery_date)
        if key in self._client_movement_keys:
            row = conn.execute(
                """
                SELECT me.id FROM movement_event me
                JOIN cylinder c ON c.id = me.cylinder_id
                WHERE c.serial_number = %s AND me.delivery_date = %s AND me.state <> 'VOID'
                LIMIT 1
                """,
                (serial, mv.delivery_date),
            ).fetchone()
            if row:
                self._apply_return_from_circulation(conn, row["id"], mv.return_date)
            self.stats["circulation_merged"] += 1
            return
        # Also check DB for an existing movement that day
        row = conn.execute(
            """
            SELECT me.id FROM movement_event me
            JOIN cylinder c ON c.id = me.cylinder_id
            WHERE c.serial_number = %s AND me.delivery_date = %s AND me.state <> 'VOID'
            LIMIT 1
            """,
            (serial, mv.delivery_date),
        ).fetchone()
        if row:
            self._apply_return_from_circulation(conn, row["id"], mv.return_date)
            self.stats["circulation_merged"] += 1
            self._client_movement_keys.add(key)
            return
        # No client-ledger counterpart — quarantine (don't invent holder from free text alone
        # when holder can't be resolved; if resolvable, import as gap-fill).
        holder_id = self._resolve_holder(mv.holder_name, mv.territory)
        if holder_id is None:
            holder_id = self._ensure_provisional_client(
                conn,
                mv.holder_name,
                territory=mv.territory,
                workbook=mv.workbook,
                sheet=mv.sheet,
                row_ref=mv.row_ref,
            )
        if holder_id is None:
            self._flag(
                conn,
                mv.workbook,
                mv.sheet,
                mv.row_ref,
                "CIRCULATION_NO_CLIENT_MATCH",
                {"serial": serial, "holder": mv.holder_name, "delivery": mv.delivery_date.isoformat()},
            )
            return
        # Gap-fill from cylinder book when holder resolves (still one event).
        gap = StagedMovement(
            workbook=mv.workbook,
            sheet=mv.sheet,
            row_ref=mv.row_ref + ":GAP",
            pane="RENTAL",
            holder_name=mv.holder_name,
            serials=mv.serials,
            delivery_date=mv.delivery_date,
            return_date=mv.return_date,
            gas_raw=mv.gas_raw,
            flags=mv.flags + ["GAP_FILL_FROM_CIRCULATION"],
            raw=mv.raw,
            territory=mv.territory,
        )
        self._insert_ledger_movement(conn, gap)
        self.stats["circulation_gap_fill"] += 1

    def _load_accessory(self, conn: psycopg.Connection, mv: StagedMovement) -> None:
        holder_id = self._resolve_holder(mv.holder_name, mv.territory)
        if holder_id is None or mv.delivery_date is None or not mv.accessory_type:
            self._flag(
                conn,
                mv.workbook,
                mv.sheet,
                mv.row_ref,
                "ACCESSORY_UNPARSEABLE",
                {"holder": mv.holder_name, "note": mv.note},
            )
            return
        self_id = self._self_party_id()
        acc = conn.execute(
            """
            INSERT INTO accessory(accessory_type, owner_party_id, state)
            VALUES (%s, %s, 'ON_LOAN')
            RETURNING id
            """,
            (mv.accessory_type, self_id),
        ).fetchone()
        assert acc
        state = "RETURNED" if mv.return_date else "ON_LOAN"
        try:
            with self._sp(conn):
                conn.execute(
                    """
                    INSERT INTO accessory_rental(
                        accessory_id, client_party_id, start_date, end_date, state, note, charge_basis
                    ) VALUES (%s,%s,%s,%s,%s,%s,'RENTAL')
                    """,
                    (acc["id"], holder_id, mv.delivery_date, mv.return_date, state, mv.note),
                )
            self.stats["accessory_inserted"] += 1
            self.stats["imported_clean"] += 1
        except psycopg.Error as e:
            self._flag(
                conn,
                mv.workbook,
                mv.sheet,
                mv.row_ref,
                f"ACCESSORY_INSERT_FAILED:{e.__class__.__name__}",
                {"err": str(e)[:200]},
            )

    def _load_sale(self, conn: psycopg.Connection, mv: StagedMovement) -> None:
        serial = mv.serials[0]
        gas_code, _, gas_reason = resolve_gas(mv.gas_raw, self.gas_alias)
        if gas_reason and gas_code is None:
            self._flag(conn, mv.workbook, mv.sheet, mv.row_ref, gas_reason, {"gas": mv.gas_raw})
        cyl_id = self._find_cylinder(conn, serial, "SALE", None, gas_code)
        if cyl_id is None:
            self._flag(
                conn, mv.workbook, mv.sheet, mv.row_ref, "SALE_CYLINDER_MISSING", {"serial": serial}
            )
            return
        holder_id = self._resolve_holder(mv.holder_name)
        unit = mv.capacity_unit if mv.capacity_unit in ("M3", "KG") else "M3"
        parsed = sanitize_capacity(mv.capacity_m3, unit)  # type: ignore[arg-type]
        capacity = parsed.value if parsed else None
        capacity_unit = parsed.unit if parsed else "M3"
        if mv.capacity_m3 is not None and capacity is None and mv.capacity_m3 >= 1000:
            self._flag(
                conn,
                mv.workbook,
                mv.sheet,
                mv.row_ref,
                "SALE_CAPACITY_OVERFLOW",
                {"serial": serial, "capacity": mv.capacity_m3},
            )
        try:
            with self._sp(conn):
                conn.execute(
                    """
                    INSERT INTO cylinder_sale(
                        cylinder_id, client_party_id, sale_date, gas_code, capacity_m3,
                        capacity_unit, address_snapshot, locality_snapshot, phone_snapshot
                    ) VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s)
                    ON CONFLICT (cylinder_id) DO NOTHING
                    """,
                    (
                        cyl_id,
                        holder_id,
                        mv.delivery_date,
                        gas_code,
                        capacity,
                        capacity_unit,
                        mv.sale_address,
                        mv.sale_locality,
                        mv.sale_phone,
                    ),
                )
                conn.execute("UPDATE cylinder SET state='SOLD' WHERE id=%s", (cyl_id,))
                if capacity is not None:
                    self._maybe_backfill_capacity(conn, cyl_id, capacity, capacity_unit)
            self.stats["sale_inserted"] += 1
            self.stats["imported_clean"] += 1
        except psycopg.Error as e:
            self._flag(
                conn,
                mv.workbook,
                mv.sheet,
                mv.row_ref,
                f"SALE_FAILED:{e.__class__.__name__}",
                {"err": str(e)[:200]},
            )

    def _load_loan(self, conn: psycopg.Connection, mv: StagedMovement) -> None:
        serial = mv.serials[0]
        gas_code, _, _ = resolve_gas(mv.gas_raw, self.gas_alias)
        supplier_id = self._ensure_supplier(conn, mv.supplier_hint or "Nordelta")
        # Ensure supplier-owned cylinder (savepoint: BR-07 must not abort the txn)
        key = (supplier_id, serial)
        if key not in self.cylinder_id:
            row = None
            try:
                with self._sp(conn):
                    row = conn.execute(
                        """
                        INSERT INTO cylinder(
                            owner_party_id, serial_number, gas_code, ownership_basis,
                            packaging, state, condition
                        ) VALUES (%s,%s,%s,'SUPPLIER','SINGLE','AT_SUPPLIER','FULL')
                        RETURNING id
                        """,
                        (supplier_id, serial, gas_code),
                    ).fetchone()
            except psycopg.Error as e:
                row = conn.execute(
                    "SELECT id FROM cylinder WHERE owner_party_id=%s AND serial_number=%s AND deleted_at IS NULL",
                    (supplier_id, serial),
                ).fetchone()
                if row is None:
                    self._flag(
                        conn,
                        mv.workbook,
                        mv.sheet,
                        mv.row_ref,
                        f"LOAN_CYLINDER_INSERT_FAILED:{e.__class__.__name__}",
                        {
                            "serial": serial,
                            "supplier": mv.supplier_hint,
                            "err": str(e)[:200],
                        },
                    )
            if row:
                self.cylinder_id[key] = row["id"]
                self._cyl_owner[row["id"]] = supplier_id
        cyl_id = self.cylinder_id.get(key) or self._find_cylinder(conn, serial, "LOAN", None, gas_code)
        if cyl_id is None:
            self._flag(conn, mv.workbook, mv.sheet, mv.row_ref, "LOAN_CYLINDER_MISSING", {"serial": serial})
            return
        client_id = self._resolve_holder(mv.holder_name, mv.territory)
        stage = "RECEIVED"
        if mv.returned_to_supplier:
            stage = "RETURNED_TO_SUPPLIER"
        elif mv.return_date:
            stage = "BACK_FROM_CLIENT"
        elif mv.delivery_date:
            stage = "OUT_TO_CLIENT"
        try:
            with self._sp(conn):
                conn.execute(
                    """
                    INSERT INTO supplier_loan_cycle(
                        cylinder_id, supplier_party_id, client_party_id, gas_code,
                        received_from_supplier, delivered_to_client,
                        returned_by_client, returned_to_supplier, stage
                    ) VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s)
                    """,
                    (
                        cyl_id,
                        supplier_id,
                        client_id,
                        gas_code,
                        mv.received_from_supplier,
                        mv.delivery_date,
                        mv.return_date,
                        mv.returned_to_supplier,
                        stage,
                    ),
                )
            self.stats["loan_inserted"] += 1
            self.stats["imported_clean"] += 1
        except psycopg.Error as e:
            self._flag(
                conn,
                mv.workbook,
                mv.sheet,
                mv.row_ref,
                f"LOAN_FAILED:{e.__class__.__name__}",
                {"err": str(e)[:200]},
            )

    def _sp(self, conn: psycopg.Connection, name: str = "mig"):
        """Context-manager-like savepoint helpers for per-row isolation (011 C1)."""
        return _Savepoint(conn, name)

    def _flag(
        self,
        conn: psycopg.Connection,
        workbook: str,
        sheet: str,
        row_ref: str,
        reason: str,
        raw: dict[str, Any],
    ) -> None:
        self.stats["flagged"] += 1
        base_reason = reason.split(":")[0]
        self.reason_counts[base_reason] += 1
        if self.dry_run:
            return
        conn.execute(
            """
            INSERT INTO migration_exception(workbook, sheet, row_ref, raw, reason)
            VALUES (%s, %s, %s, %s, %s)
            """,
            (workbook, sheet, row_ref, Jsonb(raw), reason[:500]),
        )

    def _flush_exceptions(self, conn: psycopg.Connection, extracted: ExtractResult) -> None:
        for ex in extracted.exceptions:
            base = ex.reason.split(":")[0]
            self.reason_counts[base] += 1
            conn.execute(
                """
                INSERT INTO migration_exception(workbook, sheet, row_ref, raw, reason)
                VALUES (%s, %s, %s, %s, %s)
                """,
                (ex.workbook, ex.sheet, ex.row_ref, Jsonb(ex.raw), ex.reason[:500]),
            )

    def _simulate(self, extracted: ExtractResult) -> None:
        self.stats["imported_clean"] = len(extracted.clients) + len(extracted.cylinders)
        for mv in extracted.movements:
            if mv.pane == "CIRCULATION":
                self.stats["circulation_merged"] += 1
            else:
                self.stats["imported_clean"] += 1
        for ex in extracted.exceptions:
            self.reason_counts[ex.reason.split(":")[0]] += 1
