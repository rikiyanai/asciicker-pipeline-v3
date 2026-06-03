"""Vector-first skeleton + polyline ASCII assignment (FL-4097 component 3).

Pipeline:

    source PNG → silhouette mask (alpha > 0)
              → Zhang-Suen morphological thinning to 1-pixel skeleton
              → trace skeleton into polylines (8-connected walks)
              → Douglas-Peucker simplification per polyline
              → project polyline tangents onto cell grid
              → assign orientation per cell from the chain's local tangent

Real continuity by construction — adjacent cells on the same polyline
share the same chain object and therefore the same orientation pool. No
per-cell sampling variance.

References:
  Zhang, T., Suen, C. (1984). "A fast parallel algorithm for thinning
    digital patterns." Comm. ACM 27(3): 236-239.
  Douglas, D., Peucker, T. (1973). "Algorithms for the reduction of the
    number of points required to represent a digitized line or its
    caricature." Cartographica 10(2): 112-122.
  CUHK ASCII art paper: https://www.cse.cuhk.edu.hk/~ttwong/papers/asciiart/asciiart.pdf
"""
from __future__ import annotations

import math
from dataclasses import dataclass

import numpy as np
from PIL import Image


# --------------------------------------------------------------------------- #
# Public dataclasses
# --------------------------------------------------------------------------- #


@dataclass(frozen=True)
class Polyline:
    """An ordered sequence of (x, y) pixel coordinates along a thinned chain."""

    points: list[tuple[int, int]]

    def tangent_at(self, idx: int, window: int = 2) -> float:
        """Local tangent angle in radians, computed from neighbors within
        a ±window slice of the polyline. Returns 0.0 for degenerate
        cases (single-point or zero-length segments)."""
        n = len(self.points)
        if n < 2:
            return 0.0
        lo = max(0, idx - window)
        hi = min(n - 1, idx + window)
        if lo == hi:
            return 0.0
        x0, y0 = self.points[lo]
        x1, y1 = self.points[hi]
        if x0 == x1 and y0 == y1:
            return 0.0
        return float(math.atan2(y1 - y0, x1 - x0))


# --------------------------------------------------------------------------- #
# Zhang-Suen thinning
# --------------------------------------------------------------------------- #


def _neighbors(mask: np.ndarray, y: int, x: int) -> list[int]:
    """Return P2..P9 (8-neighbors clockwise from top) as 0/1 ints."""
    return [
        int(mask[y - 1, x]),      # P2 (N)
        int(mask[y - 1, x + 1]),  # P3 (NE)
        int(mask[y, x + 1]),      # P4 (E)
        int(mask[y + 1, x + 1]),  # P5 (SE)
        int(mask[y + 1, x]),      # P6 (S)
        int(mask[y + 1, x - 1]),  # P7 (SW)
        int(mask[y, x - 1]),      # P8 (W)
        int(mask[y - 1, x - 1]),  # P9 (NW)
    ]


def _transitions(ns: list[int]) -> int:
    """Count 0→1 transitions when walking around the 8-neighborhood (P2..P9, P2)."""
    seq = ns + [ns[0]]
    return sum(1 for i in range(8) if seq[i] == 0 and seq[i + 1] == 1)


def zhang_suen_thin(mask: np.ndarray) -> np.ndarray:
    """Thin a binary mask to a 1-pixel-wide skeleton using Zhang-Suen.

    Two-pass parallel algorithm. Iterates until no pixels are removed in a
    full pass. Bool input, bool output (same shape).
    """
    work = mask.astype(np.uint8).copy()
    h, w = work.shape
    changed = True
    while changed:
        changed = False
        # Pass 1
        to_remove = []
        for y in range(1, h - 1):
            for x in range(1, w - 1):
                if work[y, x] == 0:
                    continue
                ns = _neighbors(work, y, x)
                B = sum(ns)
                if B < 2 or B > 6:
                    continue
                if _transitions(ns) != 1:
                    continue
                # P2 * P4 * P6 == 0
                if ns[0] and ns[2] and ns[4]:
                    continue
                # P4 * P6 * P8 == 0
                if ns[2] and ns[4] and ns[6]:
                    continue
                to_remove.append((y, x))
        for (y, x) in to_remove:
            work[y, x] = 0
        if to_remove:
            changed = True
        # Pass 2
        to_remove = []
        for y in range(1, h - 1):
            for x in range(1, w - 1):
                if work[y, x] == 0:
                    continue
                ns = _neighbors(work, y, x)
                B = sum(ns)
                if B < 2 or B > 6:
                    continue
                if _transitions(ns) != 1:
                    continue
                # P2 * P4 * P8 == 0
                if ns[0] and ns[2] and ns[6]:
                    continue
                # P2 * P6 * P8 == 0
                if ns[0] and ns[4] and ns[6]:
                    continue
                to_remove.append((y, x))
        for (y, x) in to_remove:
            work[y, x] = 0
        if to_remove:
            changed = True
    return work.astype(bool)


# --------------------------------------------------------------------------- #
# Polyline tracing
# --------------------------------------------------------------------------- #


_8_NEIGHBORS = (
    (-1, -1), (-1, 0), (-1, 1),
    (0, -1),           (0, 1),
    (1, -1),  (1, 0),  (1, 1),
)


def trace_polylines(skeleton: np.ndarray) -> list[Polyline]:
    """Walk the skeleton, extracting ordered polylines.

    Starts from endpoints (skeleton pixels with exactly one neighbor) and
    walks through, terminating at branch points (≥ 3 neighbors) or other
    endpoints. Remaining unvisited closed loops are picked up by a second
    sweep that starts from any unvisited skeleton pixel.
    """
    visited = np.zeros_like(skeleton, dtype=bool)
    h, w = skeleton.shape
    polylines: list[Polyline] = []

    # Count neighbors per pixel.
    def neighbor_count(y: int, x: int) -> int:
        count = 0
        for dy, dx in _8_NEIGHBORS:
            ny, nx = y + dy, x + dx
            if 0 <= ny < h and 0 <= nx < w and skeleton[ny, nx]:
                count += 1
        return count

    # Pass 1: start from endpoints.
    for y in range(h):
        for x in range(w):
            if not skeleton[y, x] or visited[y, x]:
                continue
            if neighbor_count(y, x) != 1:
                continue
            # Walk from this endpoint.
            chain: list[tuple[int, int]] = [(x, y)]
            visited[y, x] = True
            cy, cx = y, x
            while True:
                next_step = None
                for dy, dx in _8_NEIGHBORS:
                    ny, nx = cy + dy, cx + dx
                    if 0 <= ny < h and 0 <= nx < w and skeleton[ny, nx] and not visited[ny, nx]:
                        # Prefer cardinal neighbors over diagonal for smoother walks.
                        if next_step is None or (dy == 0 or dx == 0):
                            next_step = (ny, nx)
                if next_step is None:
                    break
                visited[next_step[0], next_step[1]] = True
                chain.append((next_step[1], next_step[0]))
                cy, cx = next_step
                # Stop at branches (≥3 neighbors) to avoid eating the whole tree
                if neighbor_count(cy, cx) > 2:
                    break
            if len(chain) >= 3:
                polylines.append(Polyline(points=chain))

    # Pass 2: closed loops or anything left unvisited.
    for y in range(h):
        for x in range(w):
            if not skeleton[y, x] or visited[y, x]:
                continue
            chain = [(x, y)]
            visited[y, x] = True
            cy, cx = y, x
            while True:
                next_step = None
                for dy, dx in _8_NEIGHBORS:
                    ny, nx = cy + dy, cx + dx
                    if 0 <= ny < h and 0 <= nx < w and skeleton[ny, nx] and not visited[ny, nx]:
                        next_step = (ny, nx)
                        break
                if next_step is None:
                    break
                visited[next_step[0], next_step[1]] = True
                chain.append((next_step[1], next_step[0]))
                cy, cx = next_step
            if len(chain) >= 3:
                polylines.append(Polyline(points=chain))

    return polylines


# --------------------------------------------------------------------------- #
# Douglas-Peucker simplification
# --------------------------------------------------------------------------- #


def _perp_distance(p: tuple[int, int], a: tuple[int, int], b: tuple[int, int]) -> float:
    if a == b:
        return math.hypot(p[0] - a[0], p[1] - a[1])
    ax, ay = a
    bx, by = b
    px, py = p
    num = abs((by - ay) * px - (bx - ax) * py + bx * ay - by * ax)
    den = math.hypot(bx - ax, by - ay)
    return num / den


def douglas_peucker(points: list[tuple[int, int]], epsilon: float) -> list[tuple[int, int]]:
    """Recursive D-P polyline simplification. Returns a reduced point list."""
    if len(points) < 3:
        return list(points)
    a, b = points[0], points[-1]
    max_dist = 0.0
    max_idx = 0
    for i in range(1, len(points) - 1):
        d = _perp_distance(points[i], a, b)
        if d > max_dist:
            max_dist = d
            max_idx = i
    if max_dist <= epsilon:
        return [a, b]
    left = douglas_peucker(points[: max_idx + 1], epsilon)
    right = douglas_peucker(points[max_idx:], epsilon)
    return left[:-1] + right


# --------------------------------------------------------------------------- #
# Project polylines onto the cell grid
# --------------------------------------------------------------------------- #


@dataclass(frozen=True)
class CellPolylineHit:
    cx: int
    cy: int
    tangent_rad: float
    polyline_index: int


def project_polylines_to_cells(
    polylines: list[Polyline], cell_w: int, cell_h: int
) -> dict[tuple[int, int], CellPolylineHit]:
    """For each cell that ANY polyline passes through, record the dominant
    polyline's local tangent at the cell center.

    "Dominant" = polyline contributing the most points within the cell.
    """
    # Accumulate (cx, cy) → {polyline_idx → list of (point_idx, angle)}
    accum: dict[tuple[int, int], dict[int, list[float]]] = {}
    for pi, poly in enumerate(polylines):
        for idx, (px, py) in enumerate(poly.points):
            cx, cy = px // cell_w, py // cell_h
            key = (cx, cy)
            if key not in accum:
                accum[key] = {}
            angles = accum[key].setdefault(pi, [])
            angles.append(poly.tangent_at(idx, window=2))

    out: dict[tuple[int, int], CellPolylineHit] = {}
    for key, polys in accum.items():
        # Pick the polyline with the most points in this cell.
        best_pi, best_angles = max(polys.items(), key=lambda kv: len(kv[1]))
        # Circular mean of angles within that polyline's slice
        if best_angles:
            mean = math.atan2(
                float(np.sin(best_angles).mean()),
                float(np.cos(best_angles).mean()),
            )
        else:
            mean = 0.0
        out[key] = CellPolylineHit(
            cx=key[0], cy=key[1], tangent_rad=mean, polyline_index=best_pi
        )
    return out


# --------------------------------------------------------------------------- #
# Top-level convenience
# --------------------------------------------------------------------------- #


def skeleton_polyline_cells(
    image: Image.Image,
    cell_size: tuple[int, int],
    *,
    alpha_threshold: int = 16,
    dp_epsilon: float = 1.5,
) -> dict[tuple[int, int], CellPolylineHit]:
    """Top-level: source → skeleton → polylines → cell tangent map."""
    rgba = np.array(image.convert("RGBA"))
    mask = rgba[:, :, 3] > alpha_threshold
    # Erode the silhouette by 1 pixel before thinning — anti-alias halos
    # otherwise produce one-pixel-wide bumps that confuse thinning.
    eroded = (
        mask
        & np.roll(mask, 1, axis=0)
        & np.roll(mask, -1, axis=0)
        & np.roll(mask, 1, axis=1)
        & np.roll(mask, -1, axis=1)
    )
    skel = zhang_suen_thin(eroded)
    polylines = trace_polylines(skel)
    polylines = [
        Polyline(points=douglas_peucker(p.points, dp_epsilon)) for p in polylines
    ]
    cw, ch = cell_size
    return project_polylines_to_cells(polylines, cw, ch)


__all__ = [
    "Polyline",
    "CellPolylineHit",
    "zhang_suen_thin",
    "trace_polylines",
    "douglas_peucker",
    "project_polylines_to_cells",
    "skeleton_polyline_cells",
]
