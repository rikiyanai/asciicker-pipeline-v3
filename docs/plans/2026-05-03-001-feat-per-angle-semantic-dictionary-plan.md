---
title: "feat: Per-angle semantic dictionary with overlay slot affinity"
type: feat
status: active
date: 2026-05-03
deepened: 2026-05-03
---

# Per-Angle Semantic Dictionary With Overlay Slot Affinity

## Summary

Replace the static fractional-bounds region atlas in Y9-2 `semantic_dict.py`
with a per-angle anchor system that stores ground-truth body-part labels for
each of the 8 directional angles. Extend the pipeline-v3 semantic map JSON
schema with `slot_affinity` and overlay-mask derivation fields so the
semantic dictionary can serve wearable authoring validation (S2-FAM-04),
palette-role-scoped recoloring, and mounted composition validation (UQ-008).
Update the Section 2 canon spec to codify the new contract. Completion means
the user can sit down and define the first 8 angle anchors for the player
family.

---

## Problem Frame

The Y9-2 `semantic_dict.py` uses a static `_REGION_ATLAS` with 17 fractional-
bounded regions that are the same for every angle and every frame.
`get_body_part_at(0, 3)` returns `"head_top"` regardless of whether the
character faces North (back of head, no face visible) or South (full face).
This makes the semantic dictionary unreliable for:

1. Overlay authoring validation — a new helmet overlay needs validation that
   its cells actually cover head regions at each angle, not torso (S2-FAM-04)
2. Palette-role-scoped recoloring — "recolor just the armor cells" requires
   knowing which cells are armor vs body at each angle
3. Mounted rider/mount overlap — rider legs are hidden behind mount at angle 0
   but visible at angle 4 (UQ-008)

The pipeline-v3 semantic map JSON schema already supports per-frame regions
with per-frame bboxes, but only 4 frames out of ~352 total (across 3 families)
are annotated — all at angle 0, projection 0. The gap is coverage and tooling,
not data model.

FL-2897 documents the diagnosis and fix direction. This plan implements it.

---

## Requirements

- R1. Per-angle body-part identification: `get_body_part_at(y, x, angle)` must
  return angle-correct labels for all 8 directions
- R2. 8-anchor input workflow: the user can define per-angle region maps for
  one idle frame at each of the 8 angles for the player family
- R3. Propagation algorithm: given 8 angle anchors, automatically label walk/
  attack/death frames at the same angle using glyph+color tracking
- R4. Overlay mask derivation: given a body semantic map and the existing
  cell-diff overlay extraction, derive which body regions each overlay covers
  at each angle
- R5. Schema extension: pipeline-v3 `schema.json` accepts `slot_affinity`,
  `overlay_masks`, and palette-role slot binding without breaking existing maps
- R6. Canon spec update: Section 2 codifies the per-angle semantic dictionary
  contract as §2.3.11
- R7. Validator update: `validate_semantic_maps.py` validates the new fields
- R8. Existing maps remain valid: player-0100.json, attack-0001.json, and
  plydie-0000.json pass validation unchanged

---

## Scope Boundaries

- The user defines the 8 angle anchors manually — this plan builds the
  tooling, not the data
- Propagation to non-anchor frames is algorithmic but not required to be
  perfect — it produces candidates for human review
- Runtime engine integration (C++ changes) is out of scope — this is
  pipeline/tooling only
- Mounted sprite semantic maps (wolfie, wolack, bigbee) are future work
- The wearable authoring UI surface itself (S2-FAM-04) is future work — this
  plan provides the semantic foundation it needs

### Deferred to Follow-Up Work

- Actual labeling of the 8 player angle anchors: user task after this plan
- Propagation across attack/plydie families: separate pass after player anchors
  are validated
- Workbench UI for semantic-region-aware editing: future UQ-008/S2-FAM-04 work
- C++ engine consumption of per-angle semantic data: runtime identity work

---

## Context & Research

### Relevant Code and Patterns

**Y9-2 repo** (`asciicker-Y9-2`):
- `scripts/pipeline/bundle_wizard/semantic_dict.py` (2082 lines) — current
  static atlas, `_analyze_cells()`, `_infer_equipment()`, `identify()`,
  `build_from_xp()`, `ACCEPTED_CORPUS_ROWS` (15 entries)
- `scripts/pipeline/generate_presentation_overlays.py` (695 lines) —
  `build_overlay_from_canonical()` cell-diff logic, `visual_key()`,
  `WEARABLE_COLOR_MAPS`

**Pipeline-v3 repo** (`asciicker-pipeline-v3`):
- `docs/research/ascii/semantic_maps/schema.json` — current schema (11 fields,
  9 required)
- `docs/research/ascii/semantic_maps/player-0100.json` — 2 frames annotated
  (angle 0 only)
- `docs/research/ascii/semantic_maps/attack-0001.json` — 1 frame (angle 0)
- `docs/research/ascii/semantic_maps/plydie-0000.json` — 1 frame (angle 0)
- `scripts/validate_semantic_maps.py` — 17 validation checks
- `docs/plans/2026-03-23-workbench-canonical-spec.md` — §2.3 subsections end
  at §2.3.10 (line 2072), §2.4 starts at line 2073

### Existing Patterns

- `_analyze_cells()` already produces: `transparent_ratio`, `dominant_color`,
  `has_skin`, `has_gold`, `has_metal`, `dominant_glyph`, `color_counts`
- `build_from_xp()` already iterates all (angle, projection, anim, frame) and
  records per-region `visible_rows`, `visible_cols`, actual cell content — the
  raw data for propagation exists but is thrown away after per-region stats
- `ACCEPTED_CORPUS_ROWS` embeds actual per-angle occupancy in review keys
  (e.g., `rows=0-1|cols=2-6` at specific angles)
- Overlay diff uses `visual_key(cell) = (glyph, fg_idx, bg_idx)` on palette-
  indexed cells. `semantic_dict.py` uses RGB tuples `(glyph, fg_rgb, bg_rgb)`.
  Propagation must build its own RGB-based signature function — `visual_key()`
  cannot be reused directly due to this data format mismatch
- Engine `APPEARANCE_SLOT_KIND` enum: BODY=300, HEAD=301, SHIELD=302,
  WEAPON=303, ARMOR=306, MOUNT=307

---

## Key Technical Decisions

- **Add §2.3.11 rather than renumber**: The spec already has §2.3.0 through
  §2.3.10. Adding §2.3.11 avoids renumbering all subsequent sections and
  cross-references.

- **Anchor format is per-angle JSON, not a new Python data structure**: The
  pipeline-v3 `semantic_maps/` JSON format already supports per-frame regions.
  Angle anchors are just semantic map JSON files with 8 frames (one per angle)
  at the idle pose. This reuses the existing schema and validator rather than
  inventing a parallel format.

- **Propagation uses RGB-based signature tracking, not spatial projection**:
  Body parts move between frames but their `(glyph, fg_rgb, bg_rgb)` signature
  stays stable. Track signatures frame-to-frame rather than projecting static
  bbox coordinates forward. Note: the overlay system's `visual_key()` uses
  palette indices, not RGB — propagation must build its own RGB-variant
  signature function. When signatures collide (inevitable with a 6-color
  palette), use same-region spatial proximity as tiebreaker: prefer the
  nearest cell within ±2 of the anchor position for the same region.

- **Overlay masks are derived, not independently authored**: For each overlay
  XP file, the diff against the body XP determines covered cells at each
  angle. The semantic map for the body provides the body-part label for each
  covered cell. No separate overlay labeling pass is needed.

- **`slot_affinity` is a region-level field, not a cell-level field**: Each
  region (face, torso, legs) maps to one wearable slot. Individual cells
  inherit slot affinity from their containing region.

- **Anchor coordinate space is defined by the anchor file's `frame_w`/
  `frame_h`, not by `semantic_dict.py` defaults**: Existing `player-0100.json`
  uses `frame_w: 7` while `semantic_dict.py` defaults `FRAME_W = 9` (attack
  sprite width). Per-angle anchors store absolute cell coordinates, so the
  anchor loader must read `frame_w`/`frame_h` from the JSON and pass them
  through to `get_body_part_at()`. Each family has its own anchor file with
  its own frame dimensions. Propagation to attack frames (`frame_w: 9`)
  requires separate attack-family anchors — player anchors cannot be applied
  to attack frames.

- **Mirror projection (proj=1) anchors are derived, not independently
  authored**: For projection 1, anchor regions are X-mirrored from projection 0
  anchors: `mirrored_x = frame_w - 1 - x`. Left/right arm labels swap. The
  user only defines 8 anchors for projection 0.

- **Existing maps remain valid via schema `additionalProperties` and optional
  fields**: New schema fields (`slot_affinity`, `overlay_masks`) are optional.
  Existing maps without them still pass validation.

---

## Open Questions

### Decided During Planning

- **Where to insert the spec section?** After §2.3.10 (line 2072), before §2.4
  (line 2073). New section is §2.3.11.
- **Does the schema need a version bump?** No — new fields are optional and
  backward-compatible. `schema_version` stays `"0.1.0"`.
- **Can `visual_key()` from overlay system be reused for propagation?** No —
  it operates on palette indices while `semantic_dict.py` uses RGB tuples.
  Propagation must build an RGB-based variant.
- **Which `frame_w` governs anchor coordinates?** The anchor file's own
  `frame_w`/`frame_h` fields. Player anchors use `frame_w: 7`, attack anchors
  use `frame_w: 9`. Each family's anchors are independent.
- **Do mirror projections need separate anchors?** No — projection 1 is
  derived by X-mirroring projection 0 anchors with left/right label swap.
- **How does `identify()` interact with anchor data?** `identify()` already
  receives `angle` as a parameter. When anchor data is loaded, `identify()`
  should pass its `angle` through to `get_rect_body_part()` → `get_body_part_at()`.
  Backward compatibility means: identical results only when no anchor data is
  loaded; when anchors are loaded, results intentionally change (that is the
  whole point).

### Deferred to Implementation

- **Exact propagation confidence thresholds**: What signature match ratio
  constitutes a "confident" propagation vs. a candidate needing review? Tune
  during first propagation run.
- **Spatial proximity tiebreaker details**: When two regions share the same
  RGB signature, prefer the cell within ±2 of the anchor position for the
  same region. Exact distance metric (Manhattan vs. Euclidean) and max
  distance to be determined during implementation.
- **Overlay cells outside body bounds**: Helmet crowns and weapon swings may
  produce diff cells outside all body region bboxes. Implementation should
  exclude unmapped cells from slot_affinity percentage calculation and label
  them as `"overlay_extension"` rather than `"unknown"`.
- **Mounted region atlas structure**: How seat_anchor and mount_body regions
  interact with rider regions at each angle — deferred until mounted anchors
  are attempted.

---

## High-Level Technical Design

> *This illustrates the intended approach and is directional guidance for
> review, not implementation specification. The implementing agent should
> treat it as context, not code to reproduce.*

```
ANCHOR WORKFLOW:

  User defines 8 angle anchors (one idle frame per angle)
    → stored as semantic map JSON: player-0100-anchors.json
    → each "frame" key = angle index (0-7)
    → regions have per-angle bbox + semantic_cells + slot_affinity

PROPAGATION FLOW:

  For each (angle, walk_frame) not in anchors:
    1. Load anchor regions for this angle
    2. For each anchor region, extract visual_key signatures
    3. Scan target frame cells for matching signatures
    4. Assign body_part labels to matched cells
    5. Flag unmatched cells as "unknown" for human review
    6. Output: candidate semantic map for this frame

OVERLAY MASK DERIVATION:

  For each overlay XP (e.g., player-armor-regular.xp):
    1. Load body XP (player-0000.xp) and overlay XP
    2. At each (angle, frame), diff cells via visual_key
    3. For each differing cell, look up body_part from body semantic map
    4. Aggregate: overlay_masks[slot][angle] = { body_parts_covered, cells }
```

---

## Implementation Units

- U1. **Spec section §2.3.11: Per-Angle Semantic Dictionary Contract**

**Goal:** Add the canonical contract for per-angle semantic dictionaries to
the Section 2 spec, codifying the anchor model, propagation algorithm,
overlay mask derivation, and slot affinity.

**Requirements:** R6

**Dependencies:** None

**Files:**
- Modify: `docs/plans/2026-03-23-workbench-canonical-spec.md`

**Approach:**
- Insert new `#### 2.3.11 Per-Angle Semantic Dictionary And Overlay Slot
  Affinity Contract` after line 2072 (end of §2.3.10), before line 2073
  (start of §2.4)
- Define: per-angle anchor model replacing static `_REGION_ATLAS`; anchor
  format as pipeline-v3 semantic map JSON; slot_affinity field linking
  regions to engine `APPEARANCE_SLOT_KIND`; overlay_masks derivation from
  cell-diff; palette-role × slot binding; propagation algorithm contract;
  relationship to existing `semantic_maps/schema.json`; queue placement
  relative to S2-FAM-04 and UQ-008
- Follow existing spec style: numbered contract points, evidence citations,
  explicit gap/mismatch callouts

**Patterns to follow:**
- §2.3.6 (Wearable Slot/Style Expansion Policy) for contract structure
- §2.3.9 (Semantic Runtime Coverage Model) for row/blocker tracking style

**Test scenarios:**
- Test expectation: none — documentation-only change

**Verification:**
- Section renders correctly in markdown preview
- Cross-references to S2-FAM-04, UQ-008, and APPEARANCE_SLOT_KIND are
  present
- No broken section numbering in subsequent §2.4+ sections

---

- U2. **Extend pipeline-v3 semantic map schema with slot_affinity and overlay fields**

**Goal:** Add optional `slot_affinity`, `overlay_masks`, and slot-scoped
palette role fields to the JSON schema so new anchor maps can use them while
existing maps remain valid.

**Requirements:** R5, R8

**Dependencies:** None

**Files:**
- Modify: `docs/research/ascii/semantic_maps/schema.json`

**Approach:**
- Add optional `slot_affinity` field to region objects: enum of engine slot
  names (`"body"`, `"head"`, `"armor"`, `"shield"`, `"weapon"`, `"mount"`)
- Add optional `slot` field to palette_roles entries: string linking a
  palette role to a wearable slot for scoped recoloring
- Add optional top-level `overlay_masks` object: keyed by overlay slot name,
  containing per-angle covered-cell arrays
- Add optional top-level `angle_anchors` object: metadata about which
  angles have ground-truth anchors vs. propagated labels
- All new fields are optional — existing maps without them must still
  validate

**Patterns to follow:**
- Existing schema conventions: `"type": "string"`, `"enum": [...]` for
  constrained values, `"description"` on every field

**Test scenarios:**
- Happy path: existing player-0100.json validates against updated schema
- Happy path: existing attack-0001.json validates against updated schema
- Happy path: existing plydie-0000.json validates against updated schema
- Edge case: region with slot_affinity set validates
- Edge case: palette_role with slot field set validates
- Edge case: overlay_masks with per-angle cell arrays validates

**Verification:**
- All 3 existing map files pass validation unchanged
- A test map with all new optional fields also validates

---

- U3. **Update validate_semantic_maps.py for new schema fields**

**Goal:** Extend the validator to check slot_affinity enum values, overlay
mask structure, and palette-role slot bindings when present.

**Requirements:** R7, R8

**Dependencies:** U2

**Files:**
- Modify: `scripts/validate_semantic_maps.py`
- Test: `scripts/validate_semantic_maps.py` (self-validating — run it)

**Approach:**
- Add validation for `slot_affinity` field on regions: must be one of the
  allowed enum values if present
- Add validation for `slot` field on palette_roles: must be a string if
  present
- Add structural validation for `overlay_masks`: keyed by slot name, values
  contain angle-keyed objects with `covered_cells` arrays of `[x, y]` pairs
- Add structural validation for `angle_anchors`: tracks which angles are
  ground-truth vs. propagated
- Ensure existing maps still PASS with no new warnings

**Patterns to follow:**
- Existing validation functions: `validate_regions()`, `validate_palette_roles()`
- Error accumulation pattern: append to `errors` list, return non-zero on failure

**Test scenarios:**
- Happy path: all 3 existing maps pass with zero new errors
- Happy path: map with valid slot_affinity values passes
- Error path: map with invalid slot_affinity value (e.g., "boots") fails
- Error path: overlay_masks with non-array covered_cells fails
- Edge case: map with empty overlay_masks object passes (no overlays defined)

**Verification:**
- `python3 scripts/validate_semantic_maps.py` exits 0 with current maps
- Adding a deliberately malformed slot_affinity to a test map produces a
  clear error message

---

- U4. **Add per-angle anchor loading and region lookup to Y9-2 semantic_dict.py**

**Goal:** Replace the static `_REGION_ATLAS` fractional lookup with
angle-aware region resolution. When per-angle anchor data is available for
a given angle, use it; otherwise fall back to the existing fractional atlas.

**Requirements:** R1, R2

**Dependencies:** U2 (schema defines the anchor format)

**Files:**
- Modify: `scripts/pipeline/bundle_wizard/semantic_dict.py`
  (in `/Users/r/Downloads/asciicker-Y9-2`)

**Approach:**
- Add a module-level anchor cache: `_ANGLE_ANCHORS: dict[str, dict]` keyed
  by `(sprite_type, angle)` tuple, loaded from pipeline-v3 semantic map JSON
  files
- Add `load_angle_anchors(json_path)` function that reads a semantic map
  JSON and populates the cache, extracting per-frame regions indexed by angle
- Modify `get_body_part_at()` to accept an optional `angle` parameter:
  - If anchor data exists for `(sprite_type, angle)`: do O(1) lookup from
    pre-built inverse index `cell_to_part[(angle, y, x)] → region_name`
  - If no anchor data: fall back to existing `_resolved_region_atlas()` path
- Modify `get_rect_body_part()` similarly
- Add `slot_affinity` to region entries when available from anchor data
- Add `export_angle_anchor_template(sprite_type, frame_w, frame_h)` that
  generates a blank 8-angle anchor JSON template the user fills in

**Patterns to follow:**
- Existing `_resolved_region_atlas()` caching pattern
- Existing `build_from_xp()` angle/frame iteration structure

**Test scenarios:**
- Happy path: `get_body_part_at(0, 3, angle=4)` returns "face_center" when
  anchor data says face is at (0,3) for angle 4 (South)
- Happy path: `get_body_part_at(0, 3, angle=0)` returns "back_of_head" when
  anchor data maps that cell differently for angle 0 (North)
- Fallback: `get_body_part_at(0, 3)` without angle parameter uses existing
  fractional atlas (backward compatible)
- Fallback: `get_body_part_at(0, 3, angle=2)` with no anchor data for angle
  2 falls back to fractional atlas
- Edge case: `load_angle_anchors()` with malformed JSON raises clear error
- Happy path: `export_angle_anchor_template("player", 7, 10)` produces
  valid JSON skeleton with 8 frame entries
- Integration: `identify()` passes its existing `angle` param through to
  `get_rect_body_part()` → `get_body_part_at()` when anchor data is loaded
- Edge case: anchor file with `frame_w: 7` consumed by code that defaults
  to `FRAME_W = 9` — loader reads frame_w from JSON, not module default
- Edge case: `get_rect_body_part()` passes angle kwarg through its
  internal `get_body_part_at()` calls

**Verification:**
- With no anchor data loaded: all existing calls produce identical results
- With anchor data loaded: `identify()` returns angle-appropriate labels
  (this is intentional, not a regression)
- Anchor loader reads `frame_w`/`frame_h` from JSON and rejects mismatches
  with the target XP file

---

- U5. **Build glyph+color propagation algorithm**

**Goal:** Given the 8 angle anchors (idle frames), propagate body-part
labels to non-anchor frames (walk, attack, death) at the same angle using
glyph+color signature matching.

**Requirements:** R3

**Dependencies:** U4

**Files:**
- Modify: `scripts/pipeline/bundle_wizard/semantic_dict.py`
  (in `/Users/r/Downloads/asciicker-Y9-2`)

**Approach:**
- Add `propagate_from_anchors(xp_path, anchor_data, sprite_type)` function:
  1. For each angle in anchor_data, extract the set of `visual_key` tuples
     `(glyph, fg_rgb, bg_rgb)` per body region from the anchor frame
  2. Load the target XP file and iterate non-anchor frames at the same angle
  3. For each cell in the target frame, compute its `visual_key`
  4. Match against the anchor region signatures — assign body_part from the
     best-matching region (highest signature overlap)
  5. Cells with no signature match get `"unknown"` label
  6. Return a propagated semantic map dict with confidence scores
- Build an RGB-based signature function `rgb_cell_key(glyph, fg_rgb, bg_rgb)`
  — NOT reusing `visual_key()` from the overlay system which uses palette
  indices
- Reuse existing `_analyze_cells()` for color/glyph categorization
- When multiple regions share the same RGB signature (inevitable with the
  6-color player palette), use spatial proximity tiebreaker: prefer the cell
  within ±2 of the anchor position for the same region
- Output format matches pipeline-v3 semantic map JSON so results can be
  saved directly
- Include a `propagation_confidence` field per region: ratio of matched
  cells to total region cells from the anchor
- Read `frame_w`/`frame_h` from the anchor JSON — do not use module defaults

**Patterns to follow:**
- `_analyze_cells()` stats structure for color categorization
- `build_from_xp()` iteration pattern for angle/frame traversal

**Test scenarios:**
- Happy path: propagation from idle anchor to walk frame 1 at same angle
  preserves face/shirt/pants labels for cells with matching signatures
- Happy path: propagation confidence for stable regions (face, torso)
  is high (>0.8) since glyph+color stays stable across walk frames
- Edge case: cells that change glyph between frames (legs during walk)
  get lower confidence or "unknown" label
- Edge case: empty/transparent cells in target frame get "transparent"
  label, not "unknown"
- Edge case: two shirt cells with identical `rgb_cell_key` (glyph 220,
  fg #aa00aa, bg #aa00aa) are disambiguated by spatial proximity to their
  anchor positions
- Edge case: frame_w mismatch — propagation fails cleanly if anchor
  frame_w doesn't match target XP frame_w
- Integration: propagated output can be saved as pipeline-v3 semantic map
  JSON and passes validation

**Verification:**
- Running propagation from a manually-defined anchor produces a complete
  semantic map for all frames at that angle
- Confidence scores reflect actual signature stability

---

- U6. **Build overlay mask derivation from cell-diff + body semantic map**

**Goal:** For each overlay XP file, derive which body regions it covers at
each angle by combining the cell-level diff with the body semantic map.

**Requirements:** R4

**Dependencies:** U4

**Files:**
- Modify: `scripts/pipeline/bundle_wizard/semantic_dict.py`
  (in `/Users/r/Downloads/asciicker-Y9-2`)

**Approach:**
- Add `derive_overlay_masks(body_xp_path, overlay_xp_path, body_anchors,
  sprite_type)` function:
  1. Load body and overlay XP files
  2. For each (angle, frame), compute cell-level diff using `visual_key()`
     (same logic as `build_overlay_from_canonical()`)
  3. For each differing cell, look up body_part from `body_anchors` using
     the angle-aware `get_body_part_at(y, x, angle)`
  4. Aggregate into `overlay_masks[angle] = { body_parts_covered: set,
     covered_cells: [(x, y, body_part)] }`
  5. Infer `slot_affinity` from the dominant body_parts_covered: if >80% of
     covered cells are head regions → slot = "head"; if torso → "armor"
- Output format matches the pipeline-v3 schema's `overlay_masks` structure
- Handle the attack weapon split case: cells marked with SWOOSH_INDEX=254
  are weapon-slot, not body-slot

**Patterns to follow:**
- `build_overlay_from_canonical()` cell-diff pattern
- `visual_key()` signature computation
- `is_baked_attack_weapon_cell()` for weapon detection

**Test scenarios:**
- Happy path: helmet overlay covers head regions (face, hair, head_top)
  at all angles
- Happy path: armor overlay covers torso/arm regions
- Happy path: weapon overlay covers weapon_hand region + swoosh cells
- Edge case: overlay that covers zero cells at a given angle (e.g., shield
  not visible from behind at angle 0) produces empty cell list for that angle
- Edge case: helmet overlay cells extending above head region bbox (crown
  rows) are labeled `"overlay_extension"` and excluded from slot_affinity
  percentage calculation
- Edge case: weapon swing cells (SWOOSH_INDEX=254) are assigned weapon slot
  regardless of body region at that position
- Integration: derived overlay_masks can be written into semantic map JSON
  and passes schema validation

**Verification:**
- Running against existing player overlay XP files produces plausible
  per-angle overlay masks
- Slot affinity inference matches the known slot assignments

---

- U7. **Create the anchor template generator and user-facing workflow**

**Goal:** Provide a clear entry point for the user to define the 8 angle
anchors: generate a pre-populated JSON template, document the labeling
workflow, and validate completed anchors.

**Requirements:** R2

**Dependencies:** U2, U4

**Files:**
- Modify: `scripts/pipeline/bundle_wizard/semantic_dict.py`
  (in `/Users/r/Downloads/asciicker-Y9-2`)

**Approach:**
- `export_angle_anchor_template()` (from U4) generates a JSON file with:
  - 8 frame entries (one per angle) pre-populated with the existing
    `_REGION_ATLAS` fractional bounds as starting scaffolding
  - Empty `semantic_cells` arrays for the user to fill per-angle
  - `slot_affinity` fields pre-populated from known region-to-slot mappings
  - Comments/notes explaining what each region represents at each angle
- Add `validate_angle_anchors(json_path)` function that checks:
  - All 8 angles present
  - Each angle has at least the core body parts (head, torso, legs, feet)
  - No overlapping bboxes within a single angle
  - `slot_affinity` values are valid engine slot kinds
  - `semantic_cells` arrays are non-empty for high-confidence regions
- Add a CLI entry point: `python -m scripts.pipeline.bundle_wizard.semantic_dict
  --export-anchor-template player` and `--validate-anchors <path>`
- The template file path convention:
  `docs/research/ascii/semantic_maps/<family>-anchor-template.json`
  (in pipeline-v3 repo)

**Patterns to follow:**
- Existing `build_from_xp()` output structure for JSON formatting
- Existing CLI entry points in `bundle_wizard/main.py` for arg parsing

**Test scenarios:**
- Happy path: generated template is valid JSON matching pipeline-v3 schema
- Happy path: validation passes on a fully-populated anchor file
- Error path: validation fails on anchor file missing angle 3
- Error path: validation fails on anchor with overlapping bboxes at angle 5
- Edge case: validation warns (not fails) on angle with missing optional
  regions (e.g., weapon_hand empty at idle pose)

**Verification:**
- User can run `--export-anchor-template player`, open the JSON, fill in
  per-angle regions, run `--validate-anchors`, and get PASS/FAIL
- The generated template file path points to the pipeline-v3 repo's
  semantic_maps directory

---

## System-Wide Impact

- **Cross-repo coordination:** The anchor JSON files live in pipeline-v3
  (`docs/research/ascii/semantic_maps/`) but are consumed by Y9-2
  (`semantic_dict.py`). The path between repos is a user-configured or
  hardcoded sibling-directory assumption.
- **Backward compatibility:** All changes to `semantic_dict.py` must preserve
  existing call signatures. The `angle` parameter is optional everywhere.
  Existing callers that don't pass `angle` get the same results as before.
- **Unchanged invariants:** `build_from_xp()` output structure unchanged.
  `identify()` return structure unchanged. `ACCEPTED_CORPUS_ROWS` format
  unchanged. Pipeline-v3 workbench backend does not consume Y9-2
  semantic_dict.py directly — no service.py changes needed.
- **Schema versioning:** `schema_version` stays `"0.1.0"` because all new
  fields are optional additions, not breaking changes.

---

## Risks & Dependencies

| Risk | Mitigation |
|------|------------|
| User's 8 anchor definitions may not cover all cell positions (gaps between regions) | Validation in U7 checks for uncovered cells and warns; propagation in U5 labels gaps as "unknown" |
| Glyph+color signatures may not be unique enough to track across animated frames (e.g., two regions share the same palette) | Propagation uses spatial proximity as tiebreaker when signature matches are ambiguous; confidence scores flag uncertain cells |
| Cross-repo path between pipeline-v3 and Y9-2 may break on different machines | Anchor loading accepts explicit path argument; template generator writes to a configurable output path |
| Overlay XP files may not exist for all slot/variant combinations | `derive_overlay_masks()` handles missing files gracefully — skips and reports |

---

## Sources & References

- FL-2897: Static fractional bounds diagnosis and fix direction
- `scripts/pipeline/bundle_wizard/semantic_dict.py` — Y9-2 semantic atlas
- `scripts/pipeline/generate_presentation_overlays.py` — Y9-2 overlay diff
- `docs/research/ascii/semantic_maps/schema.json` — pipeline-v3 schema
- `docs/plans/2026-03-23-workbench-canonical-spec.md` §2.3.6-§2.3.10
- Engine `APPEARANCE_SLOT_KIND` enum: `engine/multiplayer_protocol.h` (Y9-2)
