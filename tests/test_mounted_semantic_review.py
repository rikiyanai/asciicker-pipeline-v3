"""Tests for the mounted-semantic proposals route and MCP tools (U4 backend)."""
from __future__ import annotations

import json
from pathlib import Path

import pytest


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _create_blank_session(client) -> str:
    resp = client.post(
        "/api/workbench/create-blank-session",
        data=json.dumps({"template_set_key": "player_native_idle_only", "action_key": "idle"}),
        content_type="application/json",
    )
    assert resp.status_code == 201
    return resp.get_json()["session_id"]


def _post_calibration(client, session_id: str, calibration: dict) -> None:
    resp = client.post(
        "/api/workbench/session/mounted-calibration",
        data=json.dumps({"session_id": session_id, "data": calibration}),
        content_type="application/json",
    )
    assert resp.status_code == 200


def _get_proposals(client, session_id: str):
    return client.post(
        "/api/workbench/mounted-semantic/proposals",
        data=json.dumps({"session_id": session_id}),
        content_type="application/json",
    )


def _real_calibration(client) -> tuple[str, dict]:
    """Create a session with a real compute-backed calibration record. Returns (session_id, calibration)."""
    session_id = _create_blank_session(client)
    compute_resp = client.post(
        "/api/workbench/mounted-calibration/compute",
        data=json.dumps({
            "player_xp": "sprites/player-0100.xp",
            "mounted_xp": "sprites/wolfie-0100.xp",
        }),
        content_type="application/json",
    )
    assert compute_resp.status_code == 200
    calibration = compute_resp.get_json()
    _post_calibration(client, session_id, calibration)
    return session_id, calibration


# ---------------------------------------------------------------------------
# Happy-path tests
# ---------------------------------------------------------------------------

def test_proposals_require_calibration_record(client):
    """Session without calibration → 422 calibration_absent."""
    session_id = _create_blank_session(client)
    resp = _get_proposals(client, session_id)
    assert resp.status_code == 422
    data = resp.get_json()
    assert data.get("code") == "calibration_absent"


def test_proposals_from_real_calibration(client):
    """Session with a compute-backed calibration → per_angle list with cells."""
    session_id, _ = _real_calibration(client)
    resp = _get_proposals(client, session_id)
    assert resp.status_code == 200
    data = resp.get_json()
    assert isinstance(data.get("per_angle"), list)
    assert len(data["per_angle"]) > 0


def test_proposals_per_angle_shape(client):
    """Each per_angle entry has angle, dx, dy, counts, cells."""
    session_id, _ = _real_calibration(client)
    data = _get_proposals(client, session_id).get_json()
    for entry in data["per_angle"]:
        assert "angle" in entry
        assert "dx" in entry
        assert "dy" in entry
        assert "counts" in entry
        assert "cells" in entry
        counts = entry["counts"]
        assert all(k in counts for k in ("rider_only", "mount_only", "overlap", "unresolved"))


def test_proposals_cells_have_required_fields(client):
    """Each cell in per_angle entries has category, x, y, glyph, fg, bg."""
    session_id, _ = _real_calibration(client)
    data = _get_proposals(client, session_id).get_json()
    for entry in data["per_angle"]:
        for cell in entry["cells"]:
            assert cell.get("category") in ("rider_only", "mount_only", "overlap")
            assert "x" in cell and "y" in cell
            assert "glyph" in cell
            assert "fg" in cell and "bg" in cell


def test_proposals_counts_match_cells(client):
    """Counts in each per_angle entry are consistent with the cell list."""
    session_id, _ = _real_calibration(client)
    data = _get_proposals(client, session_id).get_json()
    for entry in data["per_angle"]:
        cells = entry["cells"]
        counts = entry["counts"]
        for cat in ("rider_only", "mount_only", "overlap"):
            actual = sum(1 for c in cells if c["category"] == cat)
            assert actual == counts[cat], (
                f"angle {entry['angle']}: {cat} count={counts[cat]} but {actual} cells"
            )


def test_proposals_reflect_calibration_dx_dy(client):
    """Proposals use dx/dy from calibration record, not a hardcoded (0,0)."""
    session_id, calibration = _real_calibration(client)
    data = _get_proposals(client, session_id).get_json()
    calib_per_angle = {e["angle"]: e for e in calibration.get("per_angle", [])}
    for entry in data["per_angle"]:
        angle = entry["angle"]
        if angle in calib_per_angle:
            assert entry["dx"] == calib_per_angle[angle]["dx"]
            assert entry["dy"] == calib_per_angle[angle]["dy"]


def test_proposals_include_calibration_metadata(client):
    """Response carries player, mounted path strings."""
    session_id, calibration = _real_calibration(client)
    data = _get_proposals(client, session_id).get_json()
    # build_report() stores absolute paths; check the path ends with the expected sprite name
    assert data.get("player", "").endswith("player-0100.xp")
    assert data.get("mounted", "").endswith("wolfie-0100.xp")


# ---------------------------------------------------------------------------
# Error-path tests
# ---------------------------------------------------------------------------

def test_proposals_missing_session_id(client):
    resp = client.post(
        "/api/workbench/mounted-semantic/proposals",
        data=json.dumps({}),
        content_type="application/json",
    )
    assert resp.status_code == 400
    assert resp.get_json().get("code") == "missing_session_id"


def test_proposals_unknown_session_id(client):
    resp = _get_proposals(client, "nonexistent-session-id")
    assert resp.status_code == 404


def test_proposals_calibration_missing_player_xp(client):
    """Calibration record referencing a missing player_xp → 404."""
    session_id = _create_blank_session(client)
    bad_calibration = {
        "player_xp": "sprites/never_existed.xp",
        "mounted_xp": "sprites/wolfie-0100.xp",
        "per_angle": [{"angle": 0, "dx": 2, "dy": 1}],
        "confirmed_at": "2026-04-29T00:00:00Z",
    }
    _post_calibration(client, session_id, bad_calibration)
    resp = _get_proposals(client, session_id)
    assert resp.status_code == 404


# ---------------------------------------------------------------------------
# Semantic map validator tests (fg_region/bg_region cross-reference)
# ---------------------------------------------------------------------------


def _make_minimal_map(regions: list, cells: list[dict] | None = None) -> dict:
    """Build a minimal semantic map dict for testing dual-region references."""
    frame_regions = []
    for i, name in enumerate(regions):
        frame_regions.append({
            "name": name,
            "bbox": [0, 0, 0, 0],
            "confidence": "high",
            "palette_roles": [],
            "semantic_cells": [
                c for c in (cells or [])
                if c.get("parent_region", name) == name
            ],
        })
    return {
        "schema_version": "0.1.0",
        "family": "player",
        "reference_xp": "sprites/player-0100.xp",
        "semantic_layer": 2,
        "frame_w": 7,
        "frame_h": 10,
        "grid_layout": {"angles": 8, "projections": 2, "anim_counts": [1, 8], "frames_per_row": 9, "rows": 8},
        "palette_roles": {},
        "frames": {
            "0": {
                "angle": 0,
                "projection": 0,
                "anim_index": 0,
                "anim_name": "idle",
                "regions": frame_regions,
            }
        },
    }


def test_dual_region_ref_valid_reference_passes():
    """fg_region referencing a real region name passes validation."""
    from scripts.validate_semantic_maps import validate_dual_region_references

    cell = {
        "x": 3, "y": 2, "glyph": 220, "fg": "#000000", "bg": "#ffff55",
        "role": "face_cell",
        "fg_region": "face",
        "bg_region": "hair",
        "parent_region": "face",
    }
    map_data = _make_minimal_map(["face", "hair"], cells=[cell])
    errors: list[str] = []
    validate_dual_region_references(map_data, errors)
    assert not errors, f"Expected no errors, got: {errors}"


def test_dual_region_ref_invalid_fg_region_fails():
    """fg_region referencing a non-existent region name fails validation."""
    from scripts.validate_semantic_maps import validate_dual_region_references

    cell = {
        "x": 3, "y": 2, "glyph": 220, "fg": "#000000", "bg": "#ffff55",
        "role": "face_cell",
        "fg_region": "nonexistent_region",
        "parent_region": "face",
    }
    map_data = _make_minimal_map(["face", "hair"], cells=[cell])
    errors: list[str] = []
    validate_dual_region_references(map_data, errors)
    assert len(errors) >= 1
    assert "nonexistent_region" in errors[0]
    assert "does not match any region name" in errors[0]


def test_dual_region_ref_invalid_bg_region_fails():
    """bg_region referencing a non-existent region name fails validation."""
    from scripts.validate_semantic_maps import validate_dual_region_references

    cell = {
        "x": 3, "y": 2, "glyph": 220, "fg": "#000000", "bg": "#ffff55",
        "role": "face_cell",
        "bg_region": "missing_body_part",
        "parent_region": "face",
    }
    map_data = _make_minimal_map(["face", "hair"], cells=[cell])
    errors: list[str] = []
    validate_dual_region_references(map_data, errors)
    assert len(errors) >= 1
    assert "missing_body_part" in errors[0]


def test_dual_region_ref_both_invalid_fails():
    """Both fg_region and bg_region invalid produces two errors."""
    from scripts.validate_semantic_maps import validate_dual_region_references

    cell = {
        "x": 3, "y": 2, "glyph": 220, "fg": "#000000", "bg": "#ffff55",
        "role": "face_cell",
        "fg_region": "phanton_fg",
        "bg_region": "phanton_bg",
        "parent_region": "face",
    }
    map_data = _make_minimal_map(["face", "hair"], cells=[cell])
    errors: list[str] = []
    validate_dual_region_references(map_data, errors)
    assert len(errors) == 2


def test_dual_region_ref_empty_string_fails():
    """Empty string for fg_region/bg_region fails validation."""
    from scripts.validate_semantic_maps import validate_dual_region_references

    cell = {
        "x": 3, "y": 2, "glyph": 220, "fg": "#000000", "bg": "#ffff55",
        "role": "face_cell",
        "fg_region": "   ",
        "parent_region": "face",
    }
    map_data = _make_minimal_map(["face", "hair"], cells=[cell])
    errors: list[str] = []
    validate_dual_region_references(map_data, errors)
    assert len(errors) == 1


def test_dual_region_ref_no_refs_passes():
    """Cells without fg_region/bg_region pass validation."""
    from scripts.validate_semantic_maps import validate_dual_region_references

    cell = {
        "x": 3, "y": 2, "glyph": 220, "fg": "#000000", "bg": "#ffff55",
        "role": "face_cell",
        "parent_region": "face",
    }
    map_data = _make_minimal_map(["face", "hair"], cells=[cell])
    errors: list[str] = []
    validate_dual_region_references(map_data, errors)
    assert not errors


def test_dual_region_ref_multi_frame():
    """Validation checks frame-local region names (cross-frame refs are invalid)."""
    from scripts.validate_semantic_maps import validate_dual_region_references

    cell_frame1 = {
        "x": 3, "y": 2, "glyph": 220, "fg": "#000000", "bg": "#ffff55",
        "role": "face_cell",
        "bg_region": "hair",
        "parent_region": "face",
    }
    map_data = _make_minimal_map(["face"], cells=[cell_frame1])
    map_data["frames"]["1"] = {
        "angle": 1,
        "projection": 0,
        "anim_index": 0,
        "anim_name": "idle",
        "regions": [{
            "name": "face",
            "bbox": [0, 0, 0, 0],
            "confidence": "high",
            "palette_roles": [],
            "semantic_cells": [cell_frame1],
        }],
    }
    errors: list[str] = []
    validate_dual_region_references(map_data, errors)
    assert len(errors) >= 1
    assert "hair" in errors[0]
