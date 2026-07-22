"""Parse legacy BIFF .xls workbooks into staging records (011 R1)."""

from __future__ import annotations

from dataclasses import dataclass, field
from datetime import date
from typing import Any, Iterator

import xlrd

from .normalize import (
    cell_to_date,
    coverage_from_sheet,
    extract_cylinder_capacity,
    infer_ownership,
    norm_text,
    parse_capacity,
    parse_cuit,
    parse_serial_cell,
    sanitize_capacity_m3,
    validate_date_range,
)

SPECIAL_PROPIOS = {
    "CILINDROS VENDIDOS",
    "INTERGAS N-PROPI",
    "NORDELTA",
}
SPECIAL_CLIENT = {"ceres", "ezequiel"}


@dataclass
class StagedException:
    workbook: str
    sheet: str
    row_ref: str
    reason: str
    raw: dict[str, Any]


@dataclass
class StagedClient:
    workbook: str
    sheet: str
    display_name: str
    territory: str  # Junín | Chacabuco | Ceres
    address: str | None = None
    locality: str | None = None
    cuit: str | None = None
    phones: list[str] = field(default_factory=list)
    coverage: str = "PRIVATE"
    is_subdistributor: bool = False


@dataclass
class StagedCylinder:
    workbook: str
    sheet: str
    serial_number: str
    ownership_basis: str
    owner_hint: str
    gas_raw: str | None = None
    capacity_m3: float | None = None
    packaging: str = "SINGLE"
    battery_code: str | None = None
    member_serials: list[str] = field(default_factory=list)
    header_blob: str = ""


@dataclass
class StagedMovement:
    workbook: str
    sheet: str
    row_ref: str
    pane: str  # RENTAL | REFILL | CIRCULATION | SALE | LOAN | SUBDIST
    holder_name: str
    serials: list[str]
    delivery_date: date | None
    return_date: date | None
    gas_raw: str | None = None
    note: str | None = None
    swap_with: str | None = None
    origin_hint: str | None = None
    territory: str | None = None
    flags: list[str] = field(default_factory=list)
    raw: dict[str, Any] = field(default_factory=dict)
    # loan-only
    received_from_supplier: date | None = None
    returned_to_supplier: date | None = None
    supplier_hint: str | None = None
    # sale-only
    sale_address: str | None = None
    sale_locality: str | None = None
    sale_phone: str | None = None
    capacity_m3: float | None = None
    # accessory
    is_accessory: bool = False
    accessory_type: str | None = None


@dataclass
class ExtractResult:
    clients: list[StagedClient] = field(default_factory=list)
    cylinders: list[StagedCylinder] = field(default_factory=list)
    movements: list[StagedMovement] = field(default_factory=list)
    exceptions: list[StagedException] = field(default_factory=list)
    stats: dict[str, int] = field(default_factory=dict)

    def add_exc(
        self, workbook: str, sheet: str, row_ref: str, reason: str, raw: dict[str, Any]
    ) -> None:
        self.exceptions.append(
            StagedException(workbook, sheet, row_ref, reason, raw)
        )
        self.stats["rows_flagged"] = self.stats.get("rows_flagged", 0) + 1


def _header_blob(sh: xlrd.sheet.Sheet, max_rows: int = 8, max_cols: int = 12) -> str:
    parts: list[str] = []
    for r in range(min(max_rows, sh.nrows)):
        for c in range(min(max_cols, sh.ncols)):
            v = sh.cell_value(r, c)
            if v not in ("", None):
                parts.append(norm_text(v))
    return " ".join(parts)


def _find_header_row(sh: xlrd.sheet.Sheet) -> tuple[int | None, int | None]:
    """Return (label_row, col_header_row) where col header has ENTREGA/NUMEROS."""
    label_row = None
    col_row = None
    for r in range(min(15, sh.nrows)):
        vals = [norm_text(sh.cell_value(r, c)).casefold() for c in range(min(12, sh.ncols))]
        joined = " ".join(vals)
        if "nuestra propiedad" in joined or "su propiedad" in joined:
            label_row = r
        if "entrega" in vals and ("numeros" in vals or "números" in vals or "numero" in vals):
            col_row = r
            break
        # cylinder sheet: salida / entrada
        if "salida" in vals:
            col_row = r
            break
    return label_row, col_row


def _pane_offsets(sh: xlrd.sheet.Sheet, label_row: int | None, col_row: int) -> list[tuple[str, int]]:
    """Detect RENTAL/REFILL column bases from ENTREGA header positions."""
    entregas: list[int] = []
    for c in range(min(14, sh.ncols)):
        v = norm_text(sh.cell_value(col_row, c)).casefold()
        if v == "entrega":
            entregas.append(c)

    panes: list[tuple[str, int]] = []
    if len(entregas) >= 2:
        # Two panes: left = RENTAL (Nuestra), right = REFILL (Su)
        panes = [("RENTAL", entregas[0]), ("REFILL", entregas[1])]
    elif len(entregas) == 1:
        # Single pane — check label for Su vs Nuestra
        kind = "RENTAL"
        if label_row is not None:
            blob = " ".join(
                norm_text(sh.cell_value(label_row, c)).casefold()
                for c in range(min(12, sh.ncols))
            )
            if "su propiedad" in blob and "nuestra" not in blob:
                kind = "REFILL"
        panes = [(kind, entregas[0])]
    else:
        # Fallback classic layouts
        panes = [("RENTAL", 0)]
        if sh.ncols >= 10:
            panes.append(("REFILL", 5))
    return panes


def _row_is_empty(sh: xlrd.sheet.Sheet, r: int, bases: list[int]) -> bool:
    for base in bases:
        for off in range(5):
            c = base + off
            if c >= sh.ncols:
                break
            if sh.cell_type(r, c) not in (xlrd.XL_CELL_EMPTY, xlrd.XL_CELL_BLANK):
                val = sh.cell_value(r, c)
                if val not in ("", None):
                    return False
    return True


def parse_client_workbook(
    path: str, workbook_label: str, territory: str
) -> ExtractResult:
    result = ExtractResult()
    book = xlrd.open_workbook(path, formatting_info=False)
    result.stats["sheets"] = book.nsheets

    for sheet_name in book.sheet_names():
        sh = book.sheet_by_name(sheet_name)
        is_special = sheet_name.casefold() in SPECIAL_CLIENT
        blob = _header_blob(sh)
        display = norm_text(sheet_name)
        # Prefer a nicer display name from header cells when present
        for r in range(min(3, sh.nrows)):
            for c in range(min(6, sh.ncols)):
                v = norm_text(sh.cell_value(r, c))
                if v and len(v) > 2 and v.casefold() not in ("domicilio", "fecha", "cuit"):
                    if "hosp" not in v.casefold() or display.casefold().startswith(v.casefold()[:8]):
                        # keep sheet name as canonical identity; capture legal name later
                        pass

        address = None
        locality = None
        cuit = None
        phones: list[str] = []
        for r in range(min(8, sh.nrows)):
            for c in range(min(10, sh.ncols)):
                v = norm_text(sh.cell_value(r, c))
                low = v.casefold()
                if low.startswith("domicilio") and c + 1 < sh.ncols:
                    address = norm_text(sh.cell_value(r, c + 1)) or address
                    if c + 2 < sh.ncols:
                        loc = norm_text(sh.cell_value(r, c + 2))
                        if loc and not loc.casefold().startswith("cuit"):
                            locality = loc
                if "cuit" in low and c + 1 < sh.ncols:
                    cuit = parse_cuit(sh.cell_value(r, c + 1)) or parse_cuit(v)
                if low.startswith("tel") or "tel." in low:
                    phone = re_phone(v) or (
                        re_phone(sh.cell_value(r, c + 1)) if c + 1 < sh.ncols else None
                    )
                    if phone:
                        phones.append(phone)

        coverage = coverage_from_sheet(sheet_name, blob)
        client = StagedClient(
            workbook=workbook_label,
            sheet=sheet_name,
            display_name=display,
            territory="Ceres" if is_special and sheet_name.casefold() == "ceres" else territory,
            address=address,
            locality=locality,
            cuit=cuit,
            phones=phones,
            coverage=coverage,
            is_subdistributor=is_special,
        )
        result.clients.append(client)

        label_row, col_row = _find_header_row(sh)
        if col_row is None:
            result.add_exc(
                workbook_label,
                sheet_name,
                "header",
                "NO_MOVEMENT_HEADER",
                {"blob": blob[:200]},
            )
            continue

        panes = _pane_offsets(sh, label_row, col_row)
        # ceres/ezequiel often only have SU PROPIEDAD-style stock lists
        if is_special:
            panes = [("SUBDIST", panes[0][1] if panes else 0)]

        bases = [b for _, b in panes]
        empty_streak = 0
        for r in range(col_row + 1, sh.nrows):
            if _row_is_empty(sh, r, bases):
                empty_streak += 1
                # Stop after a long empty run (sheets often padded to 65k rows).
                if empty_streak >= 50:
                    break
                continue
            empty_streak = 0

            for pane_kind, base in panes:
                result.stats["rows_read"] = result.stats.get("rows_read", 0) + 1
                deliver_cell = sh.cell(r, base)
                serial_cell = sh.cell(r, base + 1) if base + 1 < sh.ncols else None
                return_cell = sh.cell(r, base + 2) if base + 2 < sh.ncols else None
                gas_cell = sh.cell(r, base + 3) if base + 3 < sh.ncols else None

                # Skip empty pane rows
                serial_raw = serial_cell.value if serial_cell else ""
                if (
                    deliver_cell.ctype in (xlrd.XL_CELL_EMPTY, xlrd.XL_CELL_BLANK)
                    and (serial_cell is None or serial_cell.ctype in (xlrd.XL_CELL_EMPTY, xlrd.XL_CELL_BLANK))
                    and (gas_cell is None or gas_cell.ctype in (xlrd.XL_CELL_EMPTY, xlrd.XL_CELL_BLANK))
                ):
                    result.stats["rows_read"] = result.stats.get("rows_read", 0) - 1
                    continue

                # Optional free-text note occasionally sits past METROS (base+4);
                # never treat dates/numbers (next-pane bleed / metros) as notes.
                note = None
                if base + 5 < sh.ncols:
                    nc = sh.cell(r, base + 5)
                    if nc.ctype == xlrd.XL_CELL_TEXT:
                        candidate = norm_text(nc.value)
                        if candidate and not candidate.replace(".", "", 1).isdigit():
                            note = candidate
                # Also check METROS cell for text notes (rare)
                if note is None and base + 4 < sh.ncols:
                    mc = sh.cell(r, base + 4)
                    if mc.ctype == xlrd.XL_CELL_TEXT:
                        candidate = norm_text(mc.value)
                        low = candidate.casefold()
                        if candidate and any(
                            k in low
                            for k in ("vendido", "perdido", "roto", "buroni", "cambio", "rto", "devuelto")
                        ):
                            note = candidate

                delivery, d_flag = cell_to_date(deliver_cell, book.datemode)
                ret, r_flag = (
                    cell_to_date(return_cell, book.datemode)
                    if return_cell
                    else (None, None)
                )
                serial_info = parse_serial_cell(serial_raw)
                gas_raw = norm_text(gas_cell.value) if gas_cell else None
                flags = list(serial_info["flags"])
                origin_hint = None

                if d_flag:
                    if d_flag.startswith("ORIGIN_IN_DATE:"):
                        origin_hint = d_flag.split(":", 1)[1]
                        flags.append(d_flag)
                    else:
                        result.add_exc(
                            workbook_label,
                            sheet_name,
                            f"r{r}:{pane_kind}",
                            d_flag,
                            {"serial": serial_info["raw"], "gas": gas_raw},
                        )
                        continue
                if r_flag and r_flag.startswith("ORIGIN_IN_DATE:"):
                    # return cell shouldn't hold origin; still flag
                    flags.append(r_flag)
                    ret = None
                elif r_flag:
                    flags.append(r_flag)
                    ret = None

                range_flag = validate_date_range(delivery) or validate_date_range(ret, "return")
                if range_flag:
                    result.add_exc(
                        workbook_label,
                        sheet_name,
                        f"r{r}:{pane_kind}",
                        range_flag,
                        {
                            "delivery": delivery.isoformat() if delivery else None,
                            "return": ret.isoformat() if ret else None,
                            "serial": serial_info["raw"],
                        },
                    )
                    continue

                if serial_info["is_accessory"]:
                    result.movements.append(
                        StagedMovement(
                            workbook=workbook_label,
                            sheet=sheet_name,
                            row_ref=f"r{r}:{pane_kind}",
                            pane="ACCESSORY",
                            holder_name=display,
                            serials=[],
                            delivery_date=delivery,
                            return_date=ret,
                            gas_raw=gas_raw,
                            note=serial_info["accessory_note"] or note,
                            territory=client.territory,
                            flags=flags,
                            is_accessory=True,
                            accessory_type=serial_info["accessory_type"],
                            raw={"serial_raw": serial_info["raw"]},
                        )
                    )
                    continue

                if not serial_info["serials"]:
                    if serial_info["raw"]:
                        result.add_exc(
                            workbook_label,
                            sheet_name,
                            f"r{r}:{pane_kind}",
                            "UNPARSEABLE_SERIAL",
                            {"serial": serial_info["raw"], "gas": gas_raw},
                        )
                    else:
                        # empty serial with only dates/gas — skip as noise, still counted read
                        result.stats["rows_empty"] = result.stats.get("rows_empty", 0) + 1
                    continue

                if delivery is None:
                    result.add_exc(
                        workbook_label,
                        sheet_name,
                        f"r{r}:{pane_kind}",
                        "MISSING_DELIVERY_DATE",
                        {"serial": serial_info["raw"], "gas": gas_raw},
                    )
                    continue

                if ret is not None and delivery is not None and ret < delivery:
                    flags.append("RETURN_BEFORE_DELIVERY")
                    result.add_exc(
                        workbook_label,
                        sheet_name,
                        f"r{r}:{pane_kind}",
                        "RETURN_BEFORE_DELIVERY",
                        {
                            "delivery": delivery.isoformat(),
                            "return": ret.isoformat(),
                            "serial": serial_info["raw"],
                        },
                    )
                    continue

                pane = pane_kind
                if pane == "SUBDIST":
                    pane = "RENTAL"  # stock at subdistributor treated as open rental-like custody

                result.movements.append(
                    StagedMovement(
                        workbook=workbook_label,
                        sheet=sheet_name,
                        row_ref=f"r{r}:{pane_kind}",
                        pane=pane,
                        holder_name=display,
                        serials=serial_info["serials"],
                        delivery_date=delivery,
                        return_date=ret,
                        gas_raw=gas_raw or None,
                        note=note or None,
                        swap_with=serial_info["swap_with"],
                        origin_hint=origin_hint,
                        territory=client.territory,
                        flags=flags,
                        raw={"serial_raw": serial_info["raw"]},
                    )
                )

    return result


def re_phone(raw: Any) -> str | None:
    s = norm_text(raw)
    if not s:
        return None
    # strip labels
    s = s.replace("Tel.", "").replace("tel.", "").replace("TEL.", "").strip()
    digits = "".join(ch for ch in s if ch.isdigit())
    return s if len(digits) >= 6 else None


def parse_propios_workbook(path: str, workbook_label: str = "PROPIOS") -> ExtractResult:
    result = ExtractResult()
    book = xlrd.open_workbook(path, formatting_info=False)
    result.stats["sheets"] = book.nsheets

    for sheet_name in book.sheet_names():
        sh = book.sheet_by_name(sheet_name)
        if sheet_name in SPECIAL_PROPIOS:
            if sheet_name == "CILINDROS VENDIDOS":
                _parse_sales(book, sh, workbook_label, result)
            elif sheet_name == "NORDELTA":
                _parse_loan(book, sh, workbook_label, "Nordelta", result)
            elif sheet_name == "INTERGAS N-PROPI":
                _parse_intergas_stock(book, sh, workbook_label, result)
            continue

        blob = _header_blob(sh)
        basis, owner_hint = infer_ownership(blob, sheet_name)
        serial = _serial_from_sheet_name(sheet_name)
        gas_raw = None
        packaging = "SINGLE"
        battery_code = None
        members: list[str] = []
        header_cells: list[Any] = []

        # Header scan — capacity is resolved from the full header (serial-aware).
        for r in range(min(4, sh.nrows)):
            for c in range(min(12, sh.ncols)):
                v = norm_text(sh.cell_value(r, c))
                if v:
                    header_cells.append(sh.cell_value(r, c))
                low = v.casefold()
                if not gas_raw and any(
                    g in low
                    for g in (
                        "o2",
                        "atal",
                        "argon",
                        "co2",
                        "n2",
                        "acet",
                        "helio",
                        "elio",
                        "oxigen",
                        "nitr",
                        "mapax",
                        "mix",
                    )
                ):
                    # avoid mistaking sheet labels
                    if "fecha" not in low and "salida" not in low:
                        gas_raw = v
                if "bat" in low:
                    packaging = "BATTERY"

        capacity = extract_cylinder_capacity(header_cells, serial)

        if "bat" in sheet_name.casefold():
            packaging = "BATTERY"
            battery_code = serial
            # member serials often in header row
            for c in range(2, min(20, sh.ncols)):
                v = norm_text(sh.cell_value(0, c))
                if v and v.replace(".", "", 1).isdigit():
                    members.append(str(int(float(v))) if "." in v else v)

        if not serial:
            result.add_exc(
                workbook_label, sheet_name, "header", "NO_SERIAL_IN_SHEET_NAME", {"blob": blob[:120]}
            )
            continue

        result.cylinders.append(
            StagedCylinder(
                workbook=workbook_label,
                sheet=sheet_name,
                serial_number=serial,
                ownership_basis=basis,
                owner_hint=owner_hint,
                gas_raw=gas_raw,
                capacity_m3=capacity,
                packaging=packaging,
                battery_code=battery_code,
                member_serials=members,
                header_blob=blob[:300],
            )
        )

        # Circulation rows are mirrors of client ledgers (011 R3) — extract for
        # merge/enrichment only; loader will not create duplicate movements.
        label_row, col_row = _find_header_row(sh)
        if col_row is None:
            continue
        # Detect column layout: often cols 1,2,3 or 0,1,2
        base = 0
        vals = [norm_text(sh.cell_value(col_row, c)).casefold() for c in range(min(6, sh.ncols))]
        if "salida" in vals:
            base = vals.index("salida")
        empty_streak = 0
        for r in range(col_row + 1, sh.nrows):
            out_cell = sh.cell(r, base)
            holder_cell = sh.cell(r, base + 1) if base + 1 < sh.ncols else None
            in_cell = sh.cell(r, base + 2) if base + 2 < sh.ncols else None
            gas_cell = sh.cell(r, base + 3) if base + 3 < sh.ncols else None
            holder = norm_text(holder_cell.value) if holder_cell else ""
            if out_cell.ctype in (xlrd.XL_CELL_EMPTY, xlrd.XL_CELL_BLANK) and not holder:
                empty_streak += 1
                if empty_streak >= 50:
                    break
                continue
            empty_streak = 0
            result.stats["cyl_rows_read"] = result.stats.get("cyl_rows_read", 0) + 1
            delivery, d_flag = cell_to_date(out_cell, book.datemode)
            ret, r_flag = cell_to_date(in_cell, book.datemode) if in_cell else (None, None)
            flags = ["CIRCULATION_MIRROR"]
            if d_flag:
                result.add_exc(
                    workbook_label,
                    sheet_name,
                    f"r{r}:CIRC",
                    d_flag,
                    {"holder": holder, "serial": serial},
                )
                continue
            if r_flag:
                flags.append(r_flag)
                ret = None
            range_flag = validate_date_range(delivery) or validate_date_range(ret)
            if range_flag:
                result.add_exc(
                    workbook_label,
                    sheet_name,
                    f"r{r}:CIRC",
                    range_flag,
                    {"holder": holder, "serial": serial},
                )
                continue
            if delivery is None:
                result.add_exc(
                    workbook_label,
                    sheet_name,
                    f"r{r}:CIRC",
                    "MISSING_DELIVERY_DATE",
                    {"holder": holder, "serial": serial},
                )
                continue
            result.movements.append(
                StagedMovement(
                    workbook=workbook_label,
                    sheet=sheet_name,
                    row_ref=f"r{r}:CIRC",
                    pane="CIRCULATION",
                    holder_name=holder or "UNKNOWN",
                    serials=[serial],
                    delivery_date=delivery,
                    return_date=ret,
                    gas_raw=norm_text(gas_cell.value) if gas_cell else gas_raw,
                    flags=flags,
                    raw={"mirror": True},
                )
            )

    return result


def _serial_from_sheet_name(name: str) -> str | None:
    import re

    m = re.match(r"^(\d+)", name.strip())
    if m:
        # preserve leading zeros only if meaningful; strip float artifacts
        return str(int(m.group(1))) if not m.group(1).startswith("0") or len(m.group(1)) <= 1 else m.group(1).lstrip("0") or "0"
    # "041" style
    m = re.search(r"(\d+)", name)
    return m.group(1) if m else None


def _parse_sales(book: xlrd.Book, sh: xlrd.sheet.Sheet, workbook_label: str, result: ExtractResult) -> None:
    # Find header with ENTREGA
    start = 0
    for r in range(min(10, sh.nrows)):
        vals = [norm_text(sh.cell_value(r, c)).casefold() for c in range(min(8, sh.ncols))]
        if "entrega" in vals and "numeros" in vals:
            start = r + 1
            break
    for r in range(start, sh.nrows):
        result.stats["rows_read"] = result.stats.get("rows_read", 0) + 1
        d_cell = sh.cell(r, 0)
        serial_info = parse_serial_cell(sh.cell_value(r, 1))
        client = norm_text(sh.cell_value(r, 2))
        gas_raw = norm_text(sh.cell_value(r, 3)) if sh.ncols > 3 else None
        cap = (
            sanitize_capacity_m3(parse_capacity(sh.cell_value(r, 4)))
            if sh.ncols > 4
            else None
        )
        addr = norm_text(sh.cell_value(r, 5)) if sh.ncols > 5 else None
        loc = norm_text(sh.cell_value(r, 6)) if sh.ncols > 6 else None
        phone = norm_text(sh.cell_value(r, 7)) if sh.ncols > 7 else None
        if d_cell.ctype == xlrd.XL_CELL_EMPTY and not serial_info["raw"] and not client:
            result.stats["rows_read"] = result.stats.get("rows_read", 0) - 1
            continue
        delivery, d_flag = cell_to_date(d_cell, book.datemode)
        if d_flag or delivery is None or not serial_info["serials"]:
            result.add_exc(
                workbook_label,
                sh.name,
                f"r{r}",
                d_flag or "SALE_UNPARSEABLE",
                {"serial": serial_info["raw"], "client": client},
            )
            continue
        range_flag = validate_date_range(delivery)
        if range_flag:
            result.add_exc(workbook_label, sh.name, f"r{r}", range_flag, {"serial": serial_info["raw"]})
            continue
        result.movements.append(
            StagedMovement(
                workbook=workbook_label,
                sheet=sh.name,
                row_ref=f"r{r}",
                pane="SALE",
                holder_name=client or "UNKNOWN",
                serials=serial_info["serials"][:1],
                delivery_date=delivery,
                return_date=None,
                gas_raw=gas_raw or None,
                sale_address=addr or None,
                sale_locality=loc or None,
                sale_phone=phone or None,
                capacity_m3=cap,
                flags=serial_info["flags"],
            )
        )


def _parse_loan(
    book: xlrd.Book, sh: xlrd.sheet.Sheet, workbook_label: str, supplier: str, result: ExtractResult
) -> None:
    start = 0
    for r in range(min(10, sh.nrows)):
        vals = [norm_text(sh.cell_value(r, c)).casefold() for c in range(min(8, sh.ncols))]
        if any("entrega" in v for v in vals) and any("numero" in v for v in vals):
            start = r + 1
            break
    for r in range(start, sh.nrows):
        result.stats["rows_read"] = result.stats.get("rows_read", 0) + 1
        recv, _ = cell_to_date(sh.cell(r, 0), book.datemode)
        delivered, d_flag = cell_to_date(sh.cell(r, 1), book.datemode)
        serial_info = parse_serial_cell(sh.cell_value(r, 2))
        client = norm_text(sh.cell_value(r, 3))
        gas_raw = norm_text(sh.cell_value(r, 4)) if sh.ncols > 4 else None
        ret_client, _ = cell_to_date(sh.cell(r, 5), book.datemode) if sh.ncols > 5 else (None, None)
        ret_sup, _ = cell_to_date(sh.cell(r, 6), book.datemode) if sh.ncols > 6 else (None, None)
        if not serial_info["serials"] and not client and delivered is None and recv is None:
            result.stats["rows_read"] = result.stats.get("rows_read", 0) - 1
            continue
        if not serial_info["serials"]:
            result.add_exc(
                workbook_label, sh.name, f"r{r}", "LOAN_UNPARSEABLE", {"client": client}
            )
            continue
        # Prefer client delivery date; fall back to received
        delivery = delivered or recv
        if delivery is None:
            result.add_exc(
                workbook_label, sh.name, f"r{r}", "MISSING_DELIVERY_DATE", {"serial": serial_info["raw"]}
            )
            continue
        if validate_date_range(delivery):
            result.add_exc(
                workbook_label,
                sh.name,
                f"r{r}",
                validate_date_range(delivery) or "BAD_DATE",
                {"serial": serial_info["raw"]},
            )
            continue
        result.movements.append(
            StagedMovement(
                workbook=workbook_label,
                sheet=sh.name,
                row_ref=f"r{r}",
                pane="LOAN",
                holder_name=client or supplier,
                serials=serial_info["serials"][:1],
                delivery_date=delivery,
                return_date=ret_client,
                gas_raw=gas_raw or None,
                received_from_supplier=recv,
                returned_to_supplier=ret_sup,
                supplier_hint=supplier,
                flags=serial_info["flags"] + (["LOAN_NO_CLIENT_DELIVERY"] if d_flag else []),
            )
        )


def _parse_intergas_stock(
    book: xlrd.Book, sh: xlrd.sheet.Sheet, workbook_label: str, result: ExtractResult
) -> None:
    """INTERGAS N-PROPI: register supplier-owned cylinders (+ optional return dates)."""
    for r in range(4, sh.nrows):
        result.stats["rows_read"] = result.stats.get("rows_read", 0) + 1
        serial_info = parse_serial_cell(sh.cell_value(r, 1))
        gas_raw = norm_text(sh.cell_value(r, 3)) if sh.ncols > 3 else None
        if not serial_info["serials"]:
            if not norm_text(sh.cell_value(r, 1)):
                result.stats["rows_read"] = result.stats.get("rows_read", 0) - 1
            else:
                result.add_exc(
                    workbook_label, sh.name, f"r{r}", "UNPARSEABLE_SERIAL", {"raw": serial_info["raw"]}
                )
            continue
        serial = serial_info["serials"][0]
        result.cylinders.append(
            StagedCylinder(
                workbook=workbook_label,
                sheet=sh.name,
                serial_number=serial,
                ownership_basis="SUPPLIER",
                owner_hint="Intergas",
                gas_raw=gas_raw or None,
                header_blob="intergas n-propi",
            )
        )
