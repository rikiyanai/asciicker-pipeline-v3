from __future__ import annotations

from pathlib import Path

from pipeline_v2.service import load_template_registry


REPO_ROOT = Path(__file__).resolve().parents[1]


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
            assert action["skin_family"] == "human"


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
