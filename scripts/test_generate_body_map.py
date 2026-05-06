#!/usr/bin/env python3
"""
Tests for generate_body_map.py — plan 2026-05-05-001 U3.

Covers the 6 scenarios listed in the plan:
  - Happy path: correct output dimensions
  - Happy path: cell data matches source XP at correct layer+angle
  - Happy path: armor cells from layer 3 in body map
  - Edge: transparent/magenta cells are filled with family bg
  - Edge: map with no armor/helmet produces body-only map
  - Error: missing reference XP gives clear error

Also covers _atlas_origin math and cross-frame source_layer consistency.

Run:
    python3 scripts/test_generate_body_map.py
"""

import json
import sys
import tempfile
import unittest
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parent.parent

# ── locate xp_core ──
Y9_ROOT = REPO_ROOT.parent / "asciicker-Y9-2"
if not (Y9_ROOT / "scripts" / "pipeline" / "xp_core.py").is_file():
    Y9_ROOT = REPO_ROOT.parent.parent / "asciicker-Y9-2"

if str(Y9_ROOT) not in sys.path:
    sys.path.insert(0, str(Y9_ROOT))

HAS_XP_CORE = (Y9_ROOT / "scripts" / "pipeline" / "xp_core.py").is_file()

# ── load generate_body_map via importlib to avoid needing __init__.py ──
import importlib.util as _ilu

_spec = _ilu.spec_from_file_location(
    "generate_body_map", REPO_ROOT / "scripts" / "generate_body_map.py"
)
_gbm = _ilu.module_from_spec(_spec)
_spec.loader.exec_module(_gbm)

_atlas_origin = _gbm._atlas_origin
_digit = _gbm._digit
build_body_map = _gbm.build_body_map
SLOT_ORDER = _gbm.SLOT_ORDER
MAGENTA = _gbm.MAGENTA
FAMILY_FILL = _gbm.FAMILY_FILL


# ═══════════════════════════════════════════════════════════════════
# Helpers
# ═══════════════════════════════════════════════════════════════════

def _make_minimal_map(
    *,
    num_angles: int = 2,
    frame_w: int = 4,
    frame_h: int = 4,
    family: str = "player",
    regions: list[dict] | None = None,
    reference_xp: str = "fake.xp",
) -> dict:
    """Build a minimal semantic map dict suitable for testing."""
    if regions is None:
        regions = [
            {
                "name": "body",
                "slot_affinity": "body",
                "semantic_cells": [{"x": 1, "y": 1, "glyph": 65, "fg": "#ff0000", "bg": "#000000"}],
            }
        ]
    frames = {}
    for a in range(num_angles):
        frames[str(a)] = {"regions": [dict(r) for r in regions]}
    return {
        "reference_xp": reference_xp,
        "family": family,
        "frame_w": frame_w,
        "frame_h": frame_h,
        "semantic_layer": 2,
        "grid_layout": {
            "angles": num_angles,
            "frames_per_row": num_angles,
            "anim_counts": [1],
        },
        "frames": frames,
    }


def _sorted_region_names(frame0_regions: list[dict]) -> list[str]:
    """Return region names in body-map band order (mirrors generate_body_map sort)."""
    seen: list[tuple[str, str]] = []
    seen_names: set[str] = set()
    for r in frame0_regions:
        n = r.get("name", "")
        if n and n not in seen_names:
            seen_names.add(n)
            seen.append((n, r.get("slot_affinity", "body")))
    seen.sort(key=lambda x: (SLOT_ORDER.get(x[1], 99), x[0]))
    return [n for n, _ in seen]


# ═══════════════════════════════════════════════════════════════════
# Unit tests — do NOT require xp_core
# ═══════════════════════════════════════════════════════════════════

class TestAtlasOrigin(unittest.TestCase):
    """_atlas_origin math mirrors xp_raw_layer_inspector._explicit_frame_rect."""

    def test_angle0_frame0_origin(self):
        x0, y0 = _atlas_origin(0, fr_num_x=8, frame_w=7, frame_h=10)
        self.assertEqual((x0, y0), (0, 0))

    def test_angle1_second_row(self):
        # With anim_lengths=[1], frame_base=0, x=0.
        # atlas_idx = 0 + 1*8 = 8 → fr_x=8%8=0, fr_y=8//8=1 → (0, 10)
        x0, y0 = _atlas_origin(1, fr_num_x=8, frame_w=7, frame_h=10)
        self.assertEqual((x0, y0), (0, 10))

    def test_frame_idx_advances_column(self):
        # With fr_num_x=4, angle=0, anim_lengths=[4], frame_idx=1:
        # frame_base=0, x=1. atlas_idx=1 → fr_x=1, fr_y=0 → (7, 0)
        x0, y0 = _atlas_origin(
            0, fr_num_x=4, frame_w=7, frame_h=10,
            anim_index=0, frame_idx=1, anim_lengths=[4]
        )
        self.assertEqual((x0, y0), (7, 0))

    def test_anim_index_offset(self):
        # anim_index=1 with anim_lengths=[3,2] → frame_base=3
        x0, y0 = _atlas_origin(
            0, fr_num_x=8, frame_w=7, frame_h=10,
            anim_index=1, frame_idx=0, anim_lengths=[3, 2]
        )
        # atlas_idx = 3 + 0 + 0*8 = 3 → fr_x=3, fr_y=0
        self.assertEqual((x0, y0), (21, 0))


class TestDigit(unittest.TestCase):
    def test_single_digits(self):
        for v in range(10):
            self.assertEqual(_digit(v), ord(str(v)))

    def test_letter_digits(self):
        self.assertEqual(_digit(10), ord("A"))
        self.assertEqual(_digit(35), ord("Z"))

    def test_out_of_range(self):
        with self.assertRaises(ValueError):
            _digit(36)


class TestSlotOrder(unittest.TestCase):
    def test_all_standard_slots_present(self):
        for slot in ("body", "head", "armor", "weapon", "shield", "mount"):
            self.assertIn(slot, SLOT_ORDER)

    def test_body_before_armor(self):
        self.assertLess(SLOT_ORDER["body"], SLOT_ORDER["armor"])

    def test_head_before_armor(self):
        self.assertLess(SLOT_ORDER["head"], SLOT_ORDER["armor"])


class TestFamilyFill(unittest.TestCase):
    def test_player_black(self):
        self.assertEqual(FAMILY_FILL["player"], (0, 0, 0))

    def test_mounted_families_magenta(self):
        for family in ("wolfie", "wolack", "bigbee"):
            self.assertEqual(FAMILY_FILL[family], MAGENTA)


# ═══════════════════════════════════════════════════════════════════
# Integration tests — require xp_core + real semantic map files
# ═══════════════════════════════════════════════════════════════════

MAPS_DIR = REPO_ROOT / "docs" / "research" / "ascii" / "semantic_maps"


@unittest.skipUnless(HAS_XP_CORE, "xp_core not available — skipping integration tests")
class TestBuildBodyMap(unittest.TestCase):
    """Integration tests against real semantic maps and XP files."""

    def _load_map_path(self, name: str) -> Path:
        p = MAPS_DIR / name
        if not p.is_file():
            self.skipTest(f"map file not found: {p}")
        return p

    def _build(self, map_name: str):
        mp = self._load_map_path(map_name)
        return build_body_map(mp), mp

    # T1: Correct output dimensions (player-anchors.json)
    def test_player_body_map_dimensions(self):
        """Happy path: body map width = num_angles * frame_w, height = num_regions * frame_h."""
        body, mp = self._build("player-anchors.json")
        with open(mp, encoding="utf-8") as f:
            m = json.load(f)
        fw = m["frame_w"]
        fh = m["frame_h"]
        num_angles = m["grid_layout"]["angles"]
        num_regions = len({r["name"] for r in m["frames"]["0"]["regions"]})

        l2 = body.layers[2]
        self.assertEqual(l2.width, num_angles * fw)
        self.assertEqual(l2.height, num_regions * fh)

    # T2: Cell data matches source XP at correct layer, angle 0
    def test_cell_matches_source_xp_layer2_angle0(self):
        """Happy path: cell (x,y) in body region angle 0 matches source XP layer 2."""
        from scripts.pipeline.xp_core import XPFile

        mp = self._load_map_path("player-anchors.json")
        body = build_body_map(mp)

        with open(mp, encoding="utf-8") as f:
            m = json.load(f)

        frame0 = m["frames"]["0"]
        first_region = frame0["regions"][0]
        if not first_region.get("semantic_cells"):
            self.skipTest("no semantic_cells in frame 0 region 0")

        cell = first_region["semantic_cells"][0]
        lx, ly = cell["x"], cell["y"]
        sl = first_region.get("source_layer", m.get("semantic_layer", 2))
        fpr = m["grid_layout"]["frames_per_row"]
        fw = m["frame_w"]
        fh = m["frame_h"]

        xp_path = (mp.parent / m["reference_xp"]).resolve()
        xp = XPFile()
        xp.load(str(xp_path))
        x0, y0 = _atlas_origin(0, fpr, fw, fh, anim_lengths=m["grid_layout"].get("anim_counts", [1]))
        expected = xp.layers[sl].data[y0 + ly][x0 + lx]

        sorted_names = _sorted_region_names(frame0["regions"])
        band_index = sorted_names.index(first_region["name"])
        band_y0 = band_index * fh

        actual = body.layers[2].data[band_y0 + ly][lx]
        self.assertEqual(actual, expected, f"Cell ({lx},{ly}) mismatch at band {band_index}")

    # T3: Armor cells in body map come from layer 3 (not layer 2)
    def test_armor_cells_from_layer3(self):
        """Happy path: armor region in body map matches source XP layer 3."""
        from scripts.pipeline.xp_core import XPFile

        mp = self._load_map_path("player-anchors.json")
        with open(mp, encoding="utf-8") as f:
            m = json.load(f)

        armor_region = next(
            (r for r in m["frames"]["0"].get("regions", []) if r.get("slot_affinity") == "armor"),
            None,
        )
        if armor_region is None or not armor_region.get("semantic_cells"):
            self.skipTest("player-anchors.json has no armor region with cells in frame 0")

        body = build_body_map(mp)

        cell = armor_region["semantic_cells"][0]
        lx, ly = cell["x"], cell["y"]
        sl = armor_region.get("source_layer", 3)
        fpr = m["grid_layout"]["frames_per_row"]
        fw = m["frame_w"]
        fh = m["frame_h"]

        xp_path = (mp.parent / m["reference_xp"]).resolve()
        xp = XPFile()
        xp.load(str(xp_path))
        x0, y0 = _atlas_origin(0, fpr, fw, fh, anim_lengths=m["grid_layout"].get("anim_counts", [1]))
        expected_from_l3 = xp.layers[sl].data[y0 + ly][x0 + lx]

        sorted_names = _sorted_region_names(m["frames"]["0"]["regions"])
        band_index = sorted_names.index(armor_region["name"])
        band_y0 = band_index * fh

        actual = body.layers[2].data[band_y0 + ly][lx]
        self.assertEqual(actual, expected_from_l3)

    # T4: Non-region cells are filled with family background color
    def test_transparent_cells_have_family_fill(self):
        """Edge case: cells not belonging to any region have the family fill bg."""
        mp = self._load_map_path("player-anchors.json")
        with open(mp, encoding="utf-8") as f:
            m = json.load(f)

        body = build_body_map(mp)
        family = m.get("family", "player")
        expected_bg = FAMILY_FILL.get(family, (0, 0, 0))
        fw = m["frame_w"]
        fh = m["frame_h"]

        frame0_regions = m["frames"]["0"]["regions"]
        sorted_names = _sorted_region_names(frame0_regions)
        occupied: set[tuple[int, int]] = set()
        for r in frame0_regions:
            n = r.get("name", "")
            if n not in sorted_names:
                continue
            bi = sorted_names.index(n)
            band_y0 = bi * fh
            for c in r.get("semantic_cells", []):
                occupied.add((c["x"], band_y0 + c["y"]))

        l2 = body.layers[2]
        # Sample angle 0 band 0 cells not in any region
        unoccupied_checked = False
        for y in range(fh):
            for x in range(fw):
                if (x, y) not in occupied:
                    _g, _fg, bg = l2.data[y][x]
                    self.assertEqual(bg, expected_bg,
                                     f"Cell ({x},{y}) bg={bg} should be family fill {expected_bg}")
                    unoccupied_checked = True
                    break
            if unoccupied_checked:
                break

    # T5: Map with no armor/helmet produces body-only map (no IndexError)
    def test_body_only_map_succeeds(self):
        """Edge case: attack map with no armor/helmet regions succeeds."""
        attack_map = MAPS_DIR / "attack-0001.json"
        if not attack_map.is_file():
            self.skipTest("attack-0001.json not found")
        body = build_body_map(attack_map)
        self.assertIsNotNone(body)
        self.assertGreater(body.layers[2].width, 0)
        self.assertGreater(body.layers[2].height, 0)

    # T6: Missing reference XP gives clear error message
    def test_missing_reference_xp_raises(self):
        """Error path: FileNotFoundError with the missing filename in the message."""
        with tempfile.TemporaryDirectory() as tmpdir:
            mp = Path(tmpdir) / "test.json"
            m = _make_minimal_map(reference_xp="nonexistent.xp")
            mp.write_text(json.dumps(m), encoding="utf-8")
            with self.assertRaises(FileNotFoundError) as ctx:
                build_body_map(mp)
            self.assertIn("nonexistent.xp", str(ctx.exception))


# ═══════════════════════════════════════════════════════════════════
# Cross-frame source_layer consistency
# ═══════════════════════════════════════════════════════════════════

@unittest.skipUnless(HAS_XP_CORE, "xp_core not available — skipping")
class TestCrossFrameSourceLayer(unittest.TestCase):
    def test_inconsistent_source_layer_raises(self):
        """build_body_map raises ValueError when source_layer differs across angles."""
        from scripts.pipeline.xp_core import XPFile, XPLayer

        with tempfile.TemporaryDirectory() as tmpdir:
            xp_path = Path(tmpdir) / "fake.xp"
            xp = XPFile()
            xp.version = -1
            xp.layers = [XPLayer(8, 8), XPLayer(8, 8), XPLayer(8, 8), XPLayer(8, 8)]
            xp.save(str(xp_path))

            mp = Path(tmpdir) / "map.json"
            m = _make_minimal_map(
                num_angles=2,
                frame_w=4,
                frame_h=4,
                reference_xp="fake.xp",
                regions=[{
                    "name": "armor",
                    "slot_affinity": "armor",
                    "source_layer": 3,
                    "semantic_cells": [],
                }],
            )
            # Inject inconsistent source_layer in frame 1
            m["frames"]["1"]["regions"][0]["source_layer"] = 2
            mp.write_text(json.dumps(m), encoding="utf-8")

            with self.assertRaises(ValueError) as ctx:
                build_body_map(mp)
            self.assertIn("source_layer", str(ctx.exception).lower())
            self.assertIn("armor", str(ctx.exception))


if __name__ == "__main__":
    unittest.main(verbosity=2)
