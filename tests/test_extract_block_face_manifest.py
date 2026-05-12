from pathlib import Path

import numpy as np

from scripts.extract_block_face_manifest import block_semantic_bias, infer_tile_cell, load_masks
from scripts.png2xp2png import BdfFont, CP437_TO_UNI


FONT_PATH = Path("runtime/termpp-skin-lab-static/termpp-web-flat/fonts/cp437_6x6.png.bdf")


def _tile_for_glyph(glyph, fg=(0, 0, 0), bg=(180, 180, 180)):
    font = BdfFont(str(FONT_PATH))
    mask = np.array(font.get_mask(CP437_TO_UNI[glyph]), dtype=bool).reshape(6, 6)
    tile = np.zeros((6, 6, 4), dtype=np.uint8)
    tile[:, :, :3] = bg
    tile[:, :, 3] = 255
    tile[mask, :3] = fg
    return tile


def test_ocr_recovers_slash_and_backslash_from_colored_cell_background():
    masks = load_masks(FONT_PATH)

    slash = infer_tile_cell(_tile_for_glyph(47), masks)
    backslash = infer_tile_cell(_tile_for_glyph(92), masks)

    assert slash[0] == 47
    assert slash[1] == (0, 0, 0)
    assert slash[2] == (180, 180, 180)
    assert backslash[0] == 92


def test_ocr_keeps_solid_single_color_cells_as_full_blocks():
    masks = load_masks(FONT_PATH)
    tile = np.zeros((6, 6, 4), dtype=np.uint8)
    tile[:, :, :3] = (210, 210, 210)
    tile[:, :, 3] = 255

    glyph, fg, bg, _score = infer_tile_cell(tile, masks)

    assert glyph == 219
    assert fg == (210, 210, 210)
    assert bg == (255, 0, 255)


def test_block_semantic_bias_prefers_block_glyphs_over_text_intrusions():
    bias = block_semantic_bias()["middle_block_faces"]

    assert bias[219] > 0
    assert bias[220] > 0
    assert bias[221] > 0
    assert bias[222] > 0
    assert bias[223] > 0
    assert bias[72] < 0
    assert bias[55] < 0
    assert bias[44] < 0
    assert bias[93] < 0
