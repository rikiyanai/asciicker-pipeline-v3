from __future__ import annotations

import json
from pathlib import Path
from typing import Any


def save_json(path: str | Path, payload: dict[str, Any], *, compact: bool = False) -> None:
    p = Path(path)
    p.parent.mkdir(parents=True, exist_ok=True)
    if compact:
        text = json.dumps(payload, separators=(",", ":"))
    else:
        text = json.dumps(payload, indent=2)
    p.write_text(text, encoding="utf-8")


def load_json(path: str | Path) -> dict[str, Any]:
    p = Path(path)
    return json.loads(p.read_text(encoding="utf-8"))


def exists(path: str | Path) -> bool:
    return Path(path).exists()
