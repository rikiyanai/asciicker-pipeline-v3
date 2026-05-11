from __future__ import annotations

from dataclasses import dataclass, field
from pathlib import Path


Color = tuple[int, int, int]


@dataclass(frozen=True)
class GlyphAssignmentConfig:
    font_path: Path
    font_cell_size: tuple[int, int]
    target_cell_size: tuple[int, int]
    charset: str = "cp437"
    supersample: int = 3
    candidate_limit: int = 5
    score_delta_threshold: float = 0.10
    solid_bg_threshold: float = 0.95
    solid_feature_max_ratio: float = 0.02
    semantic_bias: dict[str, dict[int, float]] = field(default_factory=dict)
    color_delta_threshold: int = 18


@dataclass(frozen=True)
class GlyphCandidate:
    glyph: int
    fg: Color
    bg: Color
    score: float
    components: dict[str, float]
    reasons: list[str]


@dataclass(frozen=True)
class AssignedCell:
    x: int
    y: int
    region: str | None
    chosen: GlyphCandidate
    alternatives: tuple[GlyphCandidate, ...]
    confidence: float
    needs_review: bool
