from __future__ import annotations

import warnings
from dataclasses import replace
from pathlib import Path

import numpy as np
from PIL import Image

from .candidate import AssignedCell, Color, GlyphAssignmentConfig, GlyphCandidate
from .edge_detection import CellEdgeInfo, EdgeMap, best_grid_offset, compute_edge_map
from .font_atlas import GlyphMask, load_glyph_masks
from .edge_detection import orientation_to_glyph as _orientation_to_glyph
from .multiscale import compute_multi_scale_edge_map
from .semantic_bias import apply_semantic_bias
from .skeleton import skeleton_polyline_cells
from .ssim import best_glyph_by_ssim

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
    ranked = apply_semantic_bias(
        deduped,
        region,
        config.semantic_bias,
        config.score_delta_threshold,
        anti_fill_in_body=config.anti_fill_in_body,
    )
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


def _orientation_family(angle_rad: float | None) -> list[int]:
    """CP437 glyph candidates for a given edge orientation family.

    Wider sets than the single-glyph orientation table so the SSIM picker
    has curves/joints/terminators available within the same broad family.
    Returns a list of glyph codes to be SSIM-scored.
    """
    if angle_rad is None:
        return []
    import math as _m
    a = ((_m.degrees(angle_rad) + 180.0) % 180.0)
    # 0/180 (vertical edge)            : | ! : ; ( ) [ ] { } ‖ │
    # 45     (\ edge, gradient +45°)   : \ /  ' , . ` _ \ ` ⌐
    # 90     (horizontal edge)         : _ - = ~ — ‾ . , ' `
    # 135    (/ edge, gradient -45°)   : / \ ` ' . , _ ⌐
    if a < 22.5 or a >= 157.5:
        return [124, 33, 58, 59, 40, 41, 91, 93, 123, 125, 73, 105, 108, 84, 116]
    if a < 67.5:
        return [92, 47, 96, 39, 44, 46, 95, 41, 76, 122, 110, 109, 169, 196]
    if a < 112.5:
        return [95, 45, 61, 126, 196, 205, 46, 44, 39, 96, 175, 176]
    return [47, 92, 96, 39, 46, 44, 95, 40, 76, 122, 110, 109, 169, 196]


def _cell_from_edge_overlay(
    edge: CellEdgeInfo,
    tone_cell: AssignedCell,
    region: str | None,
    *,
    config: GlyphAssignmentConfig | None = None,
    source_tile_rgb: np.ndarray | None = None,
    masks: list[GlyphMask] | None = None,
    neighbor_glyphs: list[int] | None = None,
) -> AssignedCell:
    """Build a stroke-cell AssignedCell that OVERLAYS the orientation glyph
    on the tone path's already-picked fg/bg.

    FL-4096 (A): the previous version hardcoded bg=(255,0,255) transparent
    sentinel, which punched holes through the body fill on every stroke cell
    and visibly darkened the sprite. By inheriting bg from the tone match
    (which is the cell's dominant visible color = body fill) and fg from the
    tone match (which is the cell's dominant ink color = outline/edge color),
    we get the correct stick-figure overlay: body color stays, edge glyph
    appears in the outline color on top.

    The glyph comes from:
      - SSIM picker (FL-4097 component 1) when config.ssim_for_strokes is True
        and source_tile_rgb + masks are provided.
      - Sobel orientation map otherwise (FL-4095 behavior).
    Only fg/bg come from the tone path either way.
    """
    glyph = edge.suggested_glyph
    ssim_score: float | None = None
    reasons = [
        "FL-4096 (A) stroke overlay: glyph from Sobel orientation, "
        "fg/bg inherited from tone path"
    ]

    if (
        config is not None
        and config.ssim_for_strokes
        and source_tile_rgb is not None
        and masks is not None
    ):
        candidate_filter = None
        if config.ssim_candidate_filter_by_orientation:
            candidate_filter = _orientation_family(edge.orientation_rad)
            if not candidate_filter:
                candidate_filter = None
        ssim_glyph, ssim_score_value = best_glyph_by_ssim(
            source_tile_rgb,
            tone_cell.chosen.fg,
            tone_cell.chosen.bg,
            masks,
            candidate_glyphs=candidate_filter,
            neighbor_glyphs=neighbor_glyphs,
        )
        if ssim_glyph != 0 and ssim_score_value >= config.ssim_score_floor:
            glyph = ssim_glyph
            ssim_score = ssim_score_value
            reasons = [
                "FL-4097 (1) SSIM-picked stroke glyph; fg/bg from tone path"
            ]

    components = {
        "edge_magnitude": edge.magnitude,
        "edge_orientation_rad": edge.orientation_rad or 0.0,
        "tone_glyph": tone_cell.chosen.glyph,
    }
    if ssim_score is not None:
        components["ssim_score"] = ssim_score

    chosen = GlyphCandidate(
        glyph,
        tone_cell.chosen.fg,
        tone_cell.chosen.bg,
        1.0,
        components,
        reasons,
    )
    return AssignedCell(edge.cx, edge.cy, region, chosen, (chosen,), 1.0, False)


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

    FL-4095: when ``config.edge_aware`` is True, a Sobel/DoG pre-pass runs
    first. Cells flagged as strokes (gradient magnitude over the configured
    threshold) bypass the per-cell IoU ranking and receive an orientation-
    mapped CP437 glyph directly. Non-stroke cells go through the standard
    tone-based scoring path. Overrides still take precedence over both.
    """
    masks = load_glyph_masks(config.font_path, config.target_cell_size)
    rgba = image.convert("RGBA")
    target_w, target_h = config.target_cell_size

    # FL-4095 CUHK feature-aware grid shift — optional sub-cell alignment.
    shift_dx, shift_dy = 0, 0
    if config.edge_aware and config.edge_grid_shift_search_px > 0:
        shift_dx, shift_dy = best_grid_offset(
            rgba,
            (target_w, target_h),
            search_radius_px=config.edge_grid_shift_search_px,
            magnitude_threshold=config.edge_magnitude_threshold,
        )
    if shift_dx != 0 or shift_dy != 0:
        shifted = Image.new("RGBA", rgba.size, (0, 0, 0, 0))
        shifted.paste(rgba, (-shift_dx, -shift_dy))
        rgba = shifted

    cols = rgba.width // target_w
    rows = rgba.height // target_h

    # FL-4095 edge pre-pass. FL-4097 (2) multi-scale runs base + fine and
    # merges per base cell. Single-scale path preserved for ablation.
    edge_lookup: dict[tuple[int, int], CellEdgeInfo] = {}
    if config.edge_aware:
        if config.multi_scale_edges:
            ms_map = compute_multi_scale_edge_map(
                rgba, (target_w, target_h), config
            )
            edge_lookup = {(c.cx, c.cy): c for c in ms_map.cells}
        else:
            edge_map = compute_edge_map(
                rgba,
                (target_w, target_h),
                magnitude_threshold=config.edge_magnitude_threshold,
                use_dog=config.edge_use_dog,
                dog_sigma_narrow=config.edge_dog_sigma_narrow,
                dog_sigma_wide=config.edge_dog_sigma_wide,
            )
            edge_lookup = {(c.cx, c.cy): c for c in edge_map.cells}

    # FL-4097 (3) skeleton/polyline overrides edge orientation with the
    # polyline tangent — adjacent cells on the same chain get COHERENT
    # orientation by construction. Cells touched by a polyline but not
    # flagged as stroke by Sobel are promoted to stroke.
    polyline_lookup = {}
    if config.edge_aware and config.use_skeleton_polyline:
        polyline_lookup = skeleton_polyline_cells(
            rgba,
            (target_w, target_h),
            dp_epsilon=config.skeleton_dp_epsilon,
        )
        # Promote / refine edge_lookup entries from polyline data
        for key, hit in polyline_lookup.items():
            existing = edge_lookup.get(key)
            ori = hit.tangent_rad
            glyph = _orientation_to_glyph(ori)
            from .edge_detection import _dominant_visible_color
            cx, cy = key
            x0, y0 = cx * target_w, cy * target_h
            rgba_arr = np.array(rgba)
            fg = _dominant_visible_color(rgba_arr, x0, y0, target_w, target_h)
            refined = CellEdgeInfo(
                cx=cx,
                cy=cy,
                is_stroke=True,
                magnitude=existing.magnitude if existing else 999.0,
                orientation_rad=ori,
                suggested_glyph=glyph,
                suggested_fg=fg,
                suggested_bg=(255, 0, 255),
            )
            edge_lookup[key] = refined

    cells: list[AssignedCell] = []
    cache: dict[tuple[bytes, str | None], AssignedCell] = {}
    for y in range(rows):
        for x in range(cols):
            region = regions.get((x, y)) if regions else None

            # 1. Overrides always win.
            if overrides:
                record = overrides.get((x, y))
                if record is not None and record.get("accepted"):
                    synthetic = _cell_from_override(x, y, record)
                    if synthetic is not None:
                        cells.append(synthetic)
                        continue
                    warnings.warn(
                        f"accepted override at ({x},{y}) missing fg or bg; falling through to scoring",
                        RuntimeWarning,
                        stacklevel=2,
                    )

            # 2. Always run tone-based matcher first to get fg/bg even on
            #    stroke cells (FL-4096 A — stroke must overlay, not replace,
            #    the body fill).
            tile = rgba.crop(
                (x * target_w, y * target_h, (x + 1) * target_w, (y + 1) * target_h)
            )
            key = (tile.tobytes(), region)
            cached = cache.get(key)
            if cached is None:
                cached = assign_cell(tile, config, masks, x=0, y=0, region=region)
                cache[key] = cached
            tone_cell = replace(cached, x=x, y=y)

            # FL-4099 stick-figure mode dispatch. Precedence:
            #   silhouette_only > polyline_primary > edge-aware overlay
            polyline_hit = polyline_lookup.get((x, y))
            edge = edge_lookup.get((x, y)) if config.edge_aware else None
            is_polyline_cell = polyline_hit is not None
            is_stroke_cell = edge is not None and edge.is_stroke

            # FL-4099 (2) silhouette_only: only stroke / polyline cells are
            # drawn; everything else gets an empty (transparent) glyph.
            if config.silhouette_only and not is_polyline_cell and not is_stroke_cell:
                empty = GlyphCandidate(
                    0, (0, 0, 0), (255, 0, 255), 1.0,
                    {"silhouette_only": 1.0},
                    ["FL-4099 (2) silhouette_only: non-contour cell"],
                )
                cells.append(AssignedCell(x, y, region, empty, (empty,), 1.0, False))
                continue

            # FL-4099 (3) polyline_primary: cells on a polyline get the
            # tangent glyph as FINAL choice — SSIM and edge overlay are
            # both bypassed.
            if config.polyline_primary and is_polyline_cell:
                glyph_code = _orientation_to_glyph(polyline_hit.tangent_rad)
                chosen = GlyphCandidate(
                    glyph_code,
                    tone_cell.chosen.fg,
                    tone_cell.chosen.bg,
                    1.0,
                    {
                        "polyline_tangent_rad": polyline_hit.tangent_rad,
                        "tone_glyph": tone_cell.chosen.glyph,
                    },
                    ["FL-4099 (3) polyline_primary: tangent glyph"],
                )
                cells.append(AssignedCell(x, y, region, chosen, (chosen,), 1.0, False))
                continue

            # 3. FL-4095 edge-aware stroke overlay — keep tone's fg/bg,
            #    swap only the glyph for the orientation-mapped stroke.
            #    FL-4097 (1): when ssim_for_strokes=True, SSIM picks the
            #    glyph instead of the orientation→glyph hardcoded table.
            #    FL-4098 (3): pass already-decided neighbors (top-left,
            #    top, top-right, left) to bias toward family continuity.
            if is_stroke_cell:
                src_rgb = (
                    np.array(tile.convert("RGB"))
                    if config.ssim_for_strokes
                    else None
                )
                neighbors: list[int] = []
                if config.ssim_for_strokes:
                    # cells is row-major; (x, y-1), (x-1, y) etc. live
                    # at the absolute indices below if in-bounds.
                    for nx_off, ny_off in ((0, -1), (-1, -1), (1, -1), (-1, 0)):
                        ny = y + ny_off
                        nx = x + nx_off
                        if 0 <= ny < y or (ny == y and nx < x):
                            idx = ny * cols + nx
                            if 0 <= idx < len(cells):
                                neighbors.append(cells[idx].chosen.glyph)
                cells.append(
                    _cell_from_edge_overlay(
                        edge,
                        tone_cell,
                        region,
                        config=config,
                        source_tile_rgb=src_rgb,
                        masks=masks,
                        neighbor_glyphs=neighbors,
                    )
                )
                continue

            cells.append(tone_cell)
    return cells


def default_font_path(root: Path) -> Path:
    return root / "runtime" / "termpp-skin-lab-static" / "termpp-web-flat" / "fonts" / "cp437_6x6.png.bdf"
