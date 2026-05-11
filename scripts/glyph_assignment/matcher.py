from __future__ import annotations

from collections import Counter
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


def _top_colors(pixels: np.ndarray, limit: int = 2) -> list[Color]:
    counter = Counter(tuple(int(v) for v in row) for row in pixels.reshape(-1, 3))
    return [color for color, _count in counter.most_common(limit)]


def _render_error(tile_rgb: np.ndarray, alpha: np.ndarray, mask: np.ndarray, fg: Color, bg: Color) -> float:
    fg_arr = np.array(fg, dtype=np.float32)
    bg_arr = np.array(bg, dtype=np.float32)
    rendered = np.where(mask[:, :, None], fg_arr, bg_arr)
    diff = tile_rgb.astype(np.float32) - rendered
    visible = alpha.astype(bool)
    if not visible.any():
        return 0.0
    return float(np.mean(np.square(diff[visible])) / (255.0 * 255.0 * 3.0))


def _mask_iou_score(source_mask: np.ndarray, candidate_mask: np.ndarray) -> float:
    union = source_mask | candidate_mask
    if not union.any():
        return 1.0
    intersection = source_mask & candidate_mask
    return float(intersection.sum() / union.sum())


def _candidate(
    tile_rgb: np.ndarray,
    alpha: np.ndarray,
    ink: np.ndarray,
    glyph_mask: GlyphMask,
    fg: Color,
    bg: Color,
    solid_penalty: float,
) -> GlyphCandidate:
    iou = _mask_iou_score(ink, glyph_mask.mask)
    rgb_error = _render_error(tile_rgb, alpha, glyph_mask.mask, fg, bg)
    score = max(0.0, min(1.0, (0.72 * iou) + (0.28 * (1.0 - rgb_error)) - solid_penalty))
    reasons = ["matched CP437 mask against non-background pixels"]
    if glyph_mask.glyph == 219 and solid_penalty:
        reasons.append("solid block penalized because non-solid ink exists")
    return GlyphCandidate(
        glyph_mask.glyph,
        fg,
        bg,
        score,
        {"mask_iou": iou, "rgb_error": rgb_error, "solid_penalty": solid_penalty},
        reasons,
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
        for idx in order[: max(candidate_limit * 4, candidate_limit)]:
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
    colors = _top_colors(visible_rgb, 2)
    fg = colors[1] if len(colors) > 1 and colors[0] == bg else colors[0]
    bg_arr = np.array(bg, dtype=np.int16)
    color_delta = np.abs(tile_rgb.astype(np.int16) - bg_arr).max(axis=2)
    ink = alpha & (color_delta > config.color_delta_threshold)
    visible_count = int(alpha.sum())
    ink_count = int(ink.sum())
    total = int(alpha.size)
    bg_ratio = (visible_count - ink_count) / max(1, visible_count)
    feature_ratio = ink_count / max(1, visible_count)

    solid = (
        len(colors) == 1
        or (
            bg_ratio >= config.solid_bg_threshold
            and feature_ratio <= config.solid_feature_max_ratio
            and ink_count <= 1
        )
    )
    if solid:
        block = GlyphCandidate(
            219,
            bg,
            TRANSPARENT_BG,
            1.0,
            {"solid_bg_ratio": bg_ratio, "feature_ratio": feature_ratio},
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


def assign_image_cells(
    image: Image.Image,
    config: GlyphAssignmentConfig,
    *,
    regions: dict[tuple[int, int], str] | None = None,
) -> list[AssignedCell]:
    masks = load_glyph_masks(config.font_path, config.target_cell_size)
    rgba = image.convert("RGBA")
    target_w, target_h = config.target_cell_size
    cols = rgba.width // target_w
    rows = rgba.height // target_h
    cells: list[AssignedCell] = []
    cache: dict[tuple[bytes, str | None], AssignedCell] = {}
    for y in range(rows):
        for x in range(cols):
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
