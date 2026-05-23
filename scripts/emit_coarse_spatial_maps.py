"""Emit coarse anatomical region maps for the 24px-mini-character families.

These complement the {family}-roles.json files emitted by
build_semantic_maps_from_final_json.py. The role files carry the
region→glyph weight tables; the spatial files carry the per-frame bbox
that tells build_regions_grid() WHICH cells belong to WHICH region.

The spatial partitioning here is intentionally coarse — vertical thirds
(helmet / armor / body) plus optional weapon hand position at frame edges.
It's a smoke-test scaffold so the bias can actually fire on knight/civilian
sheets before any per-frame manual annotation work happens.

Each emitted file matches the schema accepted by
convert_24px_mini_template_2x.build_regions_grid: frame_w/frame_h are the
1x cell dimensions (the converter applies the 2x scaling internally), and
each frame lists rectangular regions in 1x cell coordinates.

Run:
  python3 pipeline-v3/scripts/emit_coarse_spatial_maps.py
"""
from __future__ import annotations

import json
import sys
from dataclasses import dataclass
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
SEMANTIC_MAPS_DIR = ROOT / "docs" / "research" / "ascii" / "semantic_maps"

ANGLES = 8


@dataclass(frozen=True)
class FamilyLayout:
    frame_w: int  # cells per frame (1x)
    frame_h: int  # cells per frame (1x)
    frames: int  # animation frames per angle


# Mirrors FAMILIES in convert_24px_mini_template_2x.py but stated in 1x cell
# coords. The converter applies the 2x scale internally.
LAYOUTS: dict[str, FamilyLayout] = {
    "player": FamilyLayout(frame_w=7, frame_h=10, frames=9),   # 14x20 at 2x → 7x10 at 1x
    "attack": FamilyLayout(frame_w=9, frame_h=10, frames=8),   # 18x20 at 2x → 9x10 at 1x
    "plydie": FamilyLayout(frame_w=11, frame_h=11, frames=5),  # 22x22 at 2x → 11x11 at 1x
}


def _coarse_regions_for_player(layout: FamilyLayout) -> list[dict]:
    """Vertical anatomical partition for a player frame.

    7×10 cell frame split into:
      rows 0-2  → helmet           (3 rows top)
      rows 3-5  → armor.body       (3 rows upper-middle)
      rows 6-8  → body.player      (3 rows lower-middle)
      row 9     → (boots — keep with body for now; matcher's boots key
                   exists in BUILT_IN_ROLE_TABLES so we tag it too)
    """
    fw, fh = layout.frame_w, layout.frame_h
    return [
        {"name": "helmet",      "bbox": [0, 0,        fw - 1, fh // 4]},
        {"name": "armor.body",  "bbox": [0, fh // 4 + 1, fw - 1, fh // 2]},
        {"name": "body.player", "bbox": [0, fh // 2 + 1, fw - 1, fh - 2]},
        {"name": "boots",       "bbox": [0, fh - 1,   fw - 1, fh - 1]},
    ]


def _coarse_regions_for_attack(layout: FamilyLayout) -> list[dict]:
    """Same vertical partition as player, plus weapon column at left edge.

    9×10 cell frame. The left-most 1 column is tagged as weapon (where the
    sword/swing visual usually sits in 8-angle attack sheets). Top-down:
      rows 0-2 → helmet
      rows 3-5 → armor.body
      rows 6-9 → rider.torso_with_sword (attack torso)
    Column 0  → weapon.sword (overrides the row tag)
    """
    fw, fh = layout.frame_w, layout.frame_h
    return [
        {"name": "helmet",                 "bbox": [0, 0,        fw - 1, fh // 4]},
        {"name": "armor.body",             "bbox": [0, fh // 4 + 1, fw - 1, fh // 2]},
        {"name": "rider.torso_with_sword", "bbox": [0, fh // 2 + 1, fw - 1, fh - 1]},
        # weapon column overrides
        {"name": "weapon.sword",           "bbox": [0, 0,        0,      fh - 1]},
    ]


def _coarse_regions_for_plydie(layout: FamilyLayout) -> list[dict]:
    """Death pose: collapse most of the frame into body.plydie.

    11×11 cell frame. plydie sprites are mostly horizontal at death,
    so we use a simpler partition:
      rows 0-3  → helmet
      rows 4-10 → body.plydie
    """
    fw, fh = layout.frame_w, layout.frame_h
    return [
        {"name": "helmet",      "bbox": [0, 0,        fw - 1, fh // 3]},
        {"name": "body.plydie", "bbox": [0, fh // 3 + 1, fw - 1, fh - 1]},
    ]


_REGION_BUILDERS = {
    "player": _coarse_regions_for_player,
    "attack": _coarse_regions_for_attack,
    "plydie": _coarse_regions_for_plydie,
}


def emit_spatial_map(family: str, layout: FamilyLayout) -> dict:
    """Emit a spatial-region map matching build_regions_grid's expected schema."""
    builder = _REGION_BUILDERS[family]
    regions = builder(layout)
    frames: dict[str, dict] = {}
    frame_key = 0
    for angle in range(ANGLES):
        for anim_index in range(layout.frames):
            frames[str(frame_key)] = {
                "angle": angle,
                "anim_index": anim_index,
                "regions": regions,
            }
            frame_key += 1
    return {
        "family": family,
        "frame_w": layout.frame_w,
        "frame_h": layout.frame_h,
        "frames": frames,
    }


def main() -> int:
    SEMANTIC_MAPS_DIR.mkdir(parents=True, exist_ok=True)
    for family, layout in LAYOUTS.items():
        payload = emit_spatial_map(family, layout)
        out_path = SEMANTIC_MAPS_DIR / f"{family}-spatial.json"
        out_path.write_text(json.dumps(payload, indent=2) + "\n")
        n_regions = len(_REGION_BUILDERS[family](layout))
        n_frames = len(payload["frames"])
        size = out_path.stat().st_size
        print(
            f"  {out_path.name}  "
            f"frame={layout.frame_w}x{layout.frame_h}  "
            f"regions/frame={n_regions}  "
            f"frames={n_frames}  ({size} bytes)"
        )
    return 0


if __name__ == "__main__":
    sys.exit(main())
