"""Edge detection + DoG preprocessing for structure-based ASCII conversion.

Implements the front half of the FL-4095 ADR: turn the source image into a
per-cell stroke map BEFORE per-cell IoU matching. Cells flagged as strokes
receive an orientation-derived CP437 glyph directly; non-stroke cells go
through the existing tone-based matcher.

Pipeline:
    source PNG
      → DoG (difference of Gaussians)      — strip pixel noise
      → Sobel (gx, gy)                     — gradient per pixel
      → magnitude, orientation maps        — per-pixel
      → per-cell aggregation               — dominant orientation, edge density
      → stroke cells                       — magnitude > threshold

The stroke map is an array of CellEdgeInfo, one per (cx, cy), telling the
matcher: is_stroke (bool), orientation (radians or None), magnitude (float),
suggested_glyph (CP437 int) for orientation-mapped strokes.

References:
    Acerola pipeline:        Sobel + DoG, atan2 → / | \\ _ mapping
    CUHK Wong et al.:        iterative grid alignment, structure-based ASCII
    arXiv 2503.14375 (2025): structure vs tone dichotomy, SSIM-graded matchers
"""
from __future__ import annotations

import math
from dataclasses import dataclass
from typing import Sequence

import numpy as np
from PIL import Image


# --------------------------------------------------------------------------- #
# Public dataclasses
# --------------------------------------------------------------------------- #


@dataclass(frozen=True)
class CellEdgeInfo:
    """Edge information for one cell in the assignment grid."""

    cx: int
    cy: int
    is_stroke: bool
    magnitude: float
    orientation_rad: float | None  # None for non-stroke cells
    suggested_glyph: int  # 0 if no stroke; CP437 int otherwise
    suggested_fg: tuple[int, int, int]
    suggested_bg: tuple[int, int, int]


@dataclass(frozen=True)
class EdgeMap:
    """Whole-image stroke map plus the gradient arrays it was derived from."""

    cells: list[CellEdgeInfo]
    cell_w: int
    cell_h: int
    grid_w: int  # cells across
    grid_h: int  # cells down
    magnitude: np.ndarray  # per-pixel magnitude (float32)
    orientation: np.ndarray  # per-pixel orientation in radians (float32)
    dog: np.ndarray | None  # per-pixel DoG response (or None if disabled)


# --------------------------------------------------------------------------- #
# DoG preprocessing
# --------------------------------------------------------------------------- #


def _gaussian_blur(image: np.ndarray, sigma: float) -> np.ndarray:
    """Cheap separable Gaussian blur using a 5-tap kernel scaled by sigma.

    Avoids the scipy dependency and is fast enough for ≤2k×2k sprite sheets.
    For sigma > 2.0 the 5-tap kernel undersamples; that's acceptable here
    since we use sigma in [0.7, 2.2].
    """
    radius = max(1, int(math.ceil(2 * sigma)))
    size = 2 * radius + 1
    coords = np.arange(-radius, radius + 1, dtype=np.float32)
    kernel = np.exp(-(coords**2) / (2 * sigma * sigma))
    kernel /= kernel.sum()
    # Separable: blur each axis once.
    padded = np.pad(image, ((0, 0), (radius, radius)), mode="edge")
    blurred_x = np.zeros_like(image, dtype=np.float32)
    for i, k in enumerate(kernel):
        blurred_x += k * padded[:, i : i + image.shape[1]]
    padded = np.pad(blurred_x, ((radius, radius), (0, 0)), mode="edge")
    blurred_xy = np.zeros_like(image, dtype=np.float32)
    for i, k in enumerate(kernel):
        blurred_xy += k * padded[i : i + image.shape[0], :]
    return blurred_xy


def difference_of_gaussians(
    luminance: np.ndarray,
    sigma_narrow: float = 0.8,
    sigma_wide: float = 2.0,
) -> np.ndarray:
    """Compute DoG = blur(σ_narrow) − blur(σ_wide).

    Output is a signed float32 array. Strong positive values are bright-on-dark
    edges; strong negative are dark-on-bright. Both ends are real edges.
    """
    narrow = _gaussian_blur(luminance, sigma_narrow)
    wide = _gaussian_blur(luminance, sigma_wide)
    return narrow - wide


# --------------------------------------------------------------------------- #
# Sobel gradient
# --------------------------------------------------------------------------- #


_SOBEL_X = np.array([[-1, 0, 1], [-2, 0, 2], [-1, 0, 1]], dtype=np.float32)
_SOBEL_Y = np.array([[-1, -2, -1], [0, 0, 0], [1, 2, 1]], dtype=np.float32)


def _convolve3x3(image: np.ndarray, kernel: np.ndarray) -> np.ndarray:
    """Vectorized 3×3 convolution. image is float32 H×W."""
    padded = np.pad(image, 1, mode="edge")
    out = np.zeros_like(image, dtype=np.float32)
    for dy in range(3):
        for dx in range(3):
            out += kernel[dy, dx] * padded[dy : dy + image.shape[0], dx : dx + image.shape[1]]
    return out


def sobel_gradient(luminance: np.ndarray) -> tuple[np.ndarray, np.ndarray]:
    """Return (gx, gy) per-pixel gradient arrays."""
    gx = _convolve3x3(luminance, _SOBEL_X)
    gy = _convolve3x3(luminance, _SOBEL_Y)
    return gx, gy


# --------------------------------------------------------------------------- #
# Canny stages 3-5: NMS + double threshold + hysteresis (FL-4096 B)
# --------------------------------------------------------------------------- #


def non_maximum_suppression(
    magnitude: np.ndarray, orientation: np.ndarray
) -> np.ndarray:
    """Thin each edge to 1-pixel wide along the gradient direction.

    For each pixel, compare magnitude against the two neighbors along the
    gradient direction (quantized to one of 4 cardinal/diagonal pairs). If
    the pixel is not a local maximum, suppress it (set to 0).

    Returns a magnitude array with non-maxima zeroed out. Same shape as
    input.

    FL-4096 (B): this is the missing Canny stage that turns per-cell edge
    detection into edge-CHAIN extraction. Adjacent cells on the same actual
    contour see the same thin 1-px chain instead of independent fat gradients.
    """
    h, w = magnitude.shape
    # Quantize orientation to [0, 180) in degrees, then to 4 buckets:
    #   0 = horizontal gradient → vertical edge, check left/right neighbors
    #   1 = 45° gradient        → diag / edge,   check ↗ and ↙ neighbors
    #   2 = vertical gradient   → horizontal edge, check up/down neighbors
    #   3 = 135° gradient       → diag \ edge,   check ↖ and ↘ neighbors
    angle_deg = np.degrees(orientation)
    angle_deg = (angle_deg + 180.0) % 180.0
    direction = np.zeros((h, w), dtype=np.int8)
    direction[(angle_deg >= 22.5) & (angle_deg < 67.5)] = 1
    direction[(angle_deg >= 67.5) & (angle_deg < 112.5)] = 2
    direction[(angle_deg >= 112.5) & (angle_deg < 157.5)] = 3

    # Per-direction neighbor magnitudes via np.roll.
    # Roll convention: positive shift moves values in positive direction.
    out = np.zeros_like(magnitude)

    # direction 0: compare to left (x-1) and right (x+1)
    left = np.roll(magnitude, 1, axis=1)
    right = np.roll(magnitude, -1, axis=1)
    mask0 = direction == 0
    cond0 = (magnitude >= left) & (magnitude >= right)
    out[mask0 & cond0] = magnitude[mask0 & cond0]

    # direction 1: compare to (y-1, x+1) and (y+1, x-1) — diagonal ↗ ↙
    ne = np.roll(np.roll(magnitude, 1, axis=0), -1, axis=1)
    sw = np.roll(np.roll(magnitude, -1, axis=0), 1, axis=1)
    mask1 = direction == 1
    cond1 = (magnitude >= ne) & (magnitude >= sw)
    out[mask1 & cond1] = magnitude[mask1 & cond1]

    # direction 2: compare to up (y-1) and down (y+1)
    up = np.roll(magnitude, 1, axis=0)
    down = np.roll(magnitude, -1, axis=0)
    mask2 = direction == 2
    cond2 = (magnitude >= up) & (magnitude >= down)
    out[mask2 & cond2] = magnitude[mask2 & cond2]

    # direction 3: compare to (y-1, x-1) and (y+1, x+1) — diagonal ↖ ↘
    nw = np.roll(np.roll(magnitude, 1, axis=0), 1, axis=1)
    se = np.roll(np.roll(magnitude, -1, axis=0), -1, axis=1)
    mask3 = direction == 3
    cond3 = (magnitude >= nw) & (magnitude >= se)
    out[mask3 & cond3] = magnitude[mask3 & cond3]

    # Zero the border (rolls wrap around and produce garbage there)
    out[0, :] = 0
    out[-1, :] = 0
    out[:, 0] = 0
    out[:, -1] = 0

    return out


def hysteresis_threshold(
    nms: np.ndarray, low: float, high: float, *, max_iter: int = 64
) -> np.ndarray:
    """Double-threshold + hysteresis tracking.

    Pixels above ``high`` are strong (always kept). Pixels in ``[low, high)``
    are weak. Weak pixels are kept only if connected (8-way) to a strong
    pixel, directly or transitively. Returns a bool array of surviving edge
    pixels.

    FL-4096 (B): this removes the isolated weak fragments that produce the
    "jumbled" appearance — only pixels on real chains survive.
    """
    strong = nms >= high
    weak = (nms >= low) & ~strong
    keep = strong.copy()

    for _ in range(max_iter):
        # 8-way dilation of keep, intersect with weak to find new survivors.
        dilated = (
            keep
            | np.roll(keep, 1, axis=0)
            | np.roll(keep, -1, axis=0)
            | np.roll(keep, 1, axis=1)
            | np.roll(keep, -1, axis=1)
            | np.roll(np.roll(keep, 1, axis=0), 1, axis=1)
            | np.roll(np.roll(keep, 1, axis=0), -1, axis=1)
            | np.roll(np.roll(keep, -1, axis=0), 1, axis=1)
            | np.roll(np.roll(keep, -1, axis=0), -1, axis=1)
        )
        new_keeps = weak & dilated & ~keep
        if not new_keeps.any():
            break
        keep |= new_keeps

    return keep


def _circular_mean(angles: np.ndarray) -> float:
    """Circular mean of a set of angles (in radians).

    Plain mean fails because π and -π are the same point; circular mean
    averages on the unit circle (sin/cos) instead. Used to aggregate
    per-pixel orientations within a single cell.
    """
    if angles.size == 0:
        return 0.0
    return float(math.atan2(float(np.sin(angles).mean()), float(np.cos(angles).mean())))


# --------------------------------------------------------------------------- #
# Orientation → CP437 glyph mapping
# --------------------------------------------------------------------------- #

# Eight-way orientation buckets. atan2(gy, gx) returns angle in (-π, π].
# We map the GRADIENT angle (perpendicular to the edge) to the stroke that
# best represents the EDGE — so a horizontal gradient (∂I/∂x large, gy≈0,
# angle ≈ 0 or π) corresponds to a VERTICAL edge → vertical bar `|`.
#
# Bucket layout (gradient angle from atan2(gy, gx)):
#
#                    π/2 (gy +, vertical gradient → horizontal edge → _)
#         3π/4 (\\)            π/4 (/)
#    ±π (|) — horizontal grad → vertical edge      0 (|)
#         -3π/4 (/)            -π/4 (\\)
#                   -π/2 (gy -, vertical gradient → horizontal edge → _)
#
# CP437 codes:
#   95  _  underscore  (horizontal edge)
#   124 |  pipe        (vertical edge)
#   47  /  forward-slash (positive-slope edge ↗)
#   92  \\ backslash    (negative-slope edge ↘)
#
# Curved-edge glyphs added at finer angles when gradient magnitude crosses
# the secondary 'curve' threshold (low priority; commented for now).

_ORIENTATION_GLYPHS: tuple[tuple[float, float, int], ...] = (
    # (angle_low_rad, angle_high_rad, cp437_glyph)
    # Vertical edges (horizontal gradient)
    (-math.pi / 8,         math.pi / 8,         124),  # |   gradient near 0
    (7 * math.pi / 8,      math.pi + 0.01,      124),  # |   gradient near π
    (-(math.pi + 0.01),   -7 * math.pi / 8,     124),  # |   gradient near -π
    # Diagonals
    ( math.pi / 8,         3 * math.pi / 8,     47),   # /   gradient at +π/4
    (-3 * math.pi / 8,    -math.pi / 8,         92),   # \   gradient at -π/4
    ( 5 * math.pi / 8,     7 * math.pi / 8,     92),   # \   gradient at +3π/4 (edge ↘)
    (-7 * math.pi / 8,    -5 * math.pi / 8,     47),   # /   gradient at -3π/4 (edge ↗)
    # Horizontal edges (vertical gradient)
    ( 3 * math.pi / 8,     5 * math.pi / 8,     95),   # _   gradient at +π/2
    (-5 * math.pi / 8,    -3 * math.pi / 8,     95),   # _   gradient at -π/2
)


def orientation_to_glyph(angle_rad: float) -> int:
    """Map a gradient angle in (-π, π] to a CP437 stroke glyph."""
    for lo, hi, glyph in _ORIENTATION_GLYPHS:
        if lo <= angle_rad < hi:
            return glyph
    # Fallback (should not hit if buckets cover -π..π)
    return 124  # vertical bar as default


# --------------------------------------------------------------------------- #
# Per-cell aggregation
# --------------------------------------------------------------------------- #


def _luminance_from_rgba(rgba: np.ndarray) -> np.ndarray:
    """ITU-R BT.601 luminance from RGBA. Transparent pixels contribute 0."""
    r = rgba[:, :, 0].astype(np.float32)
    g = rgba[:, :, 1].astype(np.float32)
    b = rgba[:, :, 2].astype(np.float32)
    alpha = rgba[:, :, 3].astype(np.float32) / 255.0
    return (0.299 * r + 0.587 * g + 0.114 * b) * alpha


def _dominant_visible_color(
    rgba: np.ndarray, x0: int, y0: int, cell_w: int, cell_h: int
) -> tuple[int, int, int]:
    """Mode RGB color among non-transparent pixels in the cell, fallback (0,0,0)."""
    tile = rgba[y0 : y0 + cell_h, x0 : x0 + cell_w]
    alpha = tile[:, :, 3]
    visible = tile[alpha > 0]
    if visible.size == 0:
        return (0, 0, 0)
    rgb = visible[:, :3]
    colors, counts = np.unique(rgb.reshape(-1, 3), axis=0, return_counts=True)
    return tuple(int(v) for v in colors[int(np.argmax(counts))])


def compute_edge_map(
    image: Image.Image,
    cell_size: tuple[int, int],
    *,
    magnitude_threshold: float = 80.0,
    use_dog: bool = True,
    dog_sigma_narrow: float = 0.8,
    dog_sigma_wide: float = 2.0,
    cell_alpha_fraction_required: float = 0.10,
    use_nms_hysteresis: bool = True,
    nms_low_ratio: float = 0.4,
    nms_high_ratio: float = 1.0,
    min_chain_pixels_per_cell: int = 2,
    use_alpha_channel: bool = False,
) -> EdgeMap:
    """Compute the per-cell stroke map for an image.

    FL-4096 (B): when ``use_nms_hysteresis`` is True (default), the pipeline
    runs the full Canny edge-chain extraction:

        DoG (optional) → Sobel → non-maximum suppression → double threshold
                       → hysteresis tracking → per-cell aggregation

    Per cell, the orientation is the CIRCULAR MEAN of surviving chain
    pixels' orientations (consistent across adjacent cells on the same
    chain), and a cell only fires as a stroke when it contains at least
    ``min_chain_pixels_per_cell`` surviving chain pixels — eliminating
    isolated single-pixel fragments that produced the "jumbled" output.

    Args:
        image: source image (RGBA preferred).
        cell_size: (width, height) of one cell in pixels.
        magnitude_threshold: per-pixel Sobel magnitude HIGH threshold (used
            as the strong-edge gate). Tuned for 6×6 cells with luminance in
            [0, 255]. Higher = fewer strokes.
        use_dog: when True, run DoG before Sobel to suppress flat-fill noise.
        dog_sigma_narrow / dog_sigma_wide: σ values for the DoG band-pass.
        cell_alpha_fraction_required: cells with fewer than this fraction of
            non-transparent pixels are never strokes.
        use_nms_hysteresis: enable Canny NMS + hysteresis chain extraction
            (FL-4096 B). When False, falls back to the FL-4095 v1 behavior
            of per-cell magnitude peak (kept for ablation testing only).
        nms_low_ratio / nms_high_ratio: hysteresis double-threshold values
            expressed as multipliers of ``magnitude_threshold``. low must be
            < high. Defaults: low = 0.4×threshold, high = 1.0×threshold.
        min_chain_pixels_per_cell: a cell must contain at least this many
            surviving chain pixels to fire as a stroke. Filters out cells
            grazed by long thin chains that happen to clip one pixel.

    Returns:
        EdgeMap with per-cell CellEdgeInfo plus the raw gradient maps for
        downstream tooling (e.g. grid-shift scoring).
    """
    rgba = np.array(image.convert("RGBA"))
    cell_w, cell_h = cell_size
    if cell_w <= 0 or cell_h <= 0:
        raise ValueError(f"cell_size must be positive, got {cell_size}")

    grid_w = rgba.shape[1] // cell_w
    grid_h = rgba.shape[0] // cell_h

    # FL-4100: alpha-channel mode uses the source alpha as the Sobel input.
    # Body interior alpha is uniform 255, background is 0; only the silhouette
    # boundary has gradient. Eliminates internal-body shading edges.
    if use_alpha_channel:
        sobel_source = rgba[:, :, 3].astype(np.float32)
    else:
        sobel_source = _luminance_from_rgba(rgba)

    if use_dog:
        dog = difference_of_gaussians(sobel_source, dog_sigma_narrow, dog_sigma_wide)
        sobel_input = np.abs(dog).astype(np.float32)
    else:
        dog = None
        sobel_input = sobel_source

    gx, gy = sobel_gradient(sobel_input)
    magnitude = np.sqrt(gx * gx + gy * gy)
    orientation = np.arctan2(gy, gx)

    if use_nms_hysteresis:
        # FL-4096 (B): full Canny chain extraction.
        nms_mag = non_maximum_suppression(magnitude, orientation)
        chain_mask = hysteresis_threshold(
            nms_mag,
            low=magnitude_threshold * nms_low_ratio,
            high=magnitude_threshold * nms_high_ratio,
        )
        # Surviving chain magnitude — zero outside the chain.
        chain_mag = np.where(chain_mask, nms_mag, 0.0)
    else:
        chain_mask = magnitude >= magnitude_threshold
        chain_mag = np.where(chain_mask, magnitude, 0.0)

    cells: list[CellEdgeInfo] = []
    for cy in range(grid_h):
        for cx in range(grid_w):
            x0 = cx * cell_w
            y0 = cy * cell_h
            tile_alpha = rgba[y0 : y0 + cell_h, x0 : x0 + cell_w, 3]
            alpha_frac = float((tile_alpha > 0).sum()) / max(1, cell_w * cell_h)
            tile_mask = chain_mask[y0 : y0 + cell_h, x0 : x0 + cell_w]
            survivors = int(tile_mask.sum())
            peak_mag = float(magnitude[y0 : y0 + cell_h, x0 : x0 + cell_w].max())

            is_stroke = (
                alpha_frac >= cell_alpha_fraction_required
                and survivors >= min_chain_pixels_per_cell
            )

            if is_stroke:
                # FL-4096 (B): orientation = circular mean of chain pixels
                # in this cell, not the peak gradient. Adjacent cells on
                # the same chain get coherent orientation.
                tile_ori = orientation[y0 : y0 + cell_h, x0 : x0 + cell_w][tile_mask]
                mean_ori = _circular_mean(tile_ori)
                tile_chain_mag = chain_mag[y0 : y0 + cell_h, x0 : x0 + cell_w]
                rep_mag = float(tile_chain_mag.max())
                glyph = orientation_to_glyph(mean_ori)
                fg = _dominant_visible_color(rgba, x0, y0, cell_w, cell_h)
                cells.append(
                    CellEdgeInfo(
                        cx=cx,
                        cy=cy,
                        is_stroke=True,
                        magnitude=rep_mag,
                        orientation_rad=mean_ori,
                        suggested_glyph=glyph,
                        suggested_fg=fg,
                        suggested_bg=(255, 0, 255),
                    )
                )
            else:
                cells.append(
                    CellEdgeInfo(
                        cx=cx,
                        cy=cy,
                        is_stroke=False,
                        magnitude=peak_mag,
                        orientation_rad=None,
                        suggested_glyph=0,
                        suggested_fg=(0, 0, 0),
                        suggested_bg=(255, 0, 255),
                    )
                )

    return EdgeMap(
        cells=cells,
        cell_w=cell_w,
        cell_h=cell_h,
        grid_w=grid_w,
        grid_h=grid_h,
        magnitude=magnitude,
        orientation=orientation,
        dog=dog,
    )


# --------------------------------------------------------------------------- #
# CUHK feature-aware grid shift
# --------------------------------------------------------------------------- #


def best_grid_offset(
    image: Image.Image,
    cell_size: tuple[int, int],
    *,
    search_radius_px: int = 2,
    magnitude_threshold: float = 80.0,
) -> tuple[int, int]:
    """Find the (dx, dy) sub-cell offset that aligns the source's edges best
    with the cell grid.

    Score = sum of per-cell peak gradient magnitudes when sampled with the
    grid shifted by (dx, dy). Higher = more edges land cleanly inside cells
    instead of straddling boundaries.

    Returns (dx, dy) in pixels, both in [-search_radius_px, +search_radius_px].
    """
    cell_w, cell_h = cell_size
    rgba = np.array(image.convert("RGBA"))
    luminance = _luminance_from_rgba(rgba)
    # Use plain luminance (skip DoG here — we want raw gradient peaks)
    gx, gy = sobel_gradient(luminance)
    magnitude = np.sqrt(gx * gx + gy * gy)

    best_score = -1.0
    best_off = (0, 0)
    for dy in range(-search_radius_px, search_radius_px + 1):
        for dx in range(-search_radius_px, search_radius_px + 1):
            score = 0.0
            grid_w = (rgba.shape[1] - max(0, dx)) // cell_w
            grid_h = (rgba.shape[0] - max(0, dy)) // cell_h
            for cy in range(grid_h):
                for cx in range(grid_w):
                    x0 = cx * cell_w + dx
                    y0 = cy * cell_h + dy
                    if x0 < 0 or y0 < 0:
                        continue
                    if x0 + cell_w > magnitude.shape[1] or y0 + cell_h > magnitude.shape[0]:
                        continue
                    tile = magnitude[y0 : y0 + cell_h, x0 : x0 + cell_w]
                    peak = float(tile.max())
                    if peak >= magnitude_threshold:
                        score += peak
            if score > best_score:
                best_score = score
                best_off = (dx, dy)
    return best_off


__all__ = [
    "CellEdgeInfo",
    "EdgeMap",
    "compute_edge_map",
    "difference_of_gaussians",
    "sobel_gradient",
    "non_maximum_suppression",
    "hysteresis_threshold",
    "orientation_to_glyph",
    "best_grid_offset",
]
