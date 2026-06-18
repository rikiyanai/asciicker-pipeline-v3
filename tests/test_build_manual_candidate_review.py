"""FL-4162 — the review-packet generator must not regress the Step 8 Law 6 fix.

The generator writes source_layer_review_decisions.jsonl. Its write path must be
fail-closed and upsert-preserving, exactly like decision_capture.record_decision:

  1. a corrupt/unreadable EXISTING decisions file blocks the write (never an
     overwrite that would erase a prior batch);
  2. an existing unrelated decision (from an earlier batch) SURVIVES the merge;
  3. a reviewed source_key updates exactly ONE row (no duplicate).
"""
import json
import sys
from pathlib import Path

import pytest

PIPELINE_V3 = Path(__file__).resolve().parents[1]
if str(PIPELINE_V3 / "scripts") not in sys.path:
    sys.path.insert(0, str(PIPELINE_V3 / "scripts"))

import decision_capture as dc  # noqa: E402
import build_manual_candidate_review as b  # noqa: E402

PROV = {"tool": "test", "recorded_at": "2026-06-18T00:00:00"}


def _rec(source_key: str, role: str) -> dict:
    """A proposal record for `source_key`, built through the real builder."""
    card = {
        "card_id": source_key, "source_key": source_key, "source_xp_path": "x.xp",
        "family": "fam", "raw_layer_index": 0, "source_final_sha256": "sha",
    }
    return dc.build_decision_record(card, approved_role=role, provenance=PROV)


def test_corrupt_existing_decisions_blocks_write(tmp_path):
    p = tmp_path / dc.DECISIONS_FILENAME
    p.write_text("{ this is not valid json\n", encoding="utf-8")
    with pytest.raises(dc.DecisionLoadError):
        b.merge_and_write_decisions(p, [_rec("bigbee-0000-L2", "bee_body")])
    # The corrupt file is left untouched — NOT overwritten by the new batch.
    assert p.read_text(encoding="utf-8") == "{ this is not valid json\n"


def test_existing_unrelated_decision_survives_merge(tmp_path):
    p = tmp_path / dc.DECISIONS_FILENAME
    b.merge_and_write_decisions(p, [_rec("batch1-keep", "old_role")])   # earlier batch
    merged = b.merge_and_write_decisions(p, [_rec("batch2-new", "new_role")])  # this batch
    assert set(merged) == {"batch1-keep", "batch2-new"}
    loaded = dc.load_decisions(p)
    assert loaded["batch1-keep"]["approved_role"] == "old_role"
    assert loaded["batch2-new"]["approved_role"] == "new_role"


def test_reviewed_source_key_updates_exactly_one_row(tmp_path):
    p = tmp_path / dc.DECISIONS_FILENAME
    b.merge_and_write_decisions(p, [_rec("x-L2", "first")])
    b.merge_and_write_decisions(p, [_rec("x-L2", "revised")])
    lines = [l for l in p.read_text(encoding="utf-8").splitlines() if l.strip()]
    assert len(lines) == 1, "upsert left more than one row for the same source_key"
    assert json.loads(lines[0])["approved_role"] == "revised"


def test_missing_file_starts_clean(tmp_path):
    p = tmp_path / dc.DECISIONS_FILENAME
    merged = b.merge_and_write_decisions(p, [_rec("only", "r")])
    assert set(merged) == {"only"}
    assert p.exists()


def _card_for(queue_class: str) -> dict:
    return {
        "card_id": "c-L3", "source_key": "c-L3", "source_xp_path": "x.xp",
        "family": "fam", "raw_layer_index": 3, "source_final_sha256": "sha",
        "review": {"queue_class_name": queue_class},
    }


def test_reject_decision_records_batch_reject():
    """A reject-batch row must carry provenance.batch=rejects-first/reject, not the
    batch-1 wrong_guess_reject value."""
    card = _card_for("reject")
    rec = dc.build_decision_record(card, approved_role="helmet", provenance=b._provenance_for(card))
    assert rec["review_provenance"]["batch"] == "rejects-first/reject"


def test_wrong_guess_decision_records_batch_wrong_guess_reject():
    card = _card_for("wrong_guess_reject")
    rec = dc.build_decision_record(card, approved_role="bee_body", provenance=b._provenance_for(card))
    assert rec["review_provenance"]["batch"] == "rejects-first/wrong_guess_reject"
