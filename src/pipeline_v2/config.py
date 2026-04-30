from __future__ import annotations

import os
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]


def normalize_base_path(raw: str) -> str:
    """Normalize PIPELINE_BASE_PATH.

    Rules:
    - Empty / unset / whitespace-only / "/" → "" (root-hosted)
    - Non-empty → ensure leading slash, strip trailing slash
    - Example: "asciicker-XPEdit" → "/asciicker-XPEdit"
    - Example: "/asciicker-XPEdit/" → "/asciicker-XPEdit"
    """
    s = raw.strip().strip("/")
    if not s:
        return ""
    return "/" + s


BASE_PATH: str = normalize_base_path(os.environ.get("PIPELINE_BASE_PATH", ""))
DATA_DIR = ROOT / "data"
UPLOAD_DIR = DATA_DIR / "uploads"
JOBS_DIR = DATA_DIR / "jobs"
SESSIONS_DIR = DATA_DIR / "sessions"
EXPORT_DIR = DATA_DIR / "exports"
PREVIEWS_DIR = DATA_DIR / "previews"
GATES_DIR = DATA_DIR / "gates"
TRACES_DIR = DATA_DIR / "traces"
BUNDLES_DIR = DATA_DIR / "bundles"
BUG_REPORTS_DIR = DATA_DIR / "bug_reports"
CONFIG_DIR = ROOT / "config"
SPRITES_DIR = ROOT / "sprites"

# Bug-report delivery configuration
BUG_REPORT_DELIVERY: str = os.environ.get("BUG_REPORT_DELIVERY", "local").strip().lower()
BUG_REPORT_GITHUB_REPO: str = os.environ.get("BUG_REPORT_GITHUB_REPO", "").strip()
BUG_REPORT_GITHUB_TOKEN: str = os.environ.get("BUG_REPORT_GITHUB_TOKEN", "").strip()


def ensure_dirs() -> None:
    for path in [
        DATA_DIR,
        UPLOAD_DIR,
        JOBS_DIR,
        SESSIONS_DIR,
        EXPORT_DIR,
        PREVIEWS_DIR,
        GATES_DIR,
        TRACES_DIR,
        BUNDLES_DIR,
        BUG_REPORTS_DIR,
    ]:
        path.mkdir(parents=True, exist_ok=True)
