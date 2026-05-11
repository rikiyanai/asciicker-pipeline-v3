from pathlib import Path

import numpy as np
import pytest
from PIL import Image

from scripts.glyph_assignment import (
    GlyphAssignmentConfig,
    assign_cell,
    assign_image_cells,
    load_glyph_masks,
    load_optional_semantic_bias,
)
from scripts.png2xp2png import BdfFont, CP437_TO_UNI

FONT_PATH = Path("runtime/termpp-skin-lab-static/termpp-web-flat/fonts/cp437_6x6.png.bdf")


def _config(**kwargs):
    values = {
        "font_path": FONT_PATH,
        "font_cell_size": (6, 6),
        "target_cell_size": (6, 6),
    }
    values.update(kwargs)
    return GlyphAssignmentConfig(**values)


def _tile_for_glyph(glyph, fg=(0, 0, 0), bg=(180, 180, 180)):
    font = BdfFont(str(FONT_PATH))
    mask = np.array(font.get_mask(CP437_TO_UNI[glyph]), dtype=bool).reshape(6, 6)
    tile = np.zeros((6, 6, 4), dtype=np.uint8)
    tile[:, :, :3] = bg
    tile[:, :, 3] = 255
    tile[mask, :3] = fg
    return Image.fromarray(tile, "RGBA")


def test_recovers_slash_and_backslash_from_colored_background():
    masks = load_glyph_masks(FONT_PATH, (6, 6))

    slash = assign_cell(_tile_for_glyph(47), _config(), masks)
    backslash = assign_cell(_tile_for_glyph(92), _config(), masks)

    assert slash.chosen.glyph == 47
    assert slash.chosen.fg == (0, 0, 0)
    assert slash.chosen.bg == (180, 180, 180)
    assert backslash.chosen.glyph == 92


def test_rgb_png_atlas_uses_luminance_not_alpha(tmp_path):
    atlas = Image.new("RGBA", (16 * 6, 16 * 6), (0, 0, 0, 255))
    pixels = atlas.load()
    glyph = 47
    x0 = (glyph % 16) * 6
    y0 = (glyph // 16) * 6
    for idx in range(6):
        pixels[x0 + idx, y0 + (5 - idx)] = (255, 255, 255, 255)
    path = tmp_path / "atlas.png"
    atlas.save(path)

    masks = load_glyph_masks(path, (6, 6))

    assert masks[glyph].mask.sum() == 6


def test_solid_cells_remain_full_block():
    tile = Image.new("RGBA", (6, 6), (210, 210, 210, 255))

    assigned = assign_cell(tile, _config())

    assert assigned.chosen.glyph == 219
    assert assigned.chosen.fg == (210, 210, 210)
    assert assigned.chosen.bg == (255, 0, 255)


def test_non_solid_cells_do_not_collapse_to_full_block():
    assigned = assign_cell(_tile_for_glyph(47), _config())

    assert assigned.chosen.glyph != 219
    assert len(assigned.alternatives) >= 2


def test_tiny_features_allow_one_pixel_solid_but_penalize_two_pixel_block():
    one_pixel = Image.new("RGBA", (6, 6), (180, 180, 180, 255))
    one_pixel.putpixel((0, 0), (0, 0, 0, 255))
    two_pixel = Image.new("RGBA", (6, 6), (180, 180, 180, 255))
    two_pixel.putpixel((0, 0), (0, 0, 0, 255))
    two_pixel.putpixel((1, 0), (0, 0, 0, 255))

    one = assign_cell(one_pixel, _config())
    two = assign_cell(two_pixel, _config(candidate_limit=256))
    block_alternative = next(candidate for candidate in two.alternatives if candidate.glyph == 219)

    assert one.chosen.glyph == 219
    assert one.chosen.components["ink_count"] == 1
    assert two.chosen.glyph != 219
    assert block_alternative.components["solid_penalty"] == pytest.approx(0.35)


def test_semantic_bias_only_changes_close_candidates():
    masks = load_glyph_masks(FONT_PATH, (6, 6))
    unbiased = assign_cell(_tile_for_glyph(117), _config(), masks, region="mouth")
    biased = assign_cell(
        _tile_for_glyph(117),
        _config(semantic_bias={"mouth": {118: 1.0}}, score_delta_threshold=1.0, candidate_limit=256),
        masks,
        region="mouth",
    )
    distant = assign_cell(
        _tile_for_glyph(117),
        _config(semantic_bias={"mouth": {118: 1.0}}, score_delta_threshold=0.0, candidate_limit=256),
        masks,
        region="mouth",
    )

    assert unbiased.chosen.glyph == 117
    assert biased.chosen.glyph == 118
    assert distant.chosen.glyph == 117


def test_missing_font_path_fails_at_matching_boundary():
    missing = Path("/tmp/does-not-exist-cp437.bdf")

    with pytest.raises(FileNotFoundError):
        assign_cell(_tile_for_glyph(47), _config(font_path=missing))


def test_missing_semantic_map_path_disables_bias_with_warning(tmp_path):
    missing = tmp_path / "semantic_maps"

    with pytest.warns(RuntimeWarning):
        bias = load_optional_semantic_bias(missing)

    assert bias == {}


def test_assign_image_cells_preserves_cached_tile_coordinates_and_regions():
    tile = _tile_for_glyph(47)
    image = Image.new("RGBA", (12, 6), (0, 0, 0, 0))
    image.alpha_composite(tile, (0, 0))
    image.alpha_composite(tile, (6, 0))

    cells = assign_image_cells(image, _config(), regions={(1, 0): "mouth"})

    assert [(cell.x, cell.y, cell.region, cell.chosen.glyph) for cell in cells] == [
        (0, 0, None, 47),
        (1, 0, "mouth", 47),
    ]


def test_unsupported_font_atlas_extension_fails_closed(tmp_path):
    atlas = tmp_path / "atlas.txt"
    atlas.write_text("not a font\n")

    with pytest.raises(ValueError, match="unsupported glyph atlas format"):
        load_glyph_masks(atlas, (6, 6))
