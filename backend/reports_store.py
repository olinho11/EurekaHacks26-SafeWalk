"""Simple JSON persistence for crowdsourced safety reports (demo)."""

from __future__ import annotations

import json
import threading
import time
import uuid
from pathlib import Path

_lock = threading.Lock()
DEFAULT_PATH = Path(__file__).resolve().parent / "data" / "reports.json"


def _ensure(path: Path) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    if not path.exists():
        path.write_text("[]", encoding="utf-8")


def load_reports(path: Path | None = None) -> list[dict]:
    p = path or DEFAULT_PATH
    _ensure(p)
    with _lock:
        raw = p.read_text(encoding="utf-8")
    try:
        data = json.loads(raw)
        return data if isinstance(data, list) else []
    except json.JSONDecodeError:
        return []


def append_report(
    lat: float,
    lon: float,
    kind: str,
    message: str,
    path: Path | None = None,
) -> dict:
    p = path or DEFAULT_PATH
    _ensure(p)
    rec = {
        "id": str(uuid.uuid4()),
        "lat": lat,
        "lon": lon,
        "kind": kind,
        "message": (message or "")[:500],
        "ts": int(time.time()),
    }
    with _lock:
        items = load_reports(p)
        items.append(rec)
        p.write_text(json.dumps(items, indent=2), encoding="utf-8")
    return rec
