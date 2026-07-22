#!/usr/bin/env python3
"""CLI: import legacy .xls workbooks into PostgreSQL (spec 011)."""

from __future__ import annotations

import argparse
import json
import os
import sys
import time
from pathlib import Path

from weld_migration.load import Loader
from weld_migration.parse import ExtractResult, parse_client_workbook, parse_propios_workbook

ROOT = Path(__file__).resolve().parents[2]

DEFAULT_DSN = "postgres://postgres:test@localhost:5432/weld"

DEFAULT_FILES = {
    "JUNIN": ROOT
    / "CILINDRO CLIENT REPARTO (Autoguardado) (Autoguardado) (Autoguardado) (Autoguardado).xls",
    "CHACABUCO": ROOT / "CILINDROS CLIENTES CHACABUCO.xls",
    "PROPIOS": ROOT / "CILINDROS PROPIOS.xls",
}


def _load_dotenv(path: Path) -> None:
    """Minimal .env loader (no dependency). Does not override existing env vars."""
    if not path.is_file():
        return
    try:
        text = path.read_text(encoding="utf-8")
    except OSError:
        return
    for line in text.splitlines():
        s = line.strip()
        if not s or s.startswith("#") or "=" not in s:
            continue
        key, _, val = s.partition("=")
        key = key.strip()
        if not key or key in os.environ:
            continue
        val = val.strip()
        if len(val) >= 2 and val[0] == val[-1] and val[0] in "\"'":
            val = val[1:-1]
        os.environ[key] = val


def _resolve_database_url(cli_value: str | None) -> str:
    """Prefer CLI arg, then env / .env, then local docker default. Ignore empty strings."""
    if cli_value and cli_value.strip():
        return cli_value.strip()
    env = (os.environ.get("DATABASE_URL") or "").strip()
    if env:
        return env
    return DEFAULT_DSN


def merge_extract(into: ExtractResult, src: ExtractResult) -> None:
    into.clients.extend(src.clients)
    into.cylinders.extend(src.cylinders)
    into.movements.extend(src.movements)
    into.exceptions.extend(src.exceptions)
    for k, v in src.stats.items():
        into.stats[k] = into.stats.get(k, 0) + v


def main(argv: list[str] | None = None) -> int:
    _load_dotenv(ROOT / ".env")

    parser = argparse.ArgumentParser(description="Import legacy cylinder workbooks (011)")
    parser.add_argument(
        "--database-url",
        default=None,
        help=f"Postgres URL (default: $DATABASE_URL from env/.env, or {DEFAULT_DSN})",
    )
    parser.add_argument("--dry-run", action="store_true", help="Parse + report without writing")
    parser.add_argument(
        "--skip-propios",
        action="store_true",
        help="Skip CILINDROS PROPIOS (debug)",
    )
    parser.add_argument(
        "--skip-clients",
        action="store_true",
        help="Skip client route-books (debug)",
    )
    parser.add_argument(
        "--backfill-capacity",
        action="store_true",
        help="Only re-parse PROPIOS headers and UPDATE cylinder.capacity_m3 (safe on loaded DB)",
    )
    parser.add_argument(
        "--report",
        type=Path,
        default=ROOT / "migration" / "reconciliation_report.json",
    )
    parser.add_argument("--junin", type=Path, default=DEFAULT_FILES["JUNIN"])
    parser.add_argument("--chacabuco", type=Path, default=DEFAULT_FILES["CHACABUCO"])
    parser.add_argument("--propios", type=Path, default=DEFAULT_FILES["PROPIOS"])
    args = parser.parse_args(argv)
    database_url = _resolve_database_url(args.database_url)

    if args.backfill_capacity:
        print(f"Backfill capacity from: {args.propios.name}", flush=True)
        print(f"  database: {database_url.split('@')[-1] if '@' in database_url else database_url}", flush=True)
        extracted = parse_propios_workbook(str(args.propios), "PROPIOS")
        with_cap = sum(1 for c in extracted.cylinders if c.capacity_m3 is not None)
        print(
            f"  cylinders={len(extracted.cylinders)} with_capacity={with_cap}",
            flush=True,
        )
        loader = Loader(database_url, dry_run=args.dry_run)
        report = loader.backfill_capacities(extracted.cylinders)
        args.report.parent.mkdir(parents=True, exist_ok=True)
        args.report.write_text(json.dumps(report, indent=2, default=str))
        print(json.dumps(report, indent=2, default=str))
        print(f"\nWrote report → {args.report}", flush=True)
        return 0

    extracted = ExtractResult()
    t0 = time.time()

    if not args.skip_clients:
        print(f"Extracting Junín: {args.junin.name}", flush=True)
        merge_extract(
            extracted, parse_client_workbook(str(args.junin), "JUNIN", "Junín")
        )
        print(
            f"  clients={len(extracted.clients)} movements={len(extracted.movements)} "
            f"exceptions={len(extracted.exceptions)}",
            flush=True,
        )
        print(f"Extracting Chacabuco: {args.chacabuco.name}", flush=True)
        before_m = len(extracted.movements)
        before_c = len(extracted.clients)
        merge_extract(
            extracted, parse_client_workbook(str(args.chacabuco), "CHACABUCO", "Chacabuco")
        )
        print(
            f"  +clients={len(extracted.clients) - before_c} "
            f"+movements={len(extracted.movements) - before_m}",
            flush=True,
        )

    if not args.skip_propios:
        print(f"Extracting Propios: {args.propios.name}", flush=True)
        before_cyl = len(extracted.cylinders)
        before_m = len(extracted.movements)
        merge_extract(extracted, parse_propios_workbook(str(args.propios), "PROPIOS"))
        print(
            f"  +cylinders={len(extracted.cylinders) - before_cyl} "
            f"+movements/mirrors={len(extracted.movements) - before_m}",
            flush=True,
        )

    print(
        f"Extract done in {time.time() - t0:.1f}s — "
        f"clients={len(extracted.clients)} cylinders={len(extracted.cylinders)} "
        f"movements={len(extracted.movements)} parse_exceptions={len(extracted.exceptions)}",
        flush=True,
    )

    print(f"Loading into DB (dry_run={args.dry_run})…", flush=True)
    t1 = time.time()
    loader = Loader(database_url, dry_run=args.dry_run)
    report = loader.run(extracted)
    report["elapsed_extract_s"] = round(t0 and (t1 - t0), 2)
    report["elapsed_load_s"] = round(time.time() - t1, 2)
    report["elapsed_total_s"] = round(time.time() - t0, 2)

    args.report.parent.mkdir(parents=True, exist_ok=True)
    args.report.write_text(json.dumps(report, indent=2, default=str))
    print(json.dumps(report, indent=2, default=str))
    print(f"\nWrote report → {args.report}", flush=True)
    return 0


if __name__ == "__main__":
    sys.exit(main())
