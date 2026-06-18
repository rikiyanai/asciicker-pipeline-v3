"""FL-4162 — family topology contracts classify every visible layer fail-closed."""
import sys
from pathlib import Path

import pytest

PIPELINE_V3 = Path(__file__).resolve().parents[1]
if str(PIPELINE_V3 / "scripts") not in sys.path:
    sys.path.insert(0, str(PIPELINE_V3 / "scripts"))

import build_family_topology_contracts as tc  # noqa: E402


def _row(card_id, *, family="player", li=3, qc="clean_accept", fp=None,
         roles=None, supported=True, unresolved=False, is_overlay=True,
         engine_role=None):
    return {
        "card_id": card_id, "family": family, "raw_layer_index": li, "ahsw": [0, 1, 0, 0],
        "queue_class": qc, "whole_atlas_fingerprint": fp,
        "engine_is_overlay": is_overlay, "engine_fixed_role": engine_role,
        "agent_verdict": {
            "proposed_roles": roles if roles is not None else ["helmet"],
            "supported": supported, "unresolved": unresolved,
            "contradictions": [], "topology_note": "",
        },
    }


def test_classify_card_each_class():
    assert tc.classify_card(_row("a", roles=["helmet"])) == "owned"
    assert tc.classify_card(_row("b", roles=["armor", "shield"])) == "composite"
    assert tc.classify_card(
        _row("c", roles=["composite_source:armor_shield_context"])) == "rejected"
    assert tc.classify_card(
        _row("d", roles=["helmet"], supported=False, unresolved=True)) == "unresolved"


def test_classify_card_fails_closed_on_unclassifiable_verdict():
    # supported False but not unresolved, and no fragment role -> must not be guessed.
    with pytest.raises(tc.TopologyContractError, match="does not land"):
        tc.classify_card(_row("x", roles=["helmet"], supported=False, unresolved=False))


def test_build_and_validate_full_coverage():
    rows = [
        _row("player-0100-L2", li=2, is_overlay=False, engine_role="L2 base accumulator",
             roles=["player_body"]),
        _row("player-0100-L3", li=3, fp="FP1", roles=["player_helmet_regular"]),
        _row("player-0102-L3", li=3, fp="FP1", roles=["helmet"]),  # name conflict
        _row("player-0100-L4", li=4, roles=["armor", "shield"]),    # composite
        _row("wolfie-1000-L4", family="wolfie", li=4,
             roles=["composite_source:frag"]),                       # rejected
        _row("plydie-1101-L3", family="plydie", li=3, roles=["helmet"],
             supported=False, unresolved=True),                      # unresolved
    ]
    packet = {"reviewed": rows}
    doc = tc.build_contracts(packet)
    assert doc["summary"]["total_cards"] == 6
    assert doc["summary"]["class_counts"] == {
        "owned": 3, "composite": 1, "rejected": 1, "unresolved": 1}
    # Overlay role is variant-dependent: player L3 has two role names at one index.
    assert 3 in doc["contracts"]["player"]["overlay_role_binding"][
        "variant_dependent_overlay_indices"]
    # Pixel-identity name conflict is surfaced and left for a human pick.
    conflicts = doc["contracts"]["player"]["role_name_conflicts"]
    assert conflicts and conflicts[0]["resolution"] == "unresolved_canonical_name"
    # Independent validation passes with full coverage.
    result = tc.validate_contracts(doc, packet)
    assert result["ok"] is True
    assert result["covered_cards"] == 6
    assert doc["authority"] is False


def test_validate_fails_closed_when_a_card_is_dropped():
    rows = [
        _row("player-0100-L3", li=3, roles=["helmet"]),
        _row("player-0102-L3", li=3, roles=["helmet"]),
    ]
    packet = {"reviewed": rows}
    doc = tc.build_contracts(packet)
    # Simulate a contract that silently dropped a covered card.
    doc["contracts"]["player"]["per_card"] = doc["contracts"]["player"]["per_card"][:1]
    with pytest.raises(tc.TopologyContractError, match="validation FAILED"):
        tc.validate_contracts(doc, packet)
