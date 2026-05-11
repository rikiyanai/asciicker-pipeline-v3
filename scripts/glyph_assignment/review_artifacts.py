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


def write_suggestions_json(path: Path, groups: list[dict]) -> None:
    path.write_text(json.dumps({"groups": groups}, indent=2) + "\n")


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
