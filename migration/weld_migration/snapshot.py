"""Filesystem snapshots via pg_dump / pg_restore for migration sync/rollback."""

from __future__ import annotations

import json
import shutil
import subprocess
import time
import uuid
from datetime import datetime, timezone
from pathlib import Path
from typing import Any
from urllib.parse import urlparse, urlunparse

import psycopg
from psycopg.rows import dict_row

COUNT_SQL = """
SELECT
  (SELECT count(*) FROM client WHERE deleted_at IS NULL) AS clients,
  (SELECT count(*) FROM cylinder WHERE deleted_at IS NULL) AS cylinders,
  (SELECT count(*) FROM movement_event) AS movements,
  (SELECT count(*) FROM migration_exception) AS exceptions
"""


def _parse_dsn(dsn: str) -> dict[str, str]:
    """Map postgres URL to libpq env-friendly pieces for pg_dump/pg_restore."""
    u = urlparse(dsn)
    dbname = (u.path or "/weld").lstrip("/") or "weld"
    return {
        "host": u.hostname or "localhost",
        "port": str(u.port or 5432),
        "user": u.username or "postgres",
        "password": u.password or "",
        "dbname": dbname,
    }


def _pg_env(dsn: str) -> dict[str, str]:
    parts = _parse_dsn(dsn)
    env = dict(**{k: v for k, v in __import__("os").environ.items()})
    env["PGHOST"] = parts["host"]
    env["PGPORT"] = parts["port"]
    env["PGUSER"] = parts["user"]
    env["PGPASSWORD"] = parts["password"]
    env["PGDATABASE"] = parts["dbname"]
    return env


def row_counts(dsn: str) -> dict[str, int]:
    with psycopg.connect(dsn, row_factory=dict_row) as conn:
        row = conn.execute(COUNT_SQL).fetchone()
        assert row is not None
        return {k: int(v) for k, v in row.items()}


def create_snapshot(dsn: str, snapshots_dir: Path, label: str) -> dict[str, Any]:
    snapshots_dir.mkdir(parents=True, exist_ok=True)
    snap_id = f"{datetime.now(timezone.utc).strftime('%Y%m%dT%H%M%SZ')}_{uuid.uuid4().hex[:8]}"
    dest = snapshots_dir / snap_id
    dest.mkdir(parents=True, exist_ok=False)
    dump_path = dest / "dump.pgc"
    counts = row_counts(dsn)
    env = _pg_env(dsn)
    t0 = time.time()
    proc = subprocess.run(
        [
            "pg_dump",
            "--format=custom",
            "--no-owner",
            "--no-acl",
            f"--file={dump_path}",
        ],
        env=env,
        capture_output=True,
        text=True,
        check=False,
    )
    if proc.returncode != 0:
        shutil.rmtree(dest, ignore_errors=True)
        raise RuntimeError(
            f"pg_dump failed ({proc.returncode}): {proc.stderr.strip() or proc.stdout.strip()}"
        )
    meta = {
        "id": snap_id,
        "label": label,
        "created_at": datetime.now(timezone.utc).isoformat(),
        "row_counts": counts,
        "dump_bytes": dump_path.stat().st_size,
        "elapsed_s": round(time.time() - t0, 2),
        "marked_good": False,
    }
    (dest / "meta.json").write_text(json.dumps(meta, indent=2), encoding="utf-8")
    return meta


def list_snapshots(snapshots_dir: Path) -> list[dict[str, Any]]:
    if not snapshots_dir.is_dir():
        return []
    out: list[dict[str, Any]] = []
    for child in sorted(snapshots_dir.iterdir(), reverse=True):
        meta_path = child / "meta.json"
        if not meta_path.is_file():
            continue
        try:
            meta = json.loads(meta_path.read_text(encoding="utf-8"))
        except (OSError, json.JSONDecodeError):
            continue
        out.append(meta)
    return out


def mark_snapshot_good(snapshots_dir: Path, snap_id: str, good: bool = True) -> dict[str, Any]:
    dest = snapshots_dir / snap_id
    meta_path = dest / "meta.json"
    if not meta_path.is_file():
        raise FileNotFoundError(f"Snapshot not found: {snap_id}")
    meta = json.loads(meta_path.read_text(encoding="utf-8"))
    meta["marked_good"] = good
    meta_path.write_text(json.dumps(meta, indent=2), encoding="utf-8")
    return meta


def rollback_snapshot(dsn: str, snapshots_dir: Path, snap_id: str) -> dict[str, Any]:
    dest = snapshots_dir / snap_id
    dump_path = dest / "dump.pgc"
    meta_path = dest / "meta.json"
    if not dump_path.is_file():
        raise FileNotFoundError(f"Snapshot dump missing: {snap_id}")
    env = _pg_env(dsn)
    t0 = time.time()
    # Restore into the same database. --clean drops objects before recreate.
    proc = subprocess.run(
        [
            "pg_restore",
            "--clean",
            "--if-exists",
            "--no-owner",
            "--no-acl",
            "--dbname",
            env["PGDATABASE"],
            str(dump_path),
        ],
        env=env,
        capture_output=True,
        text=True,
        check=False,
    )
    # pg_restore often exits 1 on benign notices; treat only hard failures.
    if proc.returncode not in (0, 1):
        raise RuntimeError(
            f"pg_restore failed ({proc.returncode}): {proc.stderr.strip() or proc.stdout.strip()}"
        )
    counts = row_counts(dsn)
    meta = json.loads(meta_path.read_text(encoding="utf-8")) if meta_path.is_file() else {"id": snap_id}
    return {
        "snapshot_id": snap_id,
        "label": meta.get("label"),
        "elapsed_s": round(time.time() - t0, 2),
        "row_counts_after": counts,
        "stderr_tail": (proc.stderr or "")[-2000:],
    }


def redact_dsn(dsn: str) -> str:
    u = urlparse(dsn)
    if u.password:
        netloc = f"{u.username}:***@{u.hostname}"
        if u.port:
            netloc += f":{u.port}"
        return urlunparse((u.scheme, netloc, u.path, "", "", ""))
    return dsn
