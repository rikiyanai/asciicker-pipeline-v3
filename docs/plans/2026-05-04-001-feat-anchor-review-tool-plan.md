---
title: "feat: Anchor review mode in xp_raw_layer_inspector with dual-role cells"
type: feat
status: active
date: 2026-05-04
origin: docs/brainstorms/2026-05-04-anchor-review-tool-requirements.md
---

# Anchor Review Mode In xp_raw_layer_inspector With Dual-Role Cells

## Summary

Add an `--anchor-review` mode to Y9-2's `xp_raw_layer_inspector.py` that
loads a pre-populated anchor JSON, overlays color-coded region labels on the
rendered sprite at each angle, and lets the user correct region assignments
via cursor-based cell selection with rectangle support. Extend the pipeline-v3
semantic map schema with `fg_region`/`bg_region` for half-block transition
cells. The mode saves corrections back to the anchor JSON with confidence
upgrades.

---

## Problem Frame

The auto-populated `player-anchors.json` groups cells by color into candidate
regions, but transition cells (half-block glyphs where fg and bg belong to
different body parts) are misclassified. The user needs a visual tool to
navigate angles, see the grouping, and correct it — particularly for
hair/face, shirt/pants, and pants/boots boundary cells.
(see origin: `docs/brainstorms/2026-05-04-anchor-review-tool-requirements.md`)

---

## Requirements

- R1. `--anchor-review <path>` mode in `xp_raw_layer_inspector.py` loads
  anchor JSON and overlays region labels per angle
- R2. Cursor movement + `x` toggle-select + `m`-mark-corner rectangle selection
  (shift+arrow as enhancement if terminal supports it)
- R3. Region assignment: assign selected cells to a named region
- R4. Dual-role cells: `fg_region`/`bg_region` for half-block transition cells
- R5. Schema extension: optional `fg_region`/`bg_region` in `schema.json`
- R6. Save with `Ctrl+S`: write anchor JSON, set `confidence: "high"`,
  update `ground_truth_angles`
- R7. Angle nav via existing `a/d`, region cycling via `r/f`
- R8. Read `frame_w`/`frame_h` from anchor JSON, not module defaults

---

## Scope Boundaries

- Player family only for first pass
- No workbench web UI changes
- No propagation tuning — that's after anchors are confirmed
- No mounted sprite anchors

### Deferred to Follow-Up Work

- Mounted sprite anchors (wolfie, wolack): after player workflow proven
- Workbench web UI anchor-review surface: future UQ-008 work
- Auto-populate `palette_roles` from cell colors: nice-to-have

---

## Context & Research

### Relevant Code and Patterns

**Target repo:** asciicker-Y9-2

- `scripts/pipeline/xp_raw_layer_inspector.py` — base tool (~1164 lines)
  - Main loop: lines 1038-1082, key-driven with `redraw_pending` flag
  - `_apply_key()`: lines 910-976, returns (keep_running, index_delta, ...)
  - `RawPreviewCell(glyph, fg, bg, selected)`: line 44, already has `selected` flag
  - `_style_raw_cell()`: lines 476-485, ANSI 24-bit color with inverted-video when selected
  - Region cycling: `r/f` keys at lines 945-954, index into `_region_atlas()`
  - Frame coords: `_explicit_frame_rect()` at lines 96-122
  - Argparse: lines 1127-1164
  - Semantic dict: `identify()` at line 354, `get_body_part_at()` at line 321

**Pipeline-v3 schema:**
- `docs/research/ascii/semantic_maps/schema.json` — already has `slot_affinity`, `overlay_masks`, `angle_anchors`
- `scripts/validate_semantic_maps.py` — already validates new fields from the prior plan

---

## Key Technical Decisions

- **Two-state rendering for cursor vs selected**: The cursor cell renders
  with bold+underline ANSI attributes (no background change). Toggle-selected
  cells render with inverted-video (existing `RawPreviewCell.selected` flag).
  These two states stack independently — a cell that is both cursor-active
  and toggle-selected shows bold+underline+inverted. Add a `cursor` boolean
  to `RawPreviewCell` or apply cursor attributes at render time from the
  review state.

- **Anchor state as a parallel data structure, not replacing the region atlas**:
  The anchor-review mode loads anchor regions into a separate data structure
  alongside the existing `_region_atlas()`. The existing region cycling (r/f)
  cycles through anchor regions, not the static atlas. The static atlas
  continues to exist as fallback for non-anchor-review mode.

- **Rectangle selection via shift+arrow**: TTY terminals don't have mouse
  events by default. Shift+arrow in raw mode may not be distinguishable from
  plain arrow in all terminals. Fallback: use a "mark corner" mode where the
  user presses `m` to mark the start corner, navigates to the end corner,
  and presses `m` again to complete the rectangle.

- **Half-block detection**: Glyphs 220, 221, 222, 223 are the four half-block
  characters. When a cell uses one of these glyphs and fg/bg are different
  colors from different palette roles, the reviewer prompts for
  `fg_region`/`bg_region` assignment.

---

## Open Questions

### Deferred to Implementation

- **Exact shift+arrow escape sequences**: Terminal-dependent. May need to
  fall back to the `m`-mark-corner approach. Test in the user's terminal
  first.
- **Color coding for regions**: How many distinct ANSI colors to cycle through
  for region overlay. The player sprite has ~5-7 regions per angle; 8 colors
  should suffice.

### From 2026-05-04 review

- **Primary-region heuristic for vertical split glyphs 221/222**: The
  "bg for lower-half, fg for upper-half" heuristic applies only to
  horizontal half-blocks (220, 223). Glyphs 221 (`▌`) and 222 (`▐`) are
  left/right vertical splits with equal-area halves — no clear primary.
  Need a decision: default to fg? default to left-half? prompt always?
  (feasibility, adversarial — P1)
- **Stale function references in U4 and U6**: `_selected_region()` (U4
  Patterns to follow), `export_angle_anchor_template()` (U6 Patterns to
  follow) are referenced as existing patterns but not found in the Context
  & Research section. Verify whether these exist in Y9-2 or were assumed
  without basis. (coherence — P1)
- **Half-block detection predicate assumes `palette_roles` populated**:
  The plan says half-block mode triggers when "fg/bg are different colors
  from different palette roles" but in `player-anchors.json` every region
  has `palette_roles: []` (empty). The detection logic needs a different
  predicate — e.g., reverse-lookup colors against the top-level palette
  map, or simply check fg != bg. (adversarial — P2)

---

## High-Level Technical Design

> *This illustrates the intended approach and is directional guidance for
> review, not implementation specification. The implementing agent should
> treat it as context, not code to reproduce.*

```
ANCHOR REVIEW MODE STATE:

  anchor_data: dict         # loaded from JSON
  anchor_path: str          # file path for save
  cursor: (y, x)            # current cursor position in frame-local coords
  selected_cells: set[(y,x)]  # toggle-selected cells
  rect_start: (y,x) | None # rectangle selection start corner
  current_angle: int        # from existing angle nav
  dirty: bool               # unsaved changes exist

DISPLAY (per refresh):

  1. Render sprite frame at current angle (existing)
  2. Overlay: color each non-transparent cell by its assigned region
     (use 8 distinct bg tints, one per region name)
  3. Overlay: invert-video on cursor cell
  4. Overlay: highlight toggle-selected cells
  5. Side panel: list regions at this angle with cell counts
     (requires terminal width >= frame_w * 2 + 24 columns for panel;
     if terminal is narrower, omit side panel and show region info
     in the status bar only)
  6. Status bar: angle, cursor pos, selected count, dirty flag

KEY BINDINGS (additions to existing):

  Arrow keys    : move cursor within frame
  x             : toggle-select cell at cursor (replaces layer-cycle)
  m             : mark rectangle corner (two presses = select rectangle)
  1-9           : assign selected cells to region N from the list
  n             : assign selected cells to a new named region (prompt)
  Backspace     : unassign selected cells from their current region
  h             : toggle half-block mode — next assignment applies
                  fg_region/bg_region separately
  Ctrl+S        : save anchor JSON
  Escape        : clear selection
```

---

## Implementation Units

- U1. **Schema extension: add fg_region/bg_region to semantic_cells**

**Goal:** Add optional `fg_region` and `bg_region` string fields to the
`semantic_cells` items in pipeline-v3's `schema.json` and update the
validator.

**Requirements:** R5

**Dependencies:** None

**Files:**
- Modify: `docs/research/ascii/semantic_maps/schema.json` (pipeline-v3)
- Modify: `scripts/validate_semantic_maps.py` (pipeline-v3)

**Approach:**
- Add `fg_region` and `bg_region` as optional string fields alongside
  the existing `role` field in the `semantic_cells` item schema
- Add validation in `validate_semantic_maps.py`: when present, must be
  non-empty strings

**Patterns to follow:**
- Existing `role` field in `semantic_cells` schema
- `validate_slot_affinity()` pattern for optional field validation

**Test scenarios:**
- Happy path: existing 3 maps + player-anchors.json still validate
- Happy path: cell with `fg_region` and `bg_region` set validates
- Edge case: cell with `fg_region` but no `bg_region` validates (partial is OK)
- Error path: cell with `fg_region: 123` (non-string) fails validation

**Verification:**
- `python3 scripts/validate_semantic_maps.py` exits 0 with all current maps

---

- U2. **Add --anchor-review CLI arg and anchor loading**

**Goal:** Add `--anchor-review <path>` argument to the inspector's argparse
and load the anchor JSON into a review-mode state structure.

**Requirements:** R1, R7, R8

**Dependencies:** None

**Files:**
- Modify: `scripts/pipeline/xp_raw_layer_inspector.py` (Y9-2)

**Approach:**
- Add `--anchor-review` argument to argparse (near line 1127)
- When provided, load the anchor JSON, extract `frame_w`/`frame_h`,
  build a per-angle region list from the `frames` entries
- Create an `AnchorReviewState` dataclass holding: `anchor_data`, `anchor_path`,
  `cursor_y`, `cursor_x`, `selected_cells`, `rect_start`, `dirty`,
  `region_color_map`
- Pass this state into the main loop; when `None`, existing behavior is
  unchanged
- Override `_region_atlas()` in anchor mode to return anchor regions instead
  of static atlas regions
- Override the `x/z` layer-cycling keys when in anchor mode (reassign `x`
  to cell toggle)

**Patterns to follow:**
- Existing `_apply_key()` structure for mode-conditional key handling
- Existing `RawAsset` dataclass pattern for the new state

**Test scenarios:**
- Happy path: `--anchor-review player-anchors.json` launches without error,
  shows sprite at angle 0 with region overlay
- Happy path: `a/d` angle navigation still works in anchor mode
- Error path: `--anchor-review nonexistent.json` prints error and exits
- Fallback: launching without `--anchor-review` behaves identically to before

**Verification:**
- Inspector starts in anchor-review mode and displays the sprite with
  region-colored cells at each angle

---

- U3. **Cursor movement and cell selection**

**Goal:** Add cursor navigation within the frame and cell toggle-selection
so the user can select individual cells or rectangular groups.

**Requirements:** R2

**Dependencies:** U2

**Files:**
- Modify: `scripts/pipeline/xp_raw_layer_inspector.py` (Y9-2)

**Approach:**
- Arrow keys move the cursor within frame bounds (0..frame_w-1, 0..frame_h-1)
- `x` at the cursor position toggles that cell in/out of `selected_cells`
- `m` marks rectangle start; second `m` selects all cells in the rectangle
- `Escape` clears selection
- Cursor cell gets distinct highlight (e.g., bold+underline) vs
  toggle-selected cells (inverted video)
- Render the cursor and selected cells by modifying the `selected` flag
  in `RawPreviewCell` before rendering

**Patterns to follow:**
- Existing `RawPreviewCell.selected` and `_style_raw_cell()` inversion

**Test scenarios:**
- Happy path: arrow keys move cursor, status bar shows (x, y) position
- Happy path: `x` toggles cell, cell appears inverted, `x` again deselects
- Happy path: `m` at (1,1), navigate to (3,3), `m` again selects 3x3 block
- Edge case: cursor at frame boundary (0,0) with left/up arrow stays at (0,0)
- Edge case: `Escape` clears all selected cells

**Verification:**
- User can visually see cursor position and selected cells highlighted
  differently from the region color overlay

---

- U4. **Region assignment and reassignment**

**Goal:** Let the user assign selected cells to a named region, creating
new regions or moving cells between existing ones.

**Requirements:** R3

**Dependencies:** U3

**Files:**
- Modify: `scripts/pipeline/xp_raw_layer_inspector.py` (Y9-2)

**Approach:**
- Number keys `1-9` assign selected cells to region N from the current
  angle's region list (shown in the side panel)
- `n` key prompts for a new region name via status-bar inline prompt:
  renders `New region name: _` in the status bar line; Escape cancels
  and restores prior status bar content; empty Enter is a no-op;
  duplicate name assigns selected cells to the existing region of that
  name (same as pressing the corresponding number key)
- `Backspace` removes selected cells from their current region (moves
  them to "unassigned")
- After assignment, recalculate region bboxes from their member cells
- Set `dirty = True` on any change
- Update the side panel to reflect new cell counts per region

**Patterns to follow:**
- Existing `_selected_region()` for region indexing
- Existing status bar update pattern for feedback messages

**Test scenarios:**
- Happy path: select 3 cells, press `2`, cells move to region 2
- Happy path: `n` creates "back_of_head" region, selected cells assigned
- Happy path: `Backspace` removes cells from region, region bbox shrinks
- Edge case: assigning cells already in the target region is a no-op
- Edge case: removing all cells from a region removes the region entirely

**Verification:**
- Side panel shows updated cell counts after assignment
- Region bboxes recalculate to fit remaining cells

---

- U5. **Dual-role fg_region/bg_region for half-block cells**

**Goal:** For half-block transition cells, allow separate fg and bg region
assignment so each color channel maps to its owning body part.

**Requirements:** R4

**Dependencies:** U1, U4

**Files:**
- Modify: `scripts/pipeline/xp_raw_layer_inspector.py` (Y9-2)

**Approach:**
- `h` key toggles "half-block mode" indicator in the status bar
- When half-block mode is active and the user assigns cells:
  - For cells with half-block glyphs (220/221/222/223) where fg and bg
    are different colors: pressing a number key first completes the fg
    assignment (same number key = from region list, status bar shows
    "fg: assigned to <region>"), then immediately prompts for bg
    ("bg region? [1-9 or n]"). Cancel with Escape during either sub-prompt
    aborts the whole dual assignment and leaves the cell unchanged.
  - Write `fg_region` and `bg_region` fields on the matching
    `semantic_cells` item (identified by x,y coordinates within the
    region's `semantic_cells` array)
  - The primary region assignment (the one used by `get_body_part_at()`)
    defaults to whichever half has more visual area (bg for lower-half,
    fg for upper-half, depending on glyph)
- For non-half-block cells in half-block mode, behave like normal assignment
- Visual indicator: in the side panel, show half-block cells with their
  split annotation (e.g., "fg:hair bg:face")

**Patterns to follow:**
- Half-block glyph detection: glyphs 220 (`▄`), 221 (`▌`), 222 (`▐`),
  223 (`▀`) from `sprite_constants.h` convention

**Test scenarios:**
- Happy path: toggle `h`, select a glyph-223 cell, assign fg=pants
  bg=shirt, cell shows split in panel
- Happy path: non-half-block cell in h-mode gets normal single assignment
- Edge case: half-block cell where fg==bg (solid fill) gets single
  assignment even in h-mode
- Edge case: toggling `h` off mid-selection reverts to single-assignment

**Verification:**
- Saved JSON contains `fg_region` and `bg_region` on half-block cells
- The anchor JSON still validates against pipeline-v3 schema

---

- U6. **Save to anchor JSON**

**Goal:** `Ctrl+S` saves the current anchor review state back to the
JSON file with confidence upgrades and ground_truth_angles tracking.

**Requirements:** R6

**Dependencies:** U4

**Files:**
- Modify: `scripts/pipeline/xp_raw_layer_inspector.py` (Y9-2)

**Approach:**
- **Prerequisite:** anchor-review mode must disable XOFF flow control at
  init (e.g., `tty.setraw()` or `termios` with IXON cleared) so `\x13`
  reaches the application instead of freezing the terminal. Restore
  original terminal settings on exit.
- On `Ctrl+S` (raw byte `\x13`):
  1. Rebuild all dirty `frames[angle]` entries from the review state's
     region assignments (not just the current angle — the review state
     holds corrections for all visited angles simultaneously)
  2. Set `confidence: "high"` on all regions at each saved angle that
     have at least one assigned cell
  3. Add each saved angle to `angle_anchors.ground_truth_angles` if not
     already present
  4. Write the full anchor JSON to a temporary file in the same directory,
     then `os.replace()` to `anchor_path` for crash-safe atomic write
  5. Set `dirty = False`
  6. Status bar shows "Saved to <filename>"
- On quit (`q`) when `dirty`, show "Unsaved changes! Press q again
  to discard, or Ctrl+S to save."

**Patterns to follow:**
- Existing status bar feedback pattern
- `export_angle_anchor_template()` JSON structure for output format

**Test scenarios:**
- Happy path: make changes, `Ctrl+S`, file written, dirty flag cleared
- Happy path: saved file has `confidence: "high"` on reviewed regions
- Happy path: `ground_truth_angles` includes the reviewed angle
- Edge case: save with no changes still writes (idempotent)
- Error path: quit with unsaved changes shows warning, second quit discards

**Verification:**
- Saved file passes `python3 scripts/validate_semantic_maps.py`
  (Note: `validate_anchor_file()` is planned in the prior plan's U7 and
  should be added as a verification step once available)
- Re-opening the saved file in anchor-review mode shows the corrections

---

## System-Wide Impact

- **Unchanged invariants:** The existing inspector mode (without
  `--anchor-review`) is completely unaffected. The `x` key only changes
  meaning when anchor-review mode is active.
- **Cross-repo:** The schema changes (U1) are in pipeline-v3. The inspector
  changes (U2-U6) are in Y9-2. The anchor JSON files live in pipeline-v3
  but are consumed by Y9-2 tools.
- **State lifecycle:** The `dirty` flag prevents silent data loss. The
  save path writes the full JSON via write-to-tmp then `os.replace()`
  for crash-safe atomicity (not incremental patches).

---

## Risks & Dependencies

| Risk | Mitigation |
|------|------------|
| Shift+arrow may not produce distinguishable escape sequences in all terminals | Fall back to `m`-mark-corner approach for rectangle selection |
| File overwrite on Ctrl+S without backup | Consider writing to `<path>.bak` before overwriting; defer to implementation |
| Inspector currently binds `x` to layer cycling | In anchor mode, rebind `x` to cell toggle; layer cycling moves to a different key or is disabled |

---

## Sources & References

- **Origin document:** `docs/brainstorms/2026-05-04-anchor-review-tool-requirements.md`
- Y9-2 inspector: `scripts/pipeline/xp_raw_layer_inspector.py`
- Pipeline-v3 schema: `docs/research/ascii/semantic_maps/schema.json`
- Prior plan: `docs/plans/2026-05-03-001-feat-per-angle-semantic-dictionary-plan.md`
- FL-2897: per-angle semantic dictionary diagnosis
