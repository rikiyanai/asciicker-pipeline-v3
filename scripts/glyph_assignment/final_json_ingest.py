"""FINAL-JSON ingest: canonicalize labels, load per-layer regions, extract
per-region glyph frequencies, and emit semantic_maps JSONs for the matcher.

Input:
  state_FINAL_20260521-163326.json  — per-layer human-verified labels
    {f"{family}-{ahsw}-L{idx}": {
        "status": "accept" | "partial" | "reject" | "ambig",
        "corrected_label": str,
        "note": str,
        ...
    }}

Outputs:
  WORK/canonical_vocabulary.json   — raw label → canonical region map
  WORK/layer_regions.json          — (family,ahsw,layer) → canonical region
  WORK/glyph_frequencies.json      — region → {glyph_int: count}
  WORK/semantic_maps/{family}-roles.json — schema _collect_hints_from_json accepts

The canonicalizer is rule-based (longest-substring match, lowercase, typo fixes).
The extractor reads per-layer PNGs and runs the existing matcher with no bias
to count which CP437 glyphs each layer naturally produces.
"""
from __future__ import annotations

import json
import re
from collections import Counter, defaultdict
from dataclasses import dataclass
from pathlib import Path
from typing import Iterable

from PIL import Image

from .candidate import GlyphAssignmentConfig
from .matcher import assign_image_cells


# --------------------------------------------------------------------------- #
# Canonical vocabulary
# --------------------------------------------------------------------------- #

# Canonical region names — the vocabulary the matcher's bias system keys on.
# Names use dotted hierarchy: <category>.<specifier>. The category is also the
# fallback when specifier is unknown.
CANONICAL_REGIONS: tuple[str, ...] = (
    "mount.bigbee",
    "mount.wolf",
    "rider.torso_limbless",
    "rider.torso_with_sword",
    "rider.torso_with_shield",
    "weapon.sword",
    "weapon.crossbow.body",
    "weapon.crossbow.arrow",
    "weapon.crossbow.string",
    "weapon.swoosh",
    "armor.body",
    "helmet",
    "shield",
    "body.player",
    "body.plydie",
    "composite",
    "unknown",
)


# Longest-substring rules, applied after lowercase + whitespace collapse.
# Order matters: longer / more specific phrases must come before shorter ones.
# `composite` rule fires when the note mentions ≥2 distinct component areas.
_RULES: tuple[tuple[str, str], ...] = (
    # crossbow components (must come before generic "shield" / "armor")
    ("crossbow string", "weapon.crossbow.string"),
    ("bow string", "weapon.crossbow.string"),
    ("crossbow arrow", "weapon.crossbow.arrow"),
    ("cross bow arrow", "weapon.crossbow.arrow"),
    ("arrrow", "weapon.crossbow.arrow"),
    ("crossbow", "weapon.crossbow.body"),
    ("cross bow", "weapon.crossbow.body"),
    ("weapon_crossbow", "weapon.crossbow.body"),
    # sword components
    ("holding sword", "rider.torso_with_sword"),
    ("torso holding sword", "rider.torso_with_sword"),
    ("with sword", "rider.torso_with_sword"),
    ("player_weapon_sword", "weapon.sword"),
    ("weapon_sword", "weapon.sword"),
    # swoosh
    ("weapon_swoosh", "weapon.swoosh"),
    ("swoosh", "weapon.swoosh"),
    # shield variants
    ("with shield", "rider.torso_with_shield"),
    ("shield_regular", "shield"),
    ("shield bit", "shield"),
    ("shield bits", "shield"),
    ("shield", "shield"),
    ("shiled", "shield"),  # typo
    # armor variants
    ("armor_regular", "armor.body"),
    ("armour", "armor.body"),  # spelling variant when used alone (not in negation)
    ("armor", "armor.body"),
    # helmet variants
    ("helmet_regular", "helmet"),
    ("helmet bit", "helmet"),
    ("helmet", "helmet"),
    ("helmey", "helmet"),  # typo
    # rider torso variants
    ("torso limbless", "rider.torso_limbless"),
    ("no arms", "rider.torso_limbless"),
    ("upper torso", "rider.torso_with_sword"),  # bigbee L4 pattern
    # mount variants
    ("big bee mount", "mount.bigbee"),
    ("bigbee mount", "mount.bigbee"),
    ("big bee", "mount.bigbee"),
    ("bigbee", "mount.bigbee"),
    ("bee only", "mount.bigbee"),
    ("wolf body", "mount.wolf"),
    ("wolf_body", "mount.wolf"),
    # body fallbacks (lowest priority)
    ("ply die body", "body.plydie"),
    ("plydie_body", "body.plydie"),
    ("player_body", "body.player"),
    ("player body", "body.player"),
    ("torso", "rider.torso_limbless"),
    ("body", "body.player"),  # absolute fallback for bare `body`
)


# Substrings that indicate the note describes multiple roles in one layer.
# When ≥2 different category families match, emit `composite` and record
# the constituent canonical regions in components.
_COMPOSITE_HINTS: tuple[tuple[str, str], ...] = (
    ("composite_source:armor_shield", "composite"),  # explicit composite marker
    ("plus shield", "_signal"),
    ("plus armour", "_signal"),
    ("plus armor", "_signal"),
    ("plus some for", "_signal"),
    ("plus torso", "_signal"),
    ("with shield", "_signal"),  # rider.torso_with_shield is its own region; only count as composite when paired
    ("with sword", "_signal"),
)


@dataclass(frozen=True)
class CanonicalDecision:
    region: str
    components: tuple[str, ...] = ()
    matched_phrase: str | None = None


_FAMILY_PREFIXES: tuple[str, ...] = (
    "bigbee_", "wolfie_", "wolack_", "player_", "plydie_", "attack_",
)


def _normalize(text: str) -> str:
    """Lowercase, collapse whitespace, strip non-alphanumeric except underscore."""
    text = text.lower()
    text = re.sub(r"[^\w\s.]", " ", text)
    text = re.sub(r"\s+", " ", text).strip()
    return text


def _strip_family_prefix(label: str) -> str:
    """Strip a controlled-vocabulary family prefix from snake_case labels.

    `bigbee_shield_regular` → `shield_regular`
    `player_armor_regular` → `armor_regular`
    `weapon_crossbow`      → `weapon_crossbow` (unchanged — no family prefix)

    The family identity is recorded in the row key, not the region. Stripping
    the prefix prevents `bigbee_shield_regular` from triggering both the
    `shield` and `bigbee → mount.bigbee` rules (which would falsely trip the
    composite detector).
    """
    for prefix in _FAMILY_PREFIXES:
        if label.startswith(prefix):
            return label[len(prefix):]
    return label


def canonicalize(label: str, note: str = "") -> CanonicalDecision:
    """Return canonical region for a (label, note) pair from FINAL JSON.

    The label is checked first, then the note. The first matching rule wins
    unless the combined text contains ≥2 distinct category families, in
    which case `composite` is returned with the components listed.
    """
    # Direct controlled-vocabulary shortcut: `{family}_body` → body.{family}.
    # Runs before string normalization so the family identity is preserved
    # (after _strip_family_prefix it would become just "body").
    label_lower = label.strip().lower()
    if label_lower in ("player_body", "player body"):
        return CanonicalDecision("body.player", matched_phrase="player_body")
    if label_lower in ("plydie_body", "plydie body", "ply die body"):
        return CanonicalDecision("body.plydie", matched_phrase="plydie_body")

    # Strip controlled-vocabulary family prefix BEFORE normalization so that
    # `bigbee_shield_regular` → `shield_regular` rather than matching both
    # `bigbee` (mount) and `shield_regular`.
    label_stripped = _strip_family_prefix(label_lower)
    label_n = _normalize(label_stripped)
    note_n = _normalize(note)

    if not label_n and not note_n:
        return CanonicalDecision("unknown")

    # Collect canonical regions, longest-substring-first, with consumption.
    # Once a phrase matches, its characters are masked out so shorter rules
    # don't double-match within the same span (e.g. `wolf body` matches the
    # `mount.wolf` rule and should not also trigger the bare `body` rule).
    combined = f"{label_n} {note_n}"
    matches: list[str] = []
    matched_phrases: list[str] = []
    consumed = combined
    for phrase, region in _RULES:
        idx = consumed.find(phrase)
        if idx >= 0 and region not in matches:
            matches.append(region)
            matched_phrases.append(phrase)
            # Mask the matched span with spaces (preserve string indexing).
            consumed = consumed[:idx] + " " * len(phrase) + consumed[idx + len(phrase):]

    if not matches:
        return CanonicalDecision("unknown")

    # Composite detection: ≥2 distinct category families
    categories = {r.split(".")[0] for r in matches}
    if len(matches) >= 2 and len(categories) >= 2:
        return CanonicalDecision(
            "composite",
            components=tuple(matches),
            matched_phrase=matched_phrases[0],
        )

    # Single match — return that.
    return CanonicalDecision(matches[0], matched_phrase=matched_phrases[0])


def build_canonical_vocabulary(final_json_path: Path) -> dict:
    """Run canonicalize() over every row in FINAL JSON; return a vocab report."""
    data = json.loads(final_json_path.read_text())
    raw_to_canonical: dict[str, str] = {}
    raw_to_components: dict[str, list[str]] = {}
    unmapped: list[tuple[str, str, str]] = []  # (row_key, label, note)
    composite_rows: list[tuple[str, list[str]]] = []

    for row_key, payload in data.items():
        status = payload.get("status", "")
        if status not in ("accept", "partial", "ambig"):
            continue
        label = (payload.get("corrected_label") or "").strip()
        note = (payload.get("note") or "").strip()
        decision = canonicalize(label, note)
        # Index by raw label as the primary key; collisions are OK (idempotent)
        key = label or f"<note-only:{note[:40]}>"
        raw_to_canonical[key] = decision.region
        if decision.components:
            raw_to_components[key] = list(decision.components)
            composite_rows.append((row_key, list(decision.components)))
        if decision.region == "unknown":
            unmapped.append((row_key, label, note))

    return {
        "vocabulary": list(CANONICAL_REGIONS),
        "raw_to_canonical": raw_to_canonical,
        "raw_to_components": raw_to_components,
        "composite_rows": composite_rows,
        "unmapped": unmapped,
        "stats": {
            "total_rows": sum(1 for _ in data.values()),
            "accept_partial_ambig": len(raw_to_canonical),
            "unmapped_count": len(unmapped),
            "composite_count": len(composite_rows),
        },
    }


# --------------------------------------------------------------------------- #
# Layer→region adapter (E1)
# --------------------------------------------------------------------------- #

_LAYER_KEY_RE = re.compile(r"^(?P<family>[a-z0-9_-]+?)-L(?P<idx>\d+)$")


def parse_row_key(row_key: str) -> tuple[str, str, int] | None:
    """Split `bigbee-1110-L5` → ("bigbee", "1110", 5).

    Also handles `player-nude-base-L2` → ("player", "nude-base", 2)
    by treating the trailing `-L<int>` suffix as the layer index and
    the first hyphen-segment as the family.
    """
    match = _LAYER_KEY_RE.match(row_key)
    if not match:
        return None
    head = match.group("family")
    idx = int(match.group("idx"))
    parts = head.split("-", 1)
    family = parts[0]
    ahsw = parts[1] if len(parts) == 2 else ""
    return family, ahsw, idx


def build_layer_regions_index(final_json_path: Path) -> dict:
    """Return `{family: {(ahsw, layer_idx): {region, components, status}}}`."""
    data = json.loads(final_json_path.read_text())
    index: dict[str, dict[tuple[str, int], dict]] = defaultdict(dict)

    for row_key, payload in data.items():
        parsed = parse_row_key(row_key)
        if parsed is None:
            continue
        family, ahsw, idx = parsed
        status = payload.get("status", "")
        if status not in ("accept", "partial", "ambig"):
            continue
        label = (payload.get("corrected_label") or "").strip()
        note = (payload.get("note") or "").strip()
        decision = canonicalize(label, note)
        index[family][(ahsw, idx)] = {
            "region": decision.region,
            "components": list(decision.components),
            "status": status,
            "raw_label": label,
            "raw_note": note,
        }
    return dict(index)


def load_layer_region(
    layer_index: dict,
    family: str,
    ahsw: str,
    layer_idx: int,
) -> dict | None:
    """Lookup helper: ("bigbee", "1110", 5) → {region, components, status} or None."""
    fam_map = layer_index.get(family)
    if fam_map is None:
        return None
    return fam_map.get((ahsw, layer_idx))


# --------------------------------------------------------------------------- #
# Per-region glyph frequency extractor (E3)
# --------------------------------------------------------------------------- #

# When running the matcher against a raw layer PNG, cell sizes vary per family.
# These defaults match the per-layer PNG render scale (6 px per CP437 cell, as
# used everywhere else in the pipeline).
DEFAULT_MATCH_CELL_PX = 6


def _layer_png_path(png_root: Path, family: str, ahsw: str, idx: int) -> Path:
    """Per-layer PNG path: {png_root}/{family}-{ahsw}_L{idx}.png.

    Note: PNG files use `_L` separator; FINAL JSON keys use `-L`.
    """
    if ahsw:
        return png_root / f"{family}-{ahsw}_L{idx}.png"
    return png_root / f"{family}_L{idx}.png"


# Glyphs to drop from per-region aggregation. They contribute no
# role-discriminating signal:
#   0   — transparent placeholder
#   32  — space (no ink)
#   219 — █ full block; the matcher's _is_solid_cell shortcut maps any
#         uniform-color cell to 219, so it dominates every layer's count
#         by 10–100×. The semantic_bias path is meant to nudge the LONG
#         TAIL of distinguishing glyphs (47 / for crossbow, 212 for shield
#         decorations, etc.), not the matcher's default catch-all.
_NON_DISCRIMINATIVE_GLYPHS: frozenset[int] = frozenset({0, 32, 219})


def extract_layer_glyphs(
    layer_png: Path,
    config: GlyphAssignmentConfig,
) -> Counter:
    """Run the matcher on the layer PNG with no bias; count glyphs per cell.

    Skips transparent (0), space (32), and full-block (219) cells — they are
    the matcher's catch-alls and contribute no role-discriminating signal.
    """
    if not layer_png.exists():
        return Counter()
    image = Image.open(layer_png)
    cells = assign_image_cells(image, config)
    glyphs: Counter = Counter()
    for cell in cells:
        g = cell.chosen.glyph
        if g in _NON_DISCRIMINATIVE_GLYPHS:
            continue
        glyphs[g] += 1
    return glyphs


def extract_glyph_frequencies(
    layer_index: dict,
    png_root: Path,
    config: GlyphAssignmentConfig,
    *,
    include_composite_constituents: bool = True,
    partial_weight: float = 0.5,
) -> dict:
    """For every layer with a canonical region, run the matcher and aggregate.

    Returns:
        {family: {region: {glyph_int: weighted_count}}}

    Composite layers (region == "composite" with multiple components) are
    counted toward each constituent region when include_composite_constituents
    is True.
    """
    by_family_region: dict[str, dict[str, Counter]] = defaultdict(
        lambda: defaultdict(Counter)
    )

    for family, fam_map in layer_index.items():
        for (ahsw, idx), entry in fam_map.items():
            region = entry["region"]
            status = entry["status"]
            png_path = _layer_png_path(png_root, family, ahsw, idx)
            glyphs = extract_layer_glyphs(png_path, config)
            if not glyphs:
                continue
            multiplier = 1.0 if status == "accept" else partial_weight
            target_regions: list[str]
            if region == "composite" and include_composite_constituents:
                target_regions = entry.get("components", []) or ["composite"]
            else:
                target_regions = [region]
            for tgt in target_regions:
                if tgt == "unknown":
                    continue
                for g, c in glyphs.items():
                    by_family_region[family][tgt][g] += c * multiplier

    # Normalize Counter floats back to int-like sums and drop zero counts
    out: dict[str, dict[str, dict[int, float]]] = {}
    for family, regions in by_family_region.items():
        out[family] = {}
        for region, counter in regions.items():
            out[family][region] = {int(g): float(c) for g, c in counter.items() if c > 0}
    return out


# --------------------------------------------------------------------------- #
# semantic_maps JSON emitter (E3 output)
# --------------------------------------------------------------------------- #


def emit_semantic_map(
    family: str,
    region_glyph_counts: dict[str, dict[int, float]],
    *,
    weight_floor: float = 0.15,
) -> dict:
    """Build the `{role}-roles.json` payload accepted by _collect_hints_from_json.

    The schema:
        {
          "frames": {
            "0": {
              "regions": [
                {"name": <region>, "semantic_cells": [{"glyph": int}, ...]}
              ]
            }
          }
        }

    For each region, normalize counts to [0, 1] and keep only glyphs whose
    normalized weight >= weight_floor.
    """
    regions_out = []
    for region, counts in region_glyph_counts.items():
        if not counts:
            continue
        max_c = max(counts.values())
        if max_c == 0:
            continue
        kept = sorted(
            ((g, c / max_c) for g, c in counts.items()),
            key=lambda pair: -pair[1],
        )
        semantic_cells = [
            {"glyph": int(g), "weight": round(w, 3)}
            for g, w in kept
            if w >= weight_floor
        ]
        if not semantic_cells:
            continue
        regions_out.append({"name": region, "semantic_cells": semantic_cells})

    return {
        "family": family,
        "frame_w": 0,  # unused for glyph-only hints (no spatial bbox)
        "frame_h": 0,
        "frames": {"0": {"angle": 0, "anim_index": 0, "regions": regions_out}},
    }


def write_semantic_maps(
    glyph_freqs: dict,
    output_dir: Path,
    *,
    weight_floor: float = 0.15,
) -> list[Path]:
    """Write one {family}-roles.json file per family. Return list of paths."""
    output_dir.mkdir(parents=True, exist_ok=True)
    paths: list[Path] = []
    for family, region_map in glyph_freqs.items():
        payload = emit_semantic_map(family, region_map, weight_floor=weight_floor)
        out_path = output_dir / f"{family}-roles.json"
        out_path.write_text(json.dumps(payload, indent=2) + "\n")
        paths.append(out_path)
    return paths


__all__ = [
    "CANONICAL_REGIONS",
    "CanonicalDecision",
    "canonicalize",
    "build_canonical_vocabulary",
    "parse_row_key",
    "build_layer_regions_index",
    "load_layer_region",
    "extract_layer_glyphs",
    "extract_glyph_frequencies",
    "emit_semantic_map",
    "write_semantic_maps",
]
