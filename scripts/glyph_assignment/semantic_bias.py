from __future__ import annotations

import warnings
from pathlib import Path

from .candidate import GlyphCandidate


def apply_semantic_bias(
    candidates: list[GlyphCandidate],
    region: str | None,
    semantic_bias: dict[str, dict[int, float]],
    score_delta_threshold: float,
) -> list[GlyphCandidate]:
    if not candidates or not region or region not in semantic_bias:
        return candidates
    top_score = candidates[0].score
    weights = semantic_bias[region]
    if not weights:
        return candidates
    max_weight = max(abs(value) for value in weights.values()) or 1.0
    adjusted: list[GlyphCandidate] = []
    for candidate in candidates:
        close = top_score - candidate.score <= score_delta_threshold
        weight = weights.get(candidate.glyph, 0.0) / max_weight
        if not close or weight == 0:
            adjusted.append(candidate)
            continue
        bonus = score_delta_threshold * weight
        components = dict(candidate.components)
        components["semantic_bias"] = bonus
        reasons = [*candidate.reasons, f"semantic bias for {region}"]
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


def load_optional_semantic_bias(map_root: Path) -> dict[str, dict[int, float]]:
    if not map_root.exists():
        warnings.warn(
            f"semantic map path is unavailable; glyph matching continues unbiased: {map_root}",
            RuntimeWarning,
            stacklevel=2,
        )
        return {}
    if map_root.is_symlink() and not map_root.resolve().exists():
        warnings.warn(
            f"semantic map symlink is broken; glyph matching continues unbiased: {map_root}",
            RuntimeWarning,
            stacklevel=2,
        )
        return {}
    return {}
