# Anchor Review Tool & Dual-Role Cell Support

Created: 2026-05-04
Status: ready-for-planning
Scope: Standard

## Problem Frame

The per-angle semantic dictionary (FL-2897) needs human-verified ground-truth
body-part labels at each of the 8 directional angles. An auto-populated
template (`player-anchors.json`) already groups cells by color into candidate
regions, but the color heuristic gets transition cells wrong — particularly
half-block glyphs where one cell visually represents two body parts (e.g.,
glyph 223 with fg=pants and bg=shirt).

The user needs a visual review tool that:
- Shows the sprite at each angle with region labels overlaid
- Lets them select individual cells or rectangular groups
- Lets them assign or reassign cells to regions
- Handles half-block cells where fg and bg belong to different body parts
- Saves corrections back to the anchor JSON

## Requirements

- R1. Add `--anchor-review <path>` mode to Y9-2's
  `scripts/pipeline/xp_raw_layer_inspector.py` that loads an anchor JSON file
  and overlays region labels on the rendered sprite at each angle
- R2. Cell selection: cursor movement over cells, `x` to toggle-select a cell,
  rectangle selection via holding shift + cursor movement to select a block
- R3. Region assignment: after selecting cells, press a key to assign them to a
  named region (prompt for region name, or pick from existing regions)
- R4. Dual-role cells: for half-block transition cells (glyph 220/221/222/223),
  allow separate `fg_region` and `bg_region` assignment so each color channel
  maps to its owning body part
- R5. Schema extension: add optional `fg_region` and `bg_region` string fields
  to the `semantic_cells` items in pipeline-v3's `schema.json`
- R6. Save: `Ctrl+S` writes the updated anchor JSON back to disk, sets
  `confidence: "high"` on reviewed regions, adds the current angle to
  `angle_anchors.ground_truth_angles`
- R7. Angle navigation uses existing `a/d` keys. Region cycling uses existing
  `r/f` keys. Status bar shows current angle, region count, and reviewed
  status.
- R8. The review tool reads the anchor JSON's `frame_w`/`frame_h` to determine
  cell coordinate space — it does not use semantic_dict.py's module defaults

## Success Criteria

1. User can launch the inspector with `--anchor-review player-anchors.json`,
   navigate all 8 angles, see auto-grouped regions, correct assignments,
   and save — completing one full anchor file for the player family
2. Half-block transition cells (hair/face, shirt/pants, pants/boots boundaries)
   have correct `fg_region`/`bg_region` assignments after review
3. The saved anchor JSON passes `validate_anchor_file()` and pipeline-v3's
   `validate_semantic_maps.py`
4. After loading the reviewed anchors, `get_body_part_at(y, x, angle=N)` returns
   angle-correct labels that differ between angles where the sprite orientation
   changes

## Scope Boundaries

- Only the player family for the first pass. Attack/plydie anchors come after
  the player workflow is proven.
- The review tool modifies Y9-2's `xp_raw_layer_inspector.py` — no workbench
  web UI changes.
- Propagation to walk/attack frames is a separate step after all 8 idle anchors
  are confirmed.
- The mounted overlay workflow (wolfie/wolack anchors + UQ-008 validation) is
  future work that depends on this tool being proven for on-foot sprites first.

### Deferred to Follow-Up Work

- Mounted sprite anchors (wolfie, wolack, bigbee)
- Workbench web UI anchor-review surface
- Propagation algorithm tuning based on real anchor data

## Key Decisions

- **Tool choice:** `xp_raw_layer_inspector.py` — already has angle/frame
  navigation, region cycling, cell rendering, and semantic_dict integration.
  Adding anchor-review mode is an incremental extension, not a new tool.
- **Half-block handling:** Dual-role cells with `fg_region`/`bg_region` fields.
  Each cell still belongs to one primary region for `get_body_part_at()` lookup,
  but downstream consumers (recolor, overlay validation) use the sub-cell split
  to know which color channel to touch.
- **Selection model:** Cursor + toggle (`x` key) + rectangle selection
  (shift+cursor). Modeled after the overlay reviewer interaction pattern the
  user is familiar with.

## Context: How UV Mapping Applies Here

The per-angle anchor system IS the asciicker equivalent of a UV lookup texture.
In Unity, each pixel's RG channels encode coordinates into a separate lookup
map. In asciicker, each cell at each angle maps to a body-part ID in the anchor
JSON — the anchor JSON is the lookup texture.

This matters for mounted overlays because:
- At angle 0 (N/away), rider legs are behind the mount body — those cells
  belong to the mount's front layer
- At angle 4 (S/toward), rider legs are visible — those cells are rider body
- The static atlas says "legs are at rows 7-9" regardless of angle
- The per-angle anchor says "at angle 0, cells (2,7) and (4,7) are mount_body;
  at angle 4, cells (2,7) and (4,7) are rider_legs"
- `derive_overlay_masks()` uses this per-angle truth to correctly report which
  body regions each overlay covers at each angle

Without per-angle anchors, the mounted composition validation (UQ-008) cannot
determine whether an overlay is covering the right body regions — it would
use the same static guess at every angle.

## Outstanding Questions

### Blocking

None — all decisions are made.

### Non-Blocking

- Should the reviewer show a diff/comparison between the auto-grouped template
  and the user's corrections? (Nice to have, not required for first pass.)
- Should accepted regions auto-populate `palette_roles` from the cells' actual
  colors? (Would reduce manual JSON editing but adds complexity.)

## Sources & References

- FL-2897: per-angle semantic dictionary diagnosis and fix direction
- `scripts/pipeline/xp_raw_layer_inspector.py` — base tool (Y9-2)
- `docs/research/ascii/semantic_maps/player-anchors.json` — auto-populated template
- `docs/research/ascii/semantic_maps/schema.json` — pipeline-v3 schema
- `docs/plans/2026-05-03-001-feat-per-angle-semantic-dictionary-plan.md` — implementation plan
