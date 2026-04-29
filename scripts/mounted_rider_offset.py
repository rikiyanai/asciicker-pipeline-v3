#!/usr/bin/env python3
from __future__ import annotations

import argparse
import json
import sys
from dataclasses import dataclass
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
SRC_DIR = ROOT / "src"
if str(SRC_DIR) not in sys.path:
    sys.path.insert(0, str(SRC_DIR))

from pipeline_v2.xp_codec import read_xp

MAGENTA = (255, 0, 255)


def _digit_glyph(glyph: int) -> int:
    if 48 <= glyph <= 57:
        return glyph - 48
    if 65 <= glyph <= 90:
        return glyph + 10 - 65
    if 97 <= glyph <= 122:
        return glyph + 10 - 97
    return -1


@dataclass(frozen=True)
class FrameLayout:
    width: int
    height: int
    angles: int
    projs: int
    anims: list[int]

    @property
    def anim_sum(self) -> int:
        return sum(self.anims)


def _parse_layout(xp: dict) -> FrameLayout:
    width = int(xp["width"])
    height = int(xp["height"])
    layer0 = xp["cells"][0]

    def glyph_at(x: int, y: int) -> int:
        return int(layer0[y * width + x][0])

    angles = _digit_glyph(glyph_at(0, 0))
    if angles > 0:
        projs = 2
    else:
        angles = 1
        projs = 1

    anims: list[int] = []
    for x in range(1, width):
        value = _digit_glyph(glyph_at(x, 0))
        if value > 0:
            anims.append(value)
        else:
            break
    if not anims:
        anims = [1]

    frame_width = width // (projs * sum(anims))
    frame_height = height // angles
    return FrameLayout(
        width=frame_width,
        height=frame_height,
        angles=angles,
        projs=projs,
        anims=anims,
    )


def _frame_origin(layout: FrameLayout, angle: int, anim_index: int, frame_index: int, proj: int) -> tuple[int, int]:
    x0 = (proj * layout.anim_sum + sum(layout.anims[:anim_index]) + frame_index) * layout.width
    y0 = angle * layout.height
    return x0, y0


def _cell_visible(cell: tuple[int, tuple[int, int, int], tuple[int, int, int]]) -> bool:
    glyph, _fg, bg = cell
    return not (glyph in (0, 32) and tuple(bg) == MAGENTA)


def _frame_cells(
    xp: dict,
    layout: FrameLayout,
    *,
    angle: int,
    anim_index: int,
    frame_index: int,
    proj: int,
    layer_index: int,
) -> list[tuple[int, int, int, tuple[int, int, int], tuple[int, int, int]]]:
    layer = xp["cells"][layer_index]
    xp_width = int(xp["width"])
    x0, y0 = _frame_origin(layout, angle, anim_index, frame_index, proj)
    cells: list[tuple[int, int, int, tuple[int, int, int], tuple[int, int, int]]] = []
    for y in range(layout.height):
        for x in range(layout.width):
            glyph, fg, bg = layer[(y0 + y) * xp_width + (x0 + x)]
            if _cell_visible((glyph, fg, bg)):
                cells.append((x, y, int(glyph), tuple(fg), tuple(bg)))
    return cells


def _auto_layer(player_xp: dict, mounted_xp: dict) -> int:
    player_layers = int(player_xp["layers"])
    mounted_layers = int(mounted_xp["layers"])
    if player_layers > 3 and mounted_layers > 3:
        return 3
    return 2


def _score_offset(
    player_cells: list[tuple[int, int, int, tuple[int, int, int], tuple[int, int, int]]],
    mounted_cells: list[tuple[int, int, int, tuple[int, int, int], tuple[int, int, int]]],
    dx: int,
    dy: int,
) -> tuple[int, int, int]:
    mounted_by_xy = {(x, y): (glyph, fg, bg) for x, y, glyph, fg, bg in mounted_cells}
    matches = 0
    overlaps = 0
    mismatches = 0
    for x, y, glyph, fg, bg in player_cells:
        target = mounted_by_xy.get((x + dx, y + dy))
        if target is None:
            continue
        overlaps += 1
        if target == (glyph, fg, bg):
            matches += 1
        else:
            mismatches += 1
    return matches, overlaps, mismatches


def _best_offset(
    player_cells: list[tuple[int, int, int, tuple[int, int, int], tuple[int, int, int]]],
    mounted_cells: list[tuple[int, int, int, tuple[int, int, int], tuple[int, int, int]]],
    *,
    min_dx: int,
    max_dx: int,
    min_dy: int,
    max_dy: int,
) -> dict[str, int | float]:
    best: tuple[tuple[int, int, int], int, int] | None = None
    for dx in range(min_dx, max_dx + 1):
        for dy in range(min_dy, max_dy + 1):
            matches, overlaps, mismatches = _score_offset(player_cells, mounted_cells, dx, dy)
            score = (matches, overlaps, -mismatches)
            if best is None or score > best[0]:
                best = (score, dx, dy)
    assert best is not None
    (matches, overlaps, neg_mismatches), dx, dy = best
    mismatches = -neg_mismatches
    player_count = len(player_cells)
    mounted_count = len(mounted_cells)
    coverage = (matches / player_count) if player_count else 0.0
    return {
        "dx": dx,
        "dy": dy,
        "matches": matches,
        "overlaps": overlaps,
        "mismatches": mismatches,
        "player_cells": player_count,
        "mounted_cells": mounted_count,
        "coverage": round(coverage, 6),
    }


def _resolve_file(path_or_name: str) -> Path:
    candidate = Path(path_or_name)
    if candidate.is_file():
        return candidate.resolve()
    repo_candidate = ROOT / path_or_name
    if repo_candidate.is_file():
        return repo_candidate.resolve()
    sprite_candidate = ROOT / "sprites" / path_or_name
    if sprite_candidate.is_file():
        return sprite_candidate.resolve()
    raise FileNotFoundError(path_or_name)


def build_report(
    player_path: Path,
    mounted_path: Path,
    *,
    anim_index: int,
    frame_index: int,
    proj: int,
    layer: str | int,
    min_dx: int,
    max_dx: int,
    min_dy: int,
    max_dy: int,
) -> dict:
    player_xp = read_xp(player_path)
    mounted_xp = read_xp(mounted_path)
    player_layout = _parse_layout(player_xp)
    mounted_layout = _parse_layout(mounted_xp)

    if player_layout.angles != mounted_layout.angles:
        raise ValueError("player and mounted files disagree on angle count")
    if proj < 0 or proj >= min(player_layout.projs, mounted_layout.projs):
        raise ValueError("invalid projection index for selected files")
    if anim_index < 0 or anim_index >= min(len(player_layout.anims), len(mounted_layout.anims)):
        raise ValueError("invalid animation index for selected files")
    if frame_index < 0 or frame_index >= min(player_layout.anims[anim_index], mounted_layout.anims[anim_index]):
        raise ValueError("invalid frame index for selected animation")

    layer_index = _auto_layer(player_xp, mounted_xp) if layer == "auto" else int(layer)
    if layer_index >= int(player_xp["layers"]) or layer_index >= int(mounted_xp["layers"]):
        raise ValueError("selected layer does not exist in both files")

    per_angle = []
    for angle in range(player_layout.angles):
        player_cells = _frame_cells(
            player_xp,
            player_layout,
            angle=angle,
            anim_index=anim_index,
            frame_index=frame_index,
            proj=proj,
            layer_index=layer_index,
        )
        mounted_cells = _frame_cells(
            mounted_xp,
            mounted_layout,
            angle=angle,
            anim_index=anim_index,
            frame_index=frame_index,
            proj=proj,
            layer_index=layer_index,
        )
        best = _best_offset(
            player_cells,
            mounted_cells,
            min_dx=min_dx,
            max_dx=max_dx,
            min_dy=min_dy,
            max_dy=max_dy,
        )
        best["angle"] = angle
        per_angle.append(best)

    return {
        "player": str(player_path),
        "mounted": str(mounted_path),
        "layer_used": layer_index,
        "anim_index": anim_index,
        "frame_index": frame_index,
        "proj": proj,
        "player_layout": {
            "frame_width": player_layout.width,
            "frame_height": player_layout.height,
            "angles": player_layout.angles,
            "projs": player_layout.projs,
            "anims": player_layout.anims,
        },
        "mounted_layout": {
            "frame_width": mounted_layout.width,
            "frame_height": mounted_layout.height,
            "angles": mounted_layout.angles,
            "projs": mounted_layout.projs,
            "anims": mounted_layout.anims,
        },
        "offset_x_by_angle": [entry["dx"] for entry in per_angle],
        "offset_y_by_angle": [entry["dy"] for entry in per_angle],
        "per_angle": per_angle,
    }


# ---------------------------------------------------------------------------
# Public API — thin wrappers so service.py can import without using private names
# ---------------------------------------------------------------------------

def parse_layout(xp: dict) -> FrameLayout:
    """Public wrapper for _parse_layout."""
    return _parse_layout(xp)


def frame_cells(
    xp: dict,
    layout: FrameLayout,
    *,
    angle: int,
    anim_index: int,
    frame_index: int,
    proj: int,
    layer_index: int,
) -> list[tuple[int, int, int, tuple[int, int, int], tuple[int, int, int]]]:
    """Public wrapper for _frame_cells."""
    return _frame_cells(
        xp, layout,
        angle=angle,
        anim_index=anim_index,
        frame_index=frame_index,
        proj=proj,
        layer_index=layer_index,
    )


def auto_layer(player_xp: dict, mounted_xp: dict) -> int:
    """Public wrapper for _auto_layer."""
    return _auto_layer(player_xp, mounted_xp)


def main() -> int:
    parser = argparse.ArgumentParser(
        description="Infer per-angle rider offsets by matching player XP cells against mounted wolfie XP cells."
    )
    parser.add_argument("--player", default="sprites/player-0100.xp", help="On-foot player XP path.")
    parser.add_argument("--mounted", default="sprites/wolfie-0100.xp", help="Mounted wolfie XP path.")
    parser.add_argument("--anim-index", type=int, default=0, help="Animation index within the native strip.")
    parser.add_argument("--frame-index", type=int, default=0, help="Frame index within the chosen animation.")
    parser.add_argument("--proj", type=int, default=0, help="Projection index. Usually 0 for projected view.")
    parser.add_argument(
        "--layer",
        default="auto",
        help="Layer index to match. Use 'auto' to prefer rider-isolating layer 3 when both files have it.",
    )
    parser.add_argument("--min-dx", type=int, default=-4, help="Minimum X offset to search.")
    parser.add_argument("--max-dx", type=int, default=8, help="Maximum X offset to search.")
    parser.add_argument("--min-dy", type=int, default=-4, help="Minimum Y offset to search.")
    parser.add_argument("--max-dy", type=int, default=8, help="Maximum Y offset to search.")
    parser.add_argument("--json", action="store_true", help="Emit JSON only.")
    args = parser.parse_args()

    report = build_report(
        _resolve_file(args.player),
        _resolve_file(args.mounted),
        anim_index=args.anim_index,
        frame_index=args.frame_index,
        proj=args.proj,
        layer=args.layer,
        min_dx=args.min_dx,
        max_dx=args.max_dx,
        min_dy=args.min_dy,
        max_dy=args.max_dy,
    )

    if args.json:
        print(json.dumps(report, indent=2))
        return 0

    print(f"player={report['player']}")
    print(f"mounted={report['mounted']}")
    print(
        "player_layout="
        f"{report['player_layout']['frame_width']}x{report['player_layout']['frame_height']} "
        f"angles={report['player_layout']['angles']} projs={report['player_layout']['projs']} "
        f"anims={report['player_layout']['anims']}"
    )
    print(
        "mounted_layout="
        f"{report['mounted_layout']['frame_width']}x{report['mounted_layout']['frame_height']} "
        f"angles={report['mounted_layout']['angles']} projs={report['mounted_layout']['projs']} "
        f"anims={report['mounted_layout']['anims']}"
    )
    print(f"layer_used={report['layer_used']} anim_index={report['anim_index']} frame_index={report['frame_index']} proj={report['proj']}")
    print(f"offset_x_by_angle={report['offset_x_by_angle']}")
    print(f"offset_y_by_angle={report['offset_y_by_angle']}")
    print("per_angle:")
    for entry in report["per_angle"]:
        print(
            f"  angle={entry['angle']} dx={entry['dx']} dy={entry['dy']} "
            f"matches={entry['matches']} overlaps={entry['overlaps']} "
            f"mismatches={entry['mismatches']} coverage={entry['coverage']}"
        )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
