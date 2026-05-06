---
title: "fix: Source-layer integrity + body map generator"
type: fix
status: active
date: 2026-05-05
deepened: false
---

# Source-Layer Integrity + Body Map Generator

## Summary

Add `source_layer` tags to the 5 semantic maps that fail cell cross-reference
validation because they include cells from XP layers 3/4 without layer
attribution, correct the schema enum to include `"bigbee"`, then build a body
map generator that decomposes an XP sprite into a flat regional layout XP using
the semantic maps as the UV recipe.

---

## Problem Frame

The semantic map system is the UV mapping system for Asciicker sprites — per-angle
anchor maps are UV coordinate data, `slot_affinity` defines body map zones,
`source_layer` tags which XP layer cells come from. 5 of 9 maps currently fail
the `validate_cells_against_xp` cross-reference because they include armor/rider/helmet
regions whose cells live on layers 3-4 but lack `source_layer` tags, so the
validator checks them against layer 2 (the `semantic_layer` default) and finds
mismatches. Additionally, `bigbee-0100.json` declares `family: "wolack"` and
`"bigbee"` is absent from the schema's family enum.

These integrity failures block the next step: a body map generator that reads the
semantic maps to know which cells belong to which regions on which layers, then
extracts those cells from the XP sprite and lays them out in a flat body map XP
organized by region — the "middle window" in the UV mapping workflow.

---

## Requirements

- R1. All 9 semantic maps pass `validate_semantic_maps.py` with zero errors
- R2. Every region whose cells come from a non-default layer has an explicit `source_layer` integer
- R3. `"bigbee"` is a valid family in `schema.json`
- R4. `bigbee-0100.json` declares `family: "bigbee"`
- R5. A body map generator reads a semantic map JSON + its reference XP and outputs a flat body map XP with cells organized by region and angle
- R6. The body map XP is a standard `.xp` file openable in REXPaint, the workbench, or xp-tool MCP

---

## Scope Boundaries

- No compose/resolver direction (body map → sprite) — deferred
- No runtime skin modification
- No shader integration or engine changes
- No mounted rider cutting workflow (uses body map later but not in this plan)
- No changes to the anchor review tool in Y9-2

### Deferred to Follow-Up Work

- Body map → sprite resolver (compose direction): separate plan after decompose is proven
- Equipment authoring workflow (painting in body map equipment zones): depends on compose
- Mounted rider/mount body map generation: after player body map is proven

---

## Context & Research

### Relevant Code and Patterns

**Target repo:** asciicker-pipeline-v3 (semantic maps, schema, validator, generator)
**Cross-repo read:** asciicker-Y9-2 (XP sprites, xp_core.py for XP I/O)

- `docs/research/ascii/semantic_maps/schema.json` — JSON schema with `source_layer` field already defined
- `scripts/validate_semantic_maps.py` — validator with `validate_cells_against_xp()` that uses `region.get("source_layer", default_layer)` to check the right layer
- `docs/research/ascii/semantic_maps/*.json` — 9 map files, 5 failing
- Y9-2 `scripts/pipeline/xp_core.py` — `XPFile` class: load, save, layer/cell manipulation
- Y9-2 `scripts/pipeline/recolor_wearables.py` — pattern for XP I/O: load → iterate cells → modify → save
- Y9-2 `scripts/pipeline/xp_raw_layer_inspector.py` — `_exact_dump_payload()` for reading cells per layer/angle
- MCP xp-tool: `create_xp_file`, `write_cell`, `fill_rect` for programmatic XP creation

### Failing Maps — Exact Errors

| Map | Failing Regions | Source Layer | Error Count |
|-----|----------------|--------------|-------------|
| `player-anchors.json` | armor | L3 | ~4/angle x 8 angles |
| `player-1100-anchors.json` | armor, helmet | L3, L4 | ~15/angle x 8 angles |
| `wolfie-0100.json` | rider | L3 | ~4/angle x 8 angles |
| `wolack-0101.json` | rider | L3/L4 | ~25/angle x 8 angles |
| `bigbee-0100.json` | rider | L3/L4 | ~20/angle x 8 angles |

### Additional Data Issues

- `bigbee-0100.json` has `family: "wolack"` — should be `"bigbee"`
- `schema.json` family enum: `["player", "attack", "plydie", "wolfie", "wolack"]` — missing `"bigbee"`

---

## Key Technical Decisions

- **`source_layer` on region, not on individual cells**: Each region's cells come from one layer. Tagging the region is sufficient — no need for per-cell layer tags. The validator already reads `region.get("source_layer")`.

- **Body map layout: regions as horizontal strips, angles as columns within each strip**: Each region (face, hair, shirt, pants, boots, arms, armor, helmet) gets a horizontal band. Within each band, the 8 angles are laid out left-to-right. Cell positions within each angle section preserve the original frame-local (x,y) offsets so spatial relationships are maintained.

- **Body map is one XP layer**: The body map flattens multi-layer source data into a single visual layer. The `source_layer` tag in the semantic map tells the generator which XP layer to read each region's cells from. The body map itself doesn't need layer separation — it's a flat lookup texture.

- **Generator lives in pipeline-v3**: The semantic maps, schema, and validator are in pipeline-v3. The generator reads Y9-2 XP files via the `reference_xp` path (which resolves relative to the map file via the existing symlink). No Y9-2 code changes needed.

---

## Open Questions

### Deferred to Implementation

- **Exact body map dimensions**: Depends on how many cells each region has across all 8 angles. The generator should compute the layout dynamically rather than hardcoding dimensions.
- **Region ordering in the body map**: Which region gets which row band. Follow `APPEARANCE_SLOT_KIND` ordering (body → head → armor → weapon → shield → mount) as a sensible default.
- **Metadata layer in body map**: Whether the body map XP should have its own L0 metadata encoding region names/angles. Decide during implementation.

---

## High-Level Technical Design

> *This illustrates the intended approach and is directional guidance for review, not implementation specification. The implementing agent should treat it as context, not code to reproduce.*

```
BODY MAP GENERATOR FLOW:

  Input:  semantic_map.json + reference_xp (via symlink)
  Output: body_map.xp (flat regional layout)

  1. Load semantic map JSON
  2. For each frame (angle 0-7):
       For each region in the frame:
         layer = region.source_layer ?? semantic_layer
         Load XP cells from reference_xp at (layer, angle)
         Extract cells listed in region.semantic_cells
         Place them in the body map at the region's assigned band + angle column

  BODY MAP LAYOUT (example for player-0100):

  Row band 0: face     | A0 cells | A1 cells | ... | A7 cells |
  Row band 1: hair     | A0 cells | A1 cells | ... | A7 cells |
  Row band 2: shirt    | A0 cells | A1 cells | ... | A7 cells |
  Row band 3: pants    | A0 cells | A1 cells | ... | A7 cells |
  Row band 4: boots    | A0 cells | A1 cells | ... | A7 cells |
  Row band 5: arms     | A0 cells | A1 cells | ... | A7 cells |
  Row band 6: armor    | A0 cells | A1 cells | ... | A7 cells |  (from L3)
  Row band 7: helmet   | A0 cells | A1 cells | ... | A7 cells |  (from L4)
  
  Each angle column is frame_w wide x frame_h tall.
  Non-region cells within each angle section are transparent.
  Total width = 8 x frame_w, Total height = num_regions x frame_h
```

---

## Implementation Units

- U1. **Schema + bigbee family correction**

**Goal:** Add `"bigbee"` to the schema family enum and correct `bigbee-0100.json`'s family field.

**Requirements:** R3, R4

**Dependencies:** None

**Files:**
- Modify: `docs/research/ascii/semantic_maps/schema.json`
- Modify: `docs/research/ascii/semantic_maps/bigbee-0100.json` (via Y9-2 symlink source)

**Approach:**
- Add `"bigbee"` to the `family` enum array in schema.json
- Change `"family": "wolack"` to `"family": "bigbee"` in bigbee-0100.json

**Patterns to follow:**
- Existing family enum entries in schema.json

**Test scenarios:**
- Happy path: `validate_semantic_maps.py` no longer reports schema violation on bigbee family field
- Edge case: existing wolack maps still validate (wolack is still in enum)

**Verification:**
- `bigbee-0100.json` loads with `family: "bigbee"` and passes schema conformance

---

- U2. **Add source_layer to all 5 failing maps**

**Goal:** Tag every region whose cells come from a non-default layer with the correct `source_layer` integer so the validator checks cells against the right XP layer.

**Requirements:** R1, R2

**Dependencies:** U1 (bigbee family must be valid first so validator doesn't double-fail)

**Files:**
- Modify: `docs/research/ascii/semantic_maps/player-anchors.json` (via Y9-2 symlink)
- Modify: `docs/research/ascii/semantic_maps/player-1100-anchors.json` (via Y9-2 symlink)
- Modify: `docs/research/ascii/semantic_maps/wolfie-0100.json` (via Y9-2 symlink)
- Modify: `docs/research/ascii/semantic_maps/wolack-0101.json` (via Y9-2 symlink)
- Modify: `docs/research/ascii/semantic_maps/bigbee-0100.json` (via Y9-2 symlink)

**Approach:**
- For each map, identify regions with `slot_affinity: "armor"` → add `"source_layer": 3`
- For regions with `slot_affinity: "head"` that contain helmet cells (not hair/face) → add `"source_layer": 4`
- For mounted maps (wolfie/wolack/bigbee), rider regions → add `"source_layer": 3`, rider equipment → add `"source_layer": 4` where applicable
- Regions that are already on the default `semantic_layer` (2) do NOT get `source_layer` — omitting it is cleaner than `"source_layer": 2`

**Execution note:** After tagging each map, run `validate_semantic_maps.py` to confirm it passes before moving to the next map. Do not batch — verify one at a time.

**Patterns to follow:**
- The `source_layer` field is already in schema.json
- The validator's `validate_cells_against_xp()` already reads `region.get("source_layer", default_layer)`

**Test scenarios:**
- Happy path: each map passes validator after adding source_layer tags
- Integration: `validate_semantic_maps.py` reports 9/9 PASS after all maps are corrected
- Edge case: regions on default layer 2 should NOT have source_layer set (omit = cleaner)

**Verification:**
- `python3 scripts/validate_semantic_maps.py` exits 0 with 9/9 maps passing
- Manual spot-check: open one map, verify armor region has `"source_layer": 3` and body regions have no source_layer

---

- U3. **Body map generator script**

**Goal:** Create a script that reads a semantic map JSON and its reference XP file, extracts cells from the correct layers per region, and outputs a flat body map XP file organized by region bands and angle columns.

**Requirements:** R5, R6

**Dependencies:** U2 (maps must have correct source_layer tags for the generator to read the right layers)

**Files:**
- Create: `scripts/generate_body_map.py`
- Test: `scripts/test_generate_body_map.py`

**Approach:**
- Accept a semantic map JSON path as input, resolve `reference_xp` relative to the map file
- Load the XP file via the Y9-2 `xp_core.XPFile` class (importable via sys.path or vendor a minimal XP reader)
- For each region across all 8 angles, determine the source layer from `source_layer` or `semantic_layer` fallback
- Compute body map dimensions: width = 8 x frame_w, height = num_unique_regions x frame_h
- Create a new XP file with those dimensions
- For each angle, for each region, extract the listed cells from the source XP at the correct layer and angle, place them at the corresponding position in the body map
- Non-region cells are transparent (magenta bg for mounted families, black bg for player)
- Save the body map XP

**Patterns to follow:**
- `recolor_wearables.py` for XP I/O pattern (load, iterate, modify, save)
- `validate_cells_against_xp()` for the layer-resolution logic
- `_explicit_frame_rect()` in xp_raw_layer_inspector.py for atlas UV math (angle → sheet position)

**Test scenarios:**
- Happy path: generate body map from player-anchors.json → output XP has correct dimensions (8x7=56 wide, N_regions x 10 tall)
- Happy path: cell at (3,2) in face region angle 0 in the body map matches cell (3,2) layer 2 angle 0 in player-0100.xp
- Happy path: armor cells in the body map match cells from layer 3 (not layer 2) of the source XP
- Edge case: transparent cells (not in any region) are filled with the family's transparent bg color
- Edge case: map with no armor/helmet regions (e.g. attack-0001.json, L2 only) produces a body map with only body regions
- Error path: missing reference XP file → clear error message and exit

**Verification:**
- Generated body map XP opens in xp-tool MCP `read_xp` without error
- Visual inspection: body map shows recognizable character parts organized in horizontal bands
- Cell-level spot check: pick 3 cells from different regions, verify glyph+fg+bg match the source XP at the correct layer

---

## System-Wide Impact

- **Unchanged invariants:** The existing semantic map files continue to work with the anchor review tool in Y9-2 — `source_layer` is additive and ignored by code that doesn't read it. The validator in pipeline-v3 already handles the field.
- **Cross-repo:** Semantic maps are tracked in Y9-2, vendored to pipeline-v3 via symlink. Edits to map files happen in Y9-2. The generator script lives in pipeline-v3 and reads maps via the symlink.
- **Schema consumers:** Any tool reading the schema (validator, anchor review tool, workbench API) is unaffected — `source_layer` and `"bigbee"` are additive, not breaking.

---

## Risks & Dependencies

| Risk | Mitigation |
|------|------------|
| Editing maps via symlink — changes must land in Y9-2 not pipeline-v3 | Edit the real Y9-2 files directly, verify symlink reflects changes |
| Generator depends on Y9-2's xp_core.py for XP I/O | Import via sys.path or vendor a minimal XP reader. The symlink already makes Y9-2 reachable. |
| Body map layout may not look intuitive in REXPaint | Add a visual metadata layer (L0) with region labels as text. Defer to implementation. |

---

## Sources & References

- Prior plan: `docs/plans/2026-05-03-001-feat-per-angle-semantic-dictionary-plan.md`
- Prior plan: `docs/plans/2026-05-04-001-feat-anchor-review-tool-plan.md`
- Schema: `docs/research/ascii/semantic_maps/schema.json`
- Validator: `scripts/validate_semantic_maps.py`
- Skill: `~/.claude/skills/semantic-map-audit/SKILL.md`
- XP I/O: Y9-2 `scripts/pipeline/xp_core.py`, `scripts/pipeline/recolor_wearables.py`
- XP inspector: Y9-2 `scripts/pipeline/xp_raw_layer_inspector.py`
