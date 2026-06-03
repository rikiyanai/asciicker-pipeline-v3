"""Multi-scale edge detection (FL-4097 component 2).

Runs compute_edge_map at TWO resolutions per cell — the base cell_size, and
a finer scale (cell_size / multi_scale_factor). For each output cell, picks
the resolution that produced the cleanest stroke classification.

Rationale:
  - Small features (mouth, fingernail, sword tip) span ~1 cell at 6×6 but
    are basically invisible — they get absorbed into the surrounding body
    fill by the matcher.
  - At 3×3 resolution those features become 2×2 sub-cells with their own
    distinct gradient signature.
  - But at 3×3, body fills get spurious internal "edges" from anti-alias
    noise that don't carry semantic value.
  - Per-cell winner-take-all picks the resolution where the cell actually
    has a coherent chain.
"""
from __future__ import annotations

from dataclasses import dataclass

from PIL import Image

from .candidate import GlyphAssignmentConfig
from .edge_detection import CellEdgeInfo, EdgeMap, compute_edge_map


@dataclass(frozen=True)
class MultiScaleEdgeMap:
    base: EdgeMap
    fine: EdgeMap
    fine_factor: int
    # The merged per-cell stroke decisions, indexed by BASE cell coordinates.
    cells: list[CellEdgeInfo]


def _aggregate_fine_for_base_cell(
    fine: EdgeMap, base_cx: int, base_cy: int, factor: int
) -> CellEdgeInfo | None:
    """Find the dominant stroke decision among the fine-scale sub-cells
    that fall inside one base-scale cell.

    Returns the strongest fine-cell CellEdgeInfo (highest magnitude among
    those marked is_stroke), or None if no fine sub-cell is a stroke.
    """
    best: CellEdgeInfo | None = None
    for fy in range(factor):
        for fx in range(factor):
            sub_cx = base_cx * factor + fx
            sub_cy = base_cy * factor + fy
            if sub_cx >= fine.grid_w or sub_cy >= fine.grid_h:
                continue
            idx = sub_cy * fine.grid_w + sub_cx
            if idx >= len(fine.cells):
                continue
            sub = fine.cells[idx]
            if not sub.is_stroke:
                continue
            if best is None or sub.magnitude > best.magnitude:
                best = sub
    return best


def compute_multi_scale_edge_map(
    image: Image.Image,
    cell_size: tuple[int, int],
    config: GlyphAssignmentConfig,
) -> MultiScaleEdgeMap:
    """Compute base + fine edge maps and merge per base cell."""
    cw, ch = cell_size
    factor = max(1, int(config.multi_scale_factor))
    if cw % factor != 0 or ch % factor != 0:
        # Can't sub-divide evenly; fall back to single-scale.
        factor = 1

    base_map = compute_edge_map(
        image,
        cell_size,
        magnitude_threshold=config.edge_magnitude_threshold,
        use_dog=config.edge_use_dog,
        dog_sigma_narrow=config.edge_dog_sigma_narrow,
        dog_sigma_wide=config.edge_dog_sigma_wide,
        use_alpha_channel=config.edge_use_alpha_channel,
    )
    if factor == 1:
        return MultiScaleEdgeMap(base=base_map, fine=base_map, fine_factor=1, cells=base_map.cells)

    fine_map = compute_edge_map(
        image,
        (cw // factor, ch // factor),
        magnitude_threshold=config.edge_magnitude_threshold,
        use_dog=config.edge_use_dog,
        dog_sigma_narrow=config.edge_dog_sigma_narrow,
        dog_sigma_wide=config.edge_dog_sigma_wide,
        use_alpha_channel=config.edge_use_alpha_channel,
    )

    merged: list[CellEdgeInfo] = []
    for cy in range(base_map.grid_h):
        for cx in range(base_map.grid_w):
            idx = cy * base_map.grid_w + cx
            base_cell = base_map.cells[idx]
            fine_dom = _aggregate_fine_for_base_cell(fine_map, cx, cy, factor)
            # Decision: prefer base if it's a stroke (whole-cell chain is the
            # strongest evidence). Otherwise promote a fine sub-cell stroke if
            # it exists and exceeds the base threshold.
            if base_cell.is_stroke:
                merged.append(base_cell)
            elif fine_dom is not None and fine_dom.magnitude >= config.edge_magnitude_threshold:
                # Rebrand as a base-cell stroke using fine sub-cell orientation
                merged.append(
                    CellEdgeInfo(
                        cx=cx,
                        cy=cy,
                        is_stroke=True,
                        magnitude=fine_dom.magnitude,
                        orientation_rad=fine_dom.orientation_rad,
                        suggested_glyph=fine_dom.suggested_glyph,
                        suggested_fg=fine_dom.suggested_fg,
                        suggested_bg=fine_dom.suggested_bg,
                    )
                )
            else:
                merged.append(base_cell)

    return MultiScaleEdgeMap(
        base=base_map, fine=fine_map, fine_factor=factor, cells=merged
    )


__all__ = ["MultiScaleEdgeMap", "compute_multi_scale_edge_map"]
