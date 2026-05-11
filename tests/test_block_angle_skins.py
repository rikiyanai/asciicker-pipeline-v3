from pathlib import Path

from pipeline_v2.xp_codec import read_xp


BLOCK_DIR = Path(__file__).resolve().parents[1] / "sprites" / "blocks_idle_redone"


def test_block_idle_skins_have_distinct_angle_rows_and_blank_second_projection():
    paths = sorted(BLOCK_DIR.glob("block_*_idle.xp"))
    assert len(paths) == 65

    failures = []
    for path in paths:
        xp = read_xp(path)
        width = int(xp["width"])
        height = int(xp["height"])
        visual = xp["cells"][2]
        frame_w = width // 2
        frame_h = height // 8
        row_hashes = []
        slash_count = 0
        backslash_count = 0
        second_projection_nonzero = 0
        for angle in range(8):
            glyphs = []
            for y in range(angle * frame_h, (angle + 1) * frame_h):
                for x in range(frame_w):
                    glyph = visual[y * width + x][0]
                    glyphs.append(glyph)
                    if glyph == ord("/"):
                        slash_count += 1
                    if glyph == ord("\\"):
                        backslash_count += 1
                for x in range(frame_w, width):
                    if visual[y * width + x][0]:
                        second_projection_nonzero += 1
            row_hashes.append(tuple(glyphs))
        distinct_rows = len(set(row_hashes))
        if distinct_rows != 8 or slash_count <= 0 or backslash_count <= 0 or second_projection_nonzero:
            failures.append((path.name, distinct_rows, slash_count, backslash_count, second_projection_nonzero))

    assert failures == []
