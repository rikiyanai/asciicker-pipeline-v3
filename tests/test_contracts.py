from __future__ import annotations

import json
from pathlib import Path


def _upload(client, path: Path, prefix: str = ""):
    with path.open("rb") as f:
        resp = client.post(f"{prefix}/api/upload", data={"file": (f, path.name)}, content_type="multipart/form-data")
    return resp


# --- Root-hosted tests (original, backward-compatible) ---


def test_upload_contract(client):
    fixture = Path(__file__).parent / "fixtures" / "known_good" / "cat_sheet.png"
    resp = _upload(client, fixture)
    assert resp.status_code == 201
    data = resp.get_json()
    for k in ("upload_id", "source_path", "width", "height", "sha256"):
        assert k in data
    assert data["width"] == 192
    assert data["height"] == 48


def test_analyze_contract(client):
    fixture = Path(__file__).parent / "fixtures" / "known_good" / "cat_sheet.png"
    up = _upload(client, fixture).get_json()
    resp = client.post("/api/analyze", data=json.dumps({"source_path": up["source_path"]}), content_type="application/json")
    assert resp.status_code == 200
    data = resp.get_json()
    for k in ("image_w", "image_h", "suggested_angles", "suggested_frames", "suggested_cell_w", "suggested_cell_h", "confidence", "diagnostics"):
        assert k in data


def test_run_contract(client):
    fixture = Path(__file__).parent / "fixtures" / "known_good" / "cat_sheet.png"
    up = _upload(client, fixture).get_json()
    payload = {
        "source_path": up["source_path"],
        "name": "cat",
        "angles": 1,
        "frames": "8",
        "source_projs": 1,
        "render_resolution": 24,
        "native_compat": False,
    }
    resp = client.post("/api/run", data=json.dumps(payload), content_type="application/json")
    assert resp.status_code == 200
    data = resp.get_json()
    for k in ("job_id", "state", "xp_path", "preview_paths", "metadata", "gate_report_path", "trace_path"):
        assert k in data
    assert Path(data["xp_path"]).exists()
    assert Path(data["gate_report_path"]).exists()


def test_error_contract_invalid_run(client):
    payload = {"source_path": "/tmp/nope.png", "name": "x", "angles": 1, "frames": "1"}
    resp = client.post("/api/run", data=json.dumps(payload), content_type="application/json")
    assert resp.status_code in (404, 422)
    data = resp.get_json()
    for k in ("error", "code", "stage", "request_id"):
        assert k in data


# --- Base-path-parameterized tests (root + /xpedit) ---


def test_upload_contract_hosted(hosted_client):
    client, prefix = hosted_client
    fixture = Path(__file__).parent / "fixtures" / "known_good" / "cat_sheet.png"
    resp = _upload(client, fixture, prefix)
    assert resp.status_code == 201
    data = resp.get_json()
    for k in ("upload_id", "source_path", "width", "height", "sha256"):
        assert k in data
    assert data["width"] == 192
    assert data["height"] == 48


def test_analyze_contract_hosted(hosted_client):
    client, prefix = hosted_client
    fixture = Path(__file__).parent / "fixtures" / "known_good" / "cat_sheet.png"
    up = _upload(client, fixture, prefix).get_json()
    resp = client.post(f"{prefix}/api/analyze", data=json.dumps({"source_path": up["source_path"]}), content_type="application/json")
    assert resp.status_code == 200
    data = resp.get_json()
    for k in ("image_w", "image_h", "suggested_angles", "suggested_frames", "suggested_cell_w", "suggested_cell_h", "confidence", "diagnostics"):
        assert k in data


def test_run_contract_hosted(hosted_client):
    client, prefix = hosted_client
    fixture = Path(__file__).parent / "fixtures" / "known_good" / "cat_sheet.png"
    up = _upload(client, fixture, prefix).get_json()
    payload = {
        "source_path": up["source_path"],
        "name": "cat",
        "angles": 1,
        "frames": "8",
        "source_projs": 1,
        "render_resolution": 24,
        "native_compat": False,
    }
    resp = client.post(f"{prefix}/api/run", data=json.dumps(payload), content_type="application/json")
    assert resp.status_code == 200
    data = resp.get_json()
    for k in ("job_id", "state", "xp_path", "preview_paths", "metadata", "gate_report_path", "trace_path"):
        assert k in data
    assert Path(data["xp_path"]).exists()
    assert Path(data["gate_report_path"]).exists()


def test_error_contract_hosted(hosted_client):
    client, prefix = hosted_client
    payload = {"source_path": "/tmp/nope.png", "name": "x", "angles": 1, "frames": "1"}
    resp = client.post(f"{prefix}/api/run", data=json.dumps(payload), content_type="application/json")
    assert resp.status_code in (404, 422)
    data = resp.get_json()
    for k in ("error", "code", "stage", "request_id"):
        assert k in data


# --- Legacy runtime lane regression guard ---
# These tests verify the wiring for the external diagnostic lane
# (native TERM++ launch + legacy_verify_e2e) still exists. The lane
# requires an external binary/script and is NOT acceptance-grade, but
# removing its endpoints would break the shipped UI without warning.


def test_legacy_lane_endpoints_registered(client):
    """Native TERM++ and stream endpoints must be routable."""
    rules = {r.rule for r in client.application.url_map.iter_rules()}
    assert "/api/workbench/open-termpp-skin" in rules
    assert "/api/workbench/termpp-stream/start" in rules
    assert "/api/workbench/termpp-stream/stop" in rules
    assert "/api/workbench/termpp-stream/status/<stream_id>" in rules
    assert "/api/workbench/termpp-stream/frame/<stream_id>" in rules


def test_legacy_verify_profile_accepted(client):
    """Verify function must recognize legacy_verify_e2e profile."""
    import inspect
    from pipeline_v2 import service
    src = inspect.getsource(service.workbench_run_verification)
    assert "legacy_verify_e2e" in src
    assert "verify_e2e.py" in src


def test_legacy_verify_command_template_in_js():
    """workbench.js must still contain the legacy_verify_e2e profile handler."""
    js = Path(__file__).resolve().parents[1] / "web" / "workbench.js"
    text = js.read_text()
    assert "legacy_verify_e2e" in text
    assert "verify_e2e.py" in text


def test_workbench_js_does_not_use_enabled_families_gating():
    """Bundle action scope must derive from normalized template action contracts."""
    js = Path(__file__).resolve().parents[1] / "web" / "workbench.js"
    text = js.read_text()
    assert "state.templateRegistry?.enabled_families" not in text
    assert "enabled_families missing from template registry" not in text


def test_skin_dock_test_button_in_html():
    """The Test This Skin button must remain in the shipped HTML."""
    html = Path(__file__).resolve().parents[1] / "web" / "workbench.html"
    text = html.read_text()
    assert 'id="webbuildQuickTestBtn"' in text
    assert 'id="verifyProfile"' in text
    assert 'value="legacy_verify_e2e"' in text
