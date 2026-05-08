from __future__ import annotations

import json
import sys
from pathlib import Path


def test_skin_discovery_falls_back_to_reference_xp_dir() -> None:
    """Regression test for 'No skin XPs found' when --sprite-dir is wrong/missing.

    The anchor file's reference_xp points at the authoritative sprite directory and must
    be used as a fallback for discovering composite skin XPs.
    """
    y9_root = Path(__file__).resolve().parents[2]
    scripts_dir = (Path(__file__).resolve().parents[1] / "scripts").resolve()
    sys.path.insert(0, str(scripts_dir))

    import xp_uv_body_viewer as uv  # type: ignore

    anchor_path = y9_root / "docs" / "research" / "ascii" / "semantic_maps" / "wolack-0101.json"
    assert anchor_path.is_file()

    anchor_data = json.loads(anchor_path.read_text(encoding="utf-8"))
    ref_xp = anchor_data["reference_xp"]
    ref_path = (anchor_path.parent / ref_xp).resolve()
    assert ref_path.is_file()

    unique, search_dirs, _patterns = uv._discover_skin_candidate_paths(  # noqa: SLF001
        anchor_path=anchor_path,
        sprite_dir=y9_root / "DOES_NOT_EXIST",
        reference_xp_path=ref_path,
    )

    assert ref_path.parent.resolve() in search_dirs
    assert any(p.name == "wolack-attack-body.xp" for p in unique)

