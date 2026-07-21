"""Normalization helpers: gas aliases, dates, serials, CUIT, coverage."""

from __future__ import annotations

import re
import uuid
from datetime import date, datetime, timedelta
from typing import Any

import xlrd

# Deterministic namespace for idempotent request_ids (011 R8 / AC5).
MIGRATION_NS = uuid.UUID("a7c5e2f0-0110-4b3d-9e8a-0123456789ab")

DATE_MIN = date(2000, 1, 1)


def today_plus(days: int = 30) -> date:
    return date.today() + timedelta(days=days)


def norm_text(value: Any) -> str:
    if value is None:
        return ""
    if isinstance(value, float) and value == int(value):
        return str(int(value))
    s = str(value).strip()
    s = re.sub(r"\s+", " ", s)
    return s


def norm_key(value: Any) -> str:
    return norm_text(value).casefold()


# Extra aliases beyond schema.sql seed (extend during migration — 011 / M-11).
EXTRA_GAS_ALIASES: dict[str, str] = {
    "oxígeno": "O2",
    "oxigeno": "O2",
    "oxigen": "O2",
    "oxygen": "O2",
    "o²": "O2",
    "ph o2": "O2",  # provisional (M-11)
    "ph o": "O2",
    "ph atal": "ATAL",
    "ph at": "ATAL",
    "ph": "O2",
    "o2med": "O2_MED",
    "o2 med": "O2_MED",
    "o2 medicinal": "O2_MED",
    "oxigeno medicinal": "O2_MED",
    "o2 laser": "O2_LASER",
    "oxigeno laser": "O2_LASER",
    "argon 5,0": "AR_50",
    "argon 5.0": "AR_50",
    "ar 5,0": "AR_50",
    "ar5": "AR_50",
    "argón": "AR",
    "nitrógeno": "N2",
    "nitrogen": "N2",
    "helio": "HELIUM",
    "elio": "HELIUM",
    "helium": "HELIUM",
    "acetileno": "ACET",
    "acet.": "ACET",
    "co²": "CO2",
    "dioxido": "CO2",
    "mix 20": "MIX20",
    "mix20": "MIX20",
    "mix 22": "MIX22",
    "mix22": "MIX22",
    "mapax 30": "MAPAX30",
    "mapax30": "MAPAX30",
    "thermolene": "THERMOLENE",
    "bat o2": "O2",
    "o2 bat": "O2",
    "atal bat": "ATAL",
    "oxigeno bat": "O2",
}


def resolve_gas(raw: Any, alias_map: dict[str, str]) -> tuple[str | None, bool, str | None]:
    """Return (gas_code|None, is_provisional, reason|None)."""
    token = norm_key(raw)
    if not token:
        return None, False, None
    # Strip capacity-ish suffixes accidentally pasted into gas cells.
    token = re.sub(r"\s+\d+(\.\d+)?\s*(mt|m3|metros)?$", "", token).strip()
    if token in alias_map:
        code = alias_map[token]
        provisional = token.startswith("ph")
        return code, provisional, ("PH_PREFIX_PROVISIONAL" if provisional else None)
    # Try first token (e.g. "o2 6").
    first = token.split()[0] if token else ""
    if first in alias_map:
        return alias_map[first], False, None
    return None, False, f"UNKNOWN_GAS:{token}"


_CUIT_RE = re.compile(r"(\d{2})[-\s]?(\d{8})[-\s]?(\d)")


def parse_cuit(raw: Any) -> str | None:
    s = norm_text(raw)
    if not s:
        return None
    m = _CUIT_RE.search(s.replace(".", ""))
    if not m:
        return None
    return f"{m.group(1)}-{m.group(2)}-{m.group(3)}"


def coverage_from_sheet(sheet_name: str, header_blob: str) -> str:
    """Map legacy hospital tags → MUNICIPAL_HOSPITAL.

    Require an explicit hospital+municipal cue. Bare "municipal" alone is not
    enough (e.g. CORRALON MUNICIPAL is an industrial client, not a patient).
    """
    blob = f"{sheet_name} {header_blob}".casefold()
    if any(
        t in blob
        for t in (
            "hosp.munic",
            "hosp munic",
            "hosp.munic.",
            "hospmunic",
            "h.munic",
            "hospital municipal",
            "hosp-municipal",
            "hosp municipal",
        )
    ):
        return "MUNICIPAL_HOSPITAL"
    # Compact forms without separators: "hospmunic", "hospitalmunic"
    if re.search(r"hosp(?:ital)?\s*\.?\s*munic", blob):
        return "MUNICIPAL_HOSPITAL"
    return "PRIVATE"


_HOSP_TAG_RE = re.compile(
    r"[\s\-_/]*\(?\s*hosp(?:ital)?\.?\s*\-?\s*munic(?:ipal)?\.?\s*\)?\.?",
    re.IGNORECASE,
)
_NON_ALNUM_RE = re.compile(r"[^a-z0-9\s]+")
_WS_RE = re.compile(r"\s+")


def fold_person_key(value: Any) -> str:
    """Casefold + strip accents/punctuation for fuzzy client matching."""
    import unicodedata

    s = norm_text(value)
    if not s:
        return ""
    s = unicodedata.normalize("NFKD", s)
    s = "".join(c for c in s if not unicodedata.combining(c))
    s = _HOSP_TAG_RE.sub(" ", s)
    s = s.casefold()
    s = _NON_ALNUM_RE.sub(" ", s)
    return _WS_RE.sub(" ", s).strip()


def person_token_set(value: Any) -> set[str]:
    stop = {"de", "del", "la", "el", "los", "las", "y", "e", "ex", "sa", "srl"}
    return {t for t in fold_person_key(value).split() if t and t not in stop}


def coverage_from_holder_name(name: str) -> str:
    return coverage_from_sheet(name, "")


def is_noise_holder_name(name: str) -> bool:
    s = norm_text(name)
    if not s:
        return True
    if re.fullmatch(r"[xX\?\|\.\-\s]+", s):
        return True
    if re.match(
        r"^(ver\s|sin\s|en\s|posible|cobrar|reemplazado|xxxxx)",
        s,
        re.IGNORECASE,
    ):
        return True
    return False


def parse_capacity(raw: Any) -> float | None:
    s = norm_text(raw).casefold()
    if not s:
        return None
    m = re.search(r"(\d+(?:[.,]\d+)?)", s)
    if not m:
        return None
    try:
        v = float(m.group(1).replace(",", "."))
        return v if v > 0 else None
    except ValueError:
        return None


_SERIAL_SPLIT = re.compile(r"[-/,;]+|\s{2,}")
_SWAP_RE = re.compile(r"^(\d+)\s*\((\d+)\)\s*$")
_DIGITS = re.compile(r"^\d{2,}$")


def parse_serial_cell(raw: Any) -> dict[str, Any]:
    """Parse NÚMEROS cell into serials / accessory / swap / flags."""
    s = norm_text(raw)
    out: dict[str, Any] = {
        "serials": [],
        "swap_with": None,
        "is_accessory": False,
        "accessory_type": None,
        "accessory_note": None,
        "raw": s,
        "flags": [],
    }
    if not s:
        return out

    low = s.casefold()
    if any(k in low for k in ("regulador", "reg.", "adaptador", "mochila", "alquiler de")):
        out["is_accessory"] = True
        out["accessory_note"] = s
        if "adaptador" in low:
            out["accessory_type"] = "ADAPTER"
        elif "mochila" in low:
            out["accessory_type"] = "PORTABLE_O2_BACKPACK"
        else:
            out["accessory_type"] = "REGULATOR"
        return out

    swap = _SWAP_RE.match(s.replace(" ", ""))
    if swap:
        out["serials"] = [swap.group(1)]
        out["swap_with"] = swap.group(2)
        out["flags"].append("SWAP_NOTATION")
        return out

    # Multi-serial: "6035 -169432 -192072" or "6035 169432 192072"
    parts = [p.strip() for p in _SERIAL_SPLIT.split(s) if p.strip()]
    serials: list[str] = []
    for p in parts:
        p2 = p.strip("()[]")
        if _DIGITS.match(p2):
            serials.append(p2)
        elif re.match(r"^\d+", p2):
            # e.g. "2811(BATERIA)" / "2625 BATERIA"
            m = re.match(r"^(\d+)", p2)
            if m:
                serials.append(m.group(1))
                if "bater" in p2.casefold():
                    out["flags"].append("BATTERY_TAG")
        else:
            out["flags"].append(f"NON_SERIAL_TOKEN:{p2}")

    if len(serials) > 1:
        out["flags"].append("MULTI_SERIAL")
    out["serials"] = serials
    if not serials and s:
        out["flags"].append("UNPARSEABLE_SERIAL")
    return out


def cell_to_date(cell: xlrd.sheet.Cell, datemode: int) -> tuple[date | None, str | None]:
    """Parse a workbook cell into a date. Returns (date|None, flag_reason|None)."""
    if cell.ctype == xlrd.XL_CELL_EMPTY:
        return None, None
    if cell.ctype == xlrd.XL_CELL_DATE:
        try:
            dt = xlrd.xldate_as_datetime(cell.value, datemode)
            return dt.date(), None
        except Exception:
            return None, "BAD_DATE_SERIAL"
    if cell.ctype == xlrd.XL_CELL_NUMBER:
        # Sometimes dates stored as bare Excel serials without date type.
        v = cell.value
        if 30000 <= v <= 60000:  # rough Excel date range ~1982–2064
            try:
                return xlrd.xldate_as_datetime(v, datemode).date(), None
            except Exception:
                return None, "BAD_DATE_NUMBER"
        return None, "NUMBER_IN_DATE_CELL"
    if cell.ctype == xlrd.XL_CELL_ERROR:
        return None, "ERROR_CELL"
    if cell.ctype == xlrd.XL_CELL_BOOLEAN:
        return None, "BOOL_IN_DATE_CELL"

    text = norm_text(cell.value)
    if not text:
        return None, None
    low = text.casefold()
    # Known origin-party-in-date-cell hack (011 C5).
    known_origins = ("buroni", "ceres", "pantiga", "tito", "ezequiel", "dsj")
    if low in known_origins:
        return None, f"ORIGIN_IN_DATE:{low}"
    if "error" in low:
        return None, "ERROR_TEXT"

    for fmt in ("%d/%m/%Y", "%d-%m-%Y", "%Y-%m-%d", "%d/%m/%y", "%d-%m-%y"):
        try:
            return datetime.strptime(text, fmt).date(), None
        except ValueError:
            continue
    return None, f"UNPARSEABLE_DATE:{text[:40]}"


def validate_date_range(d: date | None, kind: str = "delivery") -> str | None:
    if d is None:
        return None
    if d < DATE_MIN:
        return f"DATE_BEFORE_2000:{d.isoformat()}"
    if d > today_plus(30):
        return f"DATE_TOO_FUTURE:{d.isoformat()}"
    # Flag suspicious far-future years seen in legacy (2047/2048) even if within +30 somehow.
    if d.year >= 2040:
        return f"SUSPICIOUS_YEAR:{d.isoformat()}"
    return None


def source_key(*parts: Any) -> str:
    return "|".join(norm_text(p) for p in parts)


def request_id_for(*parts: Any) -> uuid.UUID:
    return uuid.uuid5(MIGRATION_NS, source_key(*parts))


def infer_ownership(header_blob: str, sheet_name: str) -> tuple[str, str]:
    """Return (ownership_basis, owner_name_hint). owner_name_hint maps to seeded parties."""
    blob = f"{sheet_name} {header_blob}".casefold()
    if "linde" in blob:
        return "SUPPLIER", "Linde"
    if "intergas" in blob:
        return "SUPPLIER", "Intergas"
    if "nordelta" in blob:
        return "SUPPLIER", "Nordelta"
    if re.search(r"\bdsj\b", blob):
        return "SUPPLIER", "DSJ"
    # "propio" / NUESTRA PROPIEDAD / default
    return "OURS", "Nuestra Empresa"
