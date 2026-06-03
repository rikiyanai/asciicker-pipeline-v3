"""Run the matcher on Asciicker game XPs (wolfie/bigbee/player/etc).

Pipeline per XP:
  1. Load XP, render its visible layers as a composite PIL Image at the
     matcher's native cell size (BDF-font glyph masks).
  2. Run the full FL-4095..FL-4099 matcher (iter 5b baseline config) on
     that composite, with semantic_maps/{family}-roles.json + {family}-
     spatial.json loaded for the family.
  3. Render the matcher's chosen glyphs back to a PIL Image using the same
     BDF font.
  4. Stack source ‖ matcher-output side-by-side, save, open in Preview.

Run:
  python3 pipeline-v3/scripts/convert_asciicker_xp.py
"""
from __future__ import annotations

import argparse
import os
import subprocess
import sys
from dataclasses import replace as dc_replace
from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "scripts"))
sys.path.insert(0, str(ROOT / "src"))

from glyph_assignment import (
    GlyphAssignmentConfig,
    assign_image_cells,
    load_optional_semantic_bias,
)
from glyph_assignment.font_atlas import load_glyph_masks
from glyph_assignment.matcher import default_font_path
from xp_core import XPFile

MAP_ROOT = ROOT / "docs" / "research" / "ascii" / "semantic_maps"
RENDER_DIR = Path("/tmp/asciicker_xp_render")
CELL_PX = 6  # one BDF cell per matcher cell

DEFAULT_XPS = [
    "sprites/player-1112.xp",
    "sprites/wolfie-1112.xp",
    "sprites/bigbee-1012.xp",
]


def _family_from_path(path: str) -> str:
    name = Path(path).stem
    for fam in ("player", "wolfie", "bigbee", "wolack", "plydie", "attack"):
        if name.startswith(fam):
            return fam
    return "player"


def _render_layer(layer, cell_px: int, masks_dict: dict[int, np.ndarray]) -> Image.Image:
    """Render one XPLayer to a PIL Image using BDF masks. Magenta-bg cells
    stay transparent so layers composite cleanly."""
    width_px = layer.width * cell_px
    height_px = layer.height * cell_px
    img = Image.new("RGBA", (width_px, height_px), (0, 0, 0, 0))
    px = img.load()
    for x in range(layer.width):
        for y in range(layer.height):
            glyph, fg, bg = layer.data[y][x]
            transparent_bg = bg == (255, 0, 255)
            x0 = x * cell_px
            y0 = y * cell_px
            # Paint background first (skip transparent).
            if not transparent_bg:
                for dy in range(cell_px):
                    for dx in range(cell_px):
                        px[x0 + dx, y0 + dy] = (*bg, 255)
            # Stamp glyph mask in fg.
            mask = masks_dict.get(glyph) if glyph else None
            if mask is None:
                continue
            mh, mw = mask.shape
            for dy in range(cell_px):
                for dx in range(cell_px):
                    sx = dx * mw // cell_px
                    sy = dy * mh // cell_px
                    if mask[sy, sx]:
                        px[x0 + dx, y0 + dy] = (*fg, 255)
    return img


def _composite_xp_layers(xp: XPFile, masks_dict: dict[int, np.ndarray]) -> Image.Image:
    """Skip L0 (metadata). Composite L1..LN in order."""
    base = None
    for i, layer in enumerate(xp.layers):
        if i == 0:
            continue  # metadata
        img = _render_layer(layer, CELL_PX, masks_dict)
        if base is None:
            base = img
        else:
            base.alpha_composite(img)
    if base is None:
        return Image.new("RGBA", (1, 1), (0, 0, 0, 0))
    return base


def _render_matcher_output(
    cells, masks_dict: dict[int, np.ndarray]
) -> Image.Image:
    """Render the matcher's chosen glyphs back to a PIL Image."""
    if not cells:
        return Image.new("RGBA", (1, 1), (0, 0, 0, 0))
    max_x = max(c.x for c in cells) + 1
    max_y = max(c.y for c in cells) + 1
    width_px = max_x * CELL_PX
    height_px = max_y * CELL_PX
    img = Image.new("RGBA", (width_px, height_px), (24, 24, 24, 255))
    px = img.load()
    for cell in cells:
        glyph = cell.chosen.glyph
        if glyph == 0:
            continue
        fg = cell.chosen.fg
        bg = cell.chosen.bg
        x0 = cell.x * CELL_PX
        y0 = cell.y * CELL_PX
        transparent_bg = bg == (255, 0, 255)
        if not transparent_bg:
            for dy in range(CELL_PX):
                for dx in range(CELL_PX):
                    px[x0 + dx, y0 + dy] = (*bg, 255)
        mask = masks_dict.get(glyph)
        if mask is None:
            continue
        mh, mw = mask.shape
        for dy in range(CELL_PX):
            for dx in range(CELL_PX):
                sx = dx * mw // CELL_PX
                sy = dy * mh // CELL_PX
                if mask[sy, sx]:
                    px[x0 + dx, y0 + dy] = (*fg, 255)
    return img


def _make_config(family: str, font_path: Path) -> GlyphAssignmentConfig:
    """iter 5b baseline config — all FL-4095..FL-4099 features active,
    iter 5b parameters locked (threshold 80, RGB edges)."""
    bias = load_optional_semantic_bias(MAP_ROOT, role=family)
    return GlyphAssignmentConfig(
        font_path=font_path,
        font_cell_size=(CELL_PX, CELL_PX),
        target_cell_size=(CELL_PX, CELL_PX),
        candidate_limit=6,
        score_delta_threshold=0.20,
        semantic_bias=bias,
        edge_aware=True,
        edge_magnitude_threshold=80.0,
        edge_use_dog=True,
        edge_grid_shift_search_px=2,
        edge_use_alpha_channel=False,
        ssim_for_strokes=True,
        ssim_candidate_filter_by_orientation=True,
        multi_scale_edges=True,
        use_skeleton_polyline=True,
        anti_fill_in_body=True,
        polyline_primary=True,
        silhouette_only=os.environ.get("GLYPH_SILHOUETTE_ONLY", "0") == "1",
    )


def _compose_side_by_side(
    family: str,
    name: str,
    source_img: Image.Image,
    matcher_img: Image.Image,
) -> Image.Image:
    pad = 16
    label_h = 24
    w = max(source_img.width, matcher_img.width)
    h = max(source_img.height, matcher_img.height)
    canvas_w = pad * 3 + w * 2
    canvas_h = pad * 2 + label_h * 2 + h
    canvas = Image.new("RGBA", (canvas_w, canvas_h), (24, 24, 24, 255))
    canvas.alpha_composite(source_img, (pad, label_h + pad))
    canvas.alpha_composite(matcher_img, (pad * 2 + w, label_h + pad))
    draw = ImageDraw.Draw(canvas)
    draw.text((pad, 4), f"{family}/{name}  —  SOURCE (XP rendered) | MATCHER OUTPUT (FL-4095..FL-4099)", fill=(240, 240, 240, 255))
    draw.text((pad, label_h + pad + h + 2), f"SOURCE  {source_img.size[0]}x{source_img.size[1]}", fill=(220, 220, 100, 255))
    draw.text((pad * 2 + w, label_h + pad + h + 2), f"MATCHER  {matcher_img.size[0]}x{matcher_img.size[1]}", fill=(120, 240, 140, 255))
    return canvas


def process_xp(xp_relpath: str, font_path: Path, masks_dict: dict[int, np.ndarray]) -> Path:
    xp_path = ROOT / xp_relpath
    family = _family_from_path(xp_relpath)
    name = Path(xp_relpath).stem
    print(f"  loading {xp_path}")
    xp = XPFile()
    xp.load(str(xp_path))

    print(f"  rendering source ({len(xp.layers)} layers)...")
    source_img = _composite_xp_layers(xp, masks_dict)
    print(f"    source size: {source_img.size}")

    print(f"  running matcher with family={family}...")
    config = _make_config(family, font_path)
    cells = assign_image_cells(source_img, config)
    matcher_img = _render_matcher_output(cells, masks_dict)
    print(f"    matcher output: {matcher_img.size}")

    composite = _compose_side_by_side(family, name, source_img, matcher_img)
    out_path = RENDER_DIR / f"{name}_xp_vs_matcher.png"
    composite.save(out_path)
    print(f"  wrote {out_path}  ({out_path.stat().st_size} bytes)")
    return out_path


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument(
        "--xp",
        action="append",
        default=None,
        help="XP path relative to pipeline-v3 root (repeatable). Defaults: player/wolfie/bigbee samples.",
    )
    parser.add_argument(
        "--no-open",
        action="store_true",
        help="don't open the rendered PNGs in Preview at the end",
    )
    args = parser.parse_args()

    xp_paths = args.xp if args.xp else DEFAULT_XPS
    RENDER_DIR.mkdir(parents=True, exist_ok=True)

    print(f"loading BDF font masks at {CELL_PX}x{CELL_PX}...")
    masks = load_glyph_masks(default_font_path(ROOT), (CELL_PX, CELL_PX))
    masks_dict = {m.glyph: m.mask for m in masks}
    print(f"  {len(masks_dict)} glyph masks loaded")

    rendered: list[Path] = []
    font_path = default_font_path(ROOT)
    for xp_relpath in xp_paths:
        out = process_xp(xp_relpath, font_path, masks_dict)
        rendered.append(out)

    print()
    print(f"rendered {len(rendered)} XP comparisons:")
    for p in rendered:
        print(f"  {p}")

    if not args.no_open:
        subprocess.run(
            ["open", "-a", "Preview", *[str(p) for p in rendered]], check=False
        )

    return 0


if __name__ == "__main__":
    sys.exit(main())
