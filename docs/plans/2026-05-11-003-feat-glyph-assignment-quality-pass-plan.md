---
title: "feat: Glyph assignment quality pass — semantic bias, overrides, compact artifacts"
type: feat
status: active
date: 2026-05-11
origin: docs/plans/2026-05-11-001-feat-insertable-glyph-assignment-plan.md
---

# feat: Glyph assignment quality pass — semantic bias, overrides, compact artifacts

## Summary

Four targeted improvements to the already-implemented `scripts/glyph_assignment/` module and its `convert_24px_mini_template_2x.py` adapter: filling the semantic bias loading stub so sprite-role-aware glyph preferences actually fire; wiring a per-family regions dict and config profiles into the 24px converter; adding override sidecar consumption so human corrections survive reruns; and splitting the 177 MB `glyph_suggestions.json` into a full audit file plus compact review file plus per-sheet summary. The module's ownership boundary does not change — it still owns only cell-level glyph ranking.

---

## Problem Frame

The first implementation pass (plan `2026-05-11-001`, commits `0fcb0bc`, `214fc82`, `433896f`) landed the shared `glyph_assignment` package with all planned structure: `assign_cell` has a `region` parameter, `GlyphAssignmentConfig` has a `semantic_bias` dict, and `load_optional_semantic_bias()` exists in `semantic_bias.py`. However three wiring gaps prevent any of this from having practical effect:

1. `load_optional_semantic_bias()` returns `{}` unconditionally — the JSON parsing body was never implemented.
2. `convert_24px_mini_template_2x.py` calls `assign_image_cells(image, config)` with no regions dict, so every cell gets `region=None` and no bias fires regardless of what the config contains.
3. `glyph_review_overrides.json` has a defined contract in the plan but zero code.

As a result the 24px mini conversion produces ~51% cells needing review and a 177 MB artifact, with no way for a human reviewer to persist corrections across reruns. The block extractor (which passes an explicit bias dict and region per cell) already demonstrates the correct pattern; this plan closes the same gaps for the character converter.

---

## Requirements

- R1. `load_optional_semantic_bias()` parses the semantic map JSONs and returns a non-empty `{region: {glyph: weight}}` dict when the symlink is valid and maps exist for the requested role.
- R2. Built-in CP437 preference tables per sprite role (player/attack/plydie) exist as a floor; semantic map data augments but does not replace them.
- R3. Sparse map coverage (only angle 0 annotated per role) is handled gracefully — cells with no map coverage get `region=None` and remain unbiased.
- R4. `assign_image_cells` accepts an optional `regions: dict[tuple[int, int], str]` argument; the converter builds and passes this dict per family.
- R5. Per-family `GlyphAssignmentConfig` instances in the converter use appropriate `candidate_limit` and `score_delta_threshold` (following the block extractor's `candidate_limit=12`, `score_delta_threshold=0.35` as a reference high-water mark).
- R6. `glyph_review_overrides.json` is loaded before semantic bias in each conversion run; accepted cells bypass glyph matching and preserve human choices.
- R7. A compact review artifact omits alternatives and score components for `needs_review=False` cells; a per-sheet summary records top-level stats. The full audit file is still written.
- R8. The module's public API boundary does not change — all new caller responsibilities (building regions dict, loading overrides, per-family config) live in the adapter scripts, not inside `glyph_assignment/`.

---

## Scope Boundaries

- Y9-2 adapter or vendor contract changes are out of scope.
- Browser-based review UI is out of scope.
- Block face XP improvement — already landed in `433896f` via the semantic bias pass in `extract_block_face_manifest.py`.
- Section 2 manifest ownership, workbench session identity, runtime rendering.
- Authoring new semantic map JSON files or extending map coverage beyond angle 0 (maps are consumed as-is; sparse coverage is accepted).
- Color palette quantization strategy (raw RGB vs. 216-color) — open question from plan-001, not addressed in this pass.

### Deferred to Follow-Up Work

- Y9-2 vendor contract: separate PR in asciicker-Y9-2 after this pass stabilizes the pipeline-v3 API.
- Full workbench review UI for `glyph_review_overrides.json` (the sidecar format is the first product surface; a GUI editor is a follow-up).
- Per-threshold confidence tuning experiments beyond the presets defined in U2 (labelled "maybe" by the user — if presets in U2 are insufficient, a separate investigation is warranted).

---

## Context & Research

### Relevant Code and Patterns

- `scripts/glyph_assignment/semantic_bias.py` — stub `load_optional_semantic_bias()` (returns `{}` unconditionally), `apply_semantic_bias()` is implemented and correct; bias dict format is `{region_str: {glyph_int: float}}`
- `scripts/glyph_assignment/matcher.py` — `assign_cell(tile, config, masks, *, x, y, region)` already wired; `assign_image_cells(image, config)` is the gap (no regions dict accepted)
- `scripts/glyph_assignment/review_artifacts.py` — `write_suggestions_json`, `write_contact_sheet`, `cell_to_json`; the monolith write path is here
- `scripts/extract_block_face_manifest.py` — authoritative pattern: `block_semantic_bias()` builds the bias dict inline, `ocr_image()` calls `assign_cell(region=spec.family)`, `GlyphAssignmentConfig(candidate_limit=12, score_delta_threshold=0.35, semantic_bias=block_semantic_bias())`
- `docs/research/ascii/semantic_maps/player-0100.json` (and `attack-0001.json`, `plydie-0000.json`) — body-region maps with `frames[].regions[].{name, bbox, semantic_cells: [{x,y,glyph,fg,bg,role}]}`; existing sprite glyph data per region is the seed for preference tables
- `tests/glyph_assignment/test_matcher.py` — testing conventions: `_tile_for_glyph(cp437_int)` helper, `_config(**kwargs)` factory, `FONT_PATH` constant; no parametrize, concrete glyph values

### Institutional Learnings

- Semantic bias works at the close-candidate level — it adjusts ranking only when two candidates are within `score_delta_threshold` of each other. It does not force truth. This is already enforced in `apply_semantic_bias`; preserve it in all new preference tables.
- Override sidecar must be consumed BEFORE semantic bias (override > bias > raw score). This ordering ensures human choices are not overwritten by the bias pass.
- Per-family config profiles belong at the call site in adapter scripts, not inside the shared module — this preserves module portability across Y9-2 and any future caller.
- Compact artifact: high-confidence solid cells (glyph=219, `needs_review=False`) are the dominant volume driver in the 177 MB monolith; stripping their `alternatives` and `components`/`reasons` is the primary size reduction lever.
- Sparse map coverage (only angle 0 per role) is a known constraint — the bias loader must return usable tables even for partially-annotated roles rather than silently returning `{}`.

---

## Key Technical Decisions

- **Two-source bias tables**: Semantic bias dicts are built from two layers — built-in authored CP437 preference tables per role/region (the floor), merged with glyph data extracted from `semantic_cells[].glyph` in the map JSONs (the signal layer). Maps alone are insufficient because they are body-region oriented with sparse coverage; built-in tables alone would be ungrounded. The merge gives reviewable preferences that improve as map coverage grows.

- **assign_image_cells extended with optional `regions` dict**: Rather than making the converter loop call `assign_cell` directly (which would duplicate the pixel-slicing logic), `assign_image_cells` gains `regions: dict[tuple[int,int], str] | None = None`. Building the dict is the converter's job; the module just applies it per cell. This keeps the module API surface clean.

- **Override sidecar consumed in assign_image_cells pre-pass**: Override loading and application happens in `assign_image_cells` (or a thin wrapper in the converter) before the per-cell matching loop, not inside `assign_cell` itself. This keeps `assign_cell` a pure scoring function and makes the override pass auditable as a distinct step.

- **Compact artifact via filter kwarg on write_suggestions_json**: `write_suggestions_json(path, groups, compact=True)` is additive — the full file is still written; the compact path is an additional output. Compact strips `alternatives` and `components`/`reasons` from cells where `needs_review=False`. Per-sheet summary is a separate lightweight JSON with aggregate stats (total_cells, low_confidence_count, top_5_glyphs, confidence_p50/p90). No new schema or format negotiation needed.

- **Built-in preference tables are role-specific, not region-specific at first pass**: For player, bias toward contour/outline glyphs in body regions and avoid punctuation. For attack, bias toward slash/line/half-block glyphs in weapon regions. For plydie, bias toward solid/heavy glyphs (collapsed silhouette). Region granularity (face vs. shirt vs. pants) is added only where the semantic maps provide bbox evidence.

---

## Open Questions

### Settled at Plan Time

- **Which semantic maps are authoritative for bias on first 24px pass** (Open Q3 from plan-001): All available role maps (player/attack/plydie) are consumed as augmentation signal on top of built-in tables. Maps are not authoritative alone — they provide existing sprite glyph hints, not prescriptions.
- **Per-family vs. global confidence thresholds** (Open Q4 from plan-001): Per-family config presets at call-site in the adapter. Block extractor's `candidate_limit=12`, `score_delta_threshold=0.35` is the reference ceiling; player and plydie will use lower limits.

### Deferred to Implementation

- **Exact weight values for built-in preference tables**: Determined experimentally during U1 implementation by running against existing test tiles. Initial values should follow the block extractor's sign convention (positive = prefer, negative = penalize).
- **Whether `assign_image_cells` regions dict building should be extracted to a helper in the module or stay inline in convert_24px**: Depends on how much Y9-2 would reuse it; defer until U2 implementation reveals the complexity.
- **Threshold values for per-family config presets** (U2): Starting point is block extractor's values; tuning against low-confidence rate requires running conversion and measuring.

---

## High-Level Technical Design

> *This illustrates the intended approach and is directional guidance for review, not implementation specification. The implementing agent should treat it as context, not code to reproduce.*

```
convert_24px — per-family conversion loop:

  for each (name, family) in FAMILIES:
    bias_dict   = load_optional_semantic_bias(map_root, role=family)
    overrides   = load_overrides(override_path, name, family)   # {} if missing
    config      = FAMILY_CONFIGS[family]._replace(semantic_bias=bias_dict)
    regions     = build_regions_grid(map_root, family, frame_w, frame_h, angles)
    assigned    = assign_image_cells(image, config, regions=regions, overrides=overrides)
    write_xp(...)
    write_suggestions_full(...)
    write_suggestions_compact(...)   # needs_review=False cells stripped
    write_sheet_summary(...)
```

```
load_optional_semantic_bias(map_root, role):
  tables = BUILT_IN_TABLES[role]        # per-role floor
  for json_file in map_root.glob(f"{role}-*.json"):
    for frame in data["frames"]:
      for region in frame["regions"]:
        glyph_hints = {sc["glyph"] for sc in region["semantic_cells"]}
        tables[region["name"]] = merge(tables.get(region["name"], {}), glyph_hints)
  return tables
```

```
assign_image_cells(image, config, regions=None, overrides=None):
  masks = load_glyph_masks(config)
  for (x, y), tile in slice_image(image, config.target_cell_size):
    key = (x, y)
    if overrides and key in overrides and overrides[key].get("accepted"):
      yield AssignedCell from override      # bypass scoring
    else:
      region = regions[key] if regions else None
      yield assign_cell(tile, config, masks, x=x, y=y, region=region)
```

---

## Implementation Units

### U1. Fill load_optional_semantic_bias() and define built-in role preference tables

**Goal:** Replace the always-empty stub so `load_optional_semantic_bias()` returns a usable `{region: {glyph: weight}}` dict, seeded by built-in per-role tables and augmented by glyph hints from existing semantic map JSONs.

**Requirements:** R1, R2, R3

**Dependencies:** None

**Files:**
- Modify: `scripts/glyph_assignment/semantic_bias.py`
- Modify: `scripts/glyph_assignment/__init__.py` (re-export signature update if needed)
- Modify: `tests/glyph_assignment/test_matcher.py`

**Approach:**
- Add `BUILT_IN_ROLE_TABLES: dict[str, dict[str, dict[int, float]]]` — outer key is role ("player"/"attack"/"plydie"), middle key is region name, inner is `{glyph_int: weight}`. Initial values: player body regions prefer contour/half-block glyphs and penalize punctuation; attack weapon regions prefer `/`, `\`, `-`, `|`, half-blocks, shade glyphs; plydie prefers solid/heavy glyphs.
- `load_optional_semantic_bias(map_root, role=None)` — enumerate `{role}-*.json` files in `map_root`, parse each, collect `semantic_cells[].glyph` values per `region.name`, and merge with built-in tables using additive positive weights. When `role` is None or unknown, return built-in tables for all roles merged (backward-compatible for callers that do not pass role).
- Graceful degradation: missing symlink → RuntimeWarning (existing behavior) + return built-in tables, not `{}`. Malformed JSON → log warning, skip file. Missing role → return `{}` for unknown roles.
- Sparse coverage is accepted: regions without any map JSON evidence use only built-in weights.

**Patterns to follow:**
- `block_semantic_bias()` in `scripts/extract_block_face_manifest.py` — sign convention, dict shape
- Existing `load_optional_semantic_bias` warning behavior for missing symlink

**Test scenarios:**
- Happy path: call with valid `map_root` pointing to `docs/research/ascii/semantic_maps/` and `role="player"` → returns dict with at least one region key, weights non-zero for CP437 contour glyphs
- Happy path: built-in tables returned even when map root has zero JSON files for the role
- Edge case: `role="plydie"`, map has `plydie-0000.json` → semantic_cells glyphs merged into returned dict; coverage for other angles is missing but causes no KeyError
- Edge case: map JSON has a region with empty `semantic_cells` list → region entry present with built-in weights only, no crash
- Error path: one JSON file is malformed (not valid JSON) → `RuntimeWarning` emitted, that file skipped, other files still parsed
- Edge case: `role="unknown_family"` → returns `{}` with no warning (unknown roles have no built-in tables)
- Edge case: `map_root` symlink points to non-existent path → `RuntimeWarning` emitted, returns built-in tables (not `{}`)
- Integration: returned dict passes into `GlyphAssignmentConfig(semantic_bias=...)` without type error; `apply_semantic_bias` consumes it without error

**Verification:**
- All 8 existing matcher tests still pass
- New tests pass
- Running `load_optional_semantic_bias(Path("docs/research/ascii/semantic_maps"), role="player")` from the repo root returns a non-empty dict

---

### U2. Wire per-family regions dict and config profiles into 24px converter

**Goal:** Make `assign_image_cells` accept an optional `regions` dict and update `convert_24px_mini_template_2x.py` to build per-family region grids, per-family config presets, and pass both on each conversion run.

**Requirements:** R3, R4, R5

**Dependencies:** U1

**Files:**
- Modify: `scripts/glyph_assignment/matcher.py` (add `regions` kwarg to `assign_image_cells`)
- Modify: `scripts/glyph_assignment/__init__.py` (re-export updated signature)
- Modify: `scripts/convert_24px_mini_template_2x.py`
- Modify: `tests/glyph_assignment/test_matcher.py`

**Approach:**
- `assign_image_cells(image, config, masks=None, regions=None, overrides=None)` — add `regions: dict[tuple[int,int], str] | None = None`. For each cell, look up `regions[(x,y)]` and pass as `region` to `assign_cell`. Cells missing from the dict get `region=None`.
- In `convert_24px_mini_template_2x.py`, add `FAMILY_CONFIGS: dict[str, GlyphAssignmentConfig]` mapping family name to a config preset. Reference values: attack uses `candidate_limit=8`, `score_delta_threshold=0.25`; player uses `candidate_limit=5`, `score_delta_threshold=0.15`; plydie uses `candidate_limit=4`, `score_delta_threshold=0.20`. These are starting points — implementation should validate against a test run.
- Add `build_regions_grid(map_root, role, frame_w, frame_h) -> dict[tuple[int,int], str]` — read the semantic map JSON for the role, iterate over `frames[0].regions` (angle 0 as seed), convert each `region.bbox [x0,y0,x1,y1]` (frame-local pixel coords) to cell-grid coordinates using `frame_w / cell_w` and `frame_h / cell_h`, and populate the regions dict. Cells outside all bboxes are absent from the dict (→ `region=None`).
- `_image_to_cells()` in the converter should call `assign_image_cells(image, config, regions=regions)` with the built regions grid.
- Masks should be precomputed once per family config and reused across frames (do not reload on every `_image_to_cells` call).

**Patterns to follow:**
- `ocr_image()` in `scripts/extract_block_face_manifest.py` — explicit `region=spec.family` per cell, config with non-default thresholds
- `FAMILIES` constant in `convert_24px_mini_template_2x.py` for family dispatch structure

**Test scenarios:**
- Happy path: `assign_image_cells(image, config, regions={(0,0): "face"})` → returned cell at (0,0) has `region="face"`
- Happy path: `assign_image_cells(image, config, regions=None)` → all cells have `region=None` (backward-compatible)
- Happy path: cell coordinate not in regions dict → `region=None` for that cell, no KeyError
- Integration: end-to-end conversion run for "player" family completes without error; `assigned` cells include non-None region values for cells within a known bbox
- Integration: attack family conversion uses a config with `candidate_limit` > 2 (regression against previous hardcoded `candidate_limit=2`)
- Edge case: `build_regions_grid` called for a role with no JSON file → returns empty dict (all cells unbiased)
- Edge case: semantic map bbox coordinates larger than the current frame size → clamp silently, no crash

**Verification:**
- Conversion run produces at least some cells with non-None `region` field in `glyph_suggestions.json`
- `needs_review` rate after wiring is lower than pre-wiring baseline (or concentrated in known hard zones)
- Per-family config presets produce distinct `candidate_limit` values across families

---

### U3. Implement glyph_review_overrides.json sidecar consumption

**Goal:** Add a new `overrides.py` module to the `glyph_assignment` package that loads and applies human-authored override records; wire it into `assign_image_cells` so accepted cells bypass scoring on rerun.

**Requirements:** R6

**Dependencies:** None (can develop in parallel with U1/U2; integration wiring into U2's `assign_image_cells` is the join point)

**Files:**
- Create: `scripts/glyph_assignment/overrides.py`
- Modify: `scripts/glyph_assignment/__init__.py`
- Modify: `scripts/glyph_assignment/matcher.py`
- Modify: `tests/glyph_assignment/test_matcher.py`

**Approach:**
- `load_overrides(path: Path | None, name: str, family: str) -> dict[tuple[int,int], dict]` — reads the override file at `path` if it exists, filters to records matching `name` and `family`, returns a `{(x,y): override_record}` dict. If `path` is None or file is missing, returns `{}` without error. Malformed JSON → log warning, return `{}`.
- Override record fields: `glyph` (int, optional), `fg` (RGB tuple, optional), `bg` (RGB tuple, optional), `region` (str, optional), `accepted` (bool, optional). Any combination is valid.
- `assign_image_cells` gains `overrides: dict[tuple[int,int], dict] | None = None`. For cells with `accepted=True` override, construct a synthetic `AssignedCell` from the override record (mark `needs_review=False`, `confidence=1.0`, empty alternatives). For cells with explicit `glyph` override but no `accepted`, inject the glyph as the top candidate but still score alternatives.
- Override key format in the file: `"{name}/{family}/{x}/{y}"` — this is the canonical key shape; `load_overrides` parses and builds the `(x,y)` dict keyed lookup.
- Override consumption precedes semantic bias — this ordering is a correctness constraint, not a preference.

**Patterns to follow:**
- `block_semantic_bias()` pattern for graceful missing-file handling
- `GlyphCandidate` / `AssignedCell` dataclass construction patterns in `candidate.py`

**Test scenarios:**
- Happy path: override with `accepted=True` at (x=3, y=5) → returned `AssignedCell` at (3,5) has `chosen.glyph` from override, `needs_review=False`, `confidence=1.0`
- Happy path: override with `glyph=47` but no `accepted` → assign_cell still runs scoring but chosen glyph is 47 (slash), alternatives list is populated
- Happy path: override consumed before semantic bias — verified by asserting that a bias that would change glyph 47→48 does NOT apply when glyph=47 is in the override with `accepted=True`
- Edge case: override file path is None → no error, normal pipeline runs without override
- Edge case: override file exists but has no entries matching current (name, family) → `{}` returned, cells unaffected
- Edge case: override for coordinate (100,200) that is outside the current frame dimensions → silently ignored
- Error path: override file contains invalid JSON → `RuntimeWarning` emitted, returns `{}`, pipeline continues normally
- Integration: two consecutive runs of `assign_image_cells` with an override file → cells with `accepted=True` in override produce identical `AssignedCell` output regardless of whether semantic bias config changed between runs

**Verification:**
- New `overrides.py` module with `load_overrides` exported from `__init__.py`
- `assign_image_cells` accepts `overrides` kwarg (no existing callers break — default is None)
- All existing tests pass unchanged

---

### U4. Compact artifact format for glyph_suggestions.json

**Goal:** Extend `write_suggestions_json` to emit a compact review file (low-confidence/needs-review cells only) and a per-sheet summary file, in addition to the existing full audit JSON.

**Requirements:** R7

**Dependencies:** None (independent; can be developed in any order)

**Files:**
- Modify: `scripts/glyph_assignment/review_artifacts.py`
- Modify: `scripts/glyph_assignment/__init__.py`
- Modify: `scripts/convert_24px_mini_template_2x.py`
- Modify: `tests/glyph_assignment/test_matcher.py`

**Approach:**
- `write_suggestions_json(path, groups, compact=False)` gains a `compact: bool = False` kwarg. When `compact=True`, cells where `needs_review=False` are included but with `alternatives` dropped and `chosen.components`/`chosen.reasons` stripped to reduce size. Cells where `needs_review=True` are written in full.
- Add `write_suggestions_compact(path, groups)` as a convenience that calls `write_suggestions_json(path, groups, compact=True)`.
- Add `write_sheet_summary(path, groups)` — writes a lightweight JSON with one entry per group: `{name, family, total_cells, low_confidence_cells, needs_review_cells, top_5_glyphs: [{glyph, count}], confidence_p50, confidence_p90}`. No per-cell data.
- In `convert_24px_mini_template_2x.py`, update the output block to write three files:
  - `glyph_suggestions.json` — full audit (existing path, existing behavior)
  - `glyph_suggestions_compact.json` — compact review (new)
  - `glyph_suggestions_summary.json` — per-sheet stats (new)
- `cell_to_json` in `review_artifacts.py` may need a `compact: bool = False` parameter to strip components/reasons/alternatives at the cell level.

**Patterns to follow:**
- Existing `write_suggestions_json` structure and `cell_to_json` helper
- `conversion_manifest.json` per-entry stats fields (`low_confidence_cells`, `top_glyphs`) as precedent for summary field naming

**Test scenarios:**
- Happy path: `write_suggestions_json(path, groups, compact=True)` produces a file where `needs_review=False` cells have no `alternatives` key
- Happy path: `write_suggestions_json(path, groups, compact=True)` preserves all fields for `needs_review=True` cells
- Happy path: `write_sheet_summary(path, groups)` produces one entry per group with `total_cells`, `low_confidence_cells`, `needs_review_cells`, `top_5_glyphs` list, `confidence_p50`, `confidence_p90`
- Happy path: `write_suggestions_json(path, groups, compact=False)` (default) behavior is identical to current behavior — no regressions
- Edge case: group with all cells `needs_review=True` → compact file is same structure as full (no omissions)
- Edge case: group with zero `needs_review=True` cells → compact file still includes all cells but with stripped fields (not an empty file)
- Edge case: empty groups list → both files written as `{"groups": []}`, no crash
- Verification: compact file for a representative 27-group output (based on synthetic data) is measurably smaller than full output when more than half of cells are `needs_review=False`

**Verification:**
- Three output files written to `output/24px-mini-characters-template-2x/` after a conversion run: `glyph_suggestions.json` (unchanged size), `glyph_suggestions_compact.json` (smaller), `glyph_suggestions_summary.json` (< 100 KB)
- All existing tests pass unchanged
- `write_suggestions_json` with `compact=False` produces byte-identical output to the pre-change version

---

## System-Wide Impact

- **Interaction graph:** Only `convert_24px_mini_template_2x.py` and `extract_block_face_manifest.py` are callers of the glyph_assignment module. Block extractor is not modified in this pass. Workbench API / MCP tools / Flask app do not import glyph_assignment — no downstream blast radius.
- **Error propagation:** Bias loading failures and override loading failures are both non-fatal warnings. Conversion continues unbiased / without overrides rather than aborting — consistent with the existing behavior for missing symlinks.
- **State lifecycle risks:** The override sidecar is read-only during conversion. No conversion step writes to the override file. Human-authored overrides are preserved across reruns by definition (the file is not regenerated).
- **API surface parity:** `assign_image_cells` gains two new optional kwargs (`regions`, `overrides`). Both default to None, so all existing callers are unaffected. `write_suggestions_json` gains `compact=False` — backward-compatible default.
- **Integration coverage:** The main integration scenario that unit tests will not prove: a full conversion run produces non-null region fields in `glyph_suggestions.json` for cells inside known bboxes. This requires running `scripts/convert_24px_mini_template_2x.py` end-to-end and spot-checking the output file.
- **Unchanged invariants:** `assign_cell` signature does not change. `GlyphAssignmentConfig` fields do not change. `glyph_suggestions.json` full-audit format does not change. XP file format does not change. Workbench session IDs do not change.

---

## Risks & Dependencies

| Risk | Mitigation |
|------|------------|
| Semantic map bboxes are in pixel coordinates; cell-grid conversion may have off-by-one or frame-index mismatch | Build `build_regions_grid` with explicit tests against known map coords; spot-check output regions dict against visual frame layout |
| Built-in preference table weights may not improve low-confidence rate meaningfully | Plan for a measurement step in U2 verification: run conversion, compare needs_review rate before/after. If rate is not lower, adjust weights before promoting artifacts |
| Override sidecar key format (`name/family/x/y`) must be stable across reruns | Key is derived from asset name + family string + cell coords — all deterministic from conversion inputs. No session-dependent or timestamp components |
| Compact artifact may not be significantly smaller if most cells are `needs_review=True` | Summary stats in U4 will surface the real rate; if compact savings are negligible (< 30%), the feature is still correct and its cost is low |
| Sparse map coverage (angle 0 only) limits bias reach — most cells get `region=None` | Acceptable for this pass; the per-sheet summary will reveal how many cells actually received a region label |

---

## Sources & References

- **Origin document:** [docs/plans/2026-05-11-001-feat-insertable-glyph-assignment-plan.md](docs/plans/2026-05-11-001-feat-insertable-glyph-assignment-plan.md)
- Semantic map schema: `docs/research/ascii/semantic_maps/schema.json`
- Block extractor bias pattern: `scripts/extract_block_face_manifest.py` (`block_semantic_bias`, `ocr_image`)
- Existing module: `scripts/glyph_assignment/` (all files)
- 24px converter adapter: `scripts/convert_24px_mini_template_2x.py`
- Existing tests: `tests/glyph_assignment/test_matcher.py`
