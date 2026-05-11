from __future__ import annotations

import json
from pathlib import Path

from pipeline_v2.xp_codec import read_xp, write_xp


ROOT = Path(__file__).resolve().parents[1]
SPRITE_DIR = ROOT / "sprites" / "blocks_idle_redone"
MAGENTA = (255, 0, 255)
BLACK = (0, 0, 0)
WHITE = (230, 230, 230)
ANGLES = 8


Cell = tuple[int, tuple[int, int, int], tuple[int, int, int]]


def blank_cell() -> Cell:
    return (0, BLACK, MAGENTA)


def blank_layer(width: int, height: int) -> list[Cell]:
    return [blank_cell() for _ in range(width * height)]


def metadata_layer(width: int, height: int) -> list[Cell]:
    layer = blank_layer(width, height)
    layer[0] = (ord("8"), WHITE, MAGENTA)
    layer[1] = (ord("1"), WHITE, MAGENTA)
    return layer


def cell_visible(cell: Cell) -> bool:
    return int(cell[0] or 0) != 0


def extract_base_frame(xp: dict) -> tuple[int, int, list[list[Cell]]]:
    width = int(xp["width"])
    height = int(xp["height"])
    frame_w = max(1, width // 2)
    frame_h = max(1, height // ANGLES)
    visual = xp["cells"][2 if int(xp["layers"]) > 2 else 0]
    base: list[list[Cell]] = []
    for y in range(frame_h):
        row = []
        for x in range(frame_w):
            row.append(visual[y * width + x])
        base.append(row)
    return frame_w, frame_h, base


def mirror_frame(frame: list[list[Cell]]) -> list[list[Cell]]:
    return [list(reversed(row)) for row in frame]


def shift_frame(frame: list[list[Cell]], shift_by_row: list[int]) -> list[list[Cell]]:
    height = len(frame)
    width = len(frame[0]) if height else 1
    out = [[blank_cell() for _ in range(width)] for _ in range(height)]
    for y, row in enumerate(frame):
        dx = int(shift_by_row[y] if y < len(shift_by_row) else 0)
        for x, cell in enumerate(row):
            nx = x + dx
            if 0 <= nx < width and cell_visible(cell):
                out[y][nx] = cell
    return out


def edge_color(row: list[Cell], start: int, end: int) -> tuple[int, int, int]:
    for x in range(start, end, 1 if end >= start else -1):
        if 0 <= x < len(row) and cell_visible(row[x]):
            fg = row[x][1]
            if isinstance(fg, tuple) and len(fg) == 3:
                return fg
    return WHITE


def mark_sides(frame: list[list[Cell]], left_glyph: int, right_glyph: int) -> list[list[Cell]]:
    out = [[cell for cell in row] for row in frame]
    for y, row in enumerate(out):
        used = [x for x, cell in enumerate(row) if cell_visible(cell)]
        if not used:
            continue
        lx = min(used)
        rx = max(used)
        left_fg = edge_color(row, lx, len(row))
        right_fg = edge_color(row, rx, -1)
        out[y][lx] = (left_glyph, left_fg, MAGENTA)
        out[y][rx] = (right_glyph, right_fg, MAGENTA)
    return out


def stamp_angle_cue(frame: list[list[Cell]], angle: int) -> list[list[Cell]]:
    out = [[cell for cell in row] for row in frame]
    height = len(out)
    width = len(out[0]) if height else 0
    if height <= 0 or width <= 0:
        return out
    visible_rows = [y for y, row in enumerate(out) if any(cell_visible(cell) for cell in row)]
    if not visible_rows:
        return out
    y = visible_rows[(angle * 3) % len(visible_rows)]
    used = [x for x, cell in enumerate(out[y]) if cell_visible(cell)]
    if not used:
        return out
    glyph = ord("/") if angle in (0, 1, 2, 7) else ord("\\")
    # Put the cue on an actual side/corner cell, alternating sides per angle.
    if angle % 2 == 0:
        x = min(used)
    else:
        x = max(used)
    out[y][x] = (glyph, out[y][x][1], MAGENTA)
    return out


def angle_variants(base: list[list[Cell]]) -> list[list[list[Cell]]]:
    height = len(base)
    max_shift = 2 if (len(base[0]) if height else 0) >= 6 else 1
    ramp_right = [round((y / max(1, height - 1)) * max_shift) for y in range(height)]
    ramp_left = [-v for v in ramp_right]
    mid_right = [round(((y - (height - 1) / 2) / max(1, height - 1)) * max_shift) for y in range(height)]
    mid_left = [-v for v in mid_right]
    mirrored = mirror_frame(base)
    variants = [
        mark_sides(base, ord("/"), ord("\\")),
        mark_sides(shift_frame(base, ramp_right), ord("/"), ord("\\")),
        mark_sides(shift_frame(base, [max_shift] * height), ord("/"), ord("/")),
        mark_sides(shift_frame(mirrored, ramp_right), ord("\\"), ord("/")),
        mark_sides(mirrored, ord("\\"), ord("/")),
        mark_sides(shift_frame(mirrored, ramp_left), ord("\\"), ord("/")),
        mark_sides(shift_frame(base, [-max_shift] * height), ord("\\"), ord("\\")),
        mark_sides(shift_frame(base, mid_left), ord("/"), ord("\\")),
    ]
    return [stamp_angle_cue(frame, angle) for angle, frame in enumerate(variants)]


def write_angle_sheet(path: Path, frame_w: int, frame_h: int, variants: list[list[list[Cell]]]) -> dict:
    width = frame_w * 2
    height = frame_h * ANGLES
    visual = blank_layer(width, height)
    row_hashes: list[int] = []
    slash_count = 0
    backslash_count = 0
    for angle, frame in enumerate(variants):
        row_cells: list[int] = []
        y0 = angle * frame_h
        for y in range(frame_h):
            for x in range(frame_w):
                cell = frame[y][x]
                glyph = int(cell[0] or 0)
                if glyph == ord("/"):
                    slash_count += 1
                if glyph == ord("\\"):
                    backslash_count += 1
                row_cells.append(glyph)
                visual[(y0 + y) * width + x] = cell
        row_hashes.append(hash(tuple(row_cells)))
    layers = [metadata_layer(width, height), blank_layer(width, height), visual, blank_layer(width, height)]
    write_xp(path, width, height, layers)
    glyphs = sorted({int(cell[0] or 0) for cell in visual if int(cell[0] or 0) != 0})
    return {
        "sheet_w": width,
        "sheet_h": height,
        "frame_w": frame_w,
        "frame_h": frame_h,
        "angle_row_hashes": row_hashes,
        "distinct_angle_rows": len(set(row_hashes)),
        "slash_count": slash_count,
        "backslash_count": backslash_count,
        "unique_glyphs": glyphs,
        "projection_0": "authored angle rows",
        "projection_1": "blank engine projection slot",
    }


def main() -> None:
    manifest = {
        "source": "sprites/blocks_idle_redone/*.xp rebuilt from prior OCR base frames",
        "angles": ANGLES,
        "anims": [1],
        "format": "idle player skin: 8 distinct angle rows, 1 semantic frame, projection 1 blank",
        "blocks": [],
    }
    for xp_path in sorted(SPRITE_DIR.glob("block_*_idle.xp")):
        xp = read_xp(xp_path)
        frame_w, frame_h, base = extract_base_frame(xp)
        stats = write_angle_sheet(xp_path, frame_w, frame_h, angle_variants(base))
        manifest["blocks"].append({
            "name": xp_path.stem,
            "xp": str(xp_path.relative_to(ROOT)),
            **stats,
        })
    (SPRITE_DIR / "manifest.json").write_text(json.dumps(manifest, indent=2) + "\n")
    print(f"rebuilt {len(manifest['blocks'])} block idle angle sheets in {SPRITE_DIR}")


if __name__ == "__main__":
    main()
