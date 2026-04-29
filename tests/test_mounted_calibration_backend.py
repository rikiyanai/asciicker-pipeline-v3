"""Tests for the mounted-calibration compute endpoint and session persistence (U1, U3)."""
from __future__ import annotations

import json
from pathlib import Path

import pytest

from pipeline_v2.xp_codec import write_xp


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _post(client, payload: dict):
    return client.post(
        "/api/workbench/mounted-calibration/compute",
        data=json.dumps(payload),
        content_type="application/json",
    )


def _write_one_angle_xp(path: Path) -> Path:
    """Write a minimal 1x1 single-angle XP (glyph=0 at (0,0))."""
    path.parent.mkdir(parents=True, exist_ok=True)
    cells = [(0, (255, 255, 255), (255, 0, 255))]
    write_xp(path, 1, 1, [cells])
    return path


def _write_four_angle_xp(path: Path) -> Path:
    """Write a minimal 2x4 four-angle XP (glyph='4'=52 at (0,0))."""
    path.parent.mkdir(parents=True, exist_ok=True)
    # 2 wide × 4 tall = 8 cells; glyph '4' (=52) at index 0 → _digit_glyph → 4 angles, 2 projs
    cells = [(0, (255, 255, 255), (255, 0, 255))] * 8
    cells[0] = (52, (255, 255, 255), (0, 0, 0))
    write_xp(path, 2, 4, [cells])
    return path


# ---------------------------------------------------------------------------
# Happy-path tests (use real checked-in sprites)
# ---------------------------------------------------------------------------

def test_wolfie_calibration_returns_per_angle(client):
    """Standard wolfie/player pair returns a report with per-angle entries."""
    resp = _post(client, {
        "player_xp": "sprites/player-0100.xp",
        "mounted_xp": "sprites/wolfie-0100.xp",
    })
    assert resp.status_code == 200
    data = resp.get_json()
    assert isinstance(data.get("per_angle"), list)
    assert len(data["per_angle"]) > 0
    for entry in data["per_angle"]:
        assert "dx" in entry
        assert "dy" in entry
        assert "coverage" in entry
    assert "offset_x_by_angle" in data
    assert "offset_y_by_angle" in data


def test_wolfie_calibration_coverage_positive(client):
    """Wolfie/player canonical pair should yield at least one angle with coverage > 0."""
    resp = _post(client, {
        "player_xp": "sprites/player-0100.xp",
        "mounted_xp": "sprites/wolfie-0100.xp",
    })
    assert resp.status_code == 200
    data = resp.get_json()
    coverages = [e["coverage"] for e in data["per_angle"]]
    assert any(c > 0 for c in coverages), f"Expected coverage > 0 in at least one angle, got {coverages}"


def test_wolack_calibration_returns_report(client):
    """wolack-0001.xp + player-0100.xp returns a valid per-angle report."""
    resp = _post(client, {
        "player_xp": "sprites/player-0100.xp",
        "mounted_xp": "sprites/wolack-0001.xp",
    })
    assert resp.status_code == 200
    data = resp.get_json()
    assert isinstance(data.get("per_angle"), list)
    assert len(data["per_angle"]) > 0


def test_custom_search_bounds_narrow(client):
    """Custom bounds narrower than defaults constrain the reported offsets."""
    resp = _post(client, {
        "player_xp": "sprites/player-0100.xp",
        "mounted_xp": "sprites/wolfie-0100.xp",
        "min_dx": 0,
        "max_dx": 2,
        "min_dy": 0,
        "max_dy": 2,
    })
    assert resp.status_code == 200
    data = resp.get_json()
    for entry in data["per_angle"]:
        assert 0 <= entry["dx"] <= 2, f"dx {entry['dx']} outside [0,2]"
        assert 0 <= entry["dy"] <= 2, f"dy {entry['dy']} outside [0,2]"


def test_narrow_range_does_not_error(client):
    """A single-point search range (min==max) returns best-in-range without error."""
    resp = _post(client, {
        "player_xp": "sprites/player-0100.xp",
        "mounted_xp": "sprites/wolfie-0100.xp",
        "min_dx": 3,
        "max_dx": 3,
        "min_dy": 3,
        "max_dy": 3,
    })
    assert resp.status_code == 200
    data = resp.get_json()
    for entry in data["per_angle"]:
        assert entry["dx"] == 3
        assert entry["dy"] == 3


# ---------------------------------------------------------------------------
# Error-path tests
# ---------------------------------------------------------------------------

def test_missing_player_xp(client):
    resp = _post(client, {"mounted_xp": "sprites/wolfie-0100.xp"})
    assert resp.status_code == 400
    data = resp.get_json()
    assert "player_xp" in data.get("error", "") or data.get("code") == "missing_player_xp"


def test_missing_mounted_xp(client):
    resp = _post(client, {"player_xp": "sprites/player-0100.xp"})
    assert resp.status_code == 400
    data = resp.get_json()
    assert "mounted_xp" in data.get("error", "") or data.get("code") == "missing_mounted_xp"


def test_player_xp_not_found(client):
    resp = _post(client, {
        "player_xp": "sprites/nonexistent-player.xp",
        "mounted_xp": "sprites/wolfie-0100.xp",
    })
    assert resp.status_code == 404
    data = resp.get_json()
    assert "player_xp" in data.get("error", "")


def test_mounted_xp_not_found(client):
    resp = _post(client, {
        "player_xp": "sprites/player-0100.xp",
        "mounted_xp": "sprites/nonexistent-mount.xp",
    })
    assert resp.status_code == 404
    data = resp.get_json()
    assert "mounted_xp" in data.get("error", "")


def test_dotdot_in_player_path_rejected(client):
    resp = _post(client, {
        "player_xp": "../sprites/player-0100.xp",
        "mounted_xp": "sprites/wolfie-0100.xp",
    })
    assert resp.status_code == 400
    data = resp.get_json()
    assert data.get("code") == "invalid_player_xp"


def test_dotdot_in_mounted_path_rejected(client):
    resp = _post(client, {
        "player_xp": "sprites/player-0100.xp",
        "mounted_xp": "../sprites/wolfie-0100.xp",
    })
    assert resp.status_code == 400
    data = resp.get_json()
    assert data.get("code") == "invalid_mounted_xp"


def test_inverted_dx_bounds_returns_422(client):
    resp = _post(client, {
        "player_xp": "sprites/player-0100.xp",
        "mounted_xp": "sprites/wolfie-0100.xp",
        "min_dx": 5,
        "max_dx": 2,
    })
    assert resp.status_code == 422
    data = resp.get_json()
    assert "min_dx" in data.get("error", "") or data.get("code") == "invalid_bounds"


def test_inverted_dy_bounds_returns_422(client):
    resp = _post(client, {
        "player_xp": "sprites/player-0100.xp",
        "mounted_xp": "sprites/wolfie-0100.xp",
        "min_dy": 5,
        "max_dy": 1,
    })
    assert resp.status_code == 422
    data = resp.get_json()
    assert "min_dy" in data.get("error", "") or data.get("code") == "invalid_bounds"


# ---------------------------------------------------------------------------
# U3: Session round-trip tests
# ---------------------------------------------------------------------------

_SAMPLE_CALIBRATION = {
    "player_xp": "sprites/player-0100.xp",
    "mounted_xp": "sprites/wolfie-0100.xp",
    "accepted_dx": 2,
    "accepted_dy": 1,
    "accepted_angle": 0,
    "per_angle": [{"angle": 0, "dx": 2, "dy": 1, "coverage": 0.75}],
    "confirmed_at": "2026-04-29T00:00:00Z",
}

_SAMPLE_SEMANTIC_REVIEW = {
    "player_xp": "sprites/player-0100.xp",
    "mounted_xp": "sprites/wolfie-0100.xp",
    "calibration_record_ref": _SAMPLE_CALIBRATION,
    "per_angle_assignments": [],
    "confirmed_at": "2026-04-29T00:01:00Z",
}


def _create_blank_session(client) -> str:
    resp = client.post(
        "/api/workbench/create-blank-session",
        data=json.dumps({"template_set_key": "player_native_idle_only", "action_key": "idle"}),
        content_type="application/json",
    )
    assert resp.status_code == 201
    return resp.get_json()["session_id"]


def _load_session(client, session_id: str) -> dict:
    resp = client.post(
        "/api/workbench/load-session",
        data=json.dumps({"session_id": session_id}),
        content_type="application/json",
    )
    assert resp.status_code == 200
    return resp.get_json()


def test_session_without_calibration_loads_null(client):
    """A session with no calibration returns null for both fields on load."""
    session_id = _create_blank_session(client)
    data = _load_session(client, session_id)
    assert data.get("mounted_rider_calibration") is None
    assert data.get("mounted_semantic_review") is None


def test_calibration_record_round_trips(client):
    """POST calibration → load session → field value-identical."""
    session_id = _create_blank_session(client)
    resp = client.post(
        "/api/workbench/session/mounted-calibration",
        data=json.dumps({"session_id": session_id, "data": _SAMPLE_CALIBRATION}),
        content_type="application/json",
    )
    assert resp.status_code == 200

    loaded = _load_session(client, session_id)
    assert loaded.get("mounted_rider_calibration") == _SAMPLE_CALIBRATION


def test_semantic_review_record_round_trips(client):
    """POST semantic review → load session → field present."""
    session_id = _create_blank_session(client)
    resp = client.post(
        "/api/workbench/session/mounted-semantic-review",
        data=json.dumps({"session_id": session_id, "data": _SAMPLE_SEMANTIC_REVIEW}),
        content_type="application/json",
    )
    assert resp.status_code == 200

    loaded = _load_session(client, session_id)
    assert loaded.get("mounted_semantic_review") == _SAMPLE_SEMANTIC_REVIEW


def test_calibration_record_overwrite(client):
    """Overwriting a calibration record returns the latest value on load."""
    session_id = _create_blank_session(client)
    first = dict(_SAMPLE_CALIBRATION, accepted_dx=1)
    second = dict(_SAMPLE_CALIBRATION, accepted_dx=5)

    client.post(
        "/api/workbench/session/mounted-calibration",
        data=json.dumps({"session_id": session_id, "data": first}),
        content_type="application/json",
    )
    client.post(
        "/api/workbench/session/mounted-calibration",
        data=json.dumps({"session_id": session_id, "data": second}),
        content_type="application/json",
    )

    loaded = _load_session(client, session_id)
    assert loaded["mounted_rider_calibration"]["accepted_dx"] == 5


def test_calibration_malformed_data_rejected(client):
    """Non-dict data body returns 400 and does not mutate the session."""
    session_id = _create_blank_session(client)
    # Write a valid record first
    client.post(
        "/api/workbench/session/mounted-calibration",
        data=json.dumps({"session_id": session_id, "data": _SAMPLE_CALIBRATION}),
        content_type="application/json",
    )
    # Now try a non-dict data value
    resp = client.post(
        "/api/workbench/session/mounted-calibration",
        data=json.dumps({"session_id": session_id, "data": "not-an-object"}),
        content_type="application/json",
    )
    assert resp.status_code == 400

    loaded = _load_session(client, session_id)
    assert loaded["mounted_rider_calibration"] == _SAMPLE_CALIBRATION


def test_calibration_missing_session_id_rejected(client):
    resp = client.post(
        "/api/workbench/session/mounted-calibration",
        data=json.dumps({"data": _SAMPLE_CALIBRATION}),
        content_type="application/json",
    )
    assert resp.status_code == 400


def test_semantic_review_missing_session_id_rejected(client):
    resp = client.post(
        "/api/workbench/session/mounted-semantic-review",
        data=json.dumps({"data": _SAMPLE_SEMANTIC_REVIEW}),
        content_type="application/json",
    )
    assert resp.status_code == 400


# ---------------------------------------------------------------------------
# Pre-existing test (different angle counts)
# ---------------------------------------------------------------------------

def test_different_angle_counts_returns_400(client):
    """Mismatched angle counts between player and mounted XP yield 400."""
    from pipeline_v2.config import ROOT

    test_dir = ROOT / "data" / "calibration-test"
    one_angle_path = test_dir / "one_angle.xp"
    four_angle_path = test_dir / "four_angle.xp"

    _write_one_angle_xp(one_angle_path)
    _write_four_angle_xp(four_angle_path)

    resp = _post(client, {
        "player_xp": "data/calibration-test/one_angle.xp",
        "mounted_xp": "data/calibration-test/four_angle.xp",
    })
    assert resp.status_code == 400
    data = resp.get_json()
    assert data.get("code") == "calibration_error"
    assert "angle" in data.get("error", "").lower()
