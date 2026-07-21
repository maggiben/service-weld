"""Transform + load staged records into PostgreSQL (011 R2–R8)."""

from __future__ import annotations

import uuid
from collections import Counter
from datetime import date
from typing import Any

import psycopg
from psycopg.rows import dict_row
from psycopg.types.json import Jsonb

from .normalize import EXTRA_GAS_ALIASES, request_id_for, resolve_gas
from .parse import ExtractResult, StagedClient, StagedCylinder, StagedMovement


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
        self.gas_alias: dict[str, str] = {}
        self.cylinder_id: dict[tuple[int, str], int] = {}  # (owner_id, serial) -> id
        self.client_id: dict[str, int] = {}  # display_name.casefold() -> party_id
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
                        self._load_cylinders(conn, extracted.cylinders)
                        self._load_clients(conn, extracted.clients)
                        self._load_movements(conn, extracted.movements)
                        self._flush_exceptions(conn, extracted)
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
            self.locality_by_name[row["name"].casefold()] = row["id"]
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
            SELECT p.id, p.display_name::text AS display_name
            FROM party p
            JOIN client c ON c.party_id = p.id
            WHERE p.deleted_at IS NULL AND c.deleted_at IS NULL
            """
        ):
            self.client_id[row["display_name"].casefold()] = row["id"]
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

    def _ensure_locality(
        self, conn: psycopg.Connection, name: str | None, territory_id: int | None
    ) -> int | None:
        if not name:
            return None
        key = name.casefold()
        if key in self.locality_by_name:
            return self.locality_by_name[key]
        if self.dry_run:
            return None
        row = conn.execute(
            """
            INSERT INTO locality(name, territory_id)
            VALUES (%s, %s)
            ON CONFLICT (name, province) DO UPDATE SET territory_id = COALESCE(locality.territory_id, EXCLUDED.territory_id)
            RETURNING id
            """,
            (name, territory_id),
        ).fetchone()
        assert row
        self.locality_by_name[key] = row["id"]
        return row["id"]

    def _self_party_id(self) -> int:
        return self.party_by_name["nuestra empresa"]

    def _owner_id(self, hint: str) -> int:
        key = hint.casefold()
        if key in self.party_by_name:
            return self.party_by_name[key]
        # fallback SELF
        return self._self_party_id()

    def _load_cylinders(self, conn: psycopg.Connection, cylinders: list[StagedCylinder]) -> None:
        batteries: dict[str, StagedCylinder] = {}
        for cyl in cylinders:
            if cyl.packaging == "BATTERY":
                batteries[cyl.serial_number] = cyl

            owner_id = self._owner_id(cyl.owner_hint)
            key = (owner_id, cyl.serial_number)
            if key in self.cylinder_id:
                self.stats["cylinder_exists"] += 1
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
                            ownership_basis, packaging, battery_id, state, condition
                        ) VALUES (%s,%s,%s,%s,%s,%s,%s,'IN_STOCK_EMPTY','EMPTY')
                        RETURNING id
                        """,
                        (
                            owner_id,
                            cyl.serial_number,
                            gas_code,
                            cyl.capacity_m3 if cyl.capacity_m3 is not None and 0 < cyl.capacity_m3 < 1000 else None,
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

    def _load_clients(self, conn: psycopg.Connection, clients: list[StagedClient]) -> None:
        for cl in clients:
            key = cl.display_name.casefold()
            if cl.is_subdistributor:
                # already seeded as SUBDISTRIBUTOR parties
                if key in self.party_by_name:
                    self.stats["subdist_linked"] += 1
                    continue

            if key in self.client_id:
                self.stats["client_exists"] += 1
                continue

            territory_id = self.territory_by_name.get((cl.territory or "").casefold())
            if territory_id is None and cl.territory:
                # normalize accents
                for tname, tid in self.territory_by_name.items():
                    if tname.startswith(cl.territory[:4].casefold()):
                        territory_id = tid
                        break

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
            self.party_by_name[key] = party_id
            self.party_type[party_id] = "CUSTOMER"

            try:
                with self._sp(conn):
                    conn.execute(
                        """
                        INSERT INTO client(
                            party_id, legal_name, cuit, cuit_valid, address_street,
                            locality_id, territory_id, coverage, status
                        ) VALUES (%s,%s,%s,%s,%s,%s,%s,%s,'ACTIVE')
                        ON CONFLICT (party_id) DO NOTHING
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

            self.client_id[key] = party_id
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

    def _resolve_holder(self, name: str) -> int | None:
        key = name.casefold().strip()
        if not key:
            return None
        if key in self.client_id:
            return self.client_id[key]
        if key in self.party_by_name:
            return self.party_by_name[key]
        # fuzzy: startswith / contains
        for cname, cid in self.client_id.items():
            if cname.startswith(key) or key.startswith(cname) or key in cname or cname in key:
                if abs(len(cname) - len(key)) <= 8:
                    return cid
        return None

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
        holder_id = self._resolve_holder(mv.holder_name)
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
        holder_id = self._resolve_holder(mv.holder_name)
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
        )
        self._insert_ledger_movement(conn, gap)
        self.stats["circulation_gap_fill"] += 1

    def _load_accessory(self, conn: psycopg.Connection, mv: StagedMovement) -> None:
        holder_id = self._resolve_holder(mv.holder_name)
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
        capacity = mv.capacity_m3
        if capacity is not None and capacity >= 1000:
            capacity = None  # numeric(5,2) overflow — flag but still import sale
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
                        address_snapshot, locality_snapshot, phone_snapshot
                    ) VALUES (%s,%s,%s,%s,%s,%s,%s,%s)
                    ON CONFLICT (cylinder_id) DO NOTHING
                    """,
                    (
                        cyl_id,
                        holder_id,
                        mv.delivery_date,
                        gas_code,
                        capacity,
                        mv.sale_address,
                        mv.sale_locality,
                        mv.sale_phone,
                    ),
                )
                conn.execute("UPDATE cylinder SET state='SOLD' WHERE id=%s", (cyl_id,))
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
        supplier_id = self._owner_id(mv.supplier_hint or "Nordelta")
        # Ensure supplier-owned cylinder
        key = (supplier_id, serial)
        if key not in self.cylinder_id:
            try:
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
            except psycopg.Error:
                row = conn.execute(
                    "SELECT id FROM cylinder WHERE owner_party_id=%s AND serial_number=%s AND deleted_at IS NULL",
                    (supplier_id, serial),
                ).fetchone()
            if row:
                self.cylinder_id[key] = row["id"]
        cyl_id = self.cylinder_id.get(key) or self._find_cylinder(conn, serial, "LOAN", None, gas_code)
        if cyl_id is None:
            self._flag(conn, mv.workbook, mv.sheet, mv.row_ref, "LOAN_CYLINDER_MISSING", {"serial": serial})
            return
        client_id = self._resolve_holder(mv.holder_name)
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
