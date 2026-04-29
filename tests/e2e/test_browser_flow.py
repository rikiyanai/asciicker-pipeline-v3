from __future__ import annotations

import json
import socket
import threading
import time
from datetime import datetime, UTC
from pathlib import Path

import pytest
from playwright.sync_api import sync_playwright, TimeoutError as PWTimeout
from werkzeug.serving import make_server

from pipeline_v2.app import create_app


class _ServerThread(threading.Thread):
    def __init__(self, host: str, port: int):
        super().__init__(daemon=True)
        self.host = host
        self.port = port
        self.app = create_app()
        self.server = make_server(host, port, self.app)
        self.port = self.server.server_port

    def run(self) -> None:
        self.server.serve_forever()

    def stop(self) -> None:
        self.server.shutdown()


def _free_port() -> int:
    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as s:
        s.bind(("127.0.0.1", 0))
        return int(s.getsockname()[1])


@pytest.fixture
def web_server() -> str:
    port = _free_port()
    th = _ServerThread("127.0.0.1", port)
    th.start()
    time.sleep(0.25)
    base = f"http://127.0.0.1:{th.port}"
    try:
        yield base
    finally:
        th.stop()


@pytest.mark.e2e
def test_browser_workbench_direct_flow_records_video_and_populates_workbench(web_server: str):
    fixture = Path(__file__).resolve().parents[1] / "fixtures" / "known_good" / "cat_sheet.png"
    assert fixture.exists(), fixture

    ts = datetime.now(UTC).strftime("%Y%m%dT%H%M%SZ")
    art = Path("output/e2e_artifacts") / f"run-{ts}"
    videos = Path("output/e2e_videos") / f"run-{ts}"
    art.mkdir(parents=True, exist_ok=True)
    videos.mkdir(parents=True, exist_ok=True)

    summary: dict[str, object] = {
        "base_url": web_server,
        "fixture": str(fixture),
        "artifacts_dir": str(art.resolve()),
        "videos_dir": str(videos.resolve()),
        "status": "started",
        "steps": [],
    }

    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        context = browser.new_context(record_video_dir=str(videos), record_video_size={"width": 1280, "height": 720})
        page = context.new_page()
        video = page.video

        def shot(name: str) -> None:
            page.screenshot(path=str(art / f"{name}.png"), full_page=True)

        try:
            page.goto(web_server + "/workbench", wait_until="networkidle", timeout=30000)
            summary["steps"].append("open_workbench")
            shot("01_open_workbench")

            # Create a blank session so wbRun can read geometry from it.
            # btnNewXp is enabled in classic mode on page load (updateClassicGeometryControls
            # fires at init with default 8-angle/9-frame geometry).
            page.click("#btnNewXp")
            page.wait_for_function(
                "() => { const t = document.getElementById('wbStatus').textContent;"
                " return t.includes('New XP ready') || t.includes('Session active'); }",
                timeout=15000,
            )
            summary["steps"].append("blank_session_created")
            shot("01b_blank_session_created")

            page.set_input_files("#wbFile", str(fixture))
            page.click("#wbUpload")
            page.wait_for_function("() => document.getElementById('wbRun').disabled === false", timeout=15000)
            summary["steps"].append("wb_upload_ok")
            shot("02_wb_upload_ok")

            page.click("#wbRun")
            page.wait_for_function("() => document.getElementById('wbRunOut').textContent.includes('job_id')", timeout=120000)
            summary["steps"].append("wb_run_ok")
            shot("03_wb_run_ok")

            page.wait_for_function(
                "() => document.getElementById('wbStatus').textContent.includes('Session active')",
                timeout=30000,
            )
            summary["steps"].append("workbench_session_active")
            shot("04_workbench_session_active")
            cell_count = page.locator("#grid .cell").count()
            session_json = json.loads(page.locator("#sessionOut").inner_text())
            angles = int(session_json.get("angles", 1))
            anims = [int(x) for x in (session_json.get("anims") or [1])]
            projs = int(session_json.get("projs", 1))
            grid_cols = int(session_json.get("grid_cols", 0))
            grid_rows = int(session_json.get("grid_rows", 0))
            semantic_frames = max(1, sum(anims))
            frame_cols_total = max(1, semantic_frames * max(1, projs))
            frame_char_w = grid_cols / frame_cols_total
            frame_char_h = grid_rows / max(1, angles)
            summary["cell_count"] = cell_count
            summary["session_summary"] = session_json
            summary["frame_char_w"] = frame_char_w
            summary["frame_char_h"] = frame_char_h
            shot("05_workbench_populated")
            if cell_count <= 0:
                raise AssertionError("Workbench grid has zero cells")
            # Strong geometry guard: do not treat ultra-coarse output as success.
            if frame_char_w < 4 or frame_char_h < 4:
                raise AssertionError(
                    f"Workbench frame geometry too coarse: frame_char_w={frame_char_w:.2f}, "
                    f"frame_char_h={frame_char_h:.2f} (must be >= 4)"
                )

            page.click("#btnExport")
            page.wait_for_function(
                "() => document.getElementById('exportOut').textContent.includes('xp_path')",
                timeout=30000,
            )
            summary["steps"].append("export_ok")
            shot("06_export_ok")

            export_json = page.locator("#exportOut").inner_text()
            export_data = json.loads(export_json)
            summary["export_xp_path"] = export_data.get("xp_path")

            page.wait_for_function(
                "() => document.getElementById('xpToolCommandHint').textContent.includes('scripts.asset_gen.xp_tool')",
                timeout=30000,
            )
            summary["xp_tool_hint"] = page.locator("#xpToolCommandHint").inner_text()
            summary["steps"].append("xp_tool_hint_ok")
            shot("07_xp_tool_hint")
            summary["status"] = "passed"

        except PWTimeout as e:
            summary["status"] = "failed"
            summary["timeout_error"] = str(e)
            shot("99_timeout")
            raise
        except Exception as e:
            summary["status"] = "failed"
            summary["error"] = str(e)
            shot("99_error")
            raise
        finally:
            context.close()
            browser.close()
            if video is not None:
                summary["video_path"] = str(Path(video.path()).resolve())
            (art / "summary.json").write_text(json.dumps(summary, indent=2), encoding="utf-8")
