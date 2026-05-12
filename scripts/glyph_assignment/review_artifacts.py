from __future__ import annotations

import json
from pathlib import Path

from PIL import Image, ImageDraw

from .candidate import AssignedCell


def cell_to_json(cell: AssignedCell) -> dict:
    return {
        "x": cell.x,
        "y": cell.y,
        "region": cell.region,
        "chosen": _candidate_to_json(cell.chosen),
        "alternatives": [_candidate_to_json(candidate) for candidate in cell.alternatives],
        "confidence": cell.confidence,
        "needs_review": cell.needs_review,
    }


def _candidate_to_json(candidate) -> dict:
    return {
        "glyph": candidate.glyph,
        "fg": list(candidate.fg),
        "bg": list(candidate.bg),
        "score": candidate.score,
        "components": candidate.components,
        "reasons": candidate.reasons,
    }


def _strip_cell_for_compact(cell_dict: dict) -> dict:
    """Return a copy of *cell_dict* with non-essential fields removed.

    For cells where ``needs_review`` is ``False``, ``alternatives`` and the
    ``chosen`` sub-fields ``components`` and ``reasons`` are dropped to reduce
    artifact size.  Cells where ``needs_review`` is ``True`` are returned
    unchanged so human reviewers retain all scoring context.
    """
    if cell_dict.get("needs_review"):
        return cell_dict
    stripped = dict(cell_dict)
    stripped.pop("alternatives", None)
    if "chosen" in stripped:
        chosen = dict(stripped["chosen"])
        chosen.pop("components", None)
        chosen.pop("reasons", None)
        stripped["chosen"] = chosen
    return stripped


def write_suggestions_json(path: Path, groups: list[dict], *, compact: bool = False) -> None:
    """Write *groups* to *path* as ``{"groups": [...]}`` JSON.

    When *compact* is ``True``, cells where ``needs_review=False`` are written
    without ``alternatives`` and without the ``chosen.components`` /
    ``chosen.reasons`` fields.  Cells where ``needs_review=True`` are always
    written in full so reviewers have all scoring context available.
    The default (``compact=False``) is backward-compatible with callers that
    relied on the previous single-argument signature.
    """
    if compact:
        out_groups = []
        for group in groups:
            g = dict(group)
            g["cells"] = [_strip_cell_for_compact(c) for c in g.get("cells", [])]
            out_groups.append(g)
    else:
        out_groups = groups
    path.write_text(json.dumps({"groups": out_groups}, indent=2) + "\n")


def write_suggestions_compact(path: Path, groups: list[dict]) -> None:
    """Convenience wrapper: write a compact review artifact to *path*."""
    write_suggestions_json(path, groups, compact=True)


def write_sheet_summary(path: Path, groups: list[dict]) -> None:
    """Write a lightweight per-sheet statistics file to *path*.

    Each group produces one entry with aggregate counts and confidence
    percentiles.  No per-cell data is included.

    ``cells_listed`` is the count of cells included in the suggestions group
    (non-transparent and needs-review cells), NOT the total sheet cell count.
    Transparent cells where needs_review is False are excluded from the
    suggestions file and are therefore not counted here.

    Fields per entry:
      name, family, cells_listed, low_confidence_cells, needs_review_cells,
      top_5_glyphs [{glyph, count}], confidence_p50, confidence_p90
    """
    summary_groups = []
    for group in groups:
        cells = group.get("cells", [])
        total = len(cells)
        low_conf = sum(1 for c in cells if c.get("needs_review"))
        confidences = [c.get("confidence", 0.0) for c in cells]
        glyph_counts: dict[int, int] = {}
        for c in cells:
            glyph = c.get("chosen", {}).get("glyph")
            if glyph is not None:
                glyph_counts[glyph] = glyph_counts.get(glyph, 0) + 1
        top_5 = sorted(glyph_counts.items(), key=lambda kv: (-kv[1], kv[0]))[:5]

        if confidences:
            sorted_conf = sorted(confidences)
            n = len(sorted_conf)
            p50_idx = max(0, int(n * 0.50) - 1)
            p90_idx = max(0, int(n * 0.90) - 1)
            conf_p50 = round(sorted_conf[p50_idx], 4)
            conf_p90 = round(sorted_conf[p90_idx], 4)
        else:
            conf_p50 = conf_p90 = 0.0

        summary_groups.append({
            "name": group.get("name", ""),
            "family": group.get("family", ""),
            "cells_listed": total,
            "low_confidence_cells": low_conf,
            "needs_review_cells": low_conf,
            "top_5_glyphs": [{"glyph": g, "count": c} for g, c in top_5],
            "confidence_p50": conf_p50,
            "confidence_p90": conf_p90,
        })

    path.write_text(json.dumps({"groups": summary_groups}, indent=2) + "\n")


def write_contact_sheet(path: Path, items: list[tuple[str, Image.Image]], *, cols: int = 4) -> None:
    if not items:
        Image.new("RGBA", (1, 1), (0, 0, 0, 0)).save(path)
        return
    thumb_w, thumb_h = 180, 160
    rows = (len(items) + cols - 1) // cols
    sheet = Image.new("RGBA", (cols * thumb_w, rows * thumb_h), (24, 24, 24, 255))
    draw = ImageDraw.Draw(sheet)
    for idx, (label, image) in enumerate(items):
        x = (idx % cols) * thumb_w
        y = (idx // cols) * thumb_h
        draw.rectangle((x, y, x + thumb_w - 1, y + thumb_h - 1), outline=(70, 70, 70, 255))
        scale = min((thumb_w - 16) / max(1, image.width), (thumb_h - 34) / max(1, image.height), 10)
        resized = image.convert("RGBA").resize(
            (max(1, int(image.width * scale)), max(1, int(image.height * scale))),
            Image.Resampling.NEAREST,
        )
        sheet.alpha_composite(resized, (x + (thumb_w - resized.width) // 2, y + 24))
        draw.text((x + 6, y + 5), label[:28], fill=(235, 235, 235, 255))
    sheet.save(path)
