#!/usr/bin/env python3
"""Generate recolored wearable sprite families from canonical base sprites.

Reads grid-heavy-{item}.xp and item-{item}.xp as sources and writes
grid-{tier}-{item}.xp and item-{tier}-{item}.xp for each configured tier.

To add a new color tier: append an entry to TIERS.
To add a new item:       append its name to ITEMS.

Usage:
    python -m scripts.pipeline.recolor_wearables [--dry-run] [--tier NAME] [--item NAME]

    --dry-run      Print what would be written without touching the filesystem.
    --tier NAME    Only process this tier (repeatable).
    --item NAME    Only process this item (repeatable).
"""

from __future__ import annotations

import argparse
from pathlib import Path
import sys

REPO_ROOT = Path(__file__).resolve().parents[2]
if str(REPO_ROOT) not in sys.path:
    sys.path.insert(0, str(REPO_ROOT))

from scripts.pipeline.xp_core import XPFile

SPRITES_DIR = REPO_ROOT / "assets" / "sprites"

# ---------------------------------------------------------------------------
# Color tiers
# Each entry maps canonical steel-palette RGB triples to new material colors.
# Unmapped colors pass through unchanged (black outline + leather are preserved).
#
# Canonical steel palette:
#   (170, 170, 170)  body / mid-tone
#   ( 85,  85,  85)  shadow
#   (255, 255, 255)  highlight
#   (170,   0,   0)  trim dark
#   (255,  85,  85)  trim light
#
# All values must use the 4-step channel set {0, 85, 170, 255} so they stay
# inside the engine's 64-color safe palette.
# ---------------------------------------------------------------------------

TIERS: dict[str, dict[tuple[int, int, int], tuple[int, int, int]]] = {
    "gold": {
        (170, 170, 170): (170, 170,   0),
        ( 85,  85,  85): ( 85,  85,   0),
        (255, 255, 255): (255, 255,  85),
        (170,   0,   0): (170,  85,   0),
        (255,  85,  85): (255, 170,   0),
    },
    "dark": {
        (170, 170, 170): ( 85,  85, 170),
        ( 85,  85,  85): (  0,   0, 170),
        (255, 255, 255): (170, 170, 255),
        (170,   0,   0): ( 85,   0, 170),
        (255,  85,  85): (170,  85, 255),
    },
    # --- add new tiers below ---
    # "crimson": {
    #     (170, 170, 170): (170,   0,   0),
    #     ( 85,  85,  85): ( 85,   0,   0),
    #     (255, 255, 255): (255,  85,  85),
    #     (170,   0,   0): ( 85,   0,   0),
    #     (255,  85,  85): (255,  85,  85),
    # },
    # "shadow": {
    #     (170, 170, 170): (  0,  85,  85),
    #     ( 85,  85,  85): (  0,   0,  85),
    #     (255, 255, 255): ( 85, 255, 255),
    #     (170,   0,   0): (  0,  85,  85),
    #     (255,  85,  85): ( 85, 255, 255),
    # },
}

# ---------------------------------------------------------------------------
# Items
# Each name generates two output sprites per tier:
#   grid source:  assets/sprites/grid-heavy-{name}.xp
#   item source:  assets/sprites/item-{name}.xp
# ---------------------------------------------------------------------------

ITEMS: list[str] = [
    "armor",
    "helmet",
    "shield",
    # --- add new wearables below ---
    # "boots",
    # "gloves",
    # "leggings",
    # "cape",
]


# ---------------------------------------------------------------------------
# Core logic
# ---------------------------------------------------------------------------

def recolor_xp(
    src: Path,
    dst: Path,
    color_map: dict[tuple[int, int, int], tuple[int, int, int]],
    dry_run: bool = False,
) -> None:
    xp = XPFile()
    xp.load(str(src))
    for layer in xp.layers[2:]:
        for y, row in enumerate(layer.data):
            for x, (glyph, fg, bg) in enumerate(row):
                new_fg = color_map.get(tuple(fg), tuple(fg))
                new_bg = color_map.get(tuple(bg), tuple(bg))
                row[x] = (glyph, new_fg, new_bg)
    if dry_run:
        print(f"  [dry-run] would write {dst.relative_to(REPO_ROOT)}")
        return
    dst.parent.mkdir(parents=True, exist_ok=True)
    xp.save(str(dst))
    print(f"  wrote {dst.relative_to(REPO_ROOT)}")


def run(
    tiers: list[str] | None = None,
    items: list[str] | None = None,
    dry_run: bool = False,
) -> int:
    active_tiers = {k: v for k, v in TIERS.items() if tiers is None or k in tiers}
    active_items = items if items is not None else ITEMS

    if not active_tiers:
        print(f"ERROR: no matching tiers (available: {list(TIERS)})", file=sys.stderr)
        return 1

    missing = [i for i in active_items if i not in ITEMS]
    if missing:
        print(f"WARNING: items not in ITEMS list: {missing}", file=sys.stderr)

    errors = 0
    for tier_name, color_map in active_tiers.items():
        print(f"\n[{tier_name}]")
        for item in active_items:
            # grid icon  (source: grid-heavy-{item}.xp)
            grid_src = SPRITES_DIR / f"grid-heavy-{item}.xp"
            grid_dst = SPRITES_DIR / f"grid-{tier_name}-{item}.xp"
            if not grid_src.exists():
                print(f"  SKIP grid-{item}: {grid_src.name} not found", file=sys.stderr)
                errors += 1
            else:
                recolor_xp(grid_src, grid_dst, color_map, dry_run)

            # world item  (source: item-{item}.xp)
            item_src = SPRITES_DIR / f"item-{item}.xp"
            item_dst = SPRITES_DIR / f"item-{tier_name}-{item}.xp"
            if not item_src.exists():
                print(f"  SKIP item-{item}: {item_src.name} not found", file=sys.stderr)
                errors += 1
            else:
                recolor_xp(item_src, item_dst, color_map, dry_run)

    return errors


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--dry-run", action="store_true", help="Print paths without writing files.")
    parser.add_argument("--tier", action="append", metavar="NAME", help="Limit to this tier (repeatable).")
    parser.add_argument("--item", action="append", metavar="NAME", help="Limit to this item (repeatable).")
    args = parser.parse_args()
    return run(tiers=args.tier, items=args.item, dry_run=args.dry_run)


if __name__ == "__main__":
    raise SystemExit(main())
