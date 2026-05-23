"""SSIM-based glyph picker (FL-4097 component 1).

For a given source tile + fg/bg, render every available CP437 glyph as a
virtual cell tile and compute the Structural Similarity Index against the
source. Pick the glyph whose rendered tile maximizes SSIM.

This replaces the orientation→glyph hardcoded table (FL-4095) for stroke
cells. The matcher naturally chooses:
  - straight strokes (/, |, \\, _) on linear edges
  - curve glyphs ( ), <, >, (, ) on curved edges (knight helmet plume,
    sword guard, shoulder roundness)
  - terminator glyphs (., ', :, *) on stroke endpoints
  - dense glyphs (▓, ▒) on shaded fills it identified as edges

without anyone having to hand-tune an orientation lookup.

References:
  Wang, Bovik, Sheikh, Simoncelli (2004) — "Image Quality Assessment:
    From Error Visibility to Structural Similarity"
    https://www.cns.nyu.edu/pub/eero/wang03-reprint.pdf
  2025 ML evaluation (Random Forest + SSIM matches CNN):
    https://arxiv.org/html/2503.14375v1
"""
from __future__ import annotations

import numpy as np

from .font_atlas import GlyphMask

# Cache for rendered-glyph luminance tiles (keyed by cell size). Rendering
# every CP437 glyph for every (fg, bg) pair would be expensive; we cache
# the BINARY glyph masks at cell size and rebuild the luminance tile
# on-demand from fg/bg luminance for each call.
_MASK_CACHE: dict[tuple[int, int], list[tuple[int, np.ndarray]]] = {}


def _luminance_one(rgb: tuple[int, int, int]) -> float:
    return 0.299 * rgb[0] + 0.587 * rgb[1] + 0.114 * rgb[2]


def _ssim_pair(a: np.ndarray, b: np.ndarray) -> float:
    """Single-value SSIM for two same-shape float32 arrays in [0, 1].

    Uses the standard Wang et al. constants C1=(0.01)^2, C2=(0.03)^2 with
    L=1 (normalized image range). Computes global SSIM (no spatial window
    averaging) — appropriate because we're scoring small cell-sized tiles
    where the whole cell IS the local patch.
    """
    a = a.astype(np.float32)
    b = b.astype(np.float32)
    mu_a = float(a.mean())
    mu_b = float(b.mean())
    var_a = float(a.var())
    var_b = float(b.var())
    cov_ab = float(((a - mu_a) * (b - mu_b)).mean())
    c1 = 0.01 * 0.01
    c2 = 0.03 * 0.03
    num = (2 * mu_a * mu_b + c1) * (2 * cov_ab + c2)
    den = (mu_a * mu_a + mu_b * mu_b + c1) * (var_a + var_b + c2)
    if den < 1e-12:
        return 0.0
    return float(num / den)


def cache_masks(masks: list[GlyphMask]) -> None:
    """Pre-populate the mask cache for a given cell size."""
    if not masks:
        return
    key = (masks[0].mask.shape[1], masks[0].mask.shape[0])
    _MASK_CACHE[key] = [(m.glyph, m.mask.astype(np.float32)) for m in masks]


def best_glyph_by_ssim(
    source_tile_rgb: np.ndarray,
    fg: tuple[int, int, int],
    bg: tuple[int, int, int],
    masks: list[GlyphMask],
    *,
    candidate_glyphs: list[int] | None = None,
) -> tuple[int, float]:
    """Pick the glyph whose rendered tile has highest SSIM with the source.

    Args:
        source_tile_rgb: source pixels as H×W×3 uint8 (RGB).
        fg, bg: foreground / background colors to render each candidate with.
            The cell's tone-derived fg/bg are passed here.
        masks: full glyph mask set for this cell size.
        candidate_glyphs: when provided, only score these glyph codes. None
            scores all 256. Use to restrict to e.g. orientation-family glyphs
            after a Sobel pass.

    Returns:
        (glyph_code, ssim_score). glyph_code 0 means no positive match.
    """
    if source_tile_rgb.size == 0:
        return 0, 0.0
    # Source luminance, normalized to [0, 1]
    src_lum = (
        0.299 * source_tile_rgb[:, :, 0]
        + 0.587 * source_tile_rgb[:, :, 1]
        + 0.114 * source_tile_rgb[:, :, 2]
    ).astype(np.float32) / 255.0
    fg_lum = _luminance_one(fg) / 255.0
    bg_lum = _luminance_one(bg) / 255.0

    best_glyph = 0
    best_score = -1.0
    glyph_filter = set(candidate_glyphs) if candidate_glyphs is not None else None

    for mask_item in masks:
        if glyph_filter is not None and mask_item.glyph not in glyph_filter:
            continue
        mask = mask_item.mask.astype(np.float32)
        # Rendered luminance tile: fg where mask=True, bg elsewhere
        rendered = mask * fg_lum + (1.0 - mask) * bg_lum
        # Resize source_lum to mask shape if needed
        if src_lum.shape != rendered.shape:
            # Nearest-neighbor downsample/upsample via slicing
            from PIL import Image
            src_img = Image.fromarray((src_lum * 255).astype(np.uint8), "L")
            src_img = src_img.resize(
                (rendered.shape[1], rendered.shape[0]),
                Image.Resampling.NEAREST,
            )
            src_resampled = np.array(src_img, dtype=np.float32) / 255.0
        else:
            src_resampled = src_lum
        score = _ssim_pair(src_resampled, rendered)
        if score > best_score:
            best_score = score
            best_glyph = mask_item.glyph

    return best_glyph, best_score


__all__ = ["best_glyph_by_ssim", "cache_masks"]
