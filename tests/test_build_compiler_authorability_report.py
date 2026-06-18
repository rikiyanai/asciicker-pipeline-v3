"""FL-4162 step 10a — authorability report decides every layer fail-closed."""
import sys
from pathlib import Path

import pytest

PIPELINE_V3 = Path(__file__).resolve().parents[1]
if str(PIPELINE_V3 / "scripts") not in sys.path:
    sys.path.insert(0, str(PIPELINE_V3 / "scripts"))

import build_compiler_authorability_report as ar  # noqa: E402


def _contracts(per_card, family="player"):
    return {"contracts": {family: {"card_count": len(per_card), "per_card": per_card}}}


def _reqs(rows):
    return {"requirements": rows}


def test_owned_no_blockers_is_content_clean():
    contracts = _contracts([{"card_id": "player-0100-L3", "classification": "owned"}])
    reqs = _reqs([{"source_key": "player-0100-L3", "promotion_blockers": list(ar.PHASE_GATES)}])
    report = ar.build_report(contracts, reqs)
    assert report["summary"]["content_clean"] == 1
    assert report["layers"][0]["content_status"] == "content_clean"
    # Phase gates still apply — content_clean is not closure.
    assert report["layers"][0]["phase_gated"] is True
    assert report["authority"] is False


def test_role_name_conflict_blocks_with_plan_class_3():
    contracts = _contracts([{"card_id": "player-0100-L3", "classification": "owned"}])
    reqs = _reqs([{"source_key": "player-0100-L3",
                   "promotion_blockers": [*ar.PHASE_GATES, "role_name_conflict_unresolved"]}])
    report = ar.build_report(contracts, reqs)
    assert report["summary"]["content_clean"] == 0
    assert report["summary"]["blocked_by_plan_rejection_class"]["3_role_name_conflict"] == 1


def test_composite_blocks_with_plan_class_4():
    contracts = _contracts([{"card_id": "p-L4", "classification": "composite"}])
    reqs = _reqs([{"source_key": "p-L4",
                   "promotion_blockers": [*ar.PHASE_GATES, "composite_layer_requires_family_contract"]}])
    report = ar.build_report(contracts, reqs)
    assert report["summary"]["blocked_by_plan_rejection_class"]["4_topology_mismatch"] == 1
    assert report["layers"][0]["content_status"] == "content_blocked"


def test_unresolved_and_rejected_map_to_unowned_class_2():
    contracts = _contracts([
        {"card_id": "p-L3", "classification": "unresolved"},
        {"card_id": "p-L4", "classification": "rejected"},
    ])
    report = ar.build_report(contracts, _reqs([]))  # no requirements for these
    assert report["summary"]["blocked_by_plan_rejection_class"]["2_unowned_visible_layer"] == 2
    assert report["summary"]["content_clean"] == 0


def test_non_accept_status_blocks_but_has_no_hard_plan_class():
    contracts = _contracts([{"card_id": "p-L3", "classification": "owned"}])
    reqs = _reqs([{"source_key": "p-L3",
                   "promotion_blockers": [*ar.PHASE_GATES, "decision_from_non_accept_hand_status"]}])
    report = ar.build_report(contracts, reqs)
    assert report["summary"]["content_clean"] == 0
    assert report["summary"]["content_blocked_by_reason"][
        "proposal_from_non_accept_hand_status"] == 1
    # It is a content-confidence block, not one of the hard rejection classes.
    assert "proposal_from_non_accept_hand_status" not in report["summary"][
        "blocked_by_plan_rejection_class"]


def test_unknown_classification_fails_closed():
    contracts = _contracts([{"card_id": "p-L3", "classification": "mystery"}])
    with pytest.raises(ar.AuthorabilityReportError, match="unknown classification"):
        ar.build_report(contracts, _reqs([]))


def test_coverage_mismatch_fails_closed():
    contracts = {"contracts": {"player": {
        "card_count": 5,  # lies: only one per_card entry
        "per_card": [{"card_id": "p-L3", "classification": "owned"}],
    }}}
    with pytest.raises(ar.AuthorabilityReportError, match="covered 1 layers but contract declares 5"):
        ar.build_report(contracts, _reqs([{"source_key": "p-L3", "promotion_blockers": []}]))


def test_missing_input_fails_closed(tmp_path):
    with pytest.raises(ar.AuthorabilityReportError, match="required topology contracts missing"):
        ar._load_json(tmp_path / "nope.json", "topology contracts")
