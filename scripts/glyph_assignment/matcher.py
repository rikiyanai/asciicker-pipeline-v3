from __future__ import annotations

import warnings
from dataclasses import replace
from pathlib import Path

import numpy as np
from PIL import Image

from .candidate import AssignedCell, Color, GlyphAssignmentConfig, GlyphCandidate
from .font_atlas import GlyphMask, load_glyph_masks
from .semantic_bias import apply_semantic_bias

TRANSPARENT_BG: Color = (255, 0, 255)


def _dominant_color(pixels: np.ndarray) -> Color:
    colors, counts = np.unique(pixels.reshape(-1, 3), axis=0, return_counts=True)
    return tuple(int(v) for v in colors[int(np.argmax(counts))])


def _unique_color_count(pixels: np.ndarray) -> int:
    return int(len(np.unique(pixels.reshape(-1, 3), axis=0)))


def _is_solid_cell(
    color_count: int,
    bg_ratio: float,
    ink_count: int,
    visible_count: int,
    config: GlyphAssignmentConfig,
) -> bool:
    if color_count == 1:
        return True
    allowed_feature_pixels = max(1, int(visible_count * config.solid_feature_max_ratio))
    return (
        bg_ratio >= config.solid_bg_threshold
        and ink_count <= allowed_feature_pixels
    )


def _rank_candidates(
    tile_rgb: np.ndarray,
    alpha: np.ndarray,
    ink: np.ndarray,
    masks: list[GlyphMask],
    color_pairs: list[tuple[Color, Color]],
    candidate_limit: int,
) -> list[GlyphCandidate]:
    mask_stack = np.stack([item.mask for item in masks]).astype(bool)
    glyph_codes = [item.glyph for item in masks]
    ink_stack = ink[None, :, :]
    intersections = np.logical_and(ink_stack, mask_stack).sum(axis=(1, 2)).astype(np.float32)
    unions = np.logical_or(ink_stack, mask_stack).sum(axis=(1, 2)).astype(np.float32)
    iou_scores = np.divide(intersections, unions, out=np.ones_like(intersections), where=unions > 0)
    alpha_mask = alpha.astype(bool)
    rgb = tile_rgb.astype(np.float32)
    ranked: list[GlyphCandidate] = []
    for fg, bg in color_pairs:
        fg_arr = np.array(fg, dtype=np.float32)
        bg_arr = np.array(bg, dtype=np.float32)
        rendered = np.where(mask_stack[:, :, :, None], fg_arr, bg_arr)
        diff = rgb[None, :, :, :] - rendered
        if alpha_mask.any():
            rgb_errors = np.mean(np.square(diff[:, alpha_mask, :]), axis=(1, 2)) / (255.0 * 255.0 * 3.0)
        else:
            rgb_errors = np.zeros(len(masks), dtype=np.float32)
        solid_penalties = np.array([0.35 if glyph == 219 and int(ink.sum()) > 1 else 0.0 for glyph in glyph_codes], dtype=np.float32)
        scores = np.maximum(0.0, np.minimum(1.0, (0.72 * iou_scores) + (0.28 * (1.0 - rgb_errors)) - solid_penalties))
        order = np.argsort(-scores)
        pool_size = max(candidate_limit * 4, 4)
        for idx in order[:pool_size]:
            glyph = glyph_codes[int(idx)]
            reasons = ["matched CP437 mask against non-background pixels"]
            if glyph == 219 and solid_penalties[int(idx)]:
                reasons.append("solid block penalized because non-solid ink exists")
            ranked.append(
                GlyphCandidate(
                    glyph,
                    fg,
                    bg,
                    float(scores[int(idx)]),
                    {
                        "mask_iou": float(iou_scores[int(idx)]),
                        "rgb_error": float(rgb_errors[int(idx)]),
                        "solid_penalty": float(solid_penalties[int(idx)]),
                    },
                    reasons,
                )
            )
    ranked.sort(key=lambda item: (-item.score, item.glyph, item.fg, item.bg))
    return ranked


def assign_cell(
    tile: Image.Image | np.ndarray,
    config: GlyphAssignmentConfig,
    masks: list[GlyphMask] | None = None,
    *,
    x: int = 0,
    y: int = 0,
    region: str | None = None,
) -> AssignedCell:
    if masks is None:
        masks = load_glyph_masks(config.font_path, config.target_cell_size)
    rgba = np.array(tile.convert("RGBA") if isinstance(tile, Image.Image) else tile)
    target_w, target_h = config.target_cell_size
    if rgba.shape[:2] != (target_h, target_w):
        image = Image.fromarray(rgba, "RGBA")
        rgba = np.array(image.resize((target_w, target_h), Image.Resampling.NEAREST))
    alpha = rgba[:, :, 3] > 0
    if not alpha.any():
        empty = GlyphCandidate(0, (0, 0, 0), TRANSPARENT_BG, 1.0, {"empty": 1.0}, ["transparent cell"])
        return AssignedCell(x, y, region, empty, (empty,), 1.0, False)

    tile_rgb = rgba[:, :, :3]
    visible_rgb = tile_rgb[alpha]
    bg = _dominant_color(visible_rgb)
    color_count = _unique_color_count(visible_rgb)
    bg_arr = np.array(bg, dtype=np.int16)
    color_delta = np.abs(tile_rgb.astype(np.int16) - bg_arr).max(axis=2)
    ink = alpha & (color_delta > config.color_delta_threshold)
    visible_count = int(alpha.sum())
    ink_count = int(ink.sum())
    bg_ratio = (visible_count - ink_count) / max(1, visible_count)
    feature_ratio = ink_count / max(1, visible_count)

    if _is_solid_cell(color_count, bg_ratio, ink_count, visible_count, config):
        block = GlyphCandidate(
            219,
            bg,
            TRANSPARENT_BG,
            1.0,
            {"solid_bg_ratio": bg_ratio, "feature_ratio": feature_ratio, "ink_count": ink_count},
            ["solid visible cell uses full block"],
        )
        alt = GlyphCandidate(
            32,
            (0, 0, 0),
            bg,
            0.0,
            {"solid_bg_ratio": bg_ratio},
            ["space alternative retained for review"],
        )
        return AssignedCell(x, y, region, block, (block, alt), 1.0, False)

    fg_pixels = tile_rgb[ink] if ink.any() else visible_rgb
    fg_color = _dominant_color(fg_pixels)
    color_pairs = [(fg_color, bg)]
    if fg_color != bg:
        color_pairs.append((bg, fg_color))
    candidates = _rank_candidates(tile_rgb, alpha, ink, masks, color_pairs, max(2, config.candidate_limit))

    deduped: list[GlyphCandidate] = []
    seen: set[int] = set()
    for candidate in candidates:
        if candidate.glyph in seen:
            continue
        deduped.append(candidate)
        seen.add(candidate.glyph)
        if len(deduped) >= max(2, config.candidate_limit):
            break
    ranked = apply_semantic_bias(deduped, region, config.semantic_bias, config.score_delta_threshold)
    alternatives = tuple(ranked[: max(2, config.candidate_limit)])
    chosen = alternatives[0]
    second_score = alternatives[1].score if len(alternatives) > 1 else 0.0
    confidence = max(0.0, min(1.0, chosen.score - second_score))
    needs_review = confidence < config.score_delta_threshold
    return AssignedCell(x, y, region, chosen, alternatives, confidence, needs_review)


def _cell_from_override(x: int, y: int, record: dict) -> AssignedCell | None:
    """Build a synthetic AssignedCell from an accepted override record.

    Returns ``None`` when the record is missing the required ``glyph`` field
    or when ``fg`` / ``bg`` are missing — an override that doesn't specify
    both colours cannot decompose a tile and must fall through to normal
    scoring.

    The resulting cell has ``confidence=1.0``, ``needs_review=False``, and an
    empty alternatives tuple — it bypasses scoring entirely.
    """
    glyph = record.get("glyph")
    if not isinstance(glyph, int):
        return None
    raw_fg = record.get("fg")
    raw_bg = record.get("bg")
    if not isinstance(raw_fg, (list, tuple)) or len(raw_fg) != 3:
        return None
    if not isinstance(raw_bg, (list, tuple)) or len(raw_bg) != 3:
        return None
    fg: Color = (int(raw_fg[0]), int(raw_fg[1]), int(raw_fg[2]))
    bg: Color = (int(raw_bg[0]), int(raw_bg[1]), int(raw_bg[2]))
    region: str | None = record.get("region")
    chosen = GlyphCandidate(glyph, fg, bg, 1.0, {"override": 1.0}, ["human override accepted"])
    return AssignedCell(x, y, region, chosen, (chosen,), 1.0, False)


def assign_image_cells(
    image: Image.Image,
    config: GlyphAssignmentConfig,
    *,
    regions: dict[tuple[int, int], str] | None = None,
    overrides: dict[tuple[int, int], dict] | None = None,
) -> list[AssignedCell]:
    """Assign CP437 glyphs to every cell in *image*.

    *regions* maps ``(x, y)`` to a region name string used for semantic bias.
    *overrides* maps ``(x, y)`` to a human-authored override record; records
    with ``accepted=True`` bypass scoring entirely and are returned as-is.
    Override consumption happens before the tile cache and before semantic
    bias — human choices are always authoritative.
    """
    masks = load_glyph_masks(config.font_path, config.target_cell_size)
    rgba = image.convert("RGBA")
    target_w, target_h = config.target_cell_size
    cols = rgba.width // target_w
    rows = rgba.height // target_h
    cells: list[AssignedCell] = []
    cache: dict[tuple[bytes, str | None], AssignedCell] = {}
    for y in range(rows):
        for x in range(cols):
            # Override pre-pass: accepted cells bypass scoring and cache
            if overrides:
                record = overrides.get((x, y))
                if record is not None and record.get("accepted"):
                    synthetic = _cell_from_override(x, y, record)
                    if synthetic is not None:
                        cells.append(synthetic)
                        continue
                    # accepted override missing fg/bg — fall through to scoring
                    warnings.warn(
                        f"accepted override at ({x},{y}) missing fg or bg; falling through to scoring",
                        RuntimeWarning,
                        stacklevel=2,
                    )

            tile = rgba.crop((x * target_w, y * target_h, (x + 1) * target_w, (y + 1) * target_h))
            region = regions.get((x, y)) if regions else None
            key = (tile.tobytes(), region)
            cached = cache.get(key)
            if cached is None:
                cached = assign_cell(tile, config, masks, x=0, y=0, region=region)
                cache[key] = cached
            cells.append(replace(cached, x=x, y=y))
    return cells


def default_font_path(root: Path) -> Path:
    return root / "runtime" / "termpp-skin-lab-static" / "termpp-web-flat" / "fonts" / "cp437_6x6.png.bdf"
