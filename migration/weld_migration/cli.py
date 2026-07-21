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

DEFAULT_FILES = {
    "JUNIN": ROOT
    / "CILINDRO CLIENT REPARTO (Autoguardado) (Autoguardado) (Autoguardado) (Autoguardado).xls",
    "CHACABUCO": ROOT / "CILINDROS CLIENTES CHACABUCO.xls",
    "PROPIOS": ROOT / "CILINDROS PROPIOS.xls",
}


def merge_extract(into: ExtractResult, src: ExtractResult) -> None:
    into.clients.extend(src.clients)
    into.cylinders.extend(src.cylinders)
    into.movements.extend(src.movements)
    into.exceptions.extend(src.exceptions)
    for k, v in src.stats.items():
        into.stats[k] = into.stats.get(k, 0) + v


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description="Import legacy cylinder workbooks (011)")
    parser.add_argument(
        "--database-url",
        default=os.environ.get("DATABASE_URL", "postgres://postgres:test@localhost:5432/weld"),
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
        "--report",
        type=Path,
        default=ROOT / "migration" / "reconciliation_report.json",
    )
    parser.add_argument("--junin", type=Path, default=DEFAULT_FILES["JUNIN"])
    parser.add_argument("--chacabuco", type=Path, default=DEFAULT_FILES["CHACABUCO"])
    parser.add_argument("--propios", type=Path, default=DEFAULT_FILES["PROPIOS"])
    args = parser.parse_args(argv)

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
    loader = Loader(args.database_url, dry_run=args.dry_run)
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
