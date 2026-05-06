#!/usr/bin/env python3
"""
Body map generator — U3 of 2026-05-05-001.

Patterns per plan:
  XP I/O:          recolor_wearables.py  (XPFile.load / iterate / save)
  Layer resolution: validate_semantic_maps.py  (region.get("source_layer", default_layer))
  Atlas UV math:   xp_raw_layer_inspector._explicit_frame_rect  (copied below)

Usage:
    python3 scripts/generate_body_map.py <semantic_map.json> [--output <body_map.xp>]
"""

import argparse
import json
import sys
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parent.parent

# ── import xp_core from asciicker-Y9-2 ──
Y9_ROOT = REPO_ROOT.parent / "asciicker-Y9-2"
if not (Y9_ROOT / "scripts" / "pipeline" / "xp_core.py").is_file():
    Y9_ROOT = REPO_ROOT.parent.parent / "asciicker-Y9-2"
sys.path.insert(0, str(Y9_ROOT))
from scripts.pipeline.xp_core import XPFile, XPLayer

MAGENTA = (255, 0, 255)

FAMILY_FILL: dict[str, tuple[int, int, int]] = {
    "player": (0, 0, 0),
    "attack": (0, 0, 0),
    "plydie": (0, 0, 0),
    "wolfie": MAGENTA,
    "wolack": MAGENTA,
    "bigbee": MAGENTA,
}

SLOT_ORDER = {"body": 0, "head": 1, "armor": 2, "weapon": 3, "shield": 4, "mount": 5}


def _hex_to_rgb(h: str) -> tuple[int, int, int]:
    h = h.lstrip("#")
    return (int(h[0:2], 16), int(h[2:4], 16), int(h[4:6], 16))


# ═══════════════════════════════════════════════════════════════════
# Atlas UV math — copied from xp_raw_layer_inspector._explicit_frame_rect
# ═══════════════════════════════════════════════════════════════════

def _atlas_origin(
    angle: int,
    fr_num_x: int,
    frame_w: int,
    frame_h: int,
    anim_index: int = 0,
    frame_idx: int = 0,
    anim_lengths: list[int] | None = None,
) -> tuple[int, int]:
    """Return (x0, y0) — top-left atlas pixel for a given angle + frame.

    Mirrors xp_raw_layer_inspector._explicit_frame_rect exactly.
    """
    if anim_lengths is None:
        anim_lengths = [1]
    frame_base = sum(anim_lengths[:anim_index])
    x = frame_base + frame_idx
    atlas_idx = x + angle * fr_num_x
    fr_x = atlas_idx % fr_num_x
    fr_y = atlas_idx // fr_num_x
    x0 = fr_x * frame_w
    y0 = fr_y * frame_h
    return x0, y0


# ═══════════════════════════════════════════════════════════════════
# Body map construction
# ═══════════════════════════════════════════════════════════════════

def build_body_map(map_path: Path) -> XPFile:
    """Read semantic map + reference XP, return flat body map XP."""

    with open(map_path, encoding="utf-8") as f:
        m = json.load(f)

    # ── resolve reference XP ──
    rel = m["reference_xp"]
    xp_path = (map_path.parent / rel).resolve()
    if not xp_path.is_file():
        raise FileNotFoundError(f"reference XP not found: {rel} (at {xp_path})")

    xp = XPFile()
    xp.load(str(xp_path))

    fw = m["frame_w"]
    fh = m["frame_h"]
    gl = m["grid_layout"]
    num_angles = gl["angles"]
    fpr = gl["frames_per_row"]
    anim_lengths = gl.get("anim_counts", [1])
    default_layer = m.get("semantic_layer", 2)
    family = m.get("family", "player")
    fill_bg = FAMILY_FILL.get(family, (0, 0, 0))

    # ── collect unique regions from frame 0 ──
    frame0 = m["frames"]["0"]
    regions: list[dict] = []
    seen: set[str] = set()
    for r in frame0.get("regions", []):
        name = r.get("name", "")
        if name and name not in seen:
            seen.add(name)
            regions.append({
                "name": name,
                # layer-resolution per plan: region.get("source_layer", default_layer)
                "sl": r.get("source_layer", default_layer),
            })

    if not regions:
        raise ValueError("no regions found in frame 0")

    # sort per plan: slot_affinity then name
    regions.sort(key=lambda r: (SLOT_ORDER.get(
        next((rr.get("slot_affinity", "body") for rr in frame0["regions"]
              if rr["name"] == r["name"]), "body"), 99), r["name"]))

    num_regions = len(regions)
    body_w = num_angles * fw
    body_h = num_regions * fh

    print(f"Body map: {body_w}x{body_h}  ({num_regions} regions × {num_angles} angles)")

    # ── pre-extract visible cells per (layer, angle) ──
    # key: (layer, angle) -> {(lx,ly): (glyph, fg, bg)}
    xp_visible: dict[tuple[int, int], dict[tuple[int, int], tuple]] = {}

    layers_needed = {r["sl"] for r in regions}
    for sl in layers_needed:
        for a in range(num_angles):
            x0, y0 = _atlas_origin(a, fpr, fw, fh, anim_lengths=anim_lengths)
            cells: dict[tuple[int, int], tuple] = {}
            layer = xp.layers[sl]
            for ly in range(fh):
                for lx in range(fw):
                    ax = x0 + lx
                    ay = y0 + ly
                    if ax < layer.width and ay < layer.height:
                        g, fg, bg = layer.data[ay][ax]
                        if bg != MAGENTA:
                            cells[(lx, ly)] = (g, fg, bg)
            xp_visible[(sl, a)] = cells

    # ── build L2: flat body map ──
    l2 = [[(0, (255, 255, 255), fill_bg) for _ in range(body_w)] for _ in range(body_h)]

    for bi, r in enumerate(regions):
        rname = r["name"]
        sl = r["sl"]
        band_y0 = bi * fh

        for a in range(num_angles):
            fk = str(a)
            if fk not in m["frames"]:
                continue

            # find this region's cells at this angle
            scells: list[dict] = []
            for rr in m["frames"][fk].get("regions", []):
                if rr.get("name") == rname:
                    scells = rr.get("semantic_cells", [])
                    break

            if not scells:
                continue

            angle_x0 = a * fw
            visible = xp_visible.get((sl, a), {})

            for c in scells:
                lx = c["x"]
                ly = c["y"]
                cell = visible.get((lx, ly))
                if cell is None:
                    continue
                tx = angle_x0 + lx
                ty = band_y0 + ly
                l2[ty][tx] = cell

    # ── L0 metadata, L1 blank ──
    def _digit(v: int) -> int:
        if v <= 9:
            return ord(str(v))
        if v <= 35:
            return ord("A") + (v - 10)
        raise ValueError(f"value {v} out of CP437 digit range")

    l0 = XPLayer(body_w, body_h)
    l0.data[0][0] = (_digit(num_angles), (255, 255, 255), (0, 0, 0))
    l0.data[0][1] = (_digit(num_regions), (255, 255, 255), (0, 0, 0))

    l1 = XPLayer(body_w, body_h)

    out = XPFile()
    out.version = -1
    out.layers = [l0, l1, XPLayer(body_w, body_h, l2)]
    return out


# ═══════════════════════════════════════════════════════════════════
# CLI
# ═══════════════════════════════════════════════════════════════════

def main():
    ap = argparse.ArgumentParser(description="Body map generator (plan 2026-05-05-001 U3)")
    ap.add_argument("map", type=Path, help="Semantic map JSON (e.g. player-anchors.json)")
    ap.add_argument("-o", "--output", type=Path, help="Output .xp path")
    args = ap.parse_args()

    mp = args.map.resolve()
    if not mp.is_file():
        print(f"ERROR: not found: {mp}", file=sys.stderr)
        sys.exit(1)

    print(f"Loading: {mp.name}")
    body = build_body_map(mp)

    out = args.output or (REPO_ROOT / "output" / f"{mp.stem}_body_map.xp")
    out.parent.mkdir(parents=True, exist_ok=True)
    body.save(str(out))
    print(f"Saved: {out}")
    print(f"  Size: {body.layers[2].width}×{body.layers[2].height}")


if __name__ == "__main__":
    main()
