from __future__ import annotations

import json
import os
from pathlib import Path
from unittest.mock import patch


def _upload(client, path: Path, prefix: str = ""):
    with path.open("rb") as f:
        return client.post(f"{prefix}/api/upload", data={"file": (f, path.name)}, content_type="multipart/form-data")


def test_run_to_workbench_to_export(client):
    fixture = Path(__file__).parent / "fixtures" / "known_good" / "cat_sheet.png"
    up = _upload(client, fixture).get_json()

    run_payload = {
        "source_path": up["source_path"],
        "name": "cat",
        "angles": 1,
        "frames": "8",
        "source_projs": 1,
        "render_resolution": 24,
        "native_compat": False,
    }
    run_resp = client.post("/api/run", data=json.dumps(run_payload), content_type="application/json")
    assert run_resp.status_code == 200
    run_data = run_resp.get_json()

    wb_resp = client.post(
        "/api/workbench/load-from-job",
        data=json.dumps({"job_id": run_data["job_id"]}),
        content_type="application/json",
    )
    assert wb_resp.status_code == 201
    wb_data = wb_resp.get_json()
    assert wb_data["populated_cells"] > 0
    assert wb_data["grid_cols"] > 0
    assert wb_data["grid_rows"] > 0

    export_resp = client.post(
        "/api/workbench/export-xp",
        data=json.dumps({"session_id": wb_data["session_id"]}),
        content_type="application/json",
    )
    assert export_resp.status_code == 200
    export_data = export_resp.get_json()
    assert Path(export_data["xp_path"]).exists()
    assert export_data["checksum"]

    cmd_resp = client.post(
        "/api/workbench/xp-tool-command",
        data=json.dumps({"xp_path": export_data["xp_path"]}),
        content_type="application/json",
    )
    assert cmd_resp.status_code == 200
    cmd_data = cmd_resp.get_json()
    assert "scripts.asset_gen.xp_tool" in cmd_data["command"]

    open_resp = client.post(
        "/api/workbench/open-in-xp-tool",
        data=json.dumps({"xp_path": export_data["xp_path"], "dry_run": True}),
        content_type="application/json",
    )
    assert open_resp.status_code == 200
    open_data = open_resp.get_json()
    assert open_data["dry_run"] is True
    assert open_data["launched"] is False

    verify_dry_resp = client.post(
        "/api/workbench/run-verification",
        data=json.dumps({
            "session_id": wb_data["session_id"],
            "profile": "termpp_custom",
            "command_template": "echo verifying {xp_path}",
            "dry_run": True,
        }),
        content_type="application/json",
    )
    assert verify_dry_resp.status_code == 200
    verify_dry_data = verify_dry_resp.get_json()
    assert verify_dry_data["dry_run"] is True
    assert "verifying " in (verify_dry_data.get("command") or "")

    verify_local_resp = client.post(
        "/api/workbench/run-verification",
        data=json.dumps({
            "session_id": wb_data["session_id"],
            "profile": "local_xp_sanity",
            "timeout_sec": 10,
        }),
        content_type="application/json",
    )
    assert verify_local_resp.status_code == 200
    verify_local_data = verify_local_resp.get_json()
    assert verify_local_data["dry_run"] is False
    assert verify_local_data["profile"] == "local_xp_sanity"
    assert verify_local_data["passed"] is True
    assert Path(verify_local_data["report_path"]).exists()

    termpp_cmd_resp = client.post(
        "/api/workbench/termpp-skin-command",
        data=json.dumps({
            "session_id": wb_data["session_id"],
            "binary_name": "game_term",
        }),
        content_type="application/json",
    )
    assert termpp_cmd_resp.status_code == 200
    termpp_cmd_data = termpp_cmd_resp.get_json()
    assert termpp_cmd_data["binary_name"] == "game_term"
    assert termpp_cmd_data["planned_runtime_root"]
    assert termpp_cmd_data["xp_path"].endswith(".xp")

    termpp_dry_resp = client.post(
        "/api/workbench/open-termpp-skin",
        data=json.dumps({
            "session_id": wb_data["session_id"],
            "binary_name": "game_term",
            "dry_run": True,
        }),
        content_type="application/json",
    )
    assert termpp_dry_resp.status_code == 200
    termpp_dry_data = termpp_dry_resp.get_json()
    assert termpp_dry_data["dry_run"] is True
    assert termpp_dry_data["launched"] is False
    assert "runtime_root" in termpp_dry_data

    stream_dry_resp = client.post(
        "/api/workbench/termpp-stream/start",
        data=json.dumps({
            "session_id": wb_data["session_id"],
            "x": 0,
            "y": 0,
            "w": 320,
            "h": 240,
            "fps": 2,
            "dry_run": True,
        }),
        content_type="application/json",
    )
    assert stream_dry_resp.status_code == 200
    stream_dry_data = stream_dry_resp.get_json()
    assert stream_dry_data["dry_run"] is True
    assert stream_dry_data["region"]["w"] == 320
    assert stream_dry_data["region"]["h"] == 240

    web_skin_resp = client.post(
        "/api/workbench/web-skin-payload",
        data=json.dumps({"session_id": wb_data["session_id"]}),
        content_type="application/json",
    )
    assert web_skin_resp.status_code == 200
    web_skin_data = web_skin_resp.get_json()
    assert web_skin_data["xp_path"].endswith(".xp")
    assert web_skin_data["xp_size_bytes"] > 0
    assert len(web_skin_data["xp_b64"]) > 0
    assert "player-0000.xp" in web_skin_data["override_names"]

    runtime_preflight_resp = client.get("/api/workbench/runtime-preflight")
    assert runtime_preflight_resp.status_code == 200
    runtime_preflight = runtime_preflight_resp.get_json()
    assert isinstance(runtime_preflight.get("ok"), bool)
    assert "termpp-web-flat/index.wasm" in (runtime_preflight.get("required_files") or [])
    required_any = runtime_preflight.get("required_map_any_of") or []
    assert "termpp-web-flat/flatmaps/minimal_2x2.a3d" in required_any
    assert "termpp-web-flat/flatmaps/game_map_y8_original_game_map.a3d" in required_any
    assert "missing_files" in runtime_preflight
    assert "invalid_files" in runtime_preflight
    assert "maps_found" in runtime_preflight


def test_termpp_stream_dry_run_works_off_darwin(client):
    """Regression: dry_run=True must succeed on non-macOS (CI/Linux)."""
    fixture = Path(__file__).parent / "fixtures" / "known_good" / "cat_sheet.png"
    up = _upload(client, fixture).get_json()
    run_resp = client.post(
        "/api/run",
        data=json.dumps({
            "source_path": up["source_path"],
            "name": "cat",
            "angles": 1,
            "frames": "8",
            "source_projs": 1,
            "render_resolution": 24,
            "native_compat": False,
        }),
        content_type="application/json",
    )
    wb_resp = client.post(
        "/api/workbench/load-from-job",
        data=json.dumps({"job_id": run_resp.get_json()["job_id"]}),
        content_type="application/json",
    )
    session_id = wb_resp.get_json()["session_id"]

    fake_uname = os.uname_result(("Linux", "ci", "6.5.0", "#1", "x86_64"))
    with patch("pipeline_v2.service.os.uname", return_value=fake_uname):
        dry_resp = client.post(
            "/api/workbench/termpp-stream/start",
            data=json.dumps({
                "session_id": session_id,
                "x": 0, "y": 0, "w": 320, "h": 240,
                "fps": 2, "dry_run": True,
            }),
            content_type="application/json",
        )
        assert dry_resp.status_code == 200
        assert dry_resp.get_json()["dry_run"] is True

        real_resp = client.post(
            "/api/workbench/termpp-stream/start",
            data=json.dumps({
                "session_id": session_id,
                "x": 0, "y": 0, "w": 320, "h": 240,
                "fps": 2, "dry_run": False,
            }),
            content_type="application/json",
        )
        assert real_resp.status_code == 422


def test_workbench_browse_crud_endpoints(client):
    create_a = client.post(
        "/api/workbench/create-blank-session",
        data=json.dumps({"template_set_key": "player_native_idle_only", "action_key": "idle"}),
        content_type="application/json",
    )
    assert create_a.status_code == 201
    session_a = create_a.get_json()["session_id"]

    create_b = client.post(
        "/api/workbench/create-blank-session",
        data=json.dumps({"template_set_key": "player_native_idle_only", "action_key": "idle"}),
        content_type="application/json",
    )
    assert create_b.status_code == 201
    session_b = create_b.get_json()["session_id"]

    list_resp = client.get("/api/workbench/browse/list")
    assert list_resp.status_code == 200
    sessions = list_resp.get_json()["sessions"]
    found_ids = {item["session_id"] for item in sessions}
    assert session_a in found_ids
    assert session_b in found_ids

    rename_resp = client.post(
        "/api/workbench/browse/rename",
        data=json.dumps({"session_id": session_a, "name": "Browse Rename Proof"}),
        content_type="application/json",
    )
    assert rename_resp.status_code == 200
    renamed = rename_resp.get_json()
    assert renamed["session_id"] == session_a
    assert renamed["name"] == "Browse Rename Proof"
    assert renamed["label"] == "Browse Rename Proof"

    dup_resp = client.post(
        "/api/workbench/browse/duplicate",
        data=json.dumps({"session_id": session_a}),
        content_type="application/json",
    )
    assert dup_resp.status_code == 201
    duplicated = dup_resp.get_json()
    assert duplicated["session_id"] != session_a
    assert duplicated["name"] == "Browse Rename Proof copy"

    delete_resp = client.post(
        "/api/workbench/browse/delete",
        data=json.dumps({"session_id": duplicated["session_id"]}),
        content_type="application/json",
    )
    assert delete_resp.status_code == 200
    assert delete_resp.get_json()["deleted"] is True

    list_after = client.get("/api/workbench/browse/list")
    assert list_after.status_code == 200
    after_ids = {item["session_id"] for item in list_after.get_json()["sessions"]}
    assert duplicated["session_id"] not in after_ids
    assert session_a in after_ids


def test_workbench_browse_delete_rejects_bundle_owned_session(client):
    bundle_resp = client.post(
        "/api/workbench/bundle/create",
        data=json.dumps({"template_set_key": "player_native_full"}),
        content_type="application/json",
    )
    assert bundle_resp.status_code == 201
    bundle = bundle_resp.get_json()
    first_owned = next(
        act["session_id"]
        for act in bundle["actions"].values()
        if isinstance(act, dict) and act.get("session_id")
    )

    delete_resp = client.post(
        "/api/workbench/browse/delete",
        data=json.dumps({"session_id": first_owned}),
        content_type="application/json",
    )
    assert delete_resp.status_code == 422
    payload = delete_resp.get_json()
    assert payload["code"] == "bundle_session_delete_forbidden"


# --- Base-path-parameterized test (root + /xpedit) ---


def test_run_to_workbench_to_export_hosted(hosted_client):
    """Same flow as test_run_to_workbench_to_export but parameterized over hosting mode."""
    client, prefix = hosted_client
    fixture = Path(__file__).parent / "fixtures" / "known_good" / "cat_sheet.png"
    up = _upload(client, fixture, prefix).get_json()

    run_payload = {
        "source_path": up["source_path"],
        "name": "cat",
        "angles": 1,
        "frames": "8",
        "source_projs": 1,
        "render_resolution": 24,
        "native_compat": False,
    }
    run_resp = client.post(f"{prefix}/api/run", data=json.dumps(run_payload), content_type="application/json")
    assert run_resp.status_code == 200
    run_data = run_resp.get_json()

    wb_resp = client.post(
        f"{prefix}/api/workbench/load-from-job",
        data=json.dumps({"job_id": run_data["job_id"]}),
        content_type="application/json",
    )
    assert wb_resp.status_code == 201
    wb_data = wb_resp.get_json()
    assert wb_data["populated_cells"] > 0
    assert wb_data["grid_cols"] > 0
    assert wb_data["grid_rows"] > 0

    export_resp = client.post(
        f"{prefix}/api/workbench/export-xp",
        data=json.dumps({"session_id": wb_data["session_id"]}),
        content_type="application/json",
    )
    assert export_resp.status_code == 200
    export_data = export_resp.get_json()
    assert Path(export_data["xp_path"]).exists()
    assert export_data["checksum"]

    runtime_preflight_resp = client.get(f"{prefix}/api/workbench/runtime-preflight")
    assert runtime_preflight_resp.status_code == 200
    runtime_preflight = runtime_preflight_resp.get_json()
    assert isinstance(runtime_preflight.get("ok"), bool)
