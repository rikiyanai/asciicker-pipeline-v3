from __future__ import annotations

import copy
import pytest
from pathlib import Path

from pipeline_v2.service import (
    _normalize_template_action_spec,
    _normalize_template_registry,
    _reset_template_registry_cache,
    load_template_registry,
)


REPO_ROOT = Path(__file__).resolve().parents[1]


@pytest.fixture(autouse=True)
def reset_registry_cache():
    _reset_template_registry_cache()
    yield
    _reset_template_registry_cache()


def test_template_registry_actions_are_normalized():
    registry = load_template_registry()

    assert registry["schema_version"] == 2

    required_fields = {
        "filename_prefix",
        "skin_family",
        "preview_xp",
        "preview_xp_sha256",
        "l0_ref",
        "l0_ref_sha256",
    }

    for template_set in registry["template_sets"].values():
        for action in template_set["actions"].values():
            assert required_fields.issubset(action.keys())
            assert action["family"] == action["filename_prefix"]
            assert action["skin_family"] in registry["skin_family_scope"]


def test_template_registry_reference_paths_exist():
    registry = load_template_registry()

    for template_set in registry["template_sets"].values():
        for action in template_set["actions"].values():
            assert (REPO_ROOT / action["preview_xp"]).exists()
            assert (REPO_ROOT / action["l0_ref"]).exists()

    for prefix_spec in registry["prefix_catalog"].values():
        assert (REPO_ROOT / prefix_spec["preview_xp"]).exists()
        assert (REPO_ROOT / prefix_spec["l0_ref"]).exists()


def test_template_registry_mounted_scope_is_explicit():
    registry = load_template_registry()

    human_scope = registry["skin_family_scope"]["human"]
    assert human_scope["mounted_prefixes"] == ["wolfie", "wolack"]
    assert human_scope["deferred_prefixes"] == ["bigbee"]

    wolfie = registry["prefix_catalog"]["wolfie"]
    wolack = registry["prefix_catalog"]["wolack"]
    bigbee = registry["prefix_catalog"]["bigbee"]

    assert wolfie["mounted"] is True
    assert wolfie["authorable"] is False
    assert wolfie["status"] == "specified_not_authorable"

    assert wolack["mounted"] is True
    assert wolack["authorable"] is False
    assert wolack["status"] == "specified_not_authorable"

    assert bigbee["mounted"] is True
    assert bigbee["authorable"] is False
    assert bigbee["status"] == "deferred"


def test_templates_api_exposes_normalized_contract(client):
    response = client.get("/api/workbench/templates")
    assert response.status_code == 200

    payload = response.get_json()
    assert "enabled_families" not in payload

    idle = payload["template_sets"]["player_native_idle_only"]["actions"]["idle"]

    assert idle["filename_prefix"] == "player"
    assert idle["skin_family"] == "human"
    assert idle["preview_xp"].endswith("player-0001.xp")
    assert idle["l0_ref"].endswith("player-0100.xp")

    human_scope = payload["skin_family_scope"]["human"]
    assert human_scope["mounted_prefixes"] == ["wolfie", "wolack"]


# --- Normalizer unit tests ---

_VALID_SPEC = {
    "filename_prefix": "player",
    "skin_family": "human",
    "preview_xp": "sprites/player-0001.xp",
    "preview_xp_sha256": "abc123",
    "l0_ref": "sprites/player-0100.xp",
    "l0_ref_sha256": "def456",
    "required": True,
}


@pytest.mark.parametrize("missing_field", [
    "filename_prefix",
    "skin_family",
    "l0_ref",
    "l0_ref_sha256",
])
def test_normalize_action_spec_raises_on_missing_required_field(missing_field):
    """Fields with no fallback must raise ValueError when absent."""
    spec = {k: v for k, v in _VALID_SPEC.items() if k != missing_field}
    with pytest.raises(ValueError, match=missing_field):
        _normalize_template_action_spec("player_native_full", "idle", spec)


def test_normalize_action_spec_raises_when_no_preview_xp_source():
    """preview_xp raises only when both preview_xp and its l0_ref fallback are absent."""
    spec = {k: v for k, v in _VALID_SPEC.items() if k not in ("preview_xp", "preview_xp_sha256", "l0_ref", "l0_ref_sha256")}
    with pytest.raises(ValueError):
        _normalize_template_action_spec("player_native_full", "idle", spec)


def test_normalize_action_spec_v1_family_fallback():
    """v1 spec using 'family' instead of 'filename_prefix' is normalized correctly."""
    spec = {k: v for k, v in _VALID_SPEC.items() if k != "filename_prefix"}
    spec["family"] = "player"
    result = _normalize_template_action_spec("player_native_full", "idle", spec)
    assert result["filename_prefix"] == "player"
    assert result["family"] == "player"


def test_normalize_action_spec_preview_xp_fallback_to_l0_ref():
    """When preview_xp is absent, preview_xp_sha256 follows the same l0_ref fallback."""
    spec = {k: v for k, v in _VALID_SPEC.items() if k != "preview_xp"}
    result = _normalize_template_action_spec("player_native_full", "idle", spec)
    assert result["preview_xp"] == spec["l0_ref"]
    assert result["preview_xp_sha256"] == spec["l0_ref_sha256"]
    assert result["preview_xp_sha256"] == spec["l0_ref_sha256"]


def test_normalize_template_registry_rejects_prefix_catalog_sha_drift():
    """prefix_catalog sha fields must stay aligned with the matching template action entries."""
    registry = copy.deepcopy(load_template_registry())
    registry["prefix_catalog"]["player"]["preview_xp_sha256"] = "0" * 64

    with pytest.raises(ValueError, match="prefix_catalog.*preview_xp_sha256"):
        _normalize_template_registry(registry)


def test_normalize_registry_missing_file_returns_schema_version_2(tmp_path, monkeypatch):
    """load_template_registry returns schema_version 2 even when the config file is absent."""
    import pipeline_v2.service as svc
    monkeypatch.setattr(svc, "CONFIG_DIR", tmp_path)
    _reset_template_registry_cache()
    try:
        registry = svc.load_template_registry()
        assert registry["schema_version"] == 2
        assert registry["template_sets"] == {}
    finally:
        _reset_template_registry_cache()
