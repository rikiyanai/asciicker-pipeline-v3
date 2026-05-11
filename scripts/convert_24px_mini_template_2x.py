from __future__ import annotations

import json
import sys
import argparse
from dataclasses import dataclass
from pathlib import Path

from PIL import Image, ImageDraw

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "src"))
sys.path.insert(0, str(ROOT / "scripts"))

from pipeline_v2.app import create_app
from pipeline_v2.xp_codec import write_xp
from glyph_assignment import (
    GlyphAssignmentConfig,
    assign_image_cells,
    cell_to_json,
    write_contact_sheet,
    write_suggestions_json,
)
from glyph_assignment.matcher import default_font_path


SOURCE_DIR = ROOT / "output" / "24px-mini-characters" / "source_sheets"
OUT_DIR = ROOT / "output" / "24px-mini-characters-template-2x"
TILE_PX = 52
ANGLES = 8
MAGENTA = (255, 0, 255)
ASSIGNMENT_CELL_PX = 6


@dataclass(frozen=True)
class FamilySpec:
    anims: tuple[int, ...]
    cell_w_chars: int
    cell_h_chars: int


FAMILIES = {
    "player": FamilySpec((1, 8), 14, 20),
    "attack": FamilySpec((8,), 18, 20),
    "plydie": FamilySpec((5,), 22, 22),
}


def _cell(
    glyph: int = 0,
    fg: tuple[int, int, int] = (0, 0, 0),
    bg: tuple[int, int, int] = MAGENTA,
):
    return (glyph, fg, bg)


def _transparent_layer(width: int, height: int):
    return [_cell() for _ in range(width * height)]


def _metadata_layer(width: int, height: int, anims: tuple[int, ...]):
    layer = _transparent_layer(width, height)
    values = [str(ANGLES), *[str(value) for value in anims]]
    for x, value in enumerate(values):
        layer[x] = _cell(ord(value[0]), (255, 255, 255), MAGENTA)
    return layer


def _visual_sheet(source: Image.Image, frames: int, spec: FamilySpec) -> Image.Image:
    src = source.convert("RGBA")
    width = frames * 2 * spec.cell_w_chars
    height = ANGLES * spec.cell_h_chars
    visual = Image.new("RGBA", (width, height), (255, 0, 255, 0))
    for angle in range(ANGLES):
        src_y0 = angle * TILE_PX
        dst_y0 = angle * spec.cell_h_chars
        for frame in range(frames):
            src_x0 = frame * TILE_PX
            dst_x0 = frame * spec.cell_w_chars
            mirror_x0 = (frames + frame) * spec.cell_w_chars
            tile = src.crop((src_x0, src_y0, src_x0 + TILE_PX, src_y0 + TILE_PX))
            tile = tile.resize((spec.cell_w_chars, spec.cell_h_chars), Image.Resampling.NEAREST)
            mirrored = tile.transpose(Image.Transpose.FLIP_LEFT_RIGHT)
            visual.paste(tile, (dst_x0, dst_y0), tile)
            visual.paste(mirrored, (mirror_x0, dst_y0), mirrored)
    return visual


def _assignment_sheet(source: Image.Image, frames: int, spec: FamilySpec) -> Image.Image:
    src = source.convert("RGBA")
    width = frames * 2 * spec.cell_w_chars * ASSIGNMENT_CELL_PX
    height = ANGLES * spec.cell_h_chars * ASSIGNMENT_CELL_PX
    sheet = Image.new("RGBA", (width, height), (255, 0, 255, 0))
    for angle in range(ANGLES):
        src_y0 = angle * TILE_PX
        dst_y0 = angle * spec.cell_h_chars * ASSIGNMENT_CELL_PX
        for frame in range(frames):
            src_x0 = frame * TILE_PX
            dst_x0 = frame * spec.cell_w_chars * ASSIGNMENT_CELL_PX
            mirror_x0 = (frames + frame) * spec.cell_w_chars * ASSIGNMENT_CELL_PX
            tile = src.crop((src_x0, src_y0, src_x0 + TILE_PX, src_y0 + TILE_PX))
            tile = tile.resize(
                (spec.cell_w_chars * ASSIGNMENT_CELL_PX, spec.cell_h_chars * ASSIGNMENT_CELL_PX),
                Image.Resampling.NEAREST,
            )
            mirrored = tile.transpose(Image.Transpose.FLIP_LEFT_RIGHT)
            sheet.alpha_composite(tile, (dst_x0, dst_y0))
            sheet.alpha_composite(mirrored, (mirror_x0, dst_y0))
    return sheet


def _image_to_cells(image: Image.Image, config: GlyphAssignmentConfig):
    assigned = assign_image_cells(image, config)
    cells = [_cell(cell.chosen.glyph, cell.chosen.fg, cell.chosen.bg) for cell in assigned]
    return cells, assigned


def _glyph_summary(cells) -> dict:
    counts: dict[int, int] = {}
    low_confidence = 0
    transparent = 0
    for cell in cells:
        if cell.needs_review:
            low_confidence += 1
        glyph = cell.chosen.glyph
        if glyph == 0:
            transparent += 1
        if glyph:
            counts[glyph] = counts.get(glyph, 0) + 1
    top = sorted(counts.items(), key=lambda item: (-item[1], item[0]))[:10]
    return {
        "low_confidence_cells": low_confidence,
        "transparent_cells": transparent,
        "top_glyphs": [{"glyph": glyph, "count": count} for glyph, count in top],
    }


def _chosen_render(cells, width: int, height: int) -> Image.Image:
    scale = 3
    image = Image.new("RGBA", (width * scale, height * scale), (255, 0, 255, 0))
    draw = ImageDraw.Draw(image)
    for cell in cells:
        if cell.chosen.glyph == 0:
            continue
        x0 = cell.x * scale
        y0 = cell.y * scale
        color = (*cell.chosen.fg, 255)
        draw.rectangle((x0, y0, x0 + scale - 1, y0 + scale - 1), fill=color)
        if cell.needs_review:
            draw.point((x0, y0), fill=(255, 255, 0, 255))
    return image


def _family_from_source(path: Path) -> tuple[str, str]:
    stem = path.name.removesuffix("-source.png")
    for family in FAMILIES:
        suffix = f"-{family}"
        if stem.endswith(suffix):
            return stem[: -len(suffix)], family
    raise ValueError(f"cannot infer family from {path}")


def _upload_session(client, xp_path: Path) -> dict:
    with xp_path.open("rb") as fh:
        response = client.post(
            "/api/workbench/upload-xp",
            data={"file": (fh, xp_path.name)},
            content_type="multipart/form-data",
        )
    if response.status_code != 201:
        raise RuntimeError(
            f"upload failed for {xp_path}: {response.status_code} {response.get_data(as_text=True)}"
        )
    return response.get_json()


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--limit", type=int, default=None, help="convert only the first N source sheets")
    args = parser.parse_args()

    xps_dir = OUT_DIR / "xps"
    previews_dir = OUT_DIR / "previews"
    xps_dir.mkdir(parents=True, exist_ok=True)
    previews_dir.mkdir(parents=True, exist_ok=True)
    manifest = []
    sessions = []
    suggestion_groups = []
    contact_items = []
    font_path = default_font_path(ROOT)
    config = GlyphAssignmentConfig(
        font_path=font_path,
        font_cell_size=(ASSIGNMENT_CELL_PX, ASSIGNMENT_CELL_PX),
        target_cell_size=(ASSIGNMENT_CELL_PX, ASSIGNMENT_CELL_PX),
        candidate_limit=2,
    )

    app = create_app()
    client = app.test_client()

    source_paths = sorted(SOURCE_DIR.glob("*-source.png"))
    if args.limit is not None:
        source_paths = source_paths[: args.limit]

    for source_path in source_paths:
        name, family = _family_from_source(source_path)
        spec = FAMILIES[family]
        source = Image.open(source_path)
        if source.height != ANGLES * TILE_PX:
            raise ValueError(
                f"{source_path} height {source.height} does not match {ANGLES}x{TILE_PX}"
            )
        frames = source.width // TILE_PX
        if source.width % TILE_PX or frames != sum(spec.anims):
            raise ValueError(
                f"{source_path} width {source.width} does not match {family} frames {sum(spec.anims)}"
            )

        visual = _visual_sheet(source, frames, spec)
        assignment = _assignment_sheet(source, frames, spec)
        width, height = visual.size
        visual_cells, assigned = _image_to_cells(assignment, config)
        summary = _glyph_summary(assigned)
        layers = [
            _metadata_layer(width, height, spec.anims),
            _transparent_layer(width, height),
            visual_cells,
            _transparent_layer(width, height),
        ]
        xp_path = xps_dir / f"{name}-{family}.xp"
        preview_path = previews_dir / f"{name}-{family}.png"
        write_xp(xp_path, width, height, layers)
        visual.save(preview_path)
        uploaded = _upload_session(client, xp_path)
        suggestion_groups.append(
            {
                "name": name,
                "family": family,
                "xp": str(xp_path),
                "font_path": str(font_path),
                "target_cell_size": list(config.target_cell_size),
                "cells": [
                    cell_to_json(cell)
                    for cell in assigned
                    if cell.chosen.glyph != 0 or cell.needs_review
                ],
                **summary,
            }
        )
        contact_items.append((f"{name}-{family} source", visual))
        contact_items.append((f"{name}-{family} chosen", _chosen_render(assigned, width, height)))
        sessions.append(
            {
                "name": name,
                "family": family,
                "xp": str(xp_path),
                "session_id": uploaded["session_id"],
                "session_kind": uploaded["session_kind"],
                "metadata_status": uploaded["metadata_status"],
                "active_layer": uploaded["active_layer"],
                "visible_layers": uploaded["visible_layers"],
                "locked_layers": uploaded["locked_layers"],
                "grid_cols": uploaded["grid_cols"],
                "grid_rows": uploaded["grid_rows"],
                "cell_w_chars": uploaded.get("cell_w_chars", spec.cell_w_chars),
                "cell_h_chars": uploaded.get("cell_h_chars", spec.cell_h_chars),
                "populated_cells": uploaded["populated_cells"],
            }
        )
        manifest.append(
            {
                "name": name,
                "family": family,
                "source_sheet": str(source_path),
                "xp": str(xp_path),
                "preview": str(preview_path),
                "frames": frames,
                "angles": ANGLES,
                "projections": 2,
                "source_tile_px": TILE_PX,
                "cell_w_chars": spec.cell_w_chars,
                "cell_h_chars": spec.cell_h_chars,
                "dimensions": [width, height],
                "workbench_session_id": uploaded["session_id"],
                "glyph_assignment_mode": "dominant-bg-cp437-mask-v1",
                "font_path": str(font_path),
                "target_cell_size": list(config.target_cell_size),
                **summary,
            }
        )

    write_suggestions_json(OUT_DIR / "glyph_suggestions.json", suggestion_groups)
    write_contact_sheet(OUT_DIR / "glyph_review_contact.png", contact_items)
    (OUT_DIR / "conversion_manifest.json").write_text(
        json.dumps(manifest, indent=2) + "\n"
    )
    (OUT_DIR / "workbench_sessions.json").write_text(json.dumps(sessions, indent=2) + "\n")
    print(f"wrote {len(manifest)} 2x-template XP files to {OUT_DIR}")


if __name__ == "__main__":
    main()
