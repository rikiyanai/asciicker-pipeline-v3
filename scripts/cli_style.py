"""Small terminal formatting helpers shared by repo scripts."""

from __future__ import annotations

from collections.abc import Sequence
from typing import Any

SPARKLINE_CHARS = "▁▂▃▄▅▆▇█"


def kv(
    pairs: Sequence[tuple[str, Any]],
    *,
    indent: int = 0,
) -> str:
    """Return aligned key/value rows."""
    if not pairs:
        return ""
    prefix = "  " * indent
    width = max(len(str(key)) for key, _value in pairs)
    return "\n".join(f"{prefix}{str(key):<{width}}  {value}" for key, value in pairs)


def sparkline(
    values: Sequence[float],
    *,
    lo: float | None = None,
    hi: float | None = None,
    color: bool = False,
) -> str:
    """Return a compact inline chart.

    ``color`` is accepted for compatibility with the Y9-2 helper; this repo's
    scripts only need stable plain-text output in CI and terminals.
    """
    if not values:
        return ""
    lo_ = min(values) if lo is None else lo
    hi_ = max(values) if hi is None else hi
    span = float(hi_ - lo_) or 1.0
    chars: list[str] = []
    for value in values:
        t = max(0.0, min(1.0, (float(value) - lo_) / span))
        chars.append(SPARKLINE_CHARS[min(7, int(t * len(SPARKLINE_CHARS)))])
    return "".join(chars)
