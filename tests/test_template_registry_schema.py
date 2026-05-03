from __future__ import annotations

import copy
import pytest
from pathlib import Path

from pipeline_v2.service import (
    _action_override_names,
    _normalize_template_action_spec,
    _normalize_template_registry,
    _reset_template_registry_cache,
    _termpp_skin_override_names,
    get_registry_status,
    is_action_authorized,
    is_prefix_authorized,
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


def test_normalize_action_spec_preview_xp_fail_closed():
    """When preview_xp is absent, normalization raises ValueError instead of falling back to l0_ref."""
    spec = {k: v for k, v in _VALID_SPEC.items() if k != "preview_xp"}
    with pytest.raises(ValueError, match="preview_xp"):
        _normalize_template_action_spec("player_native_full", "idle", spec)


def test_normalize_template_registry_rejects_prefix_catalog_sha_drift():
    """prefix_catalog sha fields must stay aligned with the matching template action entries."""
    registry = copy.deepcopy(load_template_registry())
    registry["prefix_catalog"]["player"]["preview_xp_sha256"] = "0" * 64

    with pytest.raises(ValueError, match="prefix_catalog.*preview_xp_sha256"):
        _normalize_template_registry(registry)


def test_normalize_registry_missing_file_returns_schema_version_2(tmp_path, monkeypatch):
    """load_template_registry returns empty dict when config file absent, without caching."""
    import pipeline_v2.service as svc
    monkeypatch.setattr(svc, "CONFIG_DIR", tmp_path)
    _reset_template_registry_cache()
    try:
        registry = svc.load_template_registry()
        assert registry["schema_version"] == 2
        assert registry["template_sets"] == {}
        # The empty dict is returned but NOT cached — _template_registry stays None
        assert svc._template_registry is None
        # _registry_load_error is set so get_registry_status surfaces the problem
        assert svc._registry_load_error is not None
        assert "not found" in svc._registry_load_error
        # Subsequent call also retries (not cached)
        registry2 = svc.load_template_registry()
        assert registry2["schema_version"] == 2
    finally:
        _reset_template_registry_cache()


# --- Registry-derived authority helper tests (UQ-004 / S2-R1) ---

_AUTHORABLE_REGISTRY = {
    "skin_family_scope": {
        "human": {"authorable": True, "proof_only": False},
        "color_variant": {"authorable": False, "proof_only": True},
    },
    "prefix_catalog": {
        "player": {"filename_prefix": "player", "skin_family": "human", "authorable": True, "mounted": False},
        "wolfie": {"filename_prefix": "wolfie", "skin_family": "human", "authorable": False, "mounted": True, "status": "specified_not_authorable"},
        "bigbee": {"filename_prefix": "bigbee", "skin_family": "human", "authorable": False, "mounted": True, "status": "deferred"},
        "player-cv": {"filename_prefix": "player-cv", "skin_family": "color_variant", "authorable": False},
    },
}


def test_is_action_authorized_happy_path():
    spec = {"filename_prefix": "player", "skin_family": "human"}
    ok, reason = is_action_authorized(spec, _AUTHORABLE_REGISTRY)
    assert ok is True
    assert reason == ""


def test_is_action_authorized_proof_only_scope():
    spec = {"filename_prefix": "player-cv", "skin_family": "color_variant"}
    ok, reason = is_action_authorized(spec, _AUTHORABLE_REGISTRY)
    assert ok is False
    assert "proof_only" in reason


def test_is_action_authorized_mounted_not_authorable():
    spec = {"filename_prefix": "wolfie", "skin_family": "human"}
    ok, reason = is_action_authorized(spec, _AUTHORABLE_REGISTRY)
    assert ok is False
    assert "not authorable" in reason


def test_is_action_authorized_deferred_not_authorable():
    spec = {"filename_prefix": "bigbee", "skin_family": "human"}
    ok, reason = is_action_authorized(spec, _AUTHORABLE_REGISTRY)
    assert ok is False
    assert "not authorable" in reason


def test_is_action_authorized_missing_prefix():
    spec = {"skin_family": "human"}
    ok, reason = is_action_authorized(spec, _AUTHORABLE_REGISTRY)
    assert ok is False
    assert "missing filename_prefix" in reason


def test_is_action_authorized_unknown_skin_family():
    spec = {"filename_prefix": "player", "skin_family": "alien"}
    ok, reason = is_action_authorized(spec, _AUTHORABLE_REGISTRY)
    assert ok is False
    assert "skin_family" in reason


def test_is_action_authorized_none_spec():
    ok, reason = is_action_authorized(None, _AUTHORABLE_REGISTRY)
    assert ok is False
    assert "None" in reason


def test_is_action_authorized_empty_registry():
    spec = {"filename_prefix": "player", "skin_family": "human"}
    ok, reason = is_action_authorized(spec, {})
    assert ok is False


def test_is_action_authorized_family_fallback():
    """Spec using legacy 'family' field instead of 'filename_prefix' still works."""
    spec = {"family": "player", "skin_family": "human"}
    ok, reason = is_action_authorized(spec, _AUTHORABLE_REGISTRY)
    assert ok is True


def test_is_action_authorized_respects_template_set_scope():
    spec = {"filename_prefix": "player", "skin_family": "human"}
    ok, reason = is_action_authorized(
        spec,
        _AUTHORABLE_REGISTRY,
        template_set={"skin_family_scope": ["beast"]},
        template_set_key="player_native_full",
        action_key="idle",
    )
    assert ok is False
    assert "template set scope" in reason


def test_is_action_authorized_respects_template_action_linkage():
    registry = copy.deepcopy(_AUTHORABLE_REGISTRY)
    registry["prefix_catalog"]["player"]["template_actions"] = [
        {"template_set_key": "player_native_full", "action_key": "idle"},
    ]
    spec = {"filename_prefix": "player", "skin_family": "human"}
    ok, reason = is_action_authorized(
        spec,
        registry,
        template_set={"skin_family_scope": ["human"]},
        template_set_key="player_native_full",
        action_key="attack",
    )
    assert ok is False
    assert "not linked" in reason


def test_is_prefix_authorized_happy_path():
    ok, reason = is_prefix_authorized("player", _AUTHORABLE_REGISTRY)
    assert ok is True
    assert reason == ""


def test_is_prefix_authorized_mounted():
    ok, reason = is_prefix_authorized("wolfie", _AUTHORABLE_REGISTRY)
    assert ok is False
    assert "not authorable" in reason


def test_is_prefix_authorized_empty_prefix():
    ok, reason = is_prefix_authorized("", _AUTHORABLE_REGISTRY)
    assert ok is False
    assert "empty" in reason


def test_is_prefix_authorized_unknown_prefix():
    ok, reason = is_prefix_authorized("nonexistent", _AUTHORABLE_REGISTRY)
    assert ok is False
    assert "not in prefix_catalog" in reason


# --- Session normalization tests (UQ-004 / S2-R1 / R3) ---


def test_new_blank_session_has_normalized_fields(client):
    """Newly created blank session includes filename_prefix and skin_family."""
    resp = client.post("/api/workbench/create-blank-session", json={
        "template_set_key": "player_native_idle_only",
        "action_key": "idle",
    })
    assert resp.status_code == 201
    data = resp.get_json()
    assert data["filename_prefix"] == "player"
    assert data["skin_family"] == "human"
    assert data["family"] == "player"


def test_session_payload_emits_normalized_fields(client):
    """Session payload includes filename_prefix and skin_family alongside family."""
    resp = client.post("/api/workbench/create-blank-session", json={
        "template_set_key": "player_native_idle_only",
        "action_key": "idle",
    })
    data = resp.get_json()
    session_id = data["session_id"]
    # Load session via POST
    load_resp = client.post("/api/workbench/load-session", json={"session_id": session_id})
    assert load_resp.status_code == 200
    load_data = load_resp.get_json()
    assert load_data["filename_prefix"] == "player"
    assert load_data["skin_family"] == "human"
    assert load_data["family"] == "player"


# --- Registry error surfacing tests (UQ-004 / S2-R2 / R4) ---


def test_templates_api_includes_registry_status(client):
    """API response includes registry_status field."""
    response = client.get("/api/workbench/templates")
    assert response.status_code == 200
    payload = response.get_json()
    assert "registry_status" in payload


def test_templates_api_clean_registry_has_empty_status(client):
    """Clean registry load produces empty registry_status."""
    response = client.get("/api/workbench/templates")
    payload = response.get_json()
    status = payload["registry_status"]
    # No load_error, no l0_errors for the valid registry
    assert "load_error" not in status


def test_templates_api_missing_registry_shows_load_error(tmp_path, monkeypatch, client):
    """Missing registry file returns 503 with registry_status load_error."""
    import pipeline_v2.service as svc
    monkeypatch.setattr(svc, "CONFIG_DIR", tmp_path)
    _reset_template_registry_cache()
    try:
        response = client.get("/api/workbench/templates")
        assert response.status_code == 503
        payload = response.get_json()
        assert payload["template_sets"] == {}
        assert "load_error" in payload["registry_status"]
        assert "not found" in payload["registry_status"]["load_error"]
    finally:
        _reset_template_registry_cache()


def test_save_session_normalizes_legacy_family(client):
    """Saving a legacy session (no filename_prefix) enriches it with normalized fields."""
    # Create a template-owned session (has filename_prefix from creation)
    create_resp = client.post("/api/workbench/create-blank-session", json={
        "template_set_key": "player_native_idle_only",
        "action_key": "idle",
    })
    data = create_resp.get_json()
    session_id = data["session_id"]

    # Simulate a legacy session by removing filename_prefix from disk
    import pipeline_v2.service as svc
    sess_path = svc._session_path(session_id)
    sess = svc.load_json(sess_path)
    del sess["filename_prefix"]
    del sess["skin_family"]
    svc.save_json(sess_path, sess)

    # Save the session (triggers lazy normalization)
    save_resp = client.post("/api/workbench/save-session", json={
        "session_id": session_id,
    })
    assert save_resp.status_code == 200
    save_data = save_resp.get_json()
    assert save_data["filename_prefix"] == "player"
    assert save_data["skin_family"] == "human"
    assert save_data["family"] == "player"

    # Verify it persisted to disk
    load_resp = client.post("/api/workbench/load-session", json={"session_id": session_id})
    load_data = load_resp.get_json()
    assert load_data["filename_prefix"] == "player"
    assert load_data["skin_family"] == "human"


def test_load_session_normalizes_legacy_family_without_save(client):
    """Loading a legacy session resolves normalized identity fields on read."""
    create_resp = client.post("/api/workbench/create-blank-session", json={
        "template_set_key": "player_native_idle_only",
        "action_key": "idle",
    })
    data = create_resp.get_json()
    session_id = data["session_id"]

    import pipeline_v2.service as svc
    sess_path = svc._session_path(session_id)
    sess = svc.load_json(sess_path)
    del sess["filename_prefix"]
    del sess["skin_family"]
    svc.save_json(sess_path, sess)

    load_resp = client.post("/api/workbench/load-session", json={"session_id": session_id})
    assert load_resp.status_code == 200
    load_data = load_resp.get_json()
    assert load_data["filename_prefix"] == "player"
    assert load_data["skin_family"] == "human"
    assert load_data["family"] == "player"


def test_save_session_normalizes_missing_skin_family_when_prefix_exists(client):
    """Saving resolves skin_family even if filename_prefix was already present."""
    create_resp = client.post("/api/workbench/create-blank-session", json={
        "template_set_key": "player_native_idle_only",
        "action_key": "idle",
    })
    data = create_resp.get_json()
    session_id = data["session_id"]

    import pipeline_v2.service as svc
    sess_path = svc._session_path(session_id)
    sess = svc.load_json(sess_path)
    del sess["skin_family"]
    svc.save_json(sess_path, sess)

    save_resp = client.post("/api/workbench/save-session", json={"session_id": session_id})
    assert save_resp.status_code == 200
    save_data = save_resp.get_json()
    assert save_data["filename_prefix"] == "player"
    assert save_data["skin_family"] == "human"


def test_templates_api_malformed_registry_shows_load_error(tmp_path, monkeypatch, client):
    """Malformed JSON in registry returns 503 with registry_status load_error."""
    import pipeline_v2.service as svc
    (tmp_path / "template_registry.json").write_text("{ not valid json }", encoding="utf-8")
    monkeypatch.setattr(svc, "CONFIG_DIR", tmp_path)
    _reset_template_registry_cache()
    try:
        response = client.get("/api/workbench/templates")
        assert response.status_code == 503
        payload = response.get_json()
        assert payload["template_sets"] == {}
        assert "load_error" in payload["registry_status"]
        assert "malformed" in payload["registry_status"]["load_error"]
    finally:
        _reset_template_registry_cache()


# ── Override-name registry derivation tests ──────────────────────────────────


def test_termpp_skin_override_names_count_matches_expected():
    """Override names from registry produce exactly 105 names with correct per-prefix counts."""
    registry = load_template_registry()
    names = _termpp_skin_override_names(registry)
    assert len(names) == 105
    assert "player-nude.xp" in names
    assert names.count("player-nude.xp") == 1
    # Per-prefix counts: player=25 (24+nude), attack=16, plydie=24, wolfie=24, wolack=16
    player_names = [n for n in names if n.startswith("player-")]
    attack_names = [n for n in names if n.startswith("attack-")]
    plydie_names = [n for n in names if n.startswith("plydie-")]
    wolfie_names = [n for n in names if n.startswith("wolfie-")]
    wolack_names = [n for n in names if n.startswith("wolack-")]
    assert len(player_names) == 25
    assert len(attack_names) == 16
    assert len(plydie_names) == 24
    assert len(wolfie_names) == 24
    assert len(wolack_names) == 16


def test_termpp_skin_override_names_matches_action_override_names():
    """Every name from _termpp_skin_override_names equals the union of
    _action_override_names applied to each prefix_catalog entry with ahsw_range."""
    registry = load_template_registry()
    names = _termpp_skin_override_names(registry)
    expected: list[str] = []
    for prefix_key, prefix_spec in registry["prefix_catalog"].items():
        ahsw_range = (prefix_spec.get("ahsw_range") or "").strip()
        if not ahsw_range:
            continue
        expected.extend(_action_override_names(prefix_key, ahsw_range))
    assert sorted(names) == sorted(expected)


def test_termpp_skin_override_names_mutation_proves_registry_derivation():
    """Changing ahsw_range in prefix_catalog changes the override name output —
    proves the function derives from registry, not from hardcoded values."""
    registry = copy.deepcopy(load_template_registry())
    original = _termpp_skin_override_names(registry)
    original_attack_count = len([n for n in original if n.startswith("attack-")])
    assert original_attack_count == 16  # weapon_gte_1

    # Mutate attack to all_16
    registry["prefix_catalog"]["attack"]["ahsw_range"] = "all_16"
    mutated = _termpp_skin_override_names(registry)
    mutated_attack_count = len([n for n in mutated if n.startswith("attack-")])
    assert mutated_attack_count == 24  # all_16
    assert len(mutated) == 113  # 105 - 16 + 24


def test_termpp_skin_override_names_removal_excludes_prefix():
    """Removing ahsw_range from a prefix_catalog entry excludes that prefix
    from override name generation."""
    registry = copy.deepcopy(load_template_registry())
    del registry["prefix_catalog"]["wolfie"]["ahsw_range"]
    names = _termpp_skin_override_names(registry)
    wolfie_names = [n for n in names if n.startswith("wolfie-")]
    assert len(wolfie_names) == 0
    assert len(names) == 81  # 105 - 24


def test_termpp_skin_override_names_empty_registry():
    """Empty registry produces no names."""
    names = _termpp_skin_override_names({})
    assert names == []


def test_normalizer_catches_ahsw_range_drift():
    """Normalizer raises ValueError when prefix_catalog ahsw_range disagrees
    with the linked action spec ahsw_range."""
    import json
    reg_path = REPO_ROOT / "config" / "template_registry.json"
    raw = json.loads(reg_path.read_text(encoding="utf-8"))
    # Introduce drift: player prefix says weapon_gte_1, action says all_16
    raw["prefix_catalog"]["player"]["ahsw_range"] = "weapon_gte_1"
    with pytest.raises(ValueError, match="ahsw_range.*drifted"):
        _normalize_template_registry(raw)


def test_normalizer_skips_ahsw_range_check_for_empty_template_actions():
    """Prefixes with empty template_actions (wolfie/wolack) are not drift-checked
    for ahsw_range — they are sole-source. Verify no error is raised."""
    import json
    reg_path = REPO_ROOT / "config" / "template_registry.json"
    raw = json.loads(reg_path.read_text(encoding="utf-8"))
    # Even if wolfie has a different ahsw_range, no error because no linked actions
    raw["prefix_catalog"]["wolfie"]["ahsw_range"] = "weapon_gte_1"
    # Should not raise — wolfie has template_actions: []
    result = _normalize_template_registry(raw)
    assert result["prefix_catalog"]["wolfie"]["ahsw_range"] == "weapon_gte_1"
