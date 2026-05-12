"""Load and apply human-authored glyph review overrides.

Override file format (JSON):

    {
      "{name}/{family}/{x}/{y}": {
        "glyph":    int,          # optional
        "fg":       [R, G, B],    # optional
        "bg":       [R, G, B],    # optional
        "region":   "face",       # optional
        "accepted": true          # optional – bypass scoring entirely
      },
      ...
    }

``load_overrides`` reads the file, filters to records matching the given
(name, family), and returns a ``{(x, y): record_dict}`` mapping.
"""
from __future__ import annotations

import json
import warnings
from pathlib import Path


def load_overrides(
    path: Path | None,
    name: str,
    family: str,
) -> dict[tuple[int, int], dict]:
    """Load override records for *name*/*family* from *path*.

    Returns a ``{(x, y): record}`` mapping for records whose key matches
    ``"{name}/{family}/{x}/{y}"``.  Returns ``{}`` without error when *path*
    is ``None``, the file is missing, or no records match.  A malformed JSON
    file emits a ``RuntimeWarning`` and returns ``{}``.
    """
    if path is None:
        return {}
    if not path.exists():
        return {}
    try:
        raw: dict = json.loads(path.read_text())
    except (json.JSONDecodeError, OSError) as exc:
        warnings.warn(
            f"could not parse override file {path.name}: {exc}; overrides disabled",
            RuntimeWarning,
            stacklevel=2,
        )
        return {}

    prefix = f"{name}/{family}/"
    result: dict[tuple[int, int], dict] = {}
    for key, record in raw.items():
        if not key.startswith(prefix):
            continue
        tail = key[len(prefix):]
        parts = tail.split("/")
        if len(parts) != 2:
            continue
        try:
            x, y = int(parts[0]), int(parts[1])
        except ValueError:
            continue
        if not isinstance(record, dict):
            warnings.warn(
                f"override record for {key!r} is {type(record).__name__}, not dict; skipped",
                RuntimeWarning,
                stacklevel=2,
            )
            continue
        result[(x, y)] = record

    return result
