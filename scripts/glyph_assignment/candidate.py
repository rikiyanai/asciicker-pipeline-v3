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
    # FL-4095: structure-based ASCII pipeline (edge-first hybrid).
    # When edge_aware is True, assign_image_cells runs a Sobel/DoG pre-pass.
    # Cells classified as strokes (gradient magnitude > edge_magnitude_threshold)
    # bypass the per-cell IoU scoring and receive an orientation-mapped CP437
    # stroke glyph directly. Non-stroke cells fall through to the standard
    # tone-based matcher + semantic_bias path.
    edge_aware: bool = False
    edge_magnitude_threshold: float = 80.0
    edge_use_dog: bool = True
    edge_dog_sigma_narrow: float = 0.8
    edge_dog_sigma_wide: float = 2.0
    edge_grid_shift_search_px: int = 2  # 0 disables CUHK iterative alignment
    # FL-4100: alpha-channel edge detection. When True, compute_edge_map runs
    # Sobel/DoG on the source ALPHA channel instead of RGB luminance. Body
    # interior alpha is uniform 255, background alpha is 0; only the
    # silhouette boundary has an alpha gradient. Used with silhouette_only
    # this produces true outline-only output with no body shading.
    edge_use_alpha_channel: bool = False
    # FL-4097: structure-based ASCII iteration 2 — SSIM, multi-scale, skeleton.
    # When ssim_for_strokes is True, stroke cells pick their glyph by SSIM
    # against the source pixels (instead of orientation→glyph hardcode).
    # When ssim_candidate_filter_by_orientation is True, SSIM only scores
    # glyphs in the orientation family chosen by Sobel — keeps SSIM cheap
    # without losing curve/joint glyphs entirely.
    ssim_for_strokes: bool = False
    ssim_candidate_filter_by_orientation: bool = False
    ssim_score_floor: float = 0.0  # below this, fall back to orientation map
    # Multi-scale edge detection — run compute_edge_map at the base cell
    # size AND at half-size, pick stroke per cell from whichever resolution
    # has more chain pixels.
    multi_scale_edges: bool = False
    multi_scale_factor: int = 2  # secondary scale = cell_size // factor
    # Vector-first skeleton + polyline (FL-4097 component 3). When True, the
    # source silhouette is skeletonized, polylines are traced through the
    # 1-px skeleton, and per-cell orientation is overridden by the dominant
    # polyline's local tangent — guaranteed coherent across adjacent cells
    # on the same chain. Cells on a polyline that were NOT classified as
    # strokes by the Sobel pass get promoted to stroke.
    use_skeleton_polyline: bool = False
    skeleton_dp_epsilon: float = 1.5
    # FL-4099 stick-figure modes (composable). Defaults preserve FL-4098.
    #   anti_fill_in_body: penalize fill glyphs in body.*/armor.* regions
    #     (mild — body cells get thinner/striped glyphs)
    #   polyline_primary: cells on a polyline get tangent glyph as FINAL
    #     decision; SSIM is bypassed for those cells (surgical)
    #   silhouette_only: non-stroke / non-polyline cells emit empty glyph;
    #     true line-art output, body interior is background (most extreme)
    # Precedence: silhouette_only > polyline_primary > anti_fill_in_body.
    anti_fill_in_body: bool = False
    polyline_primary: bool = False
    silhouette_only: bool = False


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
