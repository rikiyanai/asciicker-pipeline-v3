#!/usr/bin/env python3
"""
Validate semantic map JSON files against schema.json.

Usage:
    python3 scripts/validate_semantic_maps.py

Auto-discovers all .json map files in docs/research/ascii/semantic_maps/
(excluding schema.json itself), validates each against the schema, checks
that referenced XP files exist, palette role references resolve, region
names are well-formed, and ambiguity entries are well-formed.

Exit 0 on success, non-zero on any validation failure.

Limitations (2026-03-21 corrective pass — verifier design handoff audit):
- Does NOT verify that semantic_cells match actual XP cell data on disk.
- Does NOT verify that region bboxes geometrically contain their claimed cells.
- Does NOT verify that palette_role colors actually appear in the reference XP.
- Does NOT cross-validate between maps (e.g., shared roles have consistent colors).
- This script is a structural integrity checker, not a correctness proof.
  Do not cite a passing result as evidence that semantic maps are accurate.
"""

import json
import os
import re
import sys
from pathlib import Path

# Attempt to use jsonschema for full schema validation; fall back to manual.
try:
    import jsonschema
    HAS_JSONSCHEMA = True
except ImportError:
    HAS_JSONSCHEMA = False

REPO_ROOT = Path(__file__).resolve().parent.parent
MAPS_DIR = REPO_ROOT / "docs" / "research" / "ascii" / "semantic_maps"
SCHEMA_FILE = MAPS_DIR / "schema.json"

# ── optional xp_core import for cell cross-reference validation ──
_Y9_ROOT: Path | None = None
for _candidate in [
    REPO_ROOT.parent / "asciicker-Y9-2",
    REPO_ROOT.parent.parent / "asciicker-Y9-2",
]:
    if (_candidate / "scripts" / "pipeline" / "xp_core.py").is_file():
        _Y9_ROOT = _candidate
        break

HAS_XP_CORE = False
if _Y9_ROOT is not None:
    if str(_Y9_ROOT) not in sys.path:
        sys.path.insert(0, str(_Y9_ROOT))
    try:
        from scripts.pipeline.xp_core import XPFile as _XPFile  # type: ignore
        HAS_XP_CORE = True
    except ImportError:
        pass

MAGENTA = (255, 0, 255)


def load_json(path: Path) -> dict:
    """Load and parse a JSON file, raising on failure."""
    with open(path, "r", encoding="utf-8") as f:
        return json.load(f)


def validate_schema_conformance(map_data: dict, schema: dict, map_path: Path, errors: list):
    """Validate map_data against the JSON schema."""
    if HAS_JSONSCHEMA:
        validator = jsonschema.Draft202012Validator(schema)
        for err in validator.iter_errors(map_data):
            path_str = ".".join(str(p) for p in err.absolute_path)
            loc = f"$.{path_str}" if path_str else "$"
            errors.append(f"  Schema violation at {loc}: {err.message}")
    else:
        # Manual validation of required top-level keys
        required = schema.get("required", [])
        for key in required:
            if key not in map_data:
                errors.append(f"  Missing required top-level key: '{key}'")

        # Check schema_version
        if map_data.get("schema_version") != "0.1.0":
            errors.append(f"  schema_version must be '0.1.0', got '{map_data.get('schema_version')}'")

        # Check family enum
        allowed_families = schema["properties"]["family"].get("enum", [])
        if allowed_families and map_data.get("family") not in allowed_families:
            errors.append(f"  family '{map_data.get('family')}' not in allowed: {allowed_families}")

        # Check grid_layout required keys
        gl_schema = schema["properties"].get("grid_layout", {})
        gl_required = gl_schema.get("required", [])
        gl_data = map_data.get("grid_layout", {})
        for key in gl_required:
            if key not in gl_data:
                errors.append(f"  Missing required grid_layout key: '{key}'")

        # Check palette_roles structure
        for role_name, role_data in map_data.get("palette_roles", {}).items():
            for rk in ["colors", "confidence", "description"]:
                if rk not in role_data:
                    errors.append(f"  palette_roles.{role_name} missing required key: '{rk}'")
            if "confidence" in role_data and role_data["confidence"] not in ("high", "medium", "low"):
                errors.append(f"  palette_roles.{role_name}.confidence invalid: '{role_data['confidence']}'")
            if "usage" in role_data and role_data["usage"] not in ("fg", "bg", "both"):
                errors.append(f"  palette_roles.{role_name}.usage invalid: '{role_data['usage']}'")

        # Check grid_layout field types
        gl_data = map_data.get("grid_layout", {})
        for int_key in ("semantic_layer", "frame_w", "frame_h"):
            if int_key in gl_data and not isinstance(gl_data[int_key], int):
                errors.append(f"  grid_layout.{int_key} must be an integer, got {type(gl_data[int_key]).__name__}")
        tbg = gl_data.get("transparent_bg")
        if tbg is not None and (not isinstance(tbg, str) or not re.match(r"^#[0-9a-f]{6}$", tbg)):
            errors.append(f"  grid_layout.transparent_bg must match '#rrggbb', got {tbg!r}")

        # Check frames structure
        for frame_key, frame_data in map_data.get("frames", {}).items():
            if "regions" not in frame_data:
                errors.append(f"  frames.{frame_key} missing required key: 'regions'")
            for i, region in enumerate(frame_data.get("regions", [])):
                for rk in ["name", "bbox", "confidence", "palette_roles"]:
                    if rk not in region:
                        errors.append(f"  frames.{frame_key}.regions[{i}] missing required key: '{rk}'")
                if "bbox" in region:
                    bbox = region["bbox"]
                    if not (isinstance(bbox, list) and len(bbox) == 4 and all(isinstance(v, int) for v in bbox)):
                        errors.append(f"  frames.{frame_key}.regions[{i}].bbox must be [int, int, int, int]")
                if "confidence" in region and region["confidence"] not in ("high", "medium", "low"):
                    errors.append(f"  frames.{frame_key}.regions[{i}].confidence invalid: '{region['confidence']}'")
                # Validate semantic_cells subfields (M2)
                for k, cell in enumerate(region.get("semantic_cells", [])):
                    for req_key in ("x", "y", "glyph", "fg", "bg"):
                        if req_key not in cell:
                            errors.append(
                                f"  frames.{frame_key}.regions[{i}].semantic_cells[{k}] "
                                f"missing required key: '{req_key}'"
                            )
                    for opt_region_key in ("fg_region", "bg_region"):
                        val = cell.get(opt_region_key)
                        if val is not None:
                            if not isinstance(val, str) or not val.strip():
                                errors.append(
                                    f"  frames.{frame_key}.regions[{i}].semantic_cells[{k}]"
                                    f".{opt_region_key} must be a non-empty string, "
                                    f"got {val!r}"
                                )


def validate_xp_reference(map_data: dict, map_path: Path, errors: list):
    """Check that the referenced XP file exists on disk."""
    ref_xp = map_data.get("reference_xp", "")
    if not isinstance(ref_xp, str) or not ref_xp:
        errors.append(f"  reference_xp must be a non-empty string, got {ref_xp!r}")
        return
    xp_path = (map_path.parent / ref_xp).resolve()
    if not xp_path.is_file():
        errors.append(f"  reference_xp file not found: {ref_xp} (resolved: {xp_path})")


def validate_palette_role_references(map_data: dict, errors: list):
    """Check that every palette_role referenced in regions exists in palette_roles."""
    defined_roles = set(map_data.get("palette_roles", {}).keys())
    for frame_key, frame_data in map_data.get("frames", {}).items():
        for i, region in enumerate(frame_data.get("regions", [])):
            for role in region.get("palette_roles", []):
                if role not in defined_roles:
                    errors.append(
                        f"  frames.{frame_key}.regions[{i}] ('{region.get('name', '?')}') "
                        f"references undefined palette_role: '{role}'"
                    )


def validate_region_names(map_data: dict, errors: list):
    """Check that region names are non-empty, non-whitespace strings."""
    for frame_key, frame_data in map_data.get("frames", {}).items():
        for i, region in enumerate(frame_data.get("regions", [])):
            name = region.get("name", "")
            if not isinstance(name, str) or not name.strip():
                errors.append(
                    f"  frames.{frame_key}.regions[{i}] has invalid name: {name!r}"
                )


def validate_dual_region_references(map_data: dict, errors: list):
    """Check that fg_region/bg_region values on semantic_cells reference
    real region names that exist in the same frame."""
    for frame_key, frame_data in map_data.get("frames", {}).items():
        regions = frame_data.get("regions", [])
        # Build set of valid region names for this frame
        valid_names: set[str] = set()
        for region in regions:
            name = region.get("name", "")
            if isinstance(name, str) and name.strip():
                valid_names.add(name)

        for i, region in enumerate(regions):
            for k, cell in enumerate(region.get("semantic_cells", [])):
                for ref_key in ("fg_region", "bg_region"):
                    ref_val = cell.get(ref_key)
                    if ref_val is not None:
                        if not isinstance(ref_val, str) or not ref_val.strip():
                            errors.append(
                                f"  frames.{frame_key}.regions[{i}].semantic_cells[{k}]"
                                f".{ref_key} must be a non-empty string, "
                                f"got {ref_val!r}"
                            )
                        elif ref_val not in valid_names:
                            errors.append(
                                f"  frames.{frame_key}.regions[{i}].semantic_cells[{k}]"
                                f".{ref_key}='{ref_val}' does not match any "
                                f"region name in this frame. Valid names: "
                                f"{sorted(valid_names)}"
                            )


def validate_ambiguities(map_data: dict, errors: list):
    """Check that ambiguity entries are well-formed non-empty strings."""
    ambiguities = map_data.get("ambiguities")
    if ambiguities is None:
        return  # Optional field
    if not isinstance(ambiguities, list):
        errors.append(f"  ambiguities must be an array, got {type(ambiguities).__name__}")
        return
    for i, entry in enumerate(ambiguities):
        if not isinstance(entry, str):
            errors.append(f"  ambiguities[{i}] must be a string, got {type(entry).__name__}")
        elif not entry.strip():
            errors.append(f"  ambiguities[{i}] is empty or whitespace-only")


# SLOT_ORDER is the single source of truth; VALID_SLOT_AFFINITIES is derived from it.
SLOT_ORDER = {"body": 0, "head": 1, "armor": 2, "weapon": 3, "shield": 4, "mount": 5}
VALID_SLOT_AFFINITIES = set(SLOT_ORDER.keys())


def validate_slot_affinity(map_data: dict, errors: list):
    """Check that slot_affinity values on regions are valid enum values."""
    for frame_key, frame_data in map_data.get("frames", {}).items():
        for i, region in enumerate(frame_data.get("regions", [])):
            sa = region.get("slot_affinity")
            if sa is not None and sa not in VALID_SLOT_AFFINITIES:
                errors.append(
                    f"  frames.{frame_key}.regions[{i}] ('{region.get('name', '?')}') "
                    f"slot_affinity invalid: '{sa}' (allowed: {sorted(VALID_SLOT_AFFINITIES)})"
                )


def validate_palette_role_slots(map_data: dict, errors: list):
    """Check that slot fields on palette_roles are valid slot strings when present."""
    for role_name, role_data in map_data.get("palette_roles", {}).items():
        slot = role_data.get("slot")
        if slot is not None:
            if not isinstance(slot, str):
                errors.append(
                    f"  palette_roles.{role_name}.slot must be a string, got {type(slot).__name__}"
                )
            elif slot not in VALID_SLOT_AFFINITIES:
                errors.append(
                    f"  palette_roles.{role_name}.slot invalid: '{slot}' "
                    f"(allowed: {sorted(VALID_SLOT_AFFINITIES)})"
                )


def validate_overlay_masks(map_data: dict, errors: list):
    """Check overlay_masks structure when present."""
    masks = map_data.get("overlay_masks")
    if masks is None:
        return
    if not isinstance(masks, dict):
        errors.append(f"  overlay_masks must be an object, got {type(masks).__name__}")
        return
    for slot_name, angle_data in masks.items():
        if not isinstance(angle_data, dict):
            errors.append(f"  overlay_masks.{slot_name} must be an object, got {type(angle_data).__name__}")
            continue
        for angle_key, coverage in angle_data.items():
            if not isinstance(coverage, dict):
                errors.append(
                    f"  overlay_masks.{slot_name}.{angle_key} must be an object, "
                    f"got {type(coverage).__name__}"
                )
                continue
            cells = coverage.get("covered_cells")
            if cells is not None:
                if not isinstance(cells, list):
                    errors.append(
                        f"  overlay_masks.{slot_name}.{angle_key}.covered_cells "
                        f"must be an array, got {type(cells).__name__}"
                    )
                else:
                    for j, cell in enumerate(cells):
                        if not (isinstance(cell, list) and len(cell) == 2
                                and all(isinstance(v, int) for v in cell)):
                            errors.append(
                                f"  overlay_masks.{slot_name}.{angle_key}.covered_cells[{j}] "
                                f"must be [int, int], got {cell!r}"
                            )
            sa = coverage.get("slot_affinity")
            if sa is not None and sa not in VALID_SLOT_AFFINITIES:
                errors.append(
                    f"  overlay_masks.{slot_name}.{angle_key}.slot_affinity "
                    f"invalid: '{sa}'"
                )


def validate_source_layer(map_data: dict, errors: list):
    """Check that source_layer values are valid integers when present."""
    for frame_key, frame_data in map_data.get("frames", {}).items():
        for i, region in enumerate(frame_data.get("regions", [])):
            sl = region.get("source_layer")
            if sl is not None and not isinstance(sl, int):
                errors.append(
                    f"  frames.{frame_key}.regions[{i}] ('{region.get('name', '?')}') "
                    f"source_layer must be an integer, got {type(sl).__name__}"
                )


def _atlas_origin_simple(angle: int, fpr: int, fw: int, fh: int) -> tuple[int, int]:
    """Return (x0, y0) for anim=0, frame=0 at the given angle.

    Simplified form of the full atlas-origin formula (anim_index=0, frame_idx=0).
    """
    atlas_idx = angle * fpr
    fr_x = atlas_idx % fpr
    fr_y = atlas_idx // fpr
    return fr_x * fw, fr_y * fh


def validate_cells_against_xp(map_data: dict, map_path: Path, errors: list):
    """Cross-reference semantic_cells against actual XP sprite data.

    For each region, reads the correct layer (source_layer or semantic_layer)
    via xp_core directly and verifies that each cell exists and has matching
    glyph/fg/bg values.

    Skipped (with a notice) when xp_core is unavailable rather than silently
    passing — a skipped check must never look like a passing check.
    """
    ref_xp = map_data.get("reference_xp", "")
    if not ref_xp:
        return
    xp_path = (map_path.parent / ref_xp).resolve()
    if not xp_path.is_file():
        return  # Already caught by validate_xp_reference

    if not HAS_XP_CORE:
        errors.append(
            "  [WARN] xp_core not available — cell cross-reference check skipped. "
            "Ensure asciicker-Y9-2 is a sibling of this repo to enable this check."
        )
        return

    gl = map_data.get("grid_layout", {})
    fpr = gl.get("frames_per_row", 1)
    fw = map_data.get("frame_w", 1)
    fh = map_data.get("frame_h", 1)
    default_layer = map_data.get("semantic_layer", 2)

    xp = _XPFile()
    xp.load(str(xp_path))

    # Cache visible-cell dicts keyed by (layer, angle)
    # visible[(lx, ly)] = (glyph, fg_tuple, bg_tuple) for non-magenta cells
    xp_visible: dict[tuple[int, int], dict[tuple[int, int], tuple]] = {}

    def get_visible(layer: int, angle: int) -> dict[tuple[int, int], tuple] | None:
        """Return cached visibility dict, or None if layer is out of range."""
        key = (layer, angle)
        if key in xp_visible:
            return xp_visible[key]
        if layer >= len(xp.layers):
            return None
        x0, y0 = _atlas_origin_simple(angle, fpr, fw, fh)
        xp_layer = xp.layers[layer]
        cells: dict[tuple[int, int], tuple] = {}
        for ly in range(fh):
            for lx in range(fw):
                ax = x0 + lx
                ay = y0 + ly
                if ax < xp_layer.width and ay < xp_layer.height:
                    g, fg, bg = xp_layer.data[ay][ax]
                    if bg != MAGENTA:
                        cells[(lx, ly)] = (g, fg, bg)
        xp_visible[key] = cells
        return cells

    def _rgb_to_hex(rgb: tuple) -> str:
        return f"#{rgb[0]:02x}{rgb[1]:02x}{rgb[2]:02x}"

    cell_errors = 0
    max_report = 10

    for frame_key, frame_data in map_data.get("frames", {}).items():
        try:
            angle = int(frame_key)
        except ValueError:
            continue

        for i, region in enumerate(frame_data.get("regions", [])):
            layer = region.get("source_layer", default_layer)
            visible = get_visible(layer, angle)
            if visible is None:
                cell_errors += 1
                if cell_errors <= max_report:
                    errors.append(
                        f"  frames.{frame_key}.regions[{i}] ('{region.get('name', '?')}') "
                        f"source_layer={layer} is out of range "
                        f"(XP has {len(xp.layers)} layer(s))"
                    )
                continue

            for k, cell in enumerate(region.get("semantic_cells", [])):
                xy = (cell.get("x", -1), cell.get("y", -1))
                actual = visible.get(xy)
                if actual is None:
                    cell_errors += 1
                    if cell_errors <= max_report:
                        errors.append(
                            f"  frames.{frame_key}.regions[{i}] ('{region.get('name', '?')}') "
                            f"cell ({xy[0]},{xy[1]}) not visible on layer {layer}"
                        )
                    continue

                cell_fg = cell.get("fg", "")
                cell_bg = cell.get("bg", "")
                cell_glyph = cell.get("glyph", -1)
                actual_glyph, actual_fg_rgb, actual_bg_rgb = actual
                actual_fg = _rgb_to_hex(actual_fg_rgb)
                actual_bg = _rgb_to_hex(actual_bg_rgb)

                if actual_glyph != cell_glyph:
                    cell_errors += 1
                    if cell_errors <= max_report:
                        errors.append(
                            f"  frames.{frame_key}.regions[{i}] ('{region.get('name', '?')}') "
                            f"cell ({xy[0]},{xy[1]}) glyph mismatch: "
                            f"map={cell_glyph}, xp={actual_glyph}"
                        )
                if actual_fg.lower() != cell_fg.lower():
                    cell_errors += 1
                    if cell_errors <= max_report:
                        errors.append(
                            f"  frames.{frame_key}.regions[{i}] ('{region.get('name', '?')}') "
                            f"cell ({xy[0]},{xy[1]}) fg mismatch: "
                            f"map={cell_fg}, xp={actual_fg}"
                        )
                if actual_bg.lower() != cell_bg.lower():
                    cell_errors += 1
                    if cell_errors <= max_report:
                        errors.append(
                            f"  frames.{frame_key}.regions[{i}] ('{region.get('name', '?')}') "
                            f"cell ({xy[0]},{xy[1]}) bg mismatch: "
                            f"map={cell_bg}, xp={actual_bg}"
                        )

    if cell_errors > max_report:
        errors.append(
            f"  ... and {cell_errors - max_report} more cell cross-reference errors"
        )


def validate_angle_anchors(map_data: dict, errors: list):
    """Check angle_anchors structure when present."""
    anchors = map_data.get("angle_anchors")
    if anchors is None:
        return
    if not isinstance(anchors, dict):
        errors.append(f"  angle_anchors must be an object, got {type(anchors).__name__}")
        return
    for key in ("ground_truth_angles", "propagated_angles"):
        val = anchors.get(key)
        if val is not None:
            if not isinstance(val, list):
                errors.append(f"  angle_anchors.{key} must be an array, got {type(val).__name__}")
            elif not all(isinstance(v, int) for v in val):
                errors.append(f"  angle_anchors.{key} entries must be integers")


def validate_hex_colors(map_data: dict, errors: list):
    """Spot-check hex color format in palette_roles and semantic_cells."""
    hex_pat = re.compile(r"^#[0-9a-f]{6}$")

    for role_name, role_data in map_data.get("palette_roles", {}).items():
        for j, color in enumerate(role_data.get("colors", [])):
            if not hex_pat.match(color):
                errors.append(f"  palette_roles.{role_name}.colors[{j}] invalid hex: '{color}'")

    for frame_key, frame_data in map_data.get("frames", {}).items():
        for i, region in enumerate(frame_data.get("regions", [])):
            for k, cell in enumerate(region.get("semantic_cells", [])):
                for color_key in ("fg", "bg"):
                    c = cell.get(color_key, "")
                    if not c or not hex_pat.match(c):
                        errors.append(
                            f"  frames.{frame_key}.regions[{i}].semantic_cells[{k}].{color_key} "
                            f"invalid hex: '{c}'"
                        )


def main():
    all_passed = True
    results = []

    # 1. Load schema
    print(f"Loading schema: {SCHEMA_FILE.relative_to(REPO_ROOT)}")
    try:
        schema = load_json(SCHEMA_FILE)
        print("  Schema JSON parsed OK")
    except (json.JSONDecodeError, FileNotFoundError) as e:
        print(f"  FAIL: Cannot load schema: {e}")
        sys.exit(1)

    # 2. Discover map files
    map_files = sorted(
        p for p in MAPS_DIR.glob("*.json")
        if p.name != "schema.json"
    )
    if not map_files:
        print("  FAIL: No map files found in semantic_maps/")
        sys.exit(1)
    print(f"  Found {len(map_files)} map file(s): {', '.join(p.name for p in map_files)}")
    print()

    if not HAS_JSONSCHEMA:
        print("  NOTE: jsonschema not installed; using manual validation fallback")
        print()

    # 3. Validate each map
    for map_path in map_files:
        rel = map_path.relative_to(REPO_ROOT)
        print(f"Validating: {rel}")
        errors = []

        # Parse JSON
        try:
            map_data = load_json(map_path)
            print("  JSON parsed OK")
        except json.JSONDecodeError as e:
            print(f"  FAIL: JSON parse error: {e}")
            all_passed = False
            results.append((rel, ["JSON parse error"]))
            continue

        # Schema conformance
        validate_schema_conformance(map_data, schema, map_path, errors)

        # XP file existence
        validate_xp_reference(map_data, map_path, errors)

        # Palette role references
        validate_palette_role_references(map_data, errors)

        # Region names
        validate_region_names(map_data, errors)

        # fg_region/bg_region cross-reference validation
        validate_dual_region_references(map_data, errors)

        # Ambiguities
        validate_ambiguities(map_data, errors)

        # Hex color format
        validate_hex_colors(map_data, errors)

        # Slot affinity on regions
        validate_slot_affinity(map_data, errors)

        # Palette role slot bindings
        validate_palette_role_slots(map_data, errors)

        # Overlay masks structure
        validate_overlay_masks(map_data, errors)

        # Angle anchors structure
        validate_angle_anchors(map_data, errors)

        # source_layer field type
        validate_source_layer(map_data, errors)

        # Cross-reference cells against actual XP data
        xp_errors: list[str] = []
        validate_cells_against_xp(map_data, map_path, xp_errors)
        if xp_errors:
            errors.extend(xp_errors)

        if errors:
            all_passed = False
            for e in errors:
                print(e)
            print(f"  RESULT: FAIL ({len(errors)} error(s))")
        else:
            print("  Schema conformance: OK")
            print("  XP file reference: OK")
            print("  Palette role references: OK")
            print("  Region names: OK")
            print("  Dual-region references: OK")
            print("  Ambiguities: OK")
            print("  Hex colors: OK")
            print("  Slot affinity: OK")
            print("  Overlay masks: OK")
            print("  RESULT: PASS")

        results.append((rel, errors))
        print()

    # Summary
    passed = sum(1 for _, errs in results if not errs)
    failed = len(results) - passed
    print("=" * 60)
    print(f"SUMMARY: {passed}/{len(results)} maps passed, {failed} failed")
    if all_passed:
        print("All semantic maps validated successfully.")
    else:
        print("Some maps have validation errors — see details above.")
    print("=" * 60)

    sys.exit(0 if all_passed else 1)


if __name__ == "__main__":
    main()
