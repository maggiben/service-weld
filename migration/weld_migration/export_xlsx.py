"""Export live Weld tables to Excel workbooks for post-migration double-check."""

from __future__ import annotations

from pathlib import Path
from typing import Any

import psycopg
from openpyxl import Workbook
from psycopg.rows import dict_row

# Stable column order per sheet — keep UI labels aligned with these keys.
EXPORTS: dict[str, tuple[str, str]] = {
    "clients": (
        "clients",
        """
        SELECT p.id,
               p.display_name,
               c.legal_name,
               c.cuit,
               c.coverage,
               c.segment,
               c.status,
               t.name AS territory,
               l.name AS locality,
               c.address_street,
               c.delivery_instructions,
               p.created_at
        FROM client c
        JOIN party p ON p.id = c.party_id
        LEFT JOIN dispatch_territory t ON t.id = c.territory_id
        LEFT JOIN locality l ON l.id = c.locality_id
        WHERE c.deleted_at IS NULL
        ORDER BY p.display_name
        """,
    ),
    "cylinders": (
        "cylinders",
        """
        SELECT cy.id,
               cy.serial_number,
               cy.gas_code,
               cy.capacity_m3,
               cy.ownership_basis,
               cy.state,
               cy.condition,
               cy.packaging,
               op.display_name AS owner_name,
               cy.created_at
        FROM cylinder cy
        JOIN party op ON op.id = cy.owner_party_id
        WHERE cy.deleted_at IS NULL
        ORDER BY cy.serial_number
        """,
    ),
    "movements": (
        "movements",
        """
        SELECT m.id,
               m.request_id,
               m.movement_kind,
               m.state,
               m.delivery_date,
               m.return_date,
               cy.serial_number AS cylinder_serial,
               hp.display_name AS holder_name,
               m.gas_code,
               m.note,
               m.created_at
        FROM movement_event m
        JOIN cylinder cy ON cy.id = m.cylinder_id
        LEFT JOIN party hp ON hp.id = m.holder_party_id
        ORDER BY m.delivery_date DESC NULLS LAST, m.id DESC
        LIMIT 100000
        """,
    ),
    "exceptions": (
        "migration_exceptions",
        """
        SELECT id, workbook, sheet, row_ref, reason, status, raw, created_at
        FROM migration_exception
        ORDER BY id
        """,
    ),
}


def _write_sheet(wb: Workbook, title: str, rows: list[dict[str, Any]]) -> None:
    ws = wb.create_sheet(title[:31])
    if not rows:
        ws.append(["(empty)"])
        return
    headers = list(rows[0].keys())
    ws.append(headers)
    for row in rows:
        ws.append([_cell(row.get(h)) for h in headers])


def _cell(value: Any) -> Any:
    if value is None:
        return ""
    if hasattr(value, "isoformat"):
        return value.isoformat()
    if isinstance(value, (dict, list)):
        return str(value)
    return value


def export_dataset(dsn: str, dataset: str, out_path: Path) -> dict[str, Any]:
    if dataset not in EXPORTS:
        raise ValueError(f"Unknown dataset: {dataset}")
    sheet_name, sql = EXPORTS[dataset]
    with psycopg.connect(dsn, row_factory=dict_row) as conn:
        rows = list(conn.execute(sql))
    wb = Workbook()
    wb.remove(wb.active)
    _write_sheet(wb, sheet_name, rows)
    out_path.parent.mkdir(parents=True, exist_ok=True)
    wb.save(out_path)
    return {"dataset": dataset, "rows": len(rows), "path": str(out_path)}


def export_all(dsn: str, out_dir: Path) -> dict[str, Any]:
    out_dir.mkdir(parents=True, exist_ok=True)
    results = []
    for key in EXPORTS:
        path = out_dir / f"{key}.xlsx"
        results.append(export_dataset(dsn, key, path))
    return {"exports": results, "dir": str(out_dir)}
