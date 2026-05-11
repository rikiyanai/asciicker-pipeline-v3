#!/usr/bin/env python3
"""Build reviewed block-face slices and CP437 OCR diagnostics.

This is intentionally manifest-first. It uses the user-cleaned RGBA source
strips as the authority, writes padded transparent semantic slices, and only
then produces provisional XP sheets so glyph selection can be reviewed.
"""

from __future__ import annotations

import argparse
import json
import sys
from dataclasses import dataclass
from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "scripts"))

from png2xp2png import BdfFont, _CP437_TO_UNI  # noqa: E402
from xp_core import XPFile, XPLayer  # noqa: E402

MAGENTA = (255, 0, 255)
CELL = 6
ANGLE_ROWS = 8

MIDDLE_LABELS = [
    "west_low",
    "northwest_diagonal",
    "northwest_thin",
    "north_flat",
    "northeast_thin",
    "northeast_diagonal",
    "east_low",
    "southwest_low",
    "south_low",
    "south_flat",
    "southeast_low",
    "east_southeast_low",
]

PILLAR_LABELS = [
    "west_cap",
    "northwest_cap",
    "northwest_face",
    "north_face",
    "northeast_face",
    "east_cap",
    "west_cap_alt",
    "northwest_cap_alt",
    "northwest_face_alt",
    "north_face_alt",
    "northeast_face_alt",
    "east_cap_alt",
]

TINY_LABELS = [
    "northwest_tiny",
    "north_tiny",
    "northeast_tiny",
    "southwest_tiny",
    "south_tiny",
    "southeast_tiny",
]


@dataclass(frozen=True)
class SliceSpec:
    family: str
    name: str
    facing: str
    source: str
    source_order: int
    crop_box: tuple[int, int, int, int]
    role: str = "face"


def remove_green_background(image: Image.Image) -> Image.Image:
    rgba = np.array(image.convert("RGBA"))
    rgb = rgba[:, :, :3].astype(np.int16)
    alpha = rgba[:, :, 3]
    green = (
        (
            (
                (np.abs(rgb[:, :, 0] - 0) <= 8)
                & (np.abs(rgb[:, :, 1] - 170) <= 14)
                & (np.abs(rgb[:, :, 2] - 0) <= 8)
            )
            | ((rgb[:, :, 1] > 70) & (rgb[:, :, 0] < 80) & (rgb[:, :, 2] < 80) & (rgb[:, :, 1] > rgb[:, :, 0] * 2))
        )
        & (alpha > 0)
    )
    rgba[green, 3] = 0
    return Image.fromarray(rgba, "RGBA")


def projection_runs(mask: np.ndarray, axis: int, threshold: int) -> list[tuple[int, int]]:
    counts = mask.sum(axis=axis)
    coords = np.where(counts >= threshold)[0]
    if not len(coords):
        return []
    runs: list[tuple[int, int]] = []
    start = prev = int(coords[0])
    for value in map(int, coords[1:]):
        if value == prev + 1:
            prev = value
            continue
        runs.append((start, prev + 1))
        start = prev = value
    runs.append((start, prev + 1))
    return runs


def expand_box(box: tuple[int, int, int, int], pad: int, width: int, height: int) -> tuple[int, int, int, int]:
    x0, y0, x1, y1 = box
    return max(0, x0 - pad), max(0, y0 - pad), min(width, x1 + pad), min(height, y1 + pad)


def alpha_bbox(image: Image.Image) -> tuple[int, int, int, int] | None:
    alpha = np.array(image.convert("RGBA"))[:, :, 3] > 0
    ys, xs = np.where(alpha)
    if not len(xs):
        return None
    return int(xs.min()), int(ys.min()), int(xs.max()) + 1, int(ys.max()) + 1


def snap_box(box: tuple[int, int, int, int], cell: int = CELL) -> tuple[int, int, int, int]:
    x0, y0, x1, y1 = box
    return (x0 // cell) * cell, (y0 // cell) * cell, ((x1 + cell - 1) // cell) * cell, ((y1 + cell - 1) // cell) * cell


def crop_with_outside_padding(image: Image.Image, box: tuple[int, int, int, int]) -> Image.Image:
    x0, y0, x1, y1 = box
    out = Image.new("RGBA", (max(1, x1 - x0), max(1, y1 - y0)), (0, 0, 0, 0))
    ix0, iy0 = max(0, x0), max(0, y0)
    ix1, iy1 = min(image.width, x1), min(image.height, y1)
    if ix1 > ix0 and iy1 > iy0:
        out.alpha_composite(image.crop((ix0, iy0, ix1, iy1)), (ix0 - x0, iy0 - y0))
    return out


def ensure_transparent_border(image: Image.Image, min_border: int = CELL) -> Image.Image:
    out = image.convert("RGBA")
    for _ in range(8):
        alpha = np.array(out)[:, :, 3] > 0
        if not alpha.any():
            return out
        top = next((idx for idx in range(alpha.shape[0]) if alpha[idx].any()), alpha.shape[0])
        bottom = next((idx for idx in range(alpha.shape[0] - 1, -1, -1) if alpha[idx].any()), -1)
        left = next((idx for idx in range(alpha.shape[1]) if alpha[:, idx].any()), alpha.shape[1])
        right = next((idx for idx in range(alpha.shape[1] - 1, -1, -1) if alpha[:, idx].any()), -1)
        pads = (
            max(0, min_border - left),
            max(0, min_border - top),
            max(0, min_border - (alpha.shape[1] - 1 - right)),
            max(0, min_border - (alpha.shape[0] - 1 - bottom)),
        )
        if not any(pads):
            return out
        left_pad, top_pad, right_pad, bottom_pad = pads
        grown = Image.new(
            "RGBA",
            (out.width + left_pad + right_pad, out.height + top_pad + bottom_pad),
            (0, 0, 0, 0),
        )
        grown.alpha_composite(out, (left_pad, top_pad))
        out = grown
    return out


def middle_specs(image: Image.Image) -> list[SliceSpec]:
    rgba = np.array(image.convert("RGBA"))
    mask = rgba[:, :, 3] > 0
    row_runs = projection_runs(mask, axis=1, threshold=1)
    if len(row_runs) != 2:
        raise RuntimeError(f"middle source expected two row bands, got {row_runs}")
    specs: list[SliceSpec] = []
    for row_name, row_run in zip(("upper", "lower"), row_runs):
        band = mask[row_run[0] : row_run[1], :]
        col_runs = projection_runs(band, axis=0, threshold=3)
        if len(col_runs) != 12:
            raise RuntimeError(f"middle {row_name} expected 12 face columns, got {col_runs}")
        for idx, (x0, x1) in enumerate(col_runs, start=1):
            y0, y1 = row_run
            facing = MIDDLE_LABELS[idx - 1]
            name = f"middle_{row_name}_{idx:02d}_{facing}"
            specs.append(SliceSpec("middle_block_faces", name, facing, "source_middle_block_faces.png", idx, (x0, y0, x1, y1), row_name))
    return specs


def pillar_specs(image: Image.Image) -> list[SliceSpec]:
    mask = np.array(image.convert("RGBA"))[:, :, 3] > 0
    col_runs = [run for run in projection_runs(mask, axis=0, threshold=10) if run[1] - run[0] > 10]
    if len(col_runs) != 12:
        raise RuntimeError(f"top pillar source expected 12 columns, got {col_runs}")
    specs = []
    for idx, (x0, x1) in enumerate(col_runs, start=1):
        facing = PILLAR_LABELS[idx - 1]
        name = f"top_pillar_{idx:02d}_{facing}"
        specs.append(SliceSpec("top_pillar_faces", name, facing, "source_top_pillars.png", idx, (x0, 0, x1, image.height), "pillar"))
    return specs


def tiny_specs(image: Image.Image) -> list[SliceSpec]:
    mask = np.array(image.convert("RGBA"))[:, :, 3] > 0
    row_runs = projection_runs(mask, axis=1, threshold=1)
    col_runs = projection_runs(mask, axis=0, threshold=1)
    if len(row_runs) != 6 or len(col_runs) != 1:
        raise RuntimeError(f"tiny source expected 6 rows and 1 column, got rows={row_runs} cols={col_runs}")
    x0, x1 = col_runs[0]
    specs = []
    for idx, (y0, y1) in enumerate(row_runs, start=1):
        facing = TINY_LABELS[idx - 1]
        name = f"tiny_{idx:02d}_{facing}"
        specs.append(SliceSpec("tiny_vertical_faces", name, facing, "source_tiny_block_faces.png", idx, (x0, y0, x1, y1), "tiny"))
    return specs


def pack_bool_mask(mask: np.ndarray) -> int:
    packed = 0
    for bit in mask.reshape(-1).astype(bool):
        packed = (packed << 1) | int(bit)
    return packed


def load_masks(font_path: Path) -> list[tuple[int, int, int]]:
    font = BdfFont(str(font_path))
    masks = []
    for glyph in range(256):
        mask = font.get_mask(_CP437_TO_UNI.get(glyph, glyph))
        if mask is None:
            continue
        shaped = np.array(mask, dtype=bool).reshape(font.cell_h, font.cell_w)
        masks.append((glyph, pack_bool_mask(shaped), int(shaped.sum())))
    return masks


def best_glyph(tile_alpha: np.ndarray, masks: list[tuple[int, int, int]]) -> tuple[int, int]:
    packed = pack_bool_mask(tile_alpha)
    on_bits = int(tile_alpha.sum())
    if on_bits <= 1:
        return 0, tile_alpha.size
    best = (0, -1)
    total_bits = tile_alpha.size
    for glyph, mask, _mask_bits in masks:
        score = total_bits - (packed ^ mask).bit_count()
        if score > best[1]:
            best = (glyph, score)
    return best


def infer_tile_cell(tile: np.ndarray, masks: list[tuple[int, int, int]]) -> tuple[int, tuple[int, int, int], tuple[int, int, int], int]:
    alpha = tile[:, :, 3] > 0
    alpha_count = int(alpha.sum())
    if alpha_count <= 1:
        return 0, (0, 0, 0), MAGENTA, tile[:, :, 3].size

    rgb_pixels = tile[:, :, :3][alpha]
    colors, counts = np.unique(rgb_pixels.reshape(-1, 3), axis=0, return_counts=True)
    dominant_idx = int(np.argmax(counts))
    bg = tuple(int(v) for v in colors[dominant_idx])

    if len(colors) == 1:
        mask = alpha
        glyph, score = 219, int(alpha.sum())
        return glyph, bg, MAGENTA, score

    rgb = tile[:, :, :3].astype(np.int16)
    bg_arr = np.array(bg, dtype=np.int16)
    color_delta = np.abs(rgb - bg_arr).max(axis=2)
    ink = alpha & (color_delta > 18)
    if int(ink.sum()) <= 1:
        if alpha_count >= tile[:, :, 3].size // 2:
            return 219, bg, MAGENTA, alpha_count
        return 0, (0, 0, 0), MAGENTA, tile[:, :, 3].size

    glyph, score = best_glyph(ink, masks)
    fg_pixels = tile[:, :, :3][ink]
    fg_colors, fg_counts = np.unique(fg_pixels.reshape(-1, 3), axis=0, return_counts=True)
    fg = tuple(int(v) for v in fg_colors[int(np.argmax(fg_counts))])
    return glyph, fg, bg, score


def ocr_image(image: Image.Image, masks: list[tuple[int, int, int]], cell: int = CELL):
    rgba = np.array(image.convert("RGBA"))
    best = None
    for oy in range(cell):
        for ox in range(cell):
            max_cols = (image.width - ox) // cell
            max_rows = (image.height - oy) // cell
            if max_cols <= 0 or max_rows <= 0:
                continue
            score = nonzero = 0
            cells = []
            for row in range(max_rows):
                out_row = []
                for col in range(max_cols):
                    tile = rgba[oy + row * cell : oy + (row + 1) * cell, ox + col * cell : ox + (col + 1) * cell]
                    glyph, fg, bg, glyph_score = infer_tile_cell(tile, masks)
                    if glyph:
                        nonzero += 1
                    score += glyph_score
                    out_row.append((glyph, fg, bg))
                cells.append(out_row)
            candidate = (score, nonzero, ox, oy, cells)
            if best is None or candidate[:2] > best[:2]:
                best = candidate
    if best is None:
        return 0, 0, [[(0, (0, 0, 0), MAGENTA)]]
    _score, _nonzero, ox, oy, cells = best
    return ox, oy, trim_cells(cells)


def trim_cells(cells):
    used = [(x, y) for y, row in enumerate(cells) for x, cell in enumerate(row) if cell[0]]
    if not used:
        return [[(0, (0, 0, 0), MAGENTA)]]
    min_x = min(x for x, _y in used)
    max_x = max(x for x, _y in used)
    min_y = min(y for _x, y in used)
    max_y = max(y for _x, y in used)
    return [row[min_x : max_x + 1] for row in cells[min_y : max_y + 1]]


def transparent_layer(width: int, height: int) -> XPLayer:
    return XPLayer(width, height, [[(0, (0, 0, 0), MAGENTA) for _ in range(width)] for _ in range(height)])


def metadata_layer(width: int, height: int) -> XPLayer:
    layer = transparent_layer(width, height)
    layer.data[0][0] = (ord("8"), (255, 255, 255), MAGENTA)
    layer.data[0][1] = (ord("1"), (255, 255, 255), MAGENTA)
    return layer


def mirror_cells(cells):
    return [list(reversed(row)) for row in cells]


def write_idle_xp(path: Path, cells) -> dict:
    frame_h = len(cells)
    frame_w = len(cells[0])
    width = frame_w * 2
    height = frame_h * ANGLE_ROWS
    visual = transparent_layer(width, height)
    mirrored = mirror_cells(cells)
    for angle in range(ANGLE_ROWS):
        y0 = angle * frame_h
        for y in range(frame_h):
            for x in range(frame_w):
                visual.data[y0 + y][x] = cells[y][x]
                visual.data[y0 + y][frame_w + x] = mirrored[y][x]
    xp = XPFile()
    xp.layers = [metadata_layer(width, height), transparent_layer(width, height), visual, transparent_layer(width, height)]
    xp.save(str(path))
    glyphs = sorted({cell[0] for row in cells for cell in row if cell[0]})
    return {"frame_w": frame_w, "frame_h": frame_h, "sheet_w": width, "sheet_h": height, "nonzero_cells": sum(1 for row in cells for c in row if c[0]), "unique_glyphs": glyphs}


def contact_sheet(items: list[tuple[str, Image.Image]], out: Path) -> None:
    thumb_w, thumb_h = 120, 140
    cols = 6
    rows = (len(items) + cols - 1) // cols
    sheet = Image.new("RGBA", (cols * thumb_w, rows * thumb_h), (20, 20, 20, 255))
    draw = ImageDraw.Draw(sheet)
    for idx, (label, img) in enumerate(items):
        x = (idx % cols) * thumb_w
        y = (idx // cols) * thumb_h
        tmp = Image.new("RGBA", (thumb_w, thumb_h), (30, 30, 30, 255))
        scale = min((thumb_w - 12) / max(1, img.width), (thumb_h - 28) / max(1, img.height), 4)
        resized = img.resize((max(1, int(img.width * scale)), max(1, int(img.height * scale))), Image.Resampling.NEAREST)
        tmp.alpha_composite(resized, ((thumb_w - resized.width) // 2, 18))
        sheet.alpha_composite(tmp, (x, y))
        draw.text((x + 4, y + 3), label[:22], fill=(230, 230, 230, 255))
    sheet.save(out)


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--review-root", type=Path, default=Path("/private/tmp/xp_block_source_review"))
    parser.add_argument("--out", type=Path, default=Path("/private/tmp/xp_block_source_review/semantic_slices_v2"))
    parser.add_argument("--font", type=Path, default=ROOT / "runtime/termpp-skin-lab-static/termpp-web-flat/fonts/cp437_6x6.png.bdf")
    parser.add_argument("--padding", type=int, default=8)
    args = parser.parse_args()

    args.out.mkdir(parents=True, exist_ok=True)
    slices_dir = args.out / "slices"
    xp_dir = args.out / "xp"
    slices_dir.mkdir(exist_ok=True)
    xp_dir.mkdir(exist_ok=True)

    source_images = {
        "source_middle_block_faces.png": remove_green_background(Image.open(args.review_root / "source_middle_block_faces.png")),
        "source_top_pillars.png": remove_green_background(Image.open(args.review_root / "source_top_pillars.png")),
        "source_tiny_block_faces.png": remove_green_background(Image.open(args.review_root / "source_tiny_block_faces.png")),
    }
    specs = []
    specs.extend(middle_specs(source_images["source_middle_block_faces.png"]))
    specs.extend(pillar_specs(source_images["source_top_pillars.png"]))
    specs.extend(tiny_specs(source_images["source_tiny_block_faces.png"]))
    masks = load_masks(args.font)

    manifest = {
        "source_authority": "user-cleaned RGBA source strips in /private/tmp/xp_block_source_review",
        "discarded_contact_blocks": [
            {"id": "block_354", "reason": "top-left amalgamation / multiple things"},
            {"id": "block_1895", "reason": "top-left amalgamation / multiple things"},
            {"id": "block_280", "reason": "windowed block plus smaller block on top, not standalone"},
            {"id": "block_2215", "reason": "player sprite facing north, not a block"},
            {"id": "block_1044", "reason": "debris fragment, excluded unless explicitly requested"},
            {"id": "contact_order_after_block_43", "reason": "not blocks per user review"},
        ],
        "cell_px": CELL,
        "crop_padding_px": args.padding,
        "families": {},
        "slices": [],
    }
    contacts: dict[str, list[tuple[str, Image.Image]]] = {}

    for spec in specs:
        src = source_images[spec.source]
        x0, y0, x1, y1 = spec.crop_box
        padded_unclamped = snap_box((x0 - args.padding, y0 - args.padding, x1 + args.padding, y1 + args.padding))
        crop_source = src
        if spec.family == "middle_block_faces":
            crop_rgba = np.array(src.convert("RGBA"))
            crop_rgba[:y0, :, 3] = 0
            crop_rgba[y1:, :, 3] = 0
            crop_source = Image.fromarray(crop_rgba, "RGBA")
        crop = ensure_transparent_border(crop_with_outside_padding(crop_source, padded_unclamped))
        slice_path = slices_dir / spec.family / f"{spec.name}.png"
        slice_path.parent.mkdir(exist_ok=True)
        crop.save(slice_path)
        ox, oy, cells = ocr_image(crop, masks, CELL)
        xp_path = xp_dir / spec.family / f"{spec.name}_idle.xp"
        xp_path.parent.mkdir(exist_ok=True)
        xp_meta = write_idle_xp(xp_path, cells)
        entry = {
            "family": spec.family,
            "name": spec.name,
            "facing": spec.facing,
            "role": spec.role,
            "source": spec.source,
            "source_order": spec.source_order,
            "source_crop_box": list(spec.crop_box),
            "padded_crop_box": list(padded_unclamped),
            "slice_png": str(slice_path),
            "provisional_xp": str(xp_path),
            "ocr_grid_offset": [ox, oy],
            **xp_meta,
        }
        manifest["slices"].append(entry)
        manifest["families"].setdefault(spec.family, 0)
        manifest["families"][spec.family] += 1
        contacts.setdefault(spec.family, []).append((f"{spec.source_order:02d} {spec.role}", crop))

    for family, items in contacts.items():
        contact_sheet(items, args.out / f"{family}_contact.png")
    (args.out / "manifest.json").write_text(json.dumps(manifest, indent=2) + "\n")
    print(json.dumps({"out": str(args.out), "slices": len(manifest["slices"]), "families": manifest["families"]}, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
