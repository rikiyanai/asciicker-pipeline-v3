# Insertable Glyph Assignment Layer Plan

Date: 2026-05-11
Status: PLANNED
Scope: Section 2 conversion pipeline, shared PNG-to-XP conversion, 24px Mini Characters, block-face XP extraction

## Objective

Add one shared glyph detection and assignment layer that can be inserted into
PNG-to-XP conversion flows in both:

- `asciicker-pipeline-v3`
- `asciicker-Y9-2`

The layer must turn raster frame/cell pixels into XP cells with meaningful
`(glyph, fg, bg)` choices, emit ranked alternatives for human review, and avoid
another one-off converter that writes every visible pixel as `219`.

## Current Evidence

Pipeline-v3:

- `scripts/convert_24px_mini_template_2x.py` currently rescales 52px source
  tiles into character-cell grids and writes every opaque cell as glyph `219`.
  This explains the user's "no glyphs" and "too blobby" report.
- `scripts/extract_block_face_manifest.py` contains the strongest local OCR
  lesson: infer dominant cell background first, then match CP437 masks from
  pixels that differ from that background. That recovered `/` and `\` where the
  earlier alpha-as-ink approach collapsed into blobs.
- `web/rexpaint-editor/cp437-font.js` already proved the same class of bug on
  the browser renderer: RGB font atlases must be interpreted through luminance
  masks, not alpha.

Y9-2:

- `scripts/processor_core.py` and `scripts/glyph_matcher.py` are older, fixed
  12x12, single-color style helpers. They are not sufficient for 24px source
  sprites or semantic review.
- `scripts/pipeline/processor.py` plus `scripts/pipeline/matcher.py` implement
  a better two-color Stage 3 processor: quantize pixels, choose two colors, and
  match CP437 glyphs by rendered SSD.
- `scripts/pipeline/processor_subcell.py` implements a quality mode based on
  subcell dithering and half/block glyphs. It is useful for high-res conversion
  quality but is not a semantic glyph reviewer by itself.
- Y9-2 `FL-3833` and `RQ-074` make font presentation ship-blocking. The shared
  rule is that XP glyph indices stay canonical; font selection is presentation
  state, not stored sprite truth.

Online references checked:

- REXPaint `.xp` files store layers of cells with a 32-bit ASCII/glyph code and
  foreground/background RGB, compressed with gzip. Source:
  https://steveasleep.com/rexpaint_manual.html
- CP437 is the original IBM PC character set and includes line/block drawing
  glyphs used here; IBM lists `ibm-437` as PC base data. Source:
  https://www.ibm.com/docs/en/idr/11.4.0?topic=source-code-page-requirements
- Unicode publishes IBM PC memory-mapped graphics mappings for code-page glyph
  interoperability. Source:
  https://www.unicode.org/Public/MAPPINGS/VENDORS/MISC/IBMGRAPH.TXT

## Architecture

Create a repo-portable Python module with no pipeline-v3 or Y9-2 app imports.
The module should accept frame/cell pixels and return ranked glyph candidates
plus review evidence.

Proposed package path in pipeline-v3:

```text
scripts/glyph_assignment/
  __init__.py
  font_atlas.py
  candidate.py
  matcher.py
  semantic_bias.py
  review_artifacts.py
```

Y9-2 can vendor or mirror the same module after the pipeline-v3 contract is
stable. Do not fork the algorithm under a different owner.

### Core Interface

```python
@dataclass(frozen=True)
class GlyphAssignmentConfig:
    font_path: Path
    font_cell_size: tuple[int, int]
    target_cell_size: tuple[int, int]
    charset: str = "cp437"
    supersample: int = 3
    candidate_limit: int = 5
    semantic_bias: dict[str, dict[int, float]] = field(default_factory=dict)

@dataclass(frozen=True)
class GlyphCandidate:
    glyph: int
    fg: tuple[int, int, int]
    bg: tuple[int, int, int]
    score: float
    components: dict[str, float]
    reasons: list[str]

@dataclass(frozen=True)
class AssignedCell:
    x: int
    y: int
    region: str | None
    chosen: GlyphCandidate
    alternatives: tuple[GlyphCandidate, ...]
    confidence: float
    needs_review: bool
```

The conversion caller owns slicing, animation metadata, and XP assembly. The
glyph layer owns only cell-level glyph/color assignment and explainable ranked
suggestions.

## Matching Pipeline

1. Normalize the source cell.
   - Preserve RGBA where available.
   - Infer transparent/color-key pixels before matching.
   - Resize or supersample to `target_cell_size` with a configured strategy,
     not hardcoded 12px shrinking.

2. Split background and ink.
   - Find dominant background among visible pixels.
   - Treat pixels that differ from the background as ink.
   - Keep a fallback for true solid color cells: `219` is valid when the cell
     is actually solid, but invalid as the universal answer.

3. Generate color hypotheses.
   - Top two palette/raw colors.
   - Background-first hypothesis.
   - Foreground/background-swapped hypothesis.
   - Optional ANSI/216-color quantized variants for Y9-2 quality mode.

4. Score glyph candidates.
   - Render each candidate font mask using `(fg, bg)`.
   - Compare to source pixels using configurable metrics:
     - mask IoU or Hamming distance
     - RGB SSD or perceptual weighted error
     - edge/corner stroke reward for `/`, `\`, `_`, `-`, `|`, `(`, `)`, etc.
     - solid-block penalty when non-solid ink exists

5. Apply semantic bias.
   - Bias does not force truth. It adjusts close scores and records why.
   - Examples:
     - `mouth`: prefer `v`, `u`, `o`, `0`, `-`
     - `eye`: prefer `.`, `o`, `0`, `*`
     - `side_corner`: prefer `/`, `\`, `|`, `_`, `-`
     - `stone_edge`: prefer `/`, `\`, box drawing, half blocks
   - Semantic regions come from existing maps such as
     `docs/research/ascii/semantic_maps/*.json` and must remain advisory until
     human-reviewed.

6. Emit review artifacts.
   - XP output with chosen cells.
   - JSON sidecar containing top candidates per cell.
   - Contact sheet comparing source, chosen render, diff heatmap, and ambiguous
     cells.
   - A concise suggestion report suitable for a human loop:
     `"mouth cells suggest v/u/o; side corners suggest / and \\; review 14 low-confidence cells."`

## Integration Plan

### Slice 1: Shared Module And Tests

Add the standalone glyph-assignment package in pipeline-v3 with unit tests that
cover:

- slash and backslash recovery on colored backgrounds
- RGB atlas luminance masks
- solid cells remain `219`
- non-solid cells do not collapse to `219`
- candidate ranking returns at least two alternatives for ambiguous cells
- semantic bias changes ranking only within a bounded score delta

### Slice 2: Pipeline-v3 24px Converter Adapter

Update `scripts/convert_24px_mini_template_2x.py` so `_image_to_cells()` calls
the shared assignment layer instead of writing glyph `219` for every opaque
cell.

Required output additions:

- `output/24px-mini-characters-template-2x/glyph_suggestions.json`
- `output/24px-mini-characters-template-2x/glyph_review_contact.png`
- per-XP metadata in the manifest:
  - `glyph_assignment_mode`
  - `font_path`
  - `target_cell_size`
  - `low_confidence_cells`
  - `top_glyphs`

### Slice 3: Block Extractor Adapter

Replace the local OCR helper code in `scripts/extract_block_face_manifest.py`
with the shared module after the 24px adapter proves the interface. Keep the
manifest/discard logic local to the block tool; only the glyph assignment moves.

### Slice 4: Y9-2 Adapter

Port the module into Y9-2 without changing the font-presentation contract:

- `scripts/pipeline/processor.py` can call the shared matcher as a Stage 3
  strategy.
- `processor_subcell.py` remains a quality/halftone strategy, not semantic OCR.
- ASCIIID/WebSuit font swapping remains presentation-only per `FL-3833` /
  `RQ-074`; the assignment module may use different font atlases as matching
  bases, but exported XP still stores glyph indices.

## Human Review Workflow

The intended conversation after conversion should be:

```text
The glyph mapper suggested v/u/o for these mouth cells, / and \ for side
corners, and 219 only for true solid fills. It flagged 14 low-confidence cells
in civilian1-player and 9 in knight1-attack. Should I bias mouth cells harder
toward v/u/o or keep the current ranking?
```

This is the missing product behavior: conversion proposes an ASCII reading, but
does not silently pretend the first automated pass is canonical.

## Gates Before Promotion

- No visual PASS without viewing generated contact sheets or recording human
  signoff.
- 24px Mini Characters output must preserve previous 12px/2x artifacts and
  write a new full-fidelity conversion directory.
- Workbench upload must show non-magenta whole-sheet render with shaped glyphs.
- XP preview animation must work for the generated sheets.
- `data/sessions/*.json` must stay out of commits unless explicitly requested.
- Y9-2 changes must not create a second font owner or encode font presentation
  into XP data.

## Non-Goals

- Do not solve all semantic dictionary authoring in this slice.
- Do not replace Section 1 whole-sheet editor ownership.
- Do not promote provisional block XP files as gameplay assets without visual
  review.
- Do not use glyph assignment as a runtime renderer. Runtime consumes XP cells;
  it does not own conversion-time OCR.

## Open Questions For Implementation

1. Whether the shared module should live in pipeline-v3 first and be copied to
   Y9-2, or whether it should be extracted into a tiny tracked shared package.
2. Whether 24px Mini Characters should use raw RGB color preservation or Y9-2's
   216-color terminal palette for the first full-fidelity pass.
3. Which semantic maps are authoritative enough for bias on the first 24px pass:
   only original player/attack/plydie maps, or new review regions generated from
   the 24px template variants.
4. Whether confidence thresholds should be per-family (`player`, `attack`,
   `plydie`, blocks) or global for the first implementation.
