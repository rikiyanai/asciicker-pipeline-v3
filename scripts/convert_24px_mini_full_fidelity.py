from __future__ import annotations

import json
import sys
from dataclasses import dataclass
from pathlib import Path

from PIL import Image

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "src"))

from pipeline_v2.app import create_app
from pipeline_v2.xp_codec import write_xp


SOURCE_DIR = ROOT / "output" / "24px-mini-characters" / "source_sheets"
OUT_DIR = ROOT / "output" / "24px-mini-characters-full-fidelity"
TILE_PX = 52
ANGLES = 8
MAGENTA = (255, 0, 255)


@dataclass(frozen=True)
class FamilySpec:
    anims: tuple[int, ...]


FAMILIES = {
    "player": FamilySpec((1, 8)),
    "attack": FamilySpec((8,)),
    "plydie": FamilySpec((5,)),
}


def _cell(
    glyph: int = 0,
    fg: tuple[int, int, int] = (0, 0, 0),
    bg: tuple[int, int, int] = MAGENTA,
):
    return (glyph, fg, bg)


def _transparent_layer(width: int, height: int):
    return [_cell() for _ in range(width * height)]


def _metadata_layer(width: int, height: int, anims: tuple[int, ...]):
    layer = _transparent_layer(width, height)
    values = [str(ANGLES), *[str(value) for value in anims]]
    for x, value in enumerate(values):
        layer[x] = _cell(ord(value[0]), (255, 255, 255), MAGENTA)
    return layer


def _visual_sheet(source: Image.Image, frames: int) -> Image.Image:
    src = source.convert("RGBA")
    width, height = src.size
    visual = Image.new("RGBA", (width * 2, height), (255, 0, 255, 0))
    for angle in range(ANGLES):
        y0 = angle * TILE_PX
        for frame in range(frames):
            x0 = frame * TILE_PX
            tile = src.crop((x0, y0, x0 + TILE_PX, y0 + TILE_PX))
            mirrored = tile.transpose(Image.Transpose.FLIP_LEFT_RIGHT)
            visual.paste(tile, (x0, y0), tile)
            visual.paste(mirrored, ((frames + frame) * TILE_PX, y0), mirrored)
    return visual


def _image_to_cells(image: Image.Image):
    rgba = image.convert("RGBA")
    width, height = rgba.size
    pixels = rgba.load()
    cells = []
    for y in range(height):
        for x in range(width):
            r, g, b, a = pixels[x, y]
            if a == 0:
                cells.append(_cell())
            else:
                cells.append(_cell(219, (r, g, b), MAGENTA))
    return cells


def _family_from_source(path: Path) -> tuple[str, str]:
    stem = path.name.removesuffix("-source.png")
    for family in FAMILIES:
        suffix = f"-{family}"
        if stem.endswith(suffix):
            return stem[: -len(suffix)], family
    raise ValueError(f"cannot infer family from {path}")


def _upload_session(client, xp_path: Path) -> dict:
    with xp_path.open("rb") as fh:
        response = client.post(
            "/api/workbench/upload-xp",
            data={"file": (fh, xp_path.name)},
            content_type="multipart/form-data",
        )
    if response.status_code != 201:
        raise RuntimeError(
            f"upload failed for {xp_path}: {response.status_code} {response.get_data(as_text=True)}"
        )
    return response.get_json()


def main() -> None:
    xps_dir = OUT_DIR / "xps"
    previews_dir = OUT_DIR / "previews"
    xps_dir.mkdir(parents=True, exist_ok=True)
    previews_dir.mkdir(parents=True, exist_ok=True)
    manifest = []
    sessions = []

    app = create_app()
    client = app.test_client()

    for source_path in sorted(SOURCE_DIR.glob("*-source.png")):
        name, family = _family_from_source(source_path)
        spec = FAMILIES[family]
        source = Image.open(source_path)
        if source.height != ANGLES * TILE_PX:
            raise ValueError(
                f"{source_path} height {source.height} does not match {ANGLES}x{TILE_PX}"
            )
        frames = source.width // TILE_PX
        if source.width % TILE_PX or frames != sum(spec.anims):
            raise ValueError(
                f"{source_path} width {source.width} does not match {family} frames {sum(spec.anims)}"
            )

        visual = _visual_sheet(source, frames)
        width, height = visual.size
        layers = [
            _metadata_layer(width, height, spec.anims),
            _transparent_layer(width, height),
            _image_to_cells(visual),
            _transparent_layer(width, height),
        ]
        xp_path = xps_dir / f"{name}-{family}.xp"
        preview_path = previews_dir / f"{name}-{family}.png"
        write_xp(xp_path, width, height, layers)
        visual.save(preview_path)
        uploaded = _upload_session(client, xp_path)
        sessions.append(
            {
                "name": name,
                "family": family,
                "xp": str(xp_path),
                "session_id": uploaded["session_id"],
                "session_kind": uploaded["session_kind"],
                "metadata_status": uploaded["metadata_status"],
                "active_layer": uploaded["active_layer"],
                "visible_layers": uploaded["visible_layers"],
                "locked_layers": uploaded["locked_layers"],
                "grid_cols": uploaded["grid_cols"],
                "grid_rows": uploaded["grid_rows"],
                "cell_w_chars": uploaded.get("cell_w_chars", TILE_PX),
                "cell_h_chars": uploaded.get("cell_h_chars", TILE_PX),
                "populated_cells": uploaded["populated_cells"],
            }
        )
        manifest.append(
            {
                "name": name,
                "family": family,
                "source_sheet": str(source_path),
                "xp": str(xp_path),
                "preview": str(preview_path),
                "frames": frames,
                "angles": ANGLES,
                "projections": 2,
                "source_tile_px": TILE_PX,
                "cell_w_chars": TILE_PX,
                "cell_h_chars": TILE_PX,
                "dimensions": [width, height],
                "workbench_session_id": uploaded["session_id"],
            }
        )

    (OUT_DIR / "conversion_manifest.json").write_text(
        json.dumps(manifest, indent=2) + "\n"
    )
    (OUT_DIR / "workbench_sessions.json").write_text(json.dumps(sessions, indent=2) + "\n")
    print(f"wrote {len(manifest)} full-fidelity XP files to {OUT_DIR}")


if __name__ == "__main__":
    main()
