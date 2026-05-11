from __future__ import annotations

from pathlib import Path


REPO_ROOT = Path(__file__).resolve().parents[1]
CANON_SPEC = REPO_ROOT / "docs" / "plans" / "2026-03-23-workbench-canonical-spec.md"
FAILURE_LOG = REPO_ROOT / "docs" / "PLAYWRIGHT_FAILURE_LOG.md"
WORKBENCH_JS = REPO_ROOT / "web" / "workbench.js"


def test_mounted_default_is_not_labeled_as_authoring_proof():
    canon = CANON_SPEC.read_text(encoding="utf-8")

    forbidden_phrases = [
        "mounted_default` = mounted-family proof",
        "mounted_default = mounted-family proof",
        "mounted_compose_parity_check.py --smoke satisfies UQ-008",
        "mounted_compose_parity_check.py --smoke closes UQ-008",
    ]

    for phrase in forbidden_phrases:
        assert phrase not in canon

    assert "mounted_default` = existing wrapper inventory / preview scope" in canon
    assert "mounted_authoring_e2e` = required UQ-008 proof lane" in canon
    assert "runtime selection of those generated rows" in canon
    assert "no-legacy-sprite-fallback evidence" in canon


def test_failure_log_defines_new_mounted_authoring_e2e_lane():
    failure_log = FAILURE_LOG.read_text(encoding="utf-8")

    required_phrases = [
        "Proof contract update (2026-05-11)",
        "mounted_authoring_e2e",
        "existing wrapper inventory OK",
        "generated mounted XP from pipeline-v3",
        "Y9-2 bundle rows with server-owned V2 IDs",
        "runtime parser acceptance",
        "select those generated rows at runtime",
        "no legacy sprite fallback",
    ]

    for phrase in required_phrases:
        assert phrase in failure_log


def test_browser_mounted_surfaces_call_artifact_routes_not_jitter_mutation():
    js = WORKBENCH_JS.read_text(encoding="utf-8")
    start = js.index("async function runMountedOverlayCalibration")
    end = js.index("function renderJitterInfo", start)
    mounted_slice = js[start:end]

    assert "/api/workbench/mounted-calibration/compute" in mounted_slice
    assert "/api/workbench/session/mounted-calibration" in mounted_slice
    assert "/api/workbench/mounted-semantic/proposals" in mounted_slice
    assert "/api/workbench/session/mounted-semantic-review" in mounted_slice
    assert "shiftFrameContents" not in mounted_slice
    assert "commitWholeSheetDocumentMutation" not in mounted_slice
