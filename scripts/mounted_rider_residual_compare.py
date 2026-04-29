#!/usr/bin/env python3
from __future__ import annotations

import argparse
import sys
from pathlib import Path

SCRIPT_DIR = Path(__file__).resolve().parent
if str(SCRIPT_DIR) not in sys.path:
    sys.path.insert(0, str(SCRIPT_DIR))

import mounted_rider_offset as mro

RESET = "\033[0m"
TRANSPARENT = mro.MAGENTA


def _fg(rgb: tuple[int, int, int]) -> str:
    return f"\033[38;2;{rgb[0]};{rgb[1]};{rgb[2]}m"


def _bg(rgb: tuple[int, int, int]) -> str:
    return f"\033[48;2;{rgb[0]};{rgb[1]};{rgb[2]}m"


def _char(glyph: int) -> str:
    if glyph == 0:
        return " "
    try:
        return bytes([glyph & 0xFF]).decode("cp437")
    except Exception:
        return "?"


def _transparent_cell() -> tuple[int, tuple[int, int, int], tuple[int, int, int]]:
    return (0, (0, 0, 0), TRANSPARENT)


def _fmt_cell(cell: tuple[int, tuple[int, int, int], tuple[int, int, int]]) -> str:
    glyph, fg, bg = cell
    bg_seq = "\033[49m" if bg == TRANSPARENT else _bg(bg)
    ch = _char(glyph)
    if ch == " ":
        return bg_seq + " " + RESET
    return bg_seq + _fg(fg) + ch + RESET


def _composite_frame(
    xp: dict,
    layout: mro.FrameLayout,
    *,
    angle: int,
    anim_index: int,
    frame_index: int,
    proj: int,
    layer_indices: list[int],
) -> list[list[tuple[int, tuple[int, int, int], tuple[int, int, int]]]]:
    width = layout.width
    height = layout.height
    canvas = [[_transparent_cell() for _ in range(width)] for _ in range(height)]
    for layer_index in layer_indices:
        if layer_index >= int(xp["layers"]):
            continue
        for x, y, glyph, fg, bg in mro._frame_cells(
            xp,
            layout,
            angle=angle,
            anim_index=anim_index,
            frame_index=frame_index,
            proj=proj,
            layer_index=layer_index,
        ):
            canvas[y][x] = (glyph, fg, bg)
    return canvas


def _place_on_canvas(
    source: list[list[tuple[int, tuple[int, int, int], tuple[int, int, int]]]],
    out_width: int,
    out_height: int,
    dx: int,
    dy: int,
) -> list[list[tuple[int, tuple[int, int, int], tuple[int, int, int]]]]:
    out = [[_transparent_cell() for _ in range(out_width)] for _ in range(out_height)]
    for y, row in enumerate(source):
        for x, cell in enumerate(row):
            tx = x + dx
            ty = y + dy
            if 0 <= tx < out_width and 0 <= ty < out_height and mro._cell_visible(cell):
                out[ty][tx] = cell
    return out


def _render_side_by_side(
    left: list[list[tuple[int, tuple[int, int, int], tuple[int, int, int]]]],
    right: list[list[tuple[int, tuple[int, int, int], tuple[int, int, int]]]],
    *,
    left_label: str,
    right_label: str,
) -> str:
    left_h = len(left)
    right_h = len(right)
    height = max(left_h, right_h)
    left_w = len(left[0]) if left else 0
    right_w = len(right[0]) if right else 0
    out = [left_label.ljust(left_w) + "    " + right_label]
    for y in range(height):
        left_row = left[y] if y < left_h else [_transparent_cell() for _ in range(left_w)]
        right_row = right[y] if y < right_h else [_transparent_cell() for _ in range(right_w)]
        out.append("".join(_fmt_cell(cell) for cell in left_row) + "    " + "".join(_fmt_cell(cell) for cell in right_row))
    return "\n".join(out)


def _cells_from_canvas(
    canvas: list[list[tuple[int, tuple[int, int, int], tuple[int, int, int]]]],
) -> list[tuple[int, int, int, tuple[int, int, int], tuple[int, int, int]]]:
    out: list[tuple[int, int, int, tuple[int, int, int], tuple[int, int, int]]] = []
    for y, row in enumerate(canvas):
        for x, cell in enumerate(row):
            if mro._cell_visible(cell):
                glyph, fg, bg = cell
                out.append((x, y, glyph, fg, bg))
    return out


def _best_translation(
    source_cells: list[tuple[int, int, int, tuple[int, int, int], tuple[int, int, int]]],
    target_cells: list[tuple[int, int, int, tuple[int, int, int], tuple[int, int, int]]],
    *,
    min_dx: int,
    max_dx: int,
    min_dy: int,
    max_dy: int,
) -> dict[str, int]:
    best = None
    target_map = {(x, y): (glyph, fg, bg) for x, y, glyph, fg, bg in target_cells}
    for dx in range(min_dx, max_dx + 1):
        for dy in range(min_dy, max_dy + 1):
            matches = 0
            overlaps = 0
            mismatches = 0
            for x, y, glyph, fg, bg in source_cells:
                target = target_map.get((x + dx, y + dy))
                if target is None:
                    continue
                overlaps += 1
                if target == (glyph, fg, bg):
                    matches += 1
                else:
                    mismatches += 1
            score = (matches, overlaps, -mismatches)
            if best is None or score > best[0]:
                best = (score, dx, dy, matches, overlaps, mismatches)
    assert best is not None
    _score, dx, dy, matches, overlaps, mismatches = best
    return {
        "dx": dx,
        "dy": dy,
        "matches": matches,
        "overlaps": overlaps,
        "mismatches": mismatches,
    }


def _subtract_exact(
    mounted_canvas: list[list[tuple[int, tuple[int, int, int], tuple[int, int, int]]]],
    aligned_wolf_canvas: list[list[tuple[int, tuple[int, int, int], tuple[int, int, int]]]],
) -> list[list[tuple[int, tuple[int, int, int], tuple[int, int, int]]]]:
    height = len(mounted_canvas)
    width = len(mounted_canvas[0]) if mounted_canvas else 0
    out = [[_transparent_cell() for _ in range(width)] for _ in range(height)]
    for y in range(height):
        for x in range(width):
            mounted = mounted_canvas[y][x]
            wolf = aligned_wolf_canvas[y][x]
            if mro._cell_visible(mounted) and mounted != wolf:
                out[y][x] = mounted
    return out


def _compare_exact(
    left_canvas: list[list[tuple[int, tuple[int, int, int], tuple[int, int, int]]]],
    right_canvas: list[list[tuple[int, tuple[int, int, int], tuple[int, int, int]]]],
) -> dict[str, int]:
    left_map = {(x, y): (glyph, fg, bg) for x, y, glyph, fg, bg in _cells_from_canvas(left_canvas)}
    right_cells = _cells_from_canvas(right_canvas)
    matches = 0
    overlaps = 0
    mismatches = 0
    for x, y, glyph, fg, bg in right_cells:
        target = left_map.get((x, y))
        if target is None:
            continue
        overlaps += 1
        if target == (glyph, fg, bg):
            matches += 1
        else:
            mismatches += 1
    return {
        "left_cells": len(left_map),
        "right_cells": len(right_cells),
        "matches": matches,
        "overlaps": overlaps,
        "mismatches": mismatches,
    }


def main() -> int:
    parser = argparse.ArgumentParser(
        description="Render wolf-only, mounted, mounted-minus-wolf residual, and shifted player-only side by side."
    )
    parser.add_argument("--player", default="sprites/player-0100.xp")
    parser.add_argument("--wolf", default="sprites/wolfie.xp")
    parser.add_argument("--mounted", default="sprites/wolfie-0100.xp")
    parser.add_argument("--angle", type=int, default=0)
    parser.add_argument("--anim-index", type=int, default=0)
    parser.add_argument("--frame-index", type=int, default=0)
    parser.add_argument("--proj", type=int, default=0)
    args = parser.parse_args()

    player_path = mro._resolve_file(args.player)
    wolf_path = mro._resolve_file(args.wolf)
    mounted_path = mro._resolve_file(args.mounted)

    player_xp = mro.read_xp(player_path)
    wolf_xp = mro.read_xp(wolf_path)
    mounted_xp = mro.read_xp(mounted_path)
    player_layout = mro._parse_layout(player_xp)
    wolf_layout = mro._parse_layout(wolf_xp)
    mounted_layout = mro._parse_layout(mounted_xp)

    player_report = mro.build_report(
        player_path,
        mounted_path,
        anim_index=args.anim_index,
        frame_index=args.frame_index,
        proj=args.proj,
        layer="auto",
        min_dx=-4,
        max_dx=8,
        min_dy=-4,
        max_dy=8,
    )
    rider_offset = player_report["per_angle"][args.angle]
    player_dx = int(rider_offset["dx"])
    player_dy = int(rider_offset["dy"])

    wolf_cells = mro._frame_cells(
        wolf_xp,
        wolf_layout,
        angle=args.angle,
        anim_index=args.anim_index,
        frame_index=args.frame_index,
        proj=args.proj,
        layer_index=2,
    )
    mounted_visual_cells = mro._frame_cells(
        mounted_xp,
        mounted_layout,
        angle=args.angle,
        anim_index=args.anim_index,
        frame_index=args.frame_index,
        proj=args.proj,
        layer_index=2,
    )
    wolf_offset = _best_translation(
        wolf_cells,
        mounted_visual_cells,
        min_dx=-4,
        max_dx=8,
        min_dy=-4,
        max_dy=8,
    )

    wolf_canvas = _composite_frame(
        wolf_xp,
        wolf_layout,
        angle=args.angle,
        anim_index=args.anim_index,
        frame_index=args.frame_index,
        proj=args.proj,
        layer_indices=[2],
    )
    mounted_layers = [2]
    if int(mounted_xp["layers"]) > 3:
        mounted_layers.append(3)
    mounted_canvas = _composite_frame(
        mounted_xp,
        mounted_layout,
        angle=args.angle,
        anim_index=args.anim_index,
        frame_index=args.frame_index,
        proj=args.proj,
        layer_indices=mounted_layers,
    )
    player_layers = [2]
    if int(player_xp["layers"]) > 3:
        player_layers.append(3)
    player_canvas = _composite_frame(
        player_xp,
        player_layout,
        angle=args.angle,
        anim_index=args.anim_index,
        frame_index=args.frame_index,
        proj=args.proj,
        layer_indices=player_layers,
    )

    aligned_wolf_canvas = _place_on_canvas(
        wolf_canvas,
        mounted_layout.width,
        mounted_layout.height,
        wolf_offset["dx"],
        wolf_offset["dy"],
    )
    shifted_player_canvas = _place_on_canvas(
        player_canvas,
        mounted_layout.width,
        mounted_layout.height,
        player_dx,
        player_dy,
    )
    residual_canvas = _subtract_exact(mounted_canvas, aligned_wolf_canvas)
    residual_vs_player = _compare_exact(residual_canvas, shifted_player_canvas)

    print(
        f"angle={args.angle} anim_index={args.anim_index} frame_index={args.frame_index} proj={args.proj} "
        f"wolf_offset=({wolf_offset['dx']},{wolf_offset['dy']}) rider_offset=({player_dx},{player_dy})"
    )
    print()
    print("1. wolfie only")
    print(_render_side_by_side(wolf_canvas, mounted_canvas, left_label=wolf_path.name, right_label=mounted_path.name))
    print()
    print("2. mounted residual vs shifted player")
    print(
        _render_side_by_side(
            residual_canvas,
            shifted_player_canvas,
            left_label=f"{mounted_path.name} minus aligned {wolf_path.name}",
            right_label=f"{player_path.name} shifted dx={player_dx} dy={player_dy}",
        )
    )
    print()
    print("EXACT MATCH METRICS")
    print(
        f"  wolf_vs_mounted_visual matches={wolf_offset['matches']}/{len(wolf_cells)} "
        f"overlaps={wolf_offset['overlaps']} mismatches={wolf_offset['mismatches']}"
    )
    print(
        f"  residual_vs_shifted_player matches={residual_vs_player['matches']}/{residual_vs_player['right_cells']} "
        f"overlaps={residual_vs_player['overlaps']} mismatches={residual_vs_player['mismatches']}"
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
