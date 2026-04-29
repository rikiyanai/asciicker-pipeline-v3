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
            if 0 <= tx < out_width and 0 <= ty < out_height:
                if mro._cell_visible(cell):
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
    gap = "    "

    def fmt_cell(cell: tuple[int, tuple[int, int, int], tuple[int, int, int]]) -> str:
        glyph, fg, bg = cell
        if bg == TRANSPARENT:
            bg_seq = "\033[49m"
        else:
            bg_seq = _bg(bg)
        ch = _char(glyph)
        if ch == " ":
            return bg_seq + " " + RESET
        return bg_seq + _fg(fg) + ch + RESET

    out = [left_label.ljust(left_w) + gap + right_label]
    for y in range(height):
        left_row = left[y] if y < left_h else [_transparent_cell() for _ in range(left_w)]
        right_row = right[y] if y < right_h else [_transparent_cell() for _ in range(right_w)]
        out.append("".join(fmt_cell(cell) for cell in left_row) + gap + "".join(fmt_cell(cell) for cell in right_row))
    return "\n".join(out)


def _compare_exact_cells(
    mounted_xp: dict,
    mounted_layout: mro.FrameLayout,
    player_xp: dict,
    player_layout: mro.FrameLayout,
    *,
    angle: int,
    anim_index: int,
    frame_index: int,
    proj: int,
    layer_index: int,
    dx: int,
    dy: int,
) -> dict[str, int]:
    mounted = {
        (x, y): (glyph, fg, bg)
        for x, y, glyph, fg, bg in mro._frame_cells(
            mounted_xp,
            mounted_layout,
            angle=angle,
            anim_index=anim_index,
            frame_index=frame_index,
            proj=proj,
            layer_index=layer_index,
        )
    }
    matches = 0
    overlaps = 0
    mismatches = 0
    player_cells = mro._frame_cells(
        player_xp,
        player_layout,
        angle=angle,
        anim_index=anim_index,
        frame_index=frame_index,
        proj=proj,
        layer_index=layer_index,
    )
    for x, y, glyph, fg, bg in player_cells:
        target = mounted.get((x + dx, y + dy))
        if target is None:
            continue
        overlaps += 1
        if target == (glyph, fg, bg):
            matches += 1
        else:
            mismatches += 1
    return {
        "player_cells": len(player_cells),
        "mounted_cells": len(mounted),
        "overlaps": overlaps,
        "matches": matches,
        "mismatches": mismatches,
    }


def main() -> int:
    parser = argparse.ArgumentParser(
        description="Render the requested wolf/player terminal comparisons and print rider-offset match metrics."
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

    report = mro.build_report(
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
    offset = report["per_angle"][args.angle]
    dx = int(offset["dx"])
    dy = int(offset["dy"])

    player_layers = [2]
    if int(player_xp["layers"]) > 3:
        player_layers.append(3)
    mounted_layers = [2]
    if int(mounted_xp["layers"]) > 3:
        mounted_layers.append(3)

    pass1_left = _composite_frame(
        wolf_xp,
        wolf_layout,
        angle=args.angle,
        anim_index=args.anim_index,
        frame_index=args.frame_index,
        proj=args.proj,
        layer_indices=[2],
    )
    pass1_right = _composite_frame(
        player_xp,
        player_layout,
        angle=args.angle,
        anim_index=args.anim_index,
        frame_index=args.frame_index,
        proj=args.proj,
        layer_indices=player_layers,
    )

    pass2_left = _composite_frame(
        mounted_xp,
        mounted_layout,
        angle=args.angle,
        anim_index=args.anim_index,
        frame_index=args.frame_index,
        proj=args.proj,
        layer_indices=mounted_layers,
    )
    shifted_player = _place_on_canvas(pass1_right, mounted_layout.width, mounted_layout.height, dx, dy)

    exact_l3 = _compare_exact_cells(
        mounted_xp,
        mounted_layout,
        player_xp,
        player_layout,
        angle=args.angle,
        anim_index=args.anim_index,
        frame_index=args.frame_index,
        proj=args.proj,
        layer_index=3 if int(player_xp["layers"]) > 3 and int(mounted_xp["layers"]) > 3 else 2,
        dx=dx,
        dy=dy,
    )

    exact_l2 = _compare_exact_cells(
        mounted_xp,
        mounted_layout,
        player_xp,
        player_layout,
        angle=args.angle,
        anim_index=args.anim_index,
        frame_index=args.frame_index,
        proj=args.proj,
        layer_index=2,
        dx=dx,
        dy=dy,
    )

    print(
        f"angle={args.angle} anim_index={args.anim_index} frame_index={args.frame_index} proj={args.proj} "
        f"offset=({dx},{dy}) layer_auto={report['layer_used']}"
    )
    print()
    print("PASS 1: wolf only vs player only")
    print(
        _render_side_by_side(
            pass1_left,
            pass1_right,
            left_label=wolf_path.name,
            right_label=player_path.name,
        )
    )
    print()
    print("PASS 2: mounted wolfie+rider vs shifted player-only")
    print(
        _render_side_by_side(
            pass2_left,
            shifted_player,
            left_label=mounted_path.name,
            right_label=f"{player_path.name} shifted dx={dx} dy={dy}",
        )
    )
    print()
    print("EXACT MATCH METRICS")
    print(
        "  layer3_or_fallback "
        f"matches={exact_l3['matches']}/{exact_l3['player_cells']} overlaps={exact_l3['overlaps']} mismatches={exact_l3['mismatches']}"
    )
    print(
        "  layer2_visual "
        f"matches={exact_l2['matches']}/{exact_l2['player_cells']} overlaps={exact_l2['overlaps']} mismatches={exact_l2['mismatches']}"
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
