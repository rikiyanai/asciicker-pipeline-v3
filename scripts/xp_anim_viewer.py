#!/usr/bin/env python3
"""xp_anim_viewer.py — full-frame, frame-by-frame XP animation viewer.

This viewer is a teaching tool for the bundle refactor, not just a sprite
browser. It shows raw XP frames at real cell dimensions, and in compare modes
it explains how those sheets participate in the compiled appearance bundle.

Usage:
    python3 scripts/pipeline/xp_anim_viewer.py [PATTERN]
    python3 scripts/pipeline/xp_anim_viewer.py ATTACK_4TEST --compare-default
    python3 scripts/pipeline/xp_anim_viewer.py --compare-default
    python3 scripts/pipeline/xp_anim_viewer.py --compare-default-random --seed 7

When `--compare-default` is enabled, the left side is the selected test or
fixture sprite and the right side is the closest traditional/default XP
counterpart. When `--compare-default-random` is enabled, the left side is a
random bundle-shaped test composition (test body + test wearables only) and
the right side is a random traditional/default composition (default body +
normal wearables only).

Walkthrough and callgraph:
Step 0. A raw XP file exists on disk in `assets/sprites/`.
Step 1. The bundle manifest declares what the XP is: owner namespace/id, slot,
presentation family, style, and variant signature.
Step 2. `scripts.pipeline.appearance_bundle._inspect_sprite_asset()` validates
the sheet-layout contract and extracts topology metadata from layer-0 rows.
Step 3. The compiler emits a `layer_definition` row into
`assets/appearance_bundle/current/appearance_bundle.json`.
Step 4. The authoritative server chooses `skin_definition_id`,
`mount_definition_id`, and equipped slot entries.
Step 5. The server sends `presentation_kind_id` plus `appearance_v2` to the
client.
Step 6. The client stores those IDs and, at render time, resolves the active
selector/presentation family from runtime state.
Step 7. The renderer resolves body, mount, and item layers by
owner/slot/presentation/style/variant.
Step 8. The renderer orders those layers and composes the final sprite.
Step 9. A frame inside that composed sprite is selected and drawn.

This script mostly inspects Steps 0-3 directly and mirrors Step 8 in a limited
way when it stacks overlay sheets in compare mode.

Viewer callgraph:
- run()                                                [viewer entry point]
- _build_view_pairs()                                  [Steps 0-3 teaching surface]
- _render_screen()                                     [Step 9 teaching surface]
- _build_subject_frame_actual()                        [Step 8 preview composition]
- _build_subject_frame_by_index()                      [Step 8 compare sync]
- _subject_educational_fields()                        [Steps 1-3 glossary matrix]
- build_frame_actual() / build_frame_by_index()        [raw XP frame extraction]

Alphabetical glossary:
- anchor_mode: the sheet-layout contract's anchor interpretation mode such as
  `character` or `mount_character`.
- appearance_v2: the authoritative appearance payload containing body owner,
  mount owner, and equipped slot entries.
- asset layout contract: the declared XP sheet family such as
  `idle_walk_character` or `attack_mount`.
- attachment order: the bundle-defined slot paint order for a presentation.
- item_definition_id: gameplay item identity and render-owner key for item
  layers.
- mount_definition_id: authoritative mount-owner identity for mount layers.
- owner_definition_kind: which owner namespace a layer belongs to: `skin`,
  `item`, or `mount`.
- presentation_kind_id: the actor's current render verb/state family such as
  `idle_walk`, `attack`, or `plydie`. It is not an outfit combination.
- row1_refs: layer-0 row-1 alignment/projection metadata extracted by the
  compiler.
- row2_refs: layer-0 row-2 depth/secondary alignment metadata extracted by the
  compiler.
- selector input contract: the runtime-state mask and variant fallback rules
  that activate a presentation family.
- skin_definition_id: the authoritative body-owner family such as `cyan_suit`
  or `normal_player`. It is not a body part.
- slot manifest: informal term for the `appearance_v2.entries[]` equipped-slot
  list. Each entry carries `slot_kind_id + item_definition_id + visual_style_id`.
- slot_kind_id: the attachment lane such as `body`, `head`, `weapon`,
  `shield`, `armor`, or `mount`.
- variant_signature: the geometry tuple
  `(height_class, width_class, silhouette_class)`.
- visual_style_id: style/color lane such as `default`, `gold`, or `dark`.

Abstraction hierarchy:
- Runtime entity
- Subject kind
- Authoritative appearance state
- Current runtime state
- Selector / presentation family
- Desired variant signature
- Owner namespaces (`skin`, `item`, `mount`)
- Ordered layer stack
- Composed sprite
- Final frame on screen

Controls:
    ← / →       previous / next sprite
    a / d       rotate angle  (8 steps for standard sprites)
    w / s       previous / next animation track
    , / .       step one frame backward / forward  (pauses autoplay)
    Space       toggle autoplay
    0           jump to frame 0  (useful for plydie corpse-clamp check)
    q / Esc     quit
"""

from __future__ import annotations

import contextlib
import io
import json
import os
import random
import select
import signal
import shutil
import sys
import termios
import threading
import time
import tty
from dataclasses import dataclass
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parents[2]
if str(REPO_ROOT) not in sys.path:
    sys.path.insert(0, str(REPO_ROOT))

from scripts.launcher_lib.xp_assets import (
    SWOOSH_RGB,
    TRANSPARENT_RGB,
    BrowserState,
    PreviewCell,
    SpriteAsset,
    SpriteEntry,
    SpriteMetadata,
    _normalize_preview_cell,
    _parse_metadata,
    _quantize_preview_rgb,
    _load_xp_quiet,
    _select_frame,
    _style_cell,
    load_sprite_asset,
    scan_sprite_entries,
)

# Angle names parallel to engine canonical order (South first).
ANGLE_NAMES = ["S", "SW", "W", "NW", "N", "NE", "E", "SE"]

KEY_ESCAPE = "\x1b"
KEY_SPACE = " "
KEY_LEFT = "LEFT"
KEY_RIGHT = "RIGHT"
KEY_UP = "UP"
KEY_DOWN = "DOWN"
KEY_PAGEUP = "PAGEUP"
KEY_PAGEDOWN = "PAGEDOWN"

SPRITE_DIR = REPO_ROOT / "assets" / "sprites"
APPEARANCE_BUNDLE_PATH = REPO_ROOT / "assets" / "appearance_bundle" / "current" / "appearance_bundle.json"
_BUNDLE_ASSET_INDEX: dict[str, list[dict[str, object]]] | None = None
_RAW_ASSET_INFO: dict[Path, dict[str, object]] = {}

DEFAULT_COMPARE_SPRITE_BY_PREFIX = {
    "attack": "attack-body.xp",
    "plydie": "plydie-body.xp",
    "player": "player-body.xp",
}


@dataclass(frozen=True)
class ViewSubject:
    name: str
    base_entry: SpriteEntry
    overlay_entries: tuple[SpriteEntry, ...] = ()


@dataclass(frozen=True)
class ViewPair:
    left: ViewSubject
    right: ViewSubject | None = None


@dataclass
class PanelState:
    show_details: bool = True
    scroll: int = 0


# ---------------------------------------------------------------------------
# Full-frame extraction (no 16×16 crop)
# ---------------------------------------------------------------------------

def build_frame_actual(
    asset: SpriteAsset,
    state: BrowserState,
    time_tick: int,
) -> tuple[list[list[PreviewCell]], int, int]:
    """Return the full frame at actual cell dimensions, plus (angle, frame_idx).

    Unlike build_preview_cells (which crops to 16×16), this returns every cell
    of the selected frame so you can see the per-cell encoded glyphs.
    """
    meta = asset.entry.meta
    atlas_idx, angle, frame_idx = _select_frame(meta, state, time_tick)
    fr_x = atlas_idx % meta.fr_num_x
    fr_y = atlas_idx // meta.fr_num_x
    x0 = fr_x * meta.fr_width
    y0 = fr_y * meta.fr_height

    rows: list[list[PreviewCell]] = []
    for fy in range(meta.fr_height):
        row: list[PreviewCell] = []
        for fx in range(meta.fr_width):
            glyph, fg_rgb, bg_rgb = asset.merged_visual[y0 + fy][x0 + fx]
            key_rgb = asset.color_key[y0 + fy][x0 + fx][2]

            if fg_rgb == SWOOSH_RGB:
                fg = SWOOSH_RGB
            elif bg_rgb == TRANSPARENT_RGB or fg_rgb == key_rgb:
                fg = None
            else:
                fg = _quantize_preview_rgb(fg_rgb)

            if bg_rgb == SWOOSH_RGB:
                bg = SWOOSH_RGB
            elif bg_rgb == TRANSPARENT_RGB or bg_rgb == key_rgb:
                bg = None
            else:
                bg = _quantize_preview_rgb(bg_rgb)

            row.append(_normalize_preview_cell(glyph, fg, bg))
        rows.append(row)

    return rows, angle, frame_idx


def build_frame_by_index(
    asset: SpriteAsset,
    anim: int,
    angle: int,
    frame_idx: int,
) -> list[list[PreviewCell]]:
    """Return an exact full frame selected by anim/angle/frame indexes."""
    meta = asset.entry.meta
    anim = min(max(anim, 0), len(meta.anim_lengths) - 1)
    angle = angle % max(1, meta.angles)
    frame_idx = frame_idx % meta.anim_lengths[anim]
    frame_base = sum(meta.anim_lengths[:anim])
    atlas_idx = frame_base + frame_idx + angle * meta.fr_num_x
    fr_x = atlas_idx % meta.fr_num_x
    fr_y = atlas_idx // meta.fr_num_x
    x0 = fr_x * meta.fr_width
    y0 = fr_y * meta.fr_height

    rows: list[list[PreviewCell]] = []
    for fy in range(meta.fr_height):
        row: list[PreviewCell] = []
        for fx in range(meta.fr_width):
            glyph, fg_rgb, bg_rgb = asset.merged_visual[y0 + fy][x0 + fx]
            key_rgb = asset.color_key[y0 + fy][x0 + fx][2]

            if fg_rgb == SWOOSH_RGB:
                fg = SWOOSH_RGB
            elif bg_rgb == TRANSPARENT_RGB or fg_rgb == key_rgb:
                fg = None
            else:
                fg = _quantize_preview_rgb(fg_rgb)

            if bg_rgb == SWOOSH_RGB:
                bg = SWOOSH_RGB
            elif bg_rgb == TRANSPARENT_RGB or bg_rgb == key_rgb:
                bg = None
            else:
                bg = _quantize_preview_rgb(bg_rgb)

            row.append(_normalize_preview_cell(glyph, fg, bg))
        rows.append(row)

    return rows


# ---------------------------------------------------------------------------
# Rendering
# ---------------------------------------------------------------------------

def _angle_label(meta: SpriteMetadata, angle: int) -> str:
    if meta.angles == 8 and angle < len(ANGLE_NAMES):
        return ANGLE_NAMES[angle]
    return str(angle)


def _render_frame_lines(
    rows: list[list[PreviewCell]],
    border_top: str,
    border_bot: str,
) -> list[str]:
    lines = [border_top]
    for row in rows:
        lines.append("  " + "".join(_style_cell(c) for c in row))
    lines.append(border_bot)
    return lines


def _render_compare_frame_lines(
    left_rows: list[list[PreviewCell]],
    right_rows: list[list[PreviewCell]],
    left_width: int,
    right_width: int,
) -> list[str]:
    left_border = "\033[2m+" + "-" * left_width + "+\033[0m"
    right_border = "\033[2m+" + "-" * right_width + "+\033[0m"
    lines = [f"  {left_border}    {right_border}"]
    total_rows = max(len(left_rows), len(right_rows))
    for row_idx in range(total_rows):
        if row_idx < len(left_rows):
            left = "".join(_style_cell(c) for c in left_rows[row_idx])
        else:
            left = " " * left_width
        if row_idx < len(right_rows):
            right = "".join(_style_cell(c) for c in right_rows[row_idx])
        else:
            right = " " * right_width
        lines.append(f"  {left}    {right}")
    lines.append(f"  {left_border}    {right_border}")
    return lines


def _animation_prefix_for(sprite_name: str) -> str:
    upper = sprite_name.upper()
    if upper.startswith("WOLACK-"):
        return "attack"
    if "ATTACK" in upper:
        return "attack"
    if "PLYDIE" in upper:
        return "plydie"
    return "player"


def _default_compare_candidates(sprite_name: str) -> list[str]:
    upper = sprite_name.upper()
    prefix = _animation_prefix_for(sprite_name)
    candidates: list[str] = []
    if "WOLF_MOUNTABLE" in upper:
        if "ATTACK" in upper:
            candidates.append("wolack-body.xp")
        else:
            candidates.append("wolfie-body.xp")
    if "BEE_MOUNTABLE" in upper:
        if "ATTACK" in upper:
            candidates.append("bigbee-attack-body.xp")
        else:
            candidates.append("bigbee-mount-body.xp")
    if "WOLFIE" in upper:
        if "ATTACK" in upper:
            candidates.append("wolack-body.xp")
        else:
            candidates.append("wolfie-body.xp")
    if "BIGBEE" in upper:
        if "ATTACK" in upper:
            candidates.append("bigbee-attack-body.xp")
        else:
            candidates.append("bigbee-mount-body.xp")
    if "GOLD_HAT" in upper:
        candidates.extend([
            f"{prefix}-helmet-gold.xp",
            f"{prefix}-helmet-regular.xp",
        ])
    if "SHIELD" in upper:
        candidates.append(f"{prefix}-shield-regular.xp")
    if "WEAPON" in upper or "SWORD" in upper:
        candidates.append(f"{prefix}-weapon-sword.xp")
    if "CYAN_SUIT" in upper:
        candidates.append(f"{prefix}-body.xp")
    candidates.append(DEFAULT_COMPARE_SPRITE_BY_PREFIX[prefix])
    candidates.append("player-body.xp")

    deduped: list[str] = []
    for candidate in candidates:
        if candidate not in deduped:
            deduped.append(candidate)
    return deduped


def _default_compare_name(sprite_name: str) -> str:
    return _default_compare_candidates(sprite_name)[0]


def _compare_anim_for(primary_name: str, compare_meta: SpriteMetadata, state_anim: int) -> int:
    upper = primary_name.upper()
    if "ATTACK" in upper or "PLYDIE" in upper:
        return 0
    if 0 <= state_anim < len(compare_meta.anim_lengths):
        return state_anim
    return 0


def _pattern_terms(pattern: str) -> list[str]:
    return [
        term.strip().lower()
        for term in pattern.replace("|", ",").split(",")
        if term.strip()
    ]


def _pattern_term_matches_name(term: str, name: str) -> bool:
    if term in name:
        return True
    tokens = [token for token in term.replace("-", "_").split("_") if token]
    if len(tokens) <= 1:
        return False
    pos = 0
    for token in tokens:
        idx = name.find(token, pos)
        if idx < 0:
            return False
        pos = idx + len(token)
    return True


def _find_matching_paths(sprite_dir: Path, pattern: str) -> list[Path]:
    terms = _pattern_terms(pattern)
    paths = sorted(sprite_dir.glob("*.xp"), key=lambda item: item.name.lower())
    if not terms:
        return paths
    matched: list[Path] = []
    for path in paths:
        name = path.name.lower()
        if any(_pattern_term_matches_name(term, name) for term in terms):
            matched.append(path)
    return matched


def _filter_entries(entries: list[SpriteEntry], pattern: str) -> list[SpriteEntry]:
    terms = _pattern_terms(pattern)
    if not terms:
        return list(entries)
    matched: list[SpriteEntry] = []
    for entry in entries:
        name = entry.name.lower()
        if any(_pattern_term_matches_name(term, name) for term in terms):
            matched.append(entry)
    return matched


def _entry_from_path(path: Path) -> SpriteEntry | None:
    try:
        xp = _load_xp_quiet(path)
        meta = _parse_metadata(xp)
    except Exception:
        return None
    if meta is None:
        return None
    return SpriteEntry(path=path, name=path.name, meta=meta)


def _get_asset(cache: dict[Path, SpriteAsset], entry: SpriteEntry) -> SpriteAsset:
    if entry.path not in cache:
        cache[entry.path] = load_sprite_asset(entry)
    return cache[entry.path]


def _compose_preview_rows(
    base_rows: list[list[PreviewCell]],
    overlay_rows: list[list[PreviewCell]],
) -> list[list[PreviewCell]]:
    height = min(len(base_rows), len(overlay_rows))
    width = min(len(base_rows[0]) if base_rows else 0, len(overlay_rows[0]) if overlay_rows else 0)
    out = [list(row) for row in base_rows]
    for y in range(height):
        for x in range(width):
            cell = overlay_rows[y][x]
            if cell.fg is None and cell.bg is None and cell.glyph == 32:
                continue
            out[y][x] = cell
    return out


def _build_subject_frame_actual(
    subject: ViewSubject,
    state: BrowserState,
    tick: int,
    cache: dict[Path, SpriteAsset],
) -> tuple[list[list[PreviewCell]], int, int]:
    base_asset = _get_asset(cache, subject.base_entry)
    rows, angle, frame_idx = build_frame_actual(base_asset, state, tick)
    anim = min(max(state.anim, 0), len(subject.base_entry.meta.anim_lengths) - 1)
    for overlay_entry in subject.overlay_entries:
        overlay_asset = _get_asset(cache, overlay_entry)
        overlay_anim = _compare_anim_for(subject.base_entry.name, overlay_entry.meta, anim)
        overlay_rows = build_frame_by_index(overlay_asset, overlay_anim, angle, frame_idx)
        rows = _compose_preview_rows(rows, overlay_rows)
    return rows, angle, frame_idx


def _build_subject_frame_by_index(
    subject: ViewSubject,
    reference_name: str,
    anim: int,
    angle: int,
    frame_idx: int,
    cache: dict[Path, SpriteAsset],
) -> list[list[PreviewCell]]:
    base_asset = _get_asset(cache, subject.base_entry)
    subject_anim = _compare_anim_for(reference_name, subject.base_entry.meta, anim)
    rows = build_frame_by_index(base_asset, subject_anim, angle, frame_idx)
    for overlay_entry in subject.overlay_entries:
        overlay_asset = _get_asset(cache, overlay_entry)
        overlay_anim = _compare_anim_for(reference_name, overlay_entry.meta, anim)
        overlay_rows = build_frame_by_index(overlay_asset, overlay_anim, angle, frame_idx)
        rows = _compose_preview_rows(rows, overlay_rows)
    return rows


def _subject_overlay_summary(subject: ViewSubject) -> str:
    if not subject.overlay_entries:
        return "-"
    return ", ".join(entry.name for entry in subject.overlay_entries)


def _infer_presentation_kind_slug(sprite_name: str) -> str:
    prefix = _animation_prefix_for(sprite_name)
    if prefix == "attack":
        return "attack"
    if prefix == "plydie":
        return "plydie"
    return "idle_walk"


def _infer_slot_kind_slug(sprite_name: str) -> str:
    upper = sprite_name.upper()
    if "HAT" in upper or "HELMET" in upper:
        return "head"
    if "SHIELD" in upper:
        return "shield"
    if "WEAPON" in upper or "SWORD" in upper:
        return "weapon"
    if "ARMOUR" in upper or "ARMOR" in upper:
        return "armor"
    if "MOUNTABLE_ITEM_WORLD" in upper:
        return "world_item"
    if "MOUNTABLE_GRID" in upper or "GRID" in upper:
        return "inventory_item"
    return "body"


def _body_family_prefix(sprite_name: str) -> str:
    lower = sprite_name.lower()
    if lower.startswith("bigbee-"):
        return "bigbee"
    if lower.startswith("wolfie-"):
        return "wolfie"
    if lower.startswith("wolack-"):
        return "wolack"
    if lower.startswith("player-"):
        return "player"
    if lower.startswith("attack-"):
        return "attack"
    if lower.startswith("plydie-"):
        return "plydie"
    return lower.split("-", 1)[0]


def _load_bundle_asset_index() -> dict[str, list[dict[str, object]]]:
    global _BUNDLE_ASSET_INDEX
    if _BUNDLE_ASSET_INDEX is not None:
        return _BUNDLE_ASSET_INDEX
    if not APPEARANCE_BUNDLE_PATH.exists():
        _BUNDLE_ASSET_INDEX = {}
        return _BUNDLE_ASSET_INDEX
    bundle = json.loads(APPEARANCE_BUNDLE_PATH.read_text(encoding="utf-8"))
    index: dict[str, list[dict[str, object]]] = {}
    for entry in bundle.get("catalog", {}).get("layer_definitions", []):
        asset = entry.get("asset", {})
        path = asset.get("path")
        if not isinstance(path, str):
            continue
        key = Path(path).name.lower()
        index.setdefault(key, []).append(
            {
                "record_kind": "layer",
                "slug": entry.get("slug", "-"),
                "owner_kind": entry.get("owner_definition_kind", "-"),
                "owner_slug": entry.get("owner_definition_slug", "-"),
                "owner_id": entry.get("owner_definition_id", "-"),
                "presentation_kind_slug": entry.get("presentation_kind_slug", "-"),
                "presentation_kind_id": entry.get("presentation_kind_id", "-"),
                "slot_kind_slug": entry.get("slot_kind_slug", "-"),
                "slot_kind_id": entry.get("slot_kind_id", "-"),
                "visual_style_slug": entry.get("visual_style_slug", "default"),
                "visual_style_id": entry.get("visual_style_id", "-"),
                "variant_signature": entry.get("variant_signature"),
                "contract": asset.get("contract", "-"),
                "frame_size": asset.get("frame_size"),
                "sheet_size": asset.get("sheet_size"),
                "row1_refs": asset.get("row1_refs"),
                "row2_refs": asset.get("row2_refs"),
            }
        )
    _BUNDLE_ASSET_INDEX = index
    return _BUNDLE_ASSET_INDEX


def _format_variant_signature(value: object) -> str:
    if not isinstance(value, dict):
        return "-"
    return "/".join(
        str(value.get(key, "-"))
        for key in ("height_class", "width_class", "silhouette_class")
    )


def _format_int_list(value: object) -> str:
    if isinstance(value, list):
        return "[" + ", ".join(str(item) for item in value) + "]"
    return "-"


def _format_size(value: object) -> str:
    if isinstance(value, dict):
        width = value.get("width", "-")
        height = value.get("height", "-")
        return f"{width}x{height}"
    return "-"


def _decode_digit(glyph: int) -> int | None:
    if 48 <= glyph <= 57:
        return glyph - 48
    if 65 <= glyph <= 90:
        return glyph + 10 - 65
    if 97 <= glyph <= 122:
        return glyph + 10 - 97
    return None


def _read_raw_asset_info(entry: SpriteEntry) -> dict[str, object]:
    cached = _RAW_ASSET_INFO.get(entry.path)
    if cached is not None:
        return cached

    info: dict[str, object] = {
        "row1_refs": "-",
        "row2_refs": "-",
        "frame_size": {"width": entry.meta.fr_width, "height": entry.meta.fr_height},
        "sheet_size": "-",
    }
    try:
        xp = _load_xp_quiet(entry.path)
        layer0 = xp.layers[0]
        row1: list[int] = []
        row2: list[int] = []
        for x in range(min(2, layer0.width)):
            d1 = _decode_digit(layer0.data[1][x][0]) if layer0.height > 1 else None
            d2 = _decode_digit(layer0.data[2][x][0]) if layer0.height > 2 else None
            if d1 is not None:
                row1.append(d1)
            if d2 is not None:
                row2.append(d2)
        if row1:
            info["row1_refs"] = row1
        if row2:
            info["row2_refs"] = row2
        visual = xp.layers[2] if len(xp.layers) > 2 else layer0
        info["sheet_size"] = {"width": visual.width, "height": visual.height}
    except Exception:
        pass

    _RAW_ASSET_INFO[entry.path] = info
    return info


def _infer_contract_and_anchor_mode(subject: ViewSubject) -> tuple[str, str]:
    slot = _infer_slot_kind_slug(subject.base_entry.name)
    presentation = _infer_presentation_kind_slug(subject.base_entry.name)
    if slot in {"world_item", "inventory_item"}:
        return "-", "none"
    if presentation == "plydie":
        return "plydie_character", "character"
    if presentation == "attack":
        if slot == "mount":
            return "attack_mount", "mount_character"
        return "attack_character", "character"
    if presentation == "idle_walk":
        if slot == "mount":
            return "idle_walk_mount", "mount_character"
        return "idle_walk_character", "character"
    return "-", "-"


def _subject_source_of_truth(subject: ViewSubject) -> str:
    bundle_records = _load_bundle_asset_index().get(subject.base_entry.name.lower(), [])
    return "compiled_bundle" if bundle_records else "viewer_inference"


def _definition_lines_for_pair(pair: ViewPair) -> list[str]:
    left_source = _subject_source_of_truth(pair.left)
    right_source = _subject_source_of_truth(pair.right) if pair.right is not None else "-"
    lines = [
        "",
        "  \033[1mDefinitions\033[0m",
        "  presentation_kind_id = render verb/state family, not outfit or camera angle",
        "  owner_definition_kind = namespace that owns this layer: skin, item, or mount",
        "  slot_kind_id = compositing lane this layer occupies: body/head/shield/weapon/armor/mount",
        "  variant_signature = geometry tuple height_class/width_class/silhouette_class",
        "  contract = declared XP sheet-layout family the compiler validates against",
        "  row1_refs / row2_refs = layer0 alignment metadata used for projection/depth matching",
        f"  source_of_truth = left:{left_source} right:{right_source}",
    ]
    if pair.right is not None:
        shared_slots = sorted(
            set(_infer_slot_kind_slug(entry.name) for entry in pair.left.overlay_entries)
            & set(_infer_slot_kind_slug(entry.name) for entry in pair.right.overlay_entries)
        )
        shared_slot_text = ", ".join(shared_slots) if shared_slots else "-"
        overlay_policy = (
            "left=test fixtures, right=normal/default fixtures"
            if pair.left.overlay_entries or pair.right.overlay_entries
            else "body-only compare"
        )
        lines.extend(
            [
                "  compare_reason = pair test fixture content against nearest default/traditional counterpart",
                f"  overlay_policy = {overlay_policy}",
                f"  shared_slots = {shared_slot_text}",
            ]
        )
    return lines


def _subject_stack_entries(subject: ViewSubject) -> tuple[SpriteEntry, ...]:
    return (subject.base_entry,) + subject.overlay_entries


def _frame_rect_for_entry(
    entry: SpriteEntry,
    reference_name: str,
    anim: int,
    angle: int,
    frame_idx: int,
) -> str:
    meta = entry.meta
    subject_anim = _compare_anim_for(reference_name, meta, anim)
    subject_anim = min(max(subject_anim, 0), len(meta.anim_lengths) - 1)
    subject_angle = angle % max(1, meta.angles)
    subject_frame = frame_idx % meta.anim_lengths[subject_anim]
    frame_base = sum(meta.anim_lengths[:subject_anim])
    atlas_idx = frame_base + subject_frame + subject_angle * meta.fr_num_x
    fr_x = atlas_idx % meta.fr_num_x
    fr_y = atlas_idx // meta.fr_num_x
    x0 = fr_x * meta.fr_width
    y0 = fr_y * meta.fr_height
    sheet_w = meta.fr_num_x * meta.fr_width
    sheet_h = meta.fr_num_y * meta.fr_height
    bl_x = x0
    bl_y = sheet_h - (y0 + meta.fr_height)
    tr_x = x0 + meta.fr_width - 1
    tr_y = sheet_h - y0 - 1
    return f"bl({bl_x},{bl_y}) tr({tr_x},{tr_y})"


def _subject_stack_summary(subject: ViewSubject) -> str:
    return " + ".join(entry.name for entry in _subject_stack_entries(subject))


def _subject_frame_rect_summary(
    subject: ViewSubject,
    reference_name: str,
    anim: int,
    angle: int,
    frame_idx: int,
) -> str:
    parts = []
    for entry in _subject_stack_entries(subject):
        rect = _frame_rect_for_entry(entry, reference_name, anim, angle, frame_idx)
        parts.append(f"{entry.name}: {rect}")
    return " ; ".join(parts)


def _subject_stack_detail_lines(
    label: str,
    subject: ViewSubject,
    reference_name: str,
    anim: int,
    angle: int,
    frame_idx: int,
) -> list[str]:
    lines = [f"  \033[1m{label} Source Sheets\033[0m"]
    for idx, entry in enumerate(_subject_stack_entries(subject), start=1):
        rect = _frame_rect_for_entry(entry, reference_name, anim, angle, frame_idx)
        lines.append(f"  {label.lower()}[{idx}] {entry.name}")
        lines.append(f"      frame_rect = {rect}")
    return lines


def _subject_educational_fields(subject: ViewSubject) -> dict[str, str]:
    bundle_records = _load_bundle_asset_index().get(subject.base_entry.name.lower(), [])
    raw_info = _read_raw_asset_info(subject.base_entry)
    if bundle_records:
        record = bundle_records[0]
        contract = str(record.get("contract", "-"))
        anchor_mode = "mount_character" if contract.endswith("_mount") else ("character" if contract != "-" else "-")
        return {
            "asset": subject.base_entry.name,
            "record": str(record.get("slug", "-")),
            "owner_kind": str(record.get("owner_kind", "-")),
            "owner_slug": str(record.get("owner_slug", "-")),
            "owner_id": str(record.get("owner_id", "-")),
            "presentation_slug": str(record.get("presentation_kind_slug", "-")),
            "presentation_id": str(record.get("presentation_kind_id", "-")),
            "slot_slug": str(record.get("slot_kind_slug", "-")),
            "slot_id": str(record.get("slot_kind_id", "-")),
            "style_slug": str(record.get("visual_style_slug", "-")),
            "style_id": str(record.get("visual_style_id", "-")),
            "variant": _format_variant_signature(record.get("variant_signature")),
            "contract": contract,
            "anchor_mode": anchor_mode,
            "row1_refs": _format_int_list(record.get("row1_refs")),
            "row2_refs": _format_int_list(record.get("row2_refs")),
            "frame_size": _format_size(record.get("frame_size")),
            "sheet_size": _format_size(record.get("sheet_size")),
            "source_of_truth": "compiled_bundle",
        }
    contract, anchor_mode = _infer_contract_and_anchor_mode(subject)
    return {
        "asset": subject.base_entry.name,
        "record": "fixture_only",
        "owner_kind": "fixture",
        "owner_slug": subject.base_entry.name,
        "owner_id": "-",
        "presentation_slug": _infer_presentation_kind_slug(subject.base_entry.name),
        "presentation_id": "-",
        "slot_slug": _infer_slot_kind_slug(subject.base_entry.name),
        "slot_id": "-",
        "style_slug": "fixture",
        "style_id": "-",
        "variant": "-",
        "contract": contract,
        "anchor_mode": anchor_mode,
        "row1_refs": _format_int_list(raw_info.get("row1_refs")),
        "row2_refs": _format_int_list(raw_info.get("row2_refs")),
        "frame_size": _format_size(raw_info.get("frame_size")),
        "sheet_size": _format_size(raw_info.get("sheet_size")),
        "source_of_truth": "viewer_inference",
    }


def _format_topology(meta: SpriteMetadata) -> str:
    return f"{meta.angles}a {meta.projs}p {list(meta.anim_lengths)} {meta.fr_width}x{meta.fr_height}"


def _entry_matches_pattern(entry: SpriteEntry, pattern: str) -> bool:
    terms = _pattern_terms(pattern)
    if not terms:
        return True
    name = entry.name.lower()
    return any(_pattern_term_matches_name(term, name) for term in terms)


def _is_test_sprite_name(name: str) -> bool:
    return "4TEST" in name.upper()


def _is_actor_body_entry(entry: SpriteEntry) -> bool:
    slot = _infer_slot_kind_slug(entry.name)
    presentation = _infer_presentation_kind_slug(entry.name)
    return (
        slot == "body"
        and presentation in {"idle_walk", "attack", "plydie"}
        and entry.meta.angles > 1
    )


def _topology_key(meta: SpriteMetadata) -> tuple[int, int, int, int]:
    return (meta.angles, meta.projs, meta.fr_width, meta.fr_height)


def _overlay_slot_sort_key(slot: str) -> int:
    order = {
        "armor": 0,
        "shield": 1,
        "weapon": 2,
        "head": 3,
    }
    return order.get(slot, 99)


def _default_right_subject_for_entry(
    entry: SpriteEntry,
    all_paths: list[Path],
    all_paths_by_name: dict[str, Path],
) -> ViewSubject | None:
    for wanted in _default_compare_candidates(entry.name):
        compare_path = all_paths_by_name.get(wanted.lower())
        if compare_path is None:
            compare_path = next(
                (
                    path for path in all_paths
                    if _pattern_term_matches_name(wanted.lower(), path.name.lower())
                ),
                None,
            )
        if compare_path is None:
            continue
        compare_entry = _entry_from_path(compare_path)
        if compare_entry is not None:
            return ViewSubject(compare_entry.name, compare_entry)
    return None


def _compare_subject_for_name(
    compare_name: str,
    all_paths: list[Path],
    all_paths_by_name: dict[str, Path],
) -> ViewSubject | None:
    if not compare_name:
        return None
    compare_path = all_paths_by_name.get(compare_name.lower())
    if compare_path is None:
        compare_path = next(
            (
                path for path in all_paths
                if _pattern_term_matches_name(compare_name.lower(), path.name.lower())
            ),
            None,
        )
    if compare_path is None:
        return None
    compare_entry = _entry_from_path(compare_path)
    if compare_entry is None:
        return None
    return ViewSubject(compare_entry.name, compare_entry)


def _test_overlay_pool_for_entry(entry: SpriteEntry, all_entries: list[SpriteEntry]) -> dict[str, list[SpriteEntry]]:
    # Step 3/8 mirror: restrict overlay fixtures to the same presentation family
    # and frame topology so the compare view demonstrates plausible bundle stacks.
    wanted_topology = _topology_key(entry.meta)
    wanted_presentation = _infer_presentation_kind_slug(entry.name)
    pool: dict[str, list[SpriteEntry]] = {}
    for candidate in all_entries:
        if not _is_test_sprite_name(candidate.name):
            continue
        slot = _infer_slot_kind_slug(candidate.name)
        if slot not in {"head", "shield", "weapon", "armor"}:
            continue
        if _infer_presentation_kind_slug(candidate.name) != wanted_presentation:
            continue
        if _topology_key(candidate.meta) != wanted_topology:
            continue
        pool.setdefault(slot, []).append(candidate)
    return pool


def _normal_overlay_pool_for_subject(base_subject: ViewSubject, all_entries: list[SpriteEntry]) -> dict[str, list[SpriteEntry]]:
    wanted_topology = _topology_key(base_subject.base_entry.meta)
    wanted_presentation = _infer_presentation_kind_slug(base_subject.base_entry.name)
    wanted_family = _body_family_prefix(base_subject.base_entry.name)

    def collect(require_presentation: bool) -> dict[str, list[SpriteEntry]]:
        pool: dict[str, list[SpriteEntry]] = {}
        for candidate in all_entries:
            if _is_test_sprite_name(candidate.name):
                continue
            slot = _infer_slot_kind_slug(candidate.name)
            if slot not in {"head", "shield", "weapon", "armor"}:
                continue
            if _topology_key(candidate.meta) != wanted_topology:
                continue
            if require_presentation and _infer_presentation_kind_slug(candidate.name) != wanted_presentation:
                continue
            if not require_presentation and _body_family_prefix(candidate.name) != wanted_family:
                continue
            pool.setdefault(slot, []).append(candidate)
        return pool

    pool = collect(require_presentation=True)
    if pool:
        return pool
    return collect(require_presentation=False)


def _pick_random_overlay_entries(
    pool: dict[str, list[SpriteEntry]],
    rng: random.Random,
    chosen_slots: tuple[str, ...] | None = None,
) -> tuple[SpriteEntry, ...]:
    slots = list(chosen_slots) if chosen_slots is not None else sorted(pool.keys(), key=_overlay_slot_sort_key)
    if not slots:
        return ()
    if chosen_slots is None:
        chosen = [slot for slot in slots if rng.random() < 0.65]
        if not chosen:
            chosen = [rng.choice(slots)]
    else:
        chosen = slots
    overlays: list[SpriteEntry] = []
    for slot in chosen:
        candidates = pool.get(slot, [])
        if candidates:
            overlays.append(rng.choice(candidates))
    overlays.sort(key=lambda entry: _overlay_slot_sort_key(_infer_slot_kind_slug(entry.name)))
    return tuple(overlays)


def _build_plain_pairs(entries: list[SpriteEntry]) -> list[ViewPair]:
    return [ViewPair(ViewSubject(entry.name, entry)) for entry in entries]


def _build_default_compare_pairs(
    entries: list[SpriteEntry],
    all_paths: list[Path],
    all_paths_by_name: dict[str, Path],
    compare: str,
) -> list[ViewPair]:
    pairs: list[ViewPair] = []
    for entry in entries:
        left = ViewSubject(entry.name, entry)
        right = (
            _compare_subject_for_name(compare, all_paths, all_paths_by_name)
            if compare
            else _default_right_subject_for_entry(entry, all_paths, all_paths_by_name)
        )
        pairs.append(ViewPair(left=left, right=right))
    return pairs


def _build_random_compare_pairs(
    entries: list[SpriteEntry],
    all_entries: list[SpriteEntry],
    all_paths: list[Path],
    all_paths_by_name: dict[str, Path],
    rng: random.Random,
) -> list[ViewPair]:
    pairs: list[ViewPair] = []
    for entry in entries:
        if not _is_actor_body_entry(entry):
            continue
        left_pool = _test_overlay_pool_for_entry(entry, all_entries)
        right_base = _default_right_subject_for_entry(entry, all_paths, all_paths_by_name)
        if right_base is None:
            pairs.append(ViewPair(left=ViewSubject(entry.name, entry)))
            continue
        right_pool = _normal_overlay_pool_for_subject(right_base, all_entries)
        shared_slots = sorted(
            set(left_pool.keys()) & set(right_pool.keys()),
            key=_overlay_slot_sort_key,
        )
        if not shared_slots:
            continue
        shared_left_pool = {slot: left_pool[slot] for slot in shared_slots}
        shared_right_pool = {slot: right_pool[slot] for slot in shared_slots}
        chosen_slots = [
            slot for slot in shared_slots if rng.random() < 0.65
        ]
        if not chosen_slots and shared_slots:
            chosen_slots = [rng.choice(shared_slots)]
        left_subject = ViewSubject(
            entry.name,
            entry,
            overlay_entries=_pick_random_overlay_entries(
                shared_left_pool,
                rng,
                chosen_slots=tuple(chosen_slots),
            ),
        )
        right_subject = ViewSubject(
            right_base.name,
            right_base.base_entry,
            overlay_entries=_pick_random_overlay_entries(
                shared_right_pool,
                rng,
                chosen_slots=tuple(chosen_slots),
            ),
        )
        pairs.append(ViewPair(left=left_subject, right=right_subject))
    return pairs


def _build_view_pairs(
    entries: list[SpriteEntry],
    all_entries: list[SpriteEntry],
    all_paths: list[Path],
    all_paths_by_name: dict[str, Path],
    compare_default: bool,
    compare_default_random: bool,
    compare: str,
    random_seed: int | None,
) -> list[ViewPair]:
    if compare_default_random:
        return _build_random_compare_pairs(
            entries,
            all_entries,
            all_paths,
            all_paths_by_name,
            random.Random(random_seed),
        )
    if compare_default or compare:
        return _build_default_compare_pairs(entries, all_paths, all_paths_by_name, compare)
    return _build_plain_pairs(entries)


def _render_screen(
    pairs: list[ViewPair],
    index: int,
    pair: ViewPair,
    state: BrowserState,
    cache: dict[Path, SpriteAsset],
    panel_state: PanelState,
) -> str:
    meta = pair.left.base_entry.meta
    tick = _time_tick()
    frame_rows, angle, frame_idx = _build_subject_frame_actual(pair.left, state, tick, cache)

    anim = min(max(state.anim, 0), len(meta.anim_lengths) - 1)
    anim_len = meta.anim_lengths[anim]
    ang_label = _angle_label(meta, angle)
    left_fields = _subject_educational_fields(pair.left)

    # Header
    hdr = [
        "\033[1mXP Anim Viewer\033[0m",
        f"  \033[1m{pair.left.name}\033[0m   [{index + 1}/{len(pairs)}]",
        (
            f"  angle {ang_label}  "
            f"frame {frame_idx + 1}/{anim_len}  "
            f"anim {anim + 1}/{len(meta.anim_lengths)}  "
            f"frame size {meta.fr_width}x{meta.fr_height}"
        ),
        "  \033[2m[←/→] sprite  [a/d] angle  [w/s] anim  [,/.] frame  [[/]] scroll  [m] details  [Space] autoplay  [0] frame 0  [q] quit\033[0m",
        "",
    ]

    border = "  " + "\033[2m+" + "-" * meta.fr_width + "+\033[0m"
    if pair.right is not None:
        compare_meta = pair.right.base_entry.meta
        compare_rows = _build_subject_frame_by_index(
            pair.right,
            pair.left.base_entry.name,
            anim,
            angle,
            frame_idx,
            cache,
        )
        right_fields = _subject_educational_fields(pair.right)
        frame_lines = [
            (
                f"  \033[2mleft: {pair.left.name}"
                f"    right: {pair.right.name}\033[0m"
            )
        ] + _subject_stack_detail_lines(
            "Left",
            pair.left,
            pair.left.base_entry.name,
            anim,
            angle,
            frame_idx,
        ) + [
            ""
        ] + _subject_stack_detail_lines(
            "Right",
            pair.right,
            pair.left.base_entry.name,
            anim,
            angle,
            frame_idx,
        ) + [
            ""
        ] + _render_compare_frame_lines(
            frame_rows,
            compare_rows,
            meta.fr_width,
            compare_meta.fr_width,
        )
        metadata_lines = [
            "",
            "  \033[1mEducational Matrix\033[0m",
            "  field           left                                      right",
            f"  base_asset      {left_fields['asset']:<40} {right_fields['asset']}",
            f"  record          {left_fields['record']:<40} {right_fields['record']}",
            f"  owner_kind      {left_fields['owner_kind']:<40} {right_fields['owner_kind']}",
            f"  owner_slug      {left_fields['owner_slug']:<40} {right_fields['owner_slug']}",
            f"  owner_id        {left_fields['owner_id']:<40} {right_fields['owner_id']}",
            f"  present_slug    {left_fields['presentation_slug']:<40} {right_fields['presentation_slug']}",
            f"  present_id      {left_fields['presentation_id']:<40} {right_fields['presentation_id']}",
            f"  slot_slug       {left_fields['slot_slug']:<40} {right_fields['slot_slug']}",
            f"  slot_id         {left_fields['slot_id']:<40} {right_fields['slot_id']}",
            f"  style_slug      {left_fields['style_slug']:<40} {right_fields['style_slug']}",
            f"  style_id        {left_fields['style_id']:<40} {right_fields['style_id']}",
            f"  variant         {left_fields['variant']:<40} {right_fields['variant']}",
            f"  contract        {left_fields['contract']:<40} {right_fields['contract']}",
            f"  anchor_mode     {left_fields['anchor_mode']:<40} {right_fields['anchor_mode']}",
            f"  row1_refs       {left_fields['row1_refs']:<40} {right_fields['row1_refs']}",
            f"  row2_refs       {left_fields['row2_refs']:<40} {right_fields['row2_refs']}",
            f"  frame_size      {left_fields['frame_size']:<40} {right_fields['frame_size']}",
            f"  sheet_size      {left_fields['sheet_size']:<40} {right_fields['sheet_size']}",
            f"  source_truth    {left_fields['source_of_truth']:<40} {right_fields['source_of_truth']}",
            f"  topology        {_format_topology(pair.left.base_entry.meta):<40} {_format_topology(pair.right.base_entry.meta)}",
            f"  overlays        {_subject_overlay_summary(pair.left):<40} {_subject_overlay_summary(pair.right)}",
            "  glossary        presentation=verb/state family  slot=attachment lane  owner=skin/item/mount namespace",
            "",
            "  \033[1mResolved Stacks\033[0m",
            f"  left stack_assets  = {_subject_stack_summary(pair.left)}",
            f"  left frame_rects   = {_subject_frame_rect_summary(pair.left, pair.left.base_entry.name, anim, angle, frame_idx)}",
            f"  right stack_assets = {_subject_stack_summary(pair.right)}",
            f"  right frame_rects  = {_subject_frame_rect_summary(pair.right, pair.left.base_entry.name, anim, angle, frame_idx)}",
        ] + _definition_lines_for_pair(pair)
    else:
        frame_lines = _subject_stack_detail_lines(
            "Left",
            pair.left,
            pair.left.base_entry.name,
            anim,
            angle,
            frame_idx,
        ) + [
            ""
        ] + _render_frame_lines(frame_rows, border, border)
        metadata_lines = [
            "",
            "  \033[1mEducational Matrix\033[0m",
            f"  base_asset  {left_fields['asset']}",
            f"  record      {left_fields['record']}",
            f"  owner_kind  {left_fields['owner_kind']}",
            f"  owner_slug  {left_fields['owner_slug']}",
            f"  owner_id    {left_fields['owner_id']}",
            f"  present_slug {left_fields['presentation_slug']}",
            f"  present_id  {left_fields['presentation_id']}",
            f"  slot_slug   {left_fields['slot_slug']}",
            f"  slot_id     {left_fields['slot_id']}",
            f"  style_slug  {left_fields['style_slug']}",
            f"  style_id    {left_fields['style_id']}",
            f"  variant     {left_fields['variant']}",
            f"  contract    {left_fields['contract']}",
            f"  anchor_mode {left_fields['anchor_mode']}",
            f"  row1_refs   {left_fields['row1_refs']}",
            f"  row2_refs   {left_fields['row2_refs']}",
            f"  frame_size  {left_fields['frame_size']}",
            f"  sheet_size  {left_fields['sheet_size']}",
            f"  source_truth {left_fields['source_of_truth']}",
            f"  topology    {_format_topology(pair.left.base_entry.meta)}",
            f"  overlays    {_subject_overlay_summary(pair.left)}",
            "",
            "  \033[1mResolved Stacks\033[0m",
            f"  left stack_assets = {_subject_stack_summary(pair.left)}",
            f"  left frame_rects  = {_subject_frame_rect_summary(pair.left, pair.left.base_entry.name, anim, angle, frame_idx)}",
        ] + _definition_lines_for_pair(pair)

    # Nearby sprite list
    nearby = ["  Nearby:"]
    start = max(0, index - 3)
    end = min(len(pairs), index + 4)
    for i in range(start, end):
        marker = "\033[1m>\033[0m" if i == index else " "
        nearby.append(f"  {marker} {pairs[i].left.name}")

    status_line = f"  \033[2m{state.status}\033[0m" if state.status else ""
    autoplay_indicator = "  \033[32m▶ autoplay\033[0m" if state.autoplay else "  \033[33m‖ paused\033[0m"

    panel_lines: list[str]
    if panel_state.show_details:
        panel_lines = metadata_lines
    else:
        panel_lines = [
            "",
            "  \033[2mDetails hidden; press [m] to show the metadata panel.\033[0m",
        ]

    panel_lines = panel_lines + [
        "",
        f"  \033[2mpanel scroll {panel_state.scroll}  [ [ / ] ] scroll metadata  [m] toggle details\033[0m",
        autoplay_indicator,
        status_line,
        "",
    ] + nearby

    fixed_lines = hdr + frame_lines
    max_lines = shutil.get_terminal_size((120, 80)).lines
    available_panel_lines = max(6, max_lines - len(fixed_lines))
    max_scroll = max(0, len(panel_lines) - available_panel_lines)
    scroll = min(max(panel_state.scroll, 0), max_scroll)
    panel_state.scroll = scroll
    visible_panel_lines = panel_lines[scroll:scroll + available_panel_lines]

    body = fixed_lines + visible_panel_lines
    return "\033[H\033[2J" + "\r\n".join(body)


# ---------------------------------------------------------------------------
# Input handling
# ---------------------------------------------------------------------------

def _read_key(fd: int) -> str | None:
    if not select.select([fd], [], [], 0.05)[0]:
        return None
    raw = os.read(fd, 16)
    if not raw:
        return None
    data = raw.decode("utf-8", errors="ignore")
    if data.startswith("\x1b[D"):
        return KEY_LEFT
    if data.startswith("\x1b[C"):
        return KEY_RIGHT
    if data.startswith("\x1b[A"):
        return KEY_UP
    if data.startswith("\x1b[B"):
        return KEY_DOWN
    if data.startswith("\x1b[5~"):
        return KEY_PAGEUP
    if data.startswith("\x1b[6~"):
        return KEY_PAGEDOWN
    return data[0]


def _apply_key(
    state: BrowserState,
    meta: SpriteMetadata,
    key: str,
) -> tuple[bool, int | None]:
    """Return (keep_running, sprite_index_delta)."""
    if key in {"q", "Q", KEY_ESCAPE, "\x03"}:
        return False, None
    if key == KEY_LEFT:
        return True, -1
    if key == KEY_RIGHT:
        return True, 1
    if key in {"j", "J"}:
        return True, -10
    if key in {"k", "K"}:
        return True, 10
    if key in {"a", "A", KEY_UP}:
        step = 360.0 / max(1, meta.angles)
        state.yaw = (state.yaw - step) % 360.0
        state.status = f"yaw {int(state.yaw) % 360}"
        return True, None
    if key in {"d", "D", KEY_DOWN}:
        step = 360.0 / max(1, meta.angles)
        state.yaw = (state.yaw + step) % 360.0
        state.status = f"yaw {int(state.yaw) % 360}"
        return True, None
    if key in {"w", "W"}:
        state.anim = (state.anim - 1) % len(meta.anim_lengths)
        state.frame = 0
        state.status = f"anim {state.anim + 1}"
        return True, None
    if key in {"s", "S"}:
        state.anim = (state.anim + 1) % len(meta.anim_lengths)
        state.frame = 0
        state.status = f"anim {state.anim + 1}"
        return True, None
    if key == ",":
        state.autoplay = False
        anim = min(max(state.anim, 0), len(meta.anim_lengths) - 1)
        state.frame = (state.frame - 1) % meta.anim_lengths[anim]
        state.status = f"frame {state.frame + 1}"
        return True, None
    if key == ".":
        state.autoplay = False
        anim = min(max(state.anim, 0), len(meta.anim_lengths) - 1)
        state.frame = (state.frame + 1) % meta.anim_lengths[anim]
        state.status = f"frame {state.frame + 1}"
        return True, None
    if key == "0":
        state.autoplay = False
        state.frame = 0
        state.status = "jumped to frame 0"
        return True, None
    if key == KEY_SPACE:
        state.autoplay = not state.autoplay
        state.status = "autoplay on" if state.autoplay else "autoplay off"
        return True, None
    return True, None


def _default_state(meta: SpriteMetadata) -> BrowserState:
    # Start on anim 1 (move) if multi-anim, else anim 0.
    anim = 1 if len(meta.anim_lengths) > 1 else 0
    return BrowserState(anim=anim, autoplay=True)


def _time_tick() -> int:
    return (time.monotonic_ns() // 1000) >> 14


def _normalize_cli_argv(argv: list[str]) -> list[str]:
    normalized: list[str] = []
    idx = 0
    while idx < len(argv):
        current = argv[idx]
        if current == "--compare-" and idx + 1 < len(argv):
            nxt = argv[idx + 1]
            if nxt in {"default-random", "default--random"}:
                normalized.append("--compare-default-random")
                idx += 2
                continue
        normalized.append(current)
        idx += 1
    return normalized


@contextlib.contextmanager
def _loading_spinner(label: str):
    if not sys.stderr.isatty():
        yield
        return

    stop = threading.Event()

    def spin() -> None:
        frames = "|/-\\"
        idx = 0
        while not stop.wait(0.1):
            frame = frames[idx % len(frames)]
            sys.stderr.write(f"\r{label} {frame}")
            sys.stderr.flush()
            idx += 1
        sys.stderr.write(f"\r{label} done\n")
        sys.stderr.flush()

    thread = threading.Thread(target=spin, daemon=True)
    thread.start()
    try:
        yield
    finally:
        stop.set()
        thread.join()


# ---------------------------------------------------------------------------
# Entry point
# ---------------------------------------------------------------------------

def run(
    sprite_dir: Path = SPRITE_DIR,
    pattern: str = "",
    compare_default: bool = False,
    compare: str = "",
    compare_default_random: bool = False,
    random_seed: int | None = None,
) -> int:
    if not sys.stdin.isatty() or not sys.stdout.isatty():
        print("xp_anim_viewer requires a TTY", file=sys.stderr)
        return 1

    with _loading_spinner("Loading XP sprites"):
        all_entries = scan_sprite_entries(sprite_dir)
    all_paths = [entry.path for entry in all_entries]
    all_paths_by_name = {path.name.lower(): path for path in all_paths}

    effective_pattern = pattern
    if (compare_default or compare_default_random) and not effective_pattern:
        effective_pattern = "4TEST"

    entries = _filter_entries(all_entries, effective_pattern)

    if compare_default_random:
        entries = [entry for entry in entries if _is_actor_body_entry(entry)]

    if not entries:
        msg = (
            f"no sprites matching {effective_pattern!r}"
            if effective_pattern
            else "no valid .xp sprites found"
        )
        print(msg, file=sys.stderr)
        return 1

    with _loading_spinner("Building compare pairs"):
        pairs = _build_view_pairs(
            entries=entries,
            all_entries=all_entries,
            all_paths=all_paths,
            all_paths_by_name=all_paths_by_name,
            compare_default=compare_default,
            compare_default_random=compare_default_random,
            compare=compare,
            random_seed=random_seed,
        )
    if not pairs:
        print("no compatible compare pairs found", file=sys.stderr)
        return 1

    cache: dict[Path, SpriteAsset] = {}

    index = 0
    pair = pairs[index]
    state = _default_state(pair.left.base_entry.meta)
    panel_state = PanelState()
    redraw = [True]

    def on_resize(*_: object) -> None:
        redraw[0] = True

    old_sig = signal.signal(signal.SIGWINCH, on_resize)
    fd = sys.stdin.fileno()
    old_settings = termios.tcgetattr(fd)
    sys.stdout.write("\033[?1049h\033[?25l")
    sys.stdout.flush()

    try:
        tty.setraw(fd)
        while True:
            if redraw[0] or state.autoplay:
                redraw[0] = False
                sys.stdout.write(
                    _render_screen(
                        pairs,
                        index,
                        pair,
                        state,
                        cache,
                        panel_state,
                    )
                )
                sys.stdout.flush()

            key = _read_key(fd)
            if key is None:
                continue

            if key in {"m", "M"}:
                panel_state.show_details = not panel_state.show_details
                panel_state.scroll = 0
                state.status = "details shown" if panel_state.show_details else "details hidden"
                redraw[0] = True
                continue
            if key in {"[", KEY_PAGEUP}:
                panel_state.scroll = max(0, panel_state.scroll - 5)
                state.status = f"panel scroll {panel_state.scroll}"
                redraw[0] = True
                continue
            if key in {"]", KEY_PAGEDOWN}:
                panel_state.scroll += 5
                state.status = f"panel scroll {panel_state.scroll}"
                redraw[0] = True
                continue

            keep, delta = _apply_key(state, pair.left.base_entry.meta, key)
            if not keep:
                break
            if delta is not None:
                total = len(pairs)
                index = (index + delta) % total if total else 0
                pair = pairs[index]
                state = _default_state(pair.left.base_entry.meta)
                state.status = pair.left.name
                panel_state.scroll = 0
            redraw[0] = True
    finally:
        termios.tcsetattr(fd, termios.TCSADRAIN, old_settings)
        sys.stdout.write("\033[?1049l\033[?25h\033[0m")
        sys.stdout.flush()
        signal.signal(signal.SIGWINCH, old_sig)

    return 0


def main() -> int:
    import argparse
    parser = argparse.ArgumentParser(
        description="Full-frame, frame-by-frame XP animation viewer.",
        epilog=__doc__,
        formatter_class=argparse.RawDescriptionHelpFormatter,
        allow_abbrev=False,
    )
    parser.add_argument(
        "pattern", nargs="?", default="",
        help=(
            "Case-insensitive substring filter on sprite filenames. "
            "Use comma or | to match multiple terms."
        ),
    )
    parser.add_argument(
        "--dir", type=Path, default=SPRITE_DIR,
        help="Sprite directory (default: assets/sprites/).",
    )
    parser.add_argument(
        "--compare-default", action="store_true",
        help=(
            "Show a side-by-side frame against the default player-family sprite "
            "(attack-body.xp for attack, plydie-body.xp for death, player-body.xp otherwise)."
        ),
    )
    parser.add_argument(
        "--compare-default-random", "--compare-default--random",
        dest="compare_default_random",
        action="store_true",
        help=(
            "Show random body+wearable combinations with test-only fixtures on the left "
            "and normal/default wearables on the right."
        ),
    )
    parser.add_argument(
        "--compare", default="",
        help="Sprite filename or substring to show side-by-side with the selected test XP.",
    )
    parser.add_argument(
        "--seed", type=int, default=None,
        help="Deterministic RNG seed for --compare-default-random.",
    )
    args = parser.parse_args(_normalize_cli_argv(sys.argv[1:]))
    return run(
        sprite_dir=args.dir,
        pattern=args.pattern,
        compare_default=args.compare_default,
        compare=args.compare,
        compare_default_random=args.compare_default_random,
        random_seed=args.seed,
    )


if __name__ == "__main__":
    raise SystemExit(main())
