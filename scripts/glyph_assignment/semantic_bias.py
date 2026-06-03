from __future__ import annotations

import json
import warnings
from pathlib import Path

from .candidate import GlyphCandidate

# ------------------------------------------------------------------
# Built-in preference tables — per-role, per-region, {glyph: weight}
#
# Positive weight = prefer, negative weight = penalize.
# These are the floor; semantic map JSON data adds augmentation on top.
# Weights are normalized by max_abs per region inside apply_semantic_bias,
# so absolute values matter only relative to other weights in the same region.
#
# CP437 glyph groups used below:
#   _HB  – half-blocks: ▄(220) ▌(221) ▐(222) ▀(223)
#   _SH  – shade glyphs: ░(176) ▒(177) ▓(178)
#   _SK  – stroke glyphs: /(47) \(92) │(179) ─(196)
# ------------------------------------------------------------------

_HB: dict[int, float] = {220: 0.6, 221: 0.6, 222: 0.6, 223: 0.6}
_SH: dict[int, float] = {176: 0.3, 177: 0.4, 178: 0.5}
_SK: dict[int, float] = {47: 0.5, 92: 0.5, 179: 0.3, 196: 0.3}

# Canonical region keys produced by final_json_ingest.canonicalize().
# Listed here as empty entries so apply_semantic_bias finds the region key
# even before semantic_maps/ JSONs are loaded — the JSON-derived weights from
# load_optional_semantic_bias() merge into these via _merge_hints().
_CANONICAL_REGION_KEYS: tuple[str, ...] = (
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
)


def _seed_canonical_regions() -> dict[str, dict[int, float]]:
    """Return canonical region keys with empty weight dicts.

    The empty entries make `apply_semantic_bias` find the region by name even
    before semantic_maps/{role}-*.json files populate the actual weights.
    """
    return {region: {} for region in _CANONICAL_REGION_KEYS}


BUILT_IN_ROLE_TABLES: dict[str, dict[str, dict[int, float]]] = {
    "player": {
        "hair":         {**_HB},
        "face":         {34: 0.8, 118: 0.8, 223: 0.5, 46: 0.4, 111: 0.4, **_HB},
        "shirt":        {**_HB, **_SH},
        "pants":        {**_HB, **_SH},
        "boots":        {**_HB, 178: 0.6},
        "arms":         {**_HB},
        "subcell_fill": {**_HB},
        **_seed_canonical_regions(),
    },
    "attack": {
        "weapon":       {47: 0.9, 92: 0.9, **_HB, **_SK, **_SH},
        "face":         {34: 0.8, 118: 0.8, **_HB},
        "shirt":        {**_HB, **_SH},
        "pants":        {**_HB, **_SH},
        "boots":        {**_HB, 178: 0.6},
        "arms":         {**_HB, **_SK},
        "subcell_fill": {**_HB},
        **_seed_canonical_regions(),
    },
    "plydie": {
        "body":  {219: 0.7, **_HB, **_SH},
        "arms":  {**_HB, **_SH},
        "shirt": {**_HB, **_SH},
        "pants": {**_HB, **_SH},
        "boots": {**_HB, 178: 0.6},
        **_seed_canonical_regions(),
    },
    "wolfie": _seed_canonical_regions(),
    "bigbee": _seed_canonical_regions(),
    "wolack": _seed_canonical_regions(),
}


def _collect_hints_from_json(path: Path) -> dict[str, set[int]]:
    """Parse one semantic map JSON; return {region_name: {glyph_int, ...}}."""
    try:
        data = json.loads(path.read_text())
    except (json.JSONDecodeError, OSError) as exc:
        warnings.warn(
            f"could not parse semantic map {path.name}: {exc}; file skipped",
            RuntimeWarning,
            stacklevel=5,
        )
        return {}
    hints: dict[str, set[int]] = {}
    for frame in data.get("frames", {}).values():
        for region in frame.get("regions", []):
            name: str = region.get("name", "")
            if not name:
                continue
            for sc in region.get("semantic_cells", []):
                glyph = sc.get("glyph")
                if isinstance(glyph, int):
                    hints.setdefault(name, set()).add(glyph)
    return hints


def _merge_hints(
    base: dict[str, dict[int, float]],
    hints: dict[str, set[int]],
) -> dict[str, dict[int, float]]:
    """Return a new dict that merges JSON glyph hints into *base* tables.

    For glyphs already in *base*, the existing weight is kept if it is already
    >= 0.5; otherwise it is raised to 0.5.  New regions from *hints* that have
    no entry in *base* are added with weight 0.5 for each hinted glyph.
    """
    result: dict[str, dict[int, float]] = {r: dict(w) for r, w in base.items()}
    for region, glyphs in hints.items():
        if region not in result:
            result[region] = {}
        for glyph in glyphs:
            result[region][glyph] = max(result[region].get(glyph, 0.0), 0.5)
    return result


# FL-4099 (1): fill-family glyphs that get penalized when anti_fill_in_body
# fires in body.*/armor.* regions. The penalty is structural — these glyphs
# carry no contour information, only tone, so a stick-figure rendering
# explicitly does NOT want them.
_ANTI_FILL_GLYPHS: frozenset[int] = frozenset({
    219,  # █ full block
    178,  # ▓ heavy shade
    177,  # ▒ medium shade
    176,  # ░ light shade
    220,  # ▄ lower half block
    221,  # ▌ left half block
    222,  # ▐ right half block
    223,  # ▀ upper half block
})


def _is_body_region(region: str | None) -> bool:
    return bool(region) and (region.startswith("body.") or region.startswith("armor."))


def apply_semantic_bias(
    candidates: list[GlyphCandidate],
    region: str | None,
    semantic_bias: dict[str, dict[int, float]],
    score_delta_threshold: float,
    *,
    anti_fill_in_body: bool = False,
) -> list[GlyphCandidate]:
    # FL-4099 (1) anti-fill penalty: even if no positive-bias entry exists
    # for the region, body cells should rerank fill glyphs DOWN.
    apply_anti_fill = anti_fill_in_body and _is_body_region(region)
    if not apply_anti_fill and (
        not candidates or not region or region not in semantic_bias
    ):
        return candidates
    top_score = candidates[0].score if candidates else 0.0
    weights = semantic_bias.get(region, {}) if region else {}
    if not weights and not apply_anti_fill:
        return candidates
    max_weight = max((abs(v) for v in weights.values()), default=1.0) or 1.0
    adjusted: list[GlyphCandidate] = []
    for candidate in candidates:
        close = top_score - candidate.score <= score_delta_threshold
        weight = weights.get(candidate.glyph, 0.0) / max_weight if weights else 0.0
        # FL-4099 (1): anti-fill penalty composes with the normal bias.
        anti_fill_penalty = 0.0
        if apply_anti_fill and candidate.glyph in _ANTI_FILL_GLYPHS:
            anti_fill_penalty = -score_delta_threshold * 1.5
        if (not close or weight == 0) and anti_fill_penalty == 0.0:
            adjusted.append(candidate)
            continue
        bonus = score_delta_threshold * weight + anti_fill_penalty
        components = dict(candidate.components)
        components["semantic_bias"] = bonus
        reasons = [*candidate.reasons]
        if weight != 0:
            reasons.append(f"semantic bias for {region}")
        if anti_fill_penalty != 0:
            reasons.append(f"FL-4099 (1) anti-fill penalty in {region}")
        adjusted.append(
            GlyphCandidate(
                candidate.glyph,
                candidate.fg,
                candidate.bg,
                candidate.score + bonus,
                components,
                reasons,
            )
        )
    return sorted(adjusted, key=lambda item: (-item.score, item.glyph))


def load_optional_semantic_bias(
    map_root: Path,
    role: str | None = None,
) -> dict[str, dict[int, float]]:
    """Return ``{region: {glyph: weight}}`` bias tables for *role*.

    Built-in preference tables for the role serve as a floor and are always
    returned.  JSON files matching ``{role}-*.json`` in *map_root* augment
    the tables with glyph hints extracted from ``semantic_cells`` entries.

    *role* should be one of ``"player"``, ``"attack"``, ``"plydie"``.
    An unknown role returns ``{}`` with no warning.
    When *role* is ``None``, merged tables for all known roles are returned
    (backward-compatible with callers that do not pass a role).

    If *map_root* does not exist or is a broken symlink, a ``RuntimeWarning``
    is emitted and the built-in tables are returned without JSON augmentation.
    """
    # Unknown role: no built-in tables and no JSON to load
    if role is not None and role not in BUILT_IN_ROLE_TABLES:
        return {}

    # Build base tables from the role (or merge all roles when role is None)
    if role is None:
        base: dict[str, dict[int, float]] = {}
        for role_tables in BUILT_IN_ROLE_TABLES.values():
            for region, weights in role_tables.items():
                if region not in base:
                    base[region] = {}
                for glyph, weight in weights.items():
                    base[region][glyph] = max(base[region].get(glyph, 0.0), weight)
    else:
        base = {r: dict(w) for r, w in BUILT_IN_ROLE_TABLES[role].items()}

    # Check map_root availability; warn and return built-in tables if absent
    if not map_root.exists():
        warnings.warn(
            f"semantic map path is unavailable; JSON hints disabled: {map_root}",
            RuntimeWarning,
            stacklevel=2,
        )
        return base
    if map_root.is_symlink() and not map_root.resolve().exists():
        warnings.warn(
            f"semantic map symlink is broken; JSON hints disabled: {map_root}",
            RuntimeWarning,
            stacklevel=2,
        )
        return base

    # Glob and parse matching JSON files, accumulate glyph hints
    pattern = f"{role}-*.json" if role is not None else "*.json"
    accumulated_hints: dict[str, set[int]] = {}
    for json_path in sorted(map_root.glob(pattern)):
        for region, glyphs in _collect_hints_from_json(json_path).items():
            accumulated_hints.setdefault(region, set()).update(glyphs)

    return _merge_hints(base, accumulated_hints)
