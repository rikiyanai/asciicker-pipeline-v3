from __future__ import annotations

import sys
from dataclasses import dataclass
from pathlib import Path

import numpy as np
from PIL import Image

ROOT = Path(__file__).resolve().parents[2]
if str(ROOT / "scripts") not in sys.path:
    sys.path.insert(0, str(ROOT / "scripts"))

from png2xp2png import BdfFont, CP437_TO_UNI  # noqa: E402


@dataclass(frozen=True)
class GlyphMask:
    glyph: int
    mask: np.ndarray
    # FL-4098 (2): supersampled grayscale render in [0, 1]. Same shape as
    # ``mask`` but soft — used by SSIM picker for antialiased comparison.
    soft_mask: np.ndarray | None = None


def _resize_mask(
    mask: np.ndarray,
    target_cell_size: tuple[int, int],
    *,
    supersample: int = 3,
) -> tuple[np.ndarray, np.ndarray]:
    """Resize a binary glyph mask to ``target_cell_size``.

    Returns ``(hard, soft)``:
      - hard: bool mask, used for IoU computation in the tone matcher.
      - soft: float32 mask in [0, 1], used by SSIM picker. When supersample
        > 1, this is produced by NEAREST-upsampling to supersample×target,
        then BILINEAR-downsampling to target — smooths curve aliasing so the
        SSIM picker can score against antialiased glyph renders.
    """
    target_w, target_h = target_cell_size
    image = Image.fromarray((mask.astype(np.uint8) * 255), "L")
    if mask.shape == (target_h, target_w):
        soft = np.array(image, dtype=np.float32) / 255.0
        return mask.astype(bool), soft
    if supersample > 1:
        big = image.resize(
            (target_w * supersample, target_h * supersample),
            Image.Resampling.NEAREST,
        )
        resized = big.resize((target_w, target_h), Image.Resampling.BILINEAR)
    else:
        resized = image.resize((target_w, target_h), Image.Resampling.NEAREST)
    soft = np.array(resized, dtype=np.float32) / 255.0
    hard = soft >= 0.5
    return hard, soft


def _load_bdf_masks(path: Path, target_cell_size: tuple[int, int]) -> list[GlyphMask]:
    font = BdfFont(str(path))
    masks: list[GlyphMask] = []
    for glyph in range(256):
        raw = font.get_mask(CP437_TO_UNI.get(glyph, glyph))
        if raw is None:
            continue
        shaped = np.array(raw, dtype=bool).reshape(font.cell_h, font.cell_w)
        hard, soft = _resize_mask(shaped, target_cell_size)
        masks.append(GlyphMask(glyph, hard, soft))
    return masks


def _load_png_grid_masks(path: Path, target_cell_size: tuple[int, int]) -> list[GlyphMask]:
    image = Image.open(path).convert("RGBA")
    if image.width % 16 or image.height % 16:
        raise ValueError(f"PNG atlas must be a 16x16 regular glyph grid: {path}")
    cell_w = image.width // 16
    cell_h = image.height // 16
    rgba = np.array(image)
    masks: list[GlyphMask] = []
    for glyph in range(256):
        x0 = (glyph % 16) * cell_w
        y0 = (glyph // 16) * cell_h
        tile = rgba[y0 : y0 + cell_h, x0 : x0 + cell_w]
        rgb = tile[:, :, :3].astype(np.uint16)
        alpha = tile[:, :, 3]
        luminance = rgb.mean(axis=2)
        mask = (alpha > 0) & (luminance >= 128)
        hard, soft = _resize_mask(mask, target_cell_size)
        masks.append(GlyphMask(glyph, hard, soft))
    return masks


def load_glyph_masks(path: Path, target_cell_size: tuple[int, int]) -> list[GlyphMask]:
    suffix = path.suffix.lower()
    if suffix == ".bdf":
        return _load_bdf_masks(path, target_cell_size)
    if suffix == ".png":
        return _load_png_grid_masks(path, target_cell_size)
    raise ValueError(f"unsupported glyph atlas format: {path}")
