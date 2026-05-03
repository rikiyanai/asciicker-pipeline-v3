from __future__ import annotations

from .models import GateResult


THRESHOLD_MET = "THRESHOLD_MET"
THRESHOLD_BREACHED = "THRESHOLD_BREACHED"

# ── G8/G9 threshold policy (locked per S2-R4) ──
#
# G8 (nonempty ratio):
#   Policy: An exported XP must have >= 5% non-space glyphs in the art layer
#   (layer index 2). This catches blank or near-blank sheets that were manually
#   edited after pipeline conversion. The 5% floor accommodates sparse manual
#   authoring (e.g. a user placing a few characters) while still rejecting empty
#   or accidentally-wiped sheets. Do not raise this threshold without a canon
#   change — autonomous flows produce sparse outputs by design.
#
# G9 (handoff):
#   Policy: At export time the XP is already materialized, so G9 simply
#   verifies that at least one populated cell exists. This is a safety-net
#   gate against zero-cell corrupt outputs, not a quality gate. The real
#   content quality signal is G8.

_G8_MIN_RATIO: float = 0.05


def gate_g7_geometry(expected_cells: int, actual_cells: int) -> GateResult:
    ok = expected_cells == actual_cells
    return GateResult(
        gate="G7",
        verdict=THRESHOLD_MET if ok else THRESHOLD_BREACHED,
        details={"expected_cells": expected_cells, "actual_cells": actual_cells},
    )


def gate_g8_nonempty(glyphs: list[int], min_ratio: float = _G8_MIN_RATIO) -> GateResult:
    """G8: Art layer non-space cell ratio must meet the G8 threshold.

    Counts non-space glyphs (not code point 0 or 32) in the art/content layer
    (layer index 2). The configured threshold (_G8_MIN_RATIO) catches blank or
    near-blank sheets while accommodating sparse manual authoring.
    """
    if not glyphs:
        return GateResult("G8", THRESHOLD_BREACHED, {"ratio": 0.0, "min_ratio": min_ratio})
    nonempty = sum(1 for g in glyphs if g not in (0, 32))
    ratio = nonempty / len(glyphs)
    ok = ratio >= min_ratio
    return GateResult(
        gate="G8",
        verdict=THRESHOLD_MET if ok else THRESHOLD_BREACHED,
        details={"ratio": ratio, "min_ratio": min_ratio, "nonempty": nonempty, "total": len(glyphs)},
    )


def gate_g9_handoff(populated_cells: int) -> GateResult:
    """G9: Export-time handoff gate — at least one populated cell exists.

    At export time the XP is already materialized, so this is a safety-net
    gate against zero-cell corrupt outputs, not a quality gate.
    """
    ok = populated_cells > 0
    return GateResult(
        gate="G9",
        verdict=THRESHOLD_MET if ok else THRESHOLD_BREACHED,
        details={"populated_cells": populated_cells},
    )


def gate_g10_action_dims(
    actual_cols: int,
    actual_rows: int,
    expected_cols: int,
    expected_rows: int,
) -> GateResult:
    """XP dimensions must match template's xp_dims."""
    ok = actual_cols == expected_cols and actual_rows == expected_rows
    return GateResult(
        gate="G10",
        verdict=THRESHOLD_MET if ok else THRESHOLD_BREACHED,
        details={
            "actual": [actual_cols, actual_rows],
            "expected": [expected_cols, expected_rows],
        },
    )


def gate_g11_layer_count(actual_layers: int, expected_layers: int) -> GateResult:
    """Layer count must match template's layers."""
    ok = actual_layers == expected_layers
    return GateResult(
        gate="G11",
        verdict=THRESHOLD_MET if ok else THRESHOLD_BREACHED,
        details={"actual_layers": actual_layers, "expected_layers": expected_layers},
    )


def gate_g12_l0_metadata(
    l0_row0_glyphs: list[str],
    expected_glyphs: list[str],
) -> GateResult:
    """L0 row-0 metadata glyphs (first N cols) must match expected family pattern."""
    ok = l0_row0_glyphs == expected_glyphs
    return GateResult(
        gate="G12",
        verdict=THRESHOLD_MET if ok else THRESHOLD_BREACHED,
        details={
            "actual_l0_row0": l0_row0_glyphs,
            "expected_l0_row0": expected_glyphs,
        },
    )
