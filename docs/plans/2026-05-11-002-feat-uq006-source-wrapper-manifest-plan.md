---
title: feat: UQ-006 source-wrapper manifest contract
type: feat
status: active
date: 2026-05-11
---

# feat: UQ-006 — Source-wrapper manifest contract

## Overview

UQ-006 implements the canonical section-2 source-wrapper manifest contract defined in
§2.3.1–§2.3.3 of the workbench canon spec
(`docs/plans/2026-03-23-workbench-canonical-spec.md`). The source panel in the browser
workbench currently persists slicing state (`source_boxes`, `source_cuts_v`,
`source_cuts_h`, `extractedBoxes`) as session-local authority through
`/api/workbench/save-session`. This plan replaces that with a canonical
`<source>.asciicker-source.json` sidecar manifest that is the single truth source for
source layout, shared by browser UI, MCP agents, CLI, and CI.

**Scope boundary:** this plan delivers slices S2-R5, S2-R6, and S2-R7 (manifest plumbing,
browser UI, and headless manifest read/write surface). It does not deliver the full
shared bundle-authoring headless contract (S2-R10, `UQ-010`), which covers
register/compile/phase0-build commands on top of manifest ownership.

## Problem Statement

### Current state

The source-wrapper layer (the browser "Source" panel and the auto-detect/I-guess
gears pipeline) has no canonical manifest owner:

- `web/workbench.js` keeps `state.sourceCutsV`, `state.sourceCutsH`,
  `state.extractedBoxes`, `state.sourceBoxes`, `state.sourceAnchorBox`, etc. as
  browser-local arrays keyed by numeric IDs.
- `src/pipeline_v2/service.py::workbench_save_session()` persists those arrays
  directly as session fields (`source_boxes`, `source_cuts_v`, `source_cuts_h`,
  `source_anchor_box`, `source_draft_box`).
- `src/pipeline_v2/service.py::_session_payload()` returns them in the canonical
  session payload for the browser to reload.
- There is no `<source>.asciicker-source.json` sidecar file format anywhere in
  the codebase.
- There is no headless mark/materialize/validate/status API surface for source
  regions.
- Agent automation of source slicing is blocked: MCP/CLI clients have no shared
  contract to write the same slicing state the browser edits.

### Goal state

1. One canonical `<source>.asciicker-source.json` sidecar owns source layout truth.
2. Session save/load derives `source_boxes` / `source_cuts_*` as mirror state from
   that manifest — they are no longer independent session authority.
3. The browser source panel is manifest-first: it shows sidecar status, saves/loads
   the sidecar, and routes user edits through manifest mutation rather than local
   array mutation.
4. A shared headless surface exposes read/write/validate/materialize/status commands —
   all backed by the same GET/PUT `/api/workbench/source-manifest` endpoints with
   query-param selectors — so MCP agents and CLI can author the same slicing state
   the browser edits.

## Proposed Solution

Implement in three ordered slices matching the canon spec:

1. **S2-R5**: Backend sidecar read/write/materialize plumbing
2. **S2-R6**: Browser source panel manifest-first UI
3. **S2-R7**: Shared headless read/write/validate/materialize/status surface

## Execution Order

Execute this plan in the order below. Do not skip a gate and do not patch UI
before the backend owner exists.

### Step 0 — Preflight and old-owner inventory

**Purpose:** prove the starting state and isolate unrelated dirt before any edit.

**Commands:**

```bash
python3 scripts/conductor_tools.py status --auto-setup
git status --short --branch
rg -n "source_boxes|source_cuts_v|source_cuts_h|source_anchor_box|source_draft_box" src/pipeline_v2 web tests
rg -n "extractedBoxes|sourceCutsV|sourceCutsH|sourceBoxes" web/workbench.js tests scripts
rg -n "bundle_blueprint_key|template_sets|prefix_catalog|presentation_kind|layer_definition" config src tests scripts
```

**Stop condition:** if unrelated dirty changes touch any target file in this
plan, stop and isolate scope with the user before editing. Never create a new
worktree.

### Step 1 — Registry/blueprint bridge

**Purpose:** unblock manifest validation/materialization without inventing a
second registry owner.

**Files:**
- `config/template_registry.json`
- `src/pipeline_v2/service.py`
- `tests/test_template_registry_schema.py`

**Required implementation:**
1. Treat current `template_sets` as the first executable `bundle_blueprint_key`
   source for UQ-006. Do not create a parallel blueprint registry in this slice.
2. Add a helper in `service.py` or `source_manifest.py` that resolves:
   `bundle_blueprint_key -> template_sets[bundle_blueprint_key] -> actions`.
3. Normalize action keys into presentation target descriptors:
   - `idle` / `mounted_idle` -> `presentation_kind="idle_walk"`
   - `attack` / `mounted_attack` -> `presentation_kind="attack"`
   - `death` -> `presentation_kind="plydie"`
4. For current scope, emit target descriptors with:
   `entity_key`, `character_key`, `presentation_kind`, `layer_owner_kind`,
   `slot`, `presentation_target_key`, `angles`, `frames`, `source_projs`,
   `projs`, `cell_w`, `cell_h`, `xp_dims`.
5. Add explicit blocker text only for future item/wearable authoring rows; do
   not make current UQ-006 depend on a non-existent wearable UI.

**Gate:**

```bash
python3 -m pytest tests/test_template_registry_schema.py -q
```

**Stop condition:** if `template_sets` cannot supply enough geometry for
`materialize_manifest()`, stop and update this plan before coding manifest
write paths. Do not stub silently.

### Step 2 — S2-R5 backend manifest owner

**Purpose:** create the sidecar owner and demote session source fields to mirrors.

**Files:**
- new `src/pipeline_v2/source_manifest.py`
- `src/pipeline_v2/service.py`
- `src/pipeline_v2/app.py`
- tests: add focused manifest tests in `tests/test_source_manifest.py` or
  extend the nearest existing workbench flow tests

**Required implementation:**
1. Add `source_manifest.py` with:
   - `manifest_path_for_source(source_path: Path | str) -> Path`
   - `load_manifest(source_path) -> dict`
   - `save_manifest(source_path, manifest, *, ack_stale_sha=False) -> dict`
   - `validate_manifest(manifest, source_png_path, *, ack_stale_sha=False) -> dict`
   - `materialize_manifest(manifest) -> dict`
   - `_create_migration_manifest(session, source_png_path) -> dict`
2. Use atomic write: write JSON to a same-directory temp file, then `replace()`.
3. `validate_manifest()` returns machine-readable:
   `{status: "PASS"|"WARN"|"FAIL", errors: [], warnings: [], sha256: {...}}`.
4. SHA policy is fixed:
   - missing/null `source.sha256` -> `WARN`, write allowed
   - present mismatch -> `FAIL`, PUT returns 409 unless `ack_stale_sha=true`
   - source rect out of bounds -> `FAIL`
   - duplicate full target tuple -> `FAIL`
   - flattened/missing ownership hierarchy -> `FAIL`
5. Add service functions:
   - `workbench_source_manifest_get(source_path|session_id, validate, materialize, req_id)`
   - `workbench_source_manifest_put(source_path, manifest, ack_stale_sha, req_id)`
6. Add routes in `app.py`:
   - `GET /api/workbench/source-manifest`
   - `PUT /api/workbench/source-manifest`
7. Update `_session_payload()` so `source_path + existing manifest` derives
   `source_boxes`, `source_cuts_v`, `source_cuts_h`, `source_anchor_box`,
   `source_draft_box`, `source_manifest_path`, and `source_manifest_status`
   from the manifest.
8. Update `workbench_save_session()` so source arrays sent by legacy/browser
   clients become manifest-draft input, are written to the sidecar first, and
   only then persist derived mirror arrays into the session JSON.

**Backend gates:**

```bash
python3 -m pytest tests/test_source_manifest.py tests/test_template_registry_schema.py -q
python3 -m compileall -q src/pipeline_v2
```

**Stop condition:** do not start browser changes until the backend can round-trip
a manifest, reject a bad hierarchy, reject duplicate target tuples, and materialize
mirror `source_boxes` from sidecar data.

### Step 3 — Action-grid compatibility wrapper

**Purpose:** keep legacy `action-grid/apply` working while preventing session
source arrays from remaining authoritative.

**Files:**
- `src/pipeline_v2/app.py`
- `src/pipeline_v2/service.py`
- tests covering `api_wb_action_grid_apply()` / `bundle_action_run()`

**Required implementation:**
1. In `bundle_action_run()`, if `source_path` has a sidecar, load/materialize it
   and use derived mirror state.
2. If only `source_path` exists and no sidecar exists, create an ephemeral
   `uniform_grid` manifest from the selected template action geometry, then use
   the same materializer path.
3. Never read raw session `source_boxes` as authority when a sidecar exists.
4. Add a regression test: deleting raw `source_boxes` from the session JSON while
   keeping the sidecar does not change action-grid/apply behavior.

**Gate:**

```bash
python3 -m pytest tests/test_source_manifest.py tests/test_workbench_flow.py -q
```

### Step 4 — S2-R6 browser source panel cutover

**Purpose:** route all source panel edits through manifest draft state.

**Files:**
- `web/workbench.html`
- `web/workbench.js`
- existing or new web tests near `tests/web/`

**Required implementation:**
1. Add state fields:
   - `state.sourceManifest`
   - `state.sourceManifestPath`
   - `state.sourceManifestStatus`
   - `state.sourceManifestDirty`
   - `state.sourceManifestLastSavedHash` or equivalent dirty detector
2. Add source-panel controls:
   - manifest path/status
   - Save Manifest
   - Reload from Manifest
   - validation result display
3. Add selected-region target controls:
   `entity_key`, `character_key`, `presentation_kind`, `layer_owner_kind`,
   `slot`, `presentation_target_key`, `angle`, `frame`, `projection`.
4. Convert add/edit/delete box and cut handlers so they mutate the manifest draft
   first, then update `state.extractedBoxes` / `state.sourceCutsV` /
   `state.sourceCutsH` as render mirrors.
5. Keep `renderSourceCanvas()` reading mirrors only; do not make it a second
   manifest parser.
6. Save-session must not be the source-layout write owner. Source panel save goes
   through `PUT /api/workbench/source-manifest` first.

**Browser gates:**

```bash
node --check web/workbench.js
node tests/web/workbench-template-gating.test.js
node --test tests/web/workbench-xp-preview-playback.test.mjs
```

If new source-manifest browser logic is split into a separate module, add a
targeted `node --test tests/web/<new-source-manifest-test>.mjs` gate in this
same step. Do not rely on `npm test` for this slice unless `package.json` is
updated to include the new tests.

### Step 5 — S2-R7 MCP/headless parity

**Purpose:** expose the same manifest owner to agents and CLI clients.

**Files:**
- `scripts/workbench_mcp_server.py`
- tests for MCP helper behavior if the repo has MCP tests

**Required implementation:**
1. Add a `_put_json()` helper if one does not exist.
2. Add tools:
   - `source_manifest_status(source_path)`
   - `source_manifest_read(source_path, validate=False, materialize=False)`
   - `source_manifest_write(source_path, manifest, ack_stale_sha=False)`
   - `source_manifest_validate(source_path)`
   - `source_manifest_materialize(source_path)`
3. All tools call the same HTTP GET/PUT routes from Step 2.
4. Error output must preserve HTTP status and response body for 409 validation
   failures.

**Gate:**

```bash
python3 -m py_compile scripts/workbench_mcp_server.py
```

### Step 6 — End-to-end proof and doc hygiene

**Required proof commands:**

```bash
python3 -m pytest tests/test_source_manifest.py tests/test_template_registry_schema.py tests/test_workbench_flow.py -q
python3 -m compileall -q src/pipeline_v2 scripts/workbench_mcp_server.py
```

**Required manual/e2e proof, if browser tooling is available:**
1. Start the workbench.
2. Load/upload a source PNG.
3. Draw a region.
4. Assign `entity_key`, `character_key`, `presentation_kind`, `layer_owner_kind`,
   `slot`, `presentation_target_key`, `angle`, `frame`, `projection`.
5. Save manifest.
6. Reload page/session.
7. Confirm region reappears from sidecar with fresh ephemeral numeric ID.
8. Use MCP or direct HTTP to update the manifest.
9. Reload browser and confirm the MCP-authored region appears.

**Doc hygiene:** after implementation, update `docs/PLAYWRIGHT_FAILURE_LOG.md`
and the canon queue/status text only with evidence from the commands above. Do
not mark UQ-006 closed unless browser and headless paths both prove one manifest
owner.

### Appearance ownership model

This plan must not flatten appearance ownership into "sprite files" or
"template actions." The source manifest only marks regions in a PNG; every
confirmed region must resolve into the runtime appearance hierarchy below.

1. **Entity owns all XP sprite assets.**
   - The entity/bundle is the top-level owner of emitted XP sprite assets.
   - A manifest region is not an independent asset owner; it is source geometry
     that feeds an entity-owned layer/presentation asset.
2. **Entity owns character.**
   - Character identity is the body/skin owner (`skin_definition_id` in the
     runtime identity layer), not a body part and not a presentation state.
3. **Character owns the core presentation kinds.**
   - The required character presentation families are `idle_walk`, `attack`,
     and `plydie`/death.
   - `idle_walk` covers idle and walk frames in one presentation family.
   - `presentation_kind_id` is the actor's current render verb/state family; it
     is not an outfit, wearable, mount, or source-sheet region.
4. **Character can have wearables.**
   - Wearables are item-owned layers attached to character slots such as
     `hat` and `armor`/`chestplate`.
   - A wearable does not own the character and does not fork the presentation
     family. It contributes a slot layer for the active character presentation.
5. **Mountables wrap the full character composition.**
   - Mount rear underlays render behind the character with any wearable combo.
   - Mount front overlays render in front of the character with any wearable combo.
   - Mounted output must therefore validate composition order around
     character-plus-wearables, not as a separate replacement character.

UQ-006 does not implement new wearable authoring or close mounted runtime proof.
Those remain under later Section-2 rows. UQ-006 does require the source-manifest
target model to preserve this hierarchy now, so later rows do not inherit a
wrong owner model.

### Manifest format

The sidecar is a JSON file adjacent to the source PNG: `<source_path>.asciicker-source.json`.
Format per §2.3.2:

```json
{
  "version": 1,
  "source": {
    "path": "uploads/wolfie_body.png",
    "sha256": "abcd1234...",
    "image_w": 252,
    "image_h": 200
  },
  "bundle_blueprint_key": "humanoid_skin_lane",
  "layout_mode": "explicit_regions",
  "layout": {
    "angles": 8,
    "frames": 4,
    "source_projs": 1,
    "angle_labels": ["N", "NE", "E", "SE", "S", "SW", "W", "NW"]
  },
  "guides": {
    "anchor_rect": null,
    "cuts_v": [100, 200],
    "cuts_h": [50],
    "detected_boxes": []
  },
  "regions": [
    {
      "id": "r1",
      "source_rect": [0, 0, 30, 25],
      "target": {
        "entity_key": "player_actor",
        "character_key": "normal_player",
        "presentation_kind": "idle_walk",
        "layer_owner_kind": "skin",
        "slot": "body",
        "presentation_target_key": "player_idle_walk_body",
        "angle": 0,
        "frame": 0,
        "projection": 0
      },
      "notes": "",
      "tags": [],
      "confidence": 1.0
    }
  ]
}
```

### Key architectural rules

1. `regions[]` are authoritative for convert/import/export. `guides.*` are editorial
   helpers only (derived, not authoritative).
2. Session `source_boxes`, `source_cuts_v`, `source_cuts_h`, `source_anchor_box`,
   `source_draft_box`, and `extractedBoxes` become mirror state derived from
   manifest `regions[]` and `guides.*` on save/load. They persist in the session
   JSON for backward-compat read, but are **never the authority**.
3. The manifest file lives at a path derived from the source PNG path. If a
   session has `source_path` set, the manifest path is
   `{source_path}.asciicker-source.json`.
4. No second source-layout model. The manifest is the single owner. If a client
   edits source layout without a manifest, an ephemeral manifest is created.
5. Manifest targets must preserve the appearance ownership hierarchy:
   `entity -> character -> presentation_kind -> layer owner/slot -> XP region`.
   Do not encode wearables, mounts, or presentation kinds as alternate character
   owners. Do not encode source regions as asset owners.
6. Mount target metadata must distinguish `mount_rear` and `mount_front` layer
   roles when mounted scope is present. Those roles compose around the full
   character-plus-wearables stack; they do not replace the character body layer.

## Technical Considerations

### S2-R5: Backend sidecar plumbing

**Files:** `src/pipeline_v2/service.py`, new `src/pipeline_v2/source_manifest.py`

1. **New module `source_manifest.py`**
   - `load_manifest(source_path: Path) -> dict` — reads `<source>.asciicker-source.json`
   - `save_manifest(source_path: Path, manifest: dict) -> None` — writes sidecar
     (atomic: write temp file, then rename for crash safety)
   - `validate_manifest(manifest: dict, source_png_path: Path) -> dict` — validates
     against §2.3.2 contract, returns `{status, errors, warnings}`. SHA256 policy:
     null/missing → `WARN` (allows writes). Present-but-mismatched → `FAIL` (blocks
     writes with 409 until the caller explicitly acknowledges staleness or recreates
     the manifest).
   - `materialize_manifest(manifest: dict) -> dict` — produces
     `{source_boxes, source_cuts_v, source_cuts_h, source_anchor_box}` mirror state.
     Loads `target_angles`, `target_frames`, `target_projs` internally from the
     blueprint registry (keyed by `manifest.bundle_blueprint_key`) rather than
     trusting caller parameters. The registry lookup must resolve the target
     through the appearance hierarchy (`entity_key`, `character_key`,
     `presentation_kind`, `layer_owner_kind`, `slot`) before selecting geometry.
   - `_regions_to_boxes(regions: list) -> list` — internal: converts manifest
     `regions[]` into the box format the browser expects. Box `id` is a generated
     ephemeral numeric ID (not the manifest string ID). `color` and `label` are
     editor-only decorations derived from region metadata.
   - `_create_migration_manifest(session: dict, source_png_path: Path) -> dict` —
     internal: creates an initial manifest from a legacy session's
     `source_boxes`/`source_cuts_*` arrays. Computes `source.sha256` from the
     source PNG at migration time. All boxes go into `guides.detected_boxes` (not
     `regions[]`, since target assignments are unknown). Box `label` matching a
     known `presentation_target_key` triggers auto-assignment into `regions[]` with
     best-guess angle/frame.

2. **Update `workbench_save_session()`**
   - When `source_path` is set and a manifest exists, derive mirror arrays from
     the manifest via `materialize_manifest()` before writing session JSON.
   - When session save includes `source_boxes` / `source_cuts_*` directly (browser
     sends them), write those mutations back to the manifest — then re-derive the
     mirror arrays.
   - Write manifest to sidecar before writing session JSON (manifest is authority).

3. **Update `_session_payload()`**
   - Derive `source_boxes`, `source_cuts_v`, `source_cuts_h`, `source_anchor_box`,
     `source_draft_box` from the manifest when `source_path` + manifest exist.
   - Add `source_manifest_path` and `source_manifest_status` to the session payload
     so the browser can display sidecar status.

4. **Update `workbench_load_session()`**
   - When loading a session with `source_path`, check for the sidecar manifest.
   - If manifest exists, materialize mirror state into the session response.
   - Add manifest status fields to the response.

5. **Add `PUT /api/workbench/source-manifest`**
   - Accept `{source_path, manifest}` — full manifest write
   - Validate manifest before writing (SHA256 mismatch = 409 Conflict with
     `{resolution: "recreate or ack"}` recovery instructions)
   - Atomic write to `<source>.asciicker-source.json` (temp file + rename)
   - Return `{status, validation, materialized}` with mirror arrays
   - One write surface for browser auto-save, MCP, and CLI

6. **Add `GET /api/workbench/source-manifest`**
   - Accept `?source_path=...` or `?session_id=...`
   - Optional `?validate=true` — runs full validation
   - Optional `?materialize=true` — returns derived mirror arrays
   - Returns manifest metadata + validation status

### S2-R6: Browser source panel UI

**Files:** `web/workbench.js`, `web/workbench.html`

1. **Manifest status bar** — add a small status area in the source panel showing:
   - manifest path (e.g., `wolfie_body.png.asciicker-source.json`)
   - save status: `Saved`, `Unsaved changes`, `No manifest`
   - validation status: `Valid`, `Warnings (N)`, `Errors (N)`
   - last modified timestamp

2. **Sidecar save/load affordances**
   - "Save Manifest" button (or auto-save on box/cut changes)
   - "Reload from Manifest" button (discard local changes, reload from sidecar)
   - Visual indicator when local state differs from saved manifest

3. **Per-region target assignment**
   - When a box is selected, show target fields:
     - `entity_key` (bundle/entity owner)
     - `character_key` (body/skin owner)
     - `presentation_kind` (`idle_walk`, `attack`, `plydie`/death)
     - `layer_owner_kind` (`skin`, `item`, `mount`)
     - `slot` (`body`, `hat`, `armor`/`chestplate`, `mount_rear`, `mount_front`, etc.)
     - `presentation_target_key` (dropdown from blueprint targets)
     - `angle` (number input, 0-indexed)
     - `frame` (number input, 0-indexed)
     - `projection` (0 or 1)
   - Changes to target fields update the manifest `regions[]` entry

4. **Guide vs region labeling**
   - Boxes from manifest `regions[]` are labeled "Region" with their target displayed
   - Boxes from `guides.detected_boxes` are labeled "Detected (unassigned)"
   - Vertical/horizontal cuts are labeled "Guide cut"
   - Clear visual distinction between authoritative regions and editorial guides

5. **Add-box / delete-box / edit-box routes through manifest mutations**
   - When user draws a new box, it starts as a guide entry in `guides.detected_boxes`
   - When user assigns a target to a box, it promotes into `regions[]`
   - When user deletes a region, it is removed from `regions[]`
   - All mutations update the local manifest draft and mark it dirty

### S2-R7: Headless surface

**Files:** `src/pipeline_v2/app.py`, `src/pipeline_v2/service.py`, `scripts/workbench_mcp_server.py`

1. **`PUT /api/workbench/source-manifest`**
   - Accept `{source_path, manifest}` — atomic full-manifest write
   - Validate before writing (SHA256 mismatch = 409 with `{resolution: "recreate or ack"}`)
   - Returns `{status, validation, materialized}` with mirror arrays
   - Used by browser (auto-save), MCP, and CLI — one write surface

2. **`GET /api/workbench/source-manifest`**
   - Accept `?source_path=...` or `?session_id=...`
   - Optional `?validate=true` — runs full validation, returns errors+warnings
   - Optional `?materialize=true` — returns derived mirror arrays (read-only)
   - Returns manifest metadata: path, exists, version, region count, mapped slots,
     unmapped required slots, last modified, validation status, SHA256 match status

3. **Validation rules** (applied on both PUT and GET `?validate=true`):
   - `version` is present and valid (integer ≥ 1)
   - `source.path`, `source.sha256`, `source.image_w`, `source.image_h` present
   - `source.sha256` is present: treat `null` or missing as WARN (e.g., migration-created
     manifest before SHA256 is computed), not FAIL; a present-but-mismatched value
     is **FAIL** (not WARN; recovery: user must either delete+recreate manifest or
     PUT with `?ack_stale_sha=true` to explicitly acknowledge staleness)
   - `bundle_blueprint_key` non-empty and present in template registry
   - `layout_mode` is `uniform_grid` or `explicit_regions`
   - Each `regions[].target` preserves the appearance hierarchy:
     `entity_key`, `character_key`, `presentation_kind`, `layer_owner_kind`,
     `slot`, `angle`, `frame`, `projection`.
   - Valid character presentation kinds for current character scope are
     `idle_walk`, `attack`, and `plydie`/death. `idle_walk` includes both idle
     and walk animation frames.
   - Wearable targets must use `layer_owner_kind="item"` plus a wearable slot
     such as `hat` or `armor`/`chestplate`; they must not create a second
     character owner.
   - Mounted targets must use explicit mount layer roles (`mount_rear` underlay,
     `mount_front` overlay) and must compose around the character-plus-wearables
     stack.
   - For `uniform_grid`: layout declares `angles`, `frames`, `source_projs`;
     validates `image_w % (frames * source_projs) == 0` and `image_h % angles == 0`
   - Each `regions[].source_rect` within source image bounds
   - Each `regions[].target` has required fields (`presentation_target_key`,
     `entity_key`, `character_key`, `presentation_kind`, `layer_owner_kind`,
     `slot`, `angle`, `frame`, `projection`)
   - No duplicate `(entity_key, character_key, presentation_kind, layer_owner_kind,
     slot, presentation_target_key, angle, frame, projection)` mappings —
     duplicates are FAIL (per §2.3.4)

4. **MCP tools** — add to `scripts/workbench_mcp_server.py`:
   - `source_manifest_status(source_path)` — manifest metadata (exists, version,
     region count, mapped/unmapped slots, last modified, SHA256 match status)
   - `source_manifest_read(source_path, validate=False, materialize=False)` — read
     manifest; set `validate=True` for validation report, `materialize=True` for
     derived mirror arrays
   - `source_manifest_write(source_path, manifest)` — write manifest with validation
   - `source_manifest_validate(source_path)` — convenience alias: `read` with
     `validate=True`
   - `source_manifest_materialize(source_path)` — convenience alias: `read` with
     `materialize=True`

   All tools route through the same `GET`/`PUT /api/workbench/source-manifest`
   endpoints. The naming aliases match the goal-state vocabulary so MCP clients
   can use `mark` (write), `materialize`, `validate`, or `status` without knowing
   query-param mechanics.

### ID mapping: manifest to browser

Manifest `regions[].id` is a stable string (e.g., `"r1"`, `"head_north"`).
Browser boxes use ephemeral numeric IDs generated by `materialize_manifest()`.
No browser numeric ID is ever written back to the manifest. This prevents
cross-client ID collisions — browser and MCP each get their own ephemeral IDs,
while the manifest string ID is the durable identity.

On reload, `materialize_manifest()` regenerates fresh numeric IDs. Box selection
state resets. This is acceptable because source panel selection is transient UI
state, not authored content.

### Cut format: preserve interaction state

Cuts in the manifest `guides` use object format to preserve selection state:

```json
"guides": {
  "cuts_v": [{"id": "cv1", "x": 100}, {"id": "cv2", "x": 200}],
  "cuts_h": [{"id": "ch1", "y": 50}]
}
```

This matches the browser's cut object shape and survives reload without data loss.

### Migration path

Existing sessions with `source_boxes` / `source_cuts_*` but no manifest:
1. On first save after UQ-006 lands, `_create_migration_manifest()` inspects the
   session arrays.
2. All boxes go into `guides.detected_boxes` (not `regions[]`) by default, since
   target assignments are not encoded in legacy box data.
3. **Auto-assignment heuristic**: if a box's `label` field matches a known
   `presentation_target_key` from the blueprint registry, it is auto-assigned into
   `regions[]` with best-guess `angle` (from box Y position / row height) and
   `frame` (from box X position / column width). This reduces the migration cliff
   for sessions that already have labeled boxes.
4. Boxes with `source: "auto"` (I-guess pipeline output) stay in
   `guides.detected_boxes` — they were never human-confirmed assignments.
5. On subsequent saves, the manifest is authority.

**Migration cliff warning**: sessions with unlabeled manually-drawn boxes will
wake up with empty `regions[]`. The user must re-assign targets. This is
intentional — the old model had no concept of target assignment, so there is
no truthful way to migrate it automatically.

### Backward compatibility

- Existing session JSONs with `source_boxes` / `source_cuts_v` / `source_cuts_h`
  continue to load. Those fields remain in `_session_payload()`.
- If no `source_path` is set on a session, no manifest operations apply.
- The `action-grid/apply` pipeline flow must continue to work, but must now
  consume manifest-derived mirror state rather than session-local arrays as
  authority. Acceptance proof: call `action-grid/apply` with a session that
  has `source_path` + manifest, confirm the backend reads `source_boxes`
  from `materialize_manifest()` output, not from raw session dict fields.
  Assert: deleting the raw `source_boxes` field from the session JSON (while
  keeping the manifest) does not change action-grid/apply behavior.

## Browser Owner-Demotion Checklist

S2-R6 must demote these old-authority mutation sites to manifest-derived mirror
readers. Every site below currently mutates `state.extractedBoxes`,
`state.sourceCutsV`, or `state.sourceCutsH` as independent authority. After
UQ-006 each site must instead work through manifest draft state (local mirror)
with writes routed through `PUT /api/workbench/source-manifest`.

### web/workbench.js — old-authority mutation sites

| Site (approx line) | Current behavior | Required change |
|--------------------|------------------|------------------|
| ~4187 save-session handler | Sends `source_boxes: state.extractedBoxes`, `source_cuts_v: state.sourceCutsV` as authority | Derive from manifest draft; send manifest via `PUT /api/workbench/source-manifest` first, then send session save with derived mirror |
| ~4280-4291 load-session handler | Copies `j.source_boxes` → `state.extractedBoxes`, `j.source_cuts_v` → `state.sourceCutsV` as authority | Copy from session mirror for initial render, then check for sidecar manifest; if manifest exists, reload from manifest and replace local state |
| ~4922-4923 box-overlap scan | Reads `state.extractedBoxes` directly | Read from manifest-derived mirror (same array, different origin — no code change needed after load path is fixed) |
| ~5049-5092 box commit/drag | Mutates `state.extractedBoxes[idx]` in place | Update local manifest draft; mark dirty; auto-save flushes to sidecar via PUT |
| ~5109 box delete | `state.extractedBoxes = state.extractedBoxes.filter(...)` | Remove from manifest draft `guides.detected_boxes` or `regions[]`; mark dirty |
| ~4930-5116 cut add/delete/drag | Mutates `state.sourceCutsV` / `state.sourceCutsH` in place | Update manifest draft `guides.cuts_v` / `guides.cuts_h`; mark dirty |
| ~3036 renderSourceCanvas | Reads `state.extractedBoxes`, `state.sourceCutsV`, `state.sourceCutsH` for rendering | No change — render from mirror state (which is now manifest-derived) |
| ~4290 max-id scan | Computes max ID across `extractedBoxes`, `sourceCutsV`, `sourceCutsH` | Use max of manifest-derived numeric IDs (regenerated by `materialize_manifest()`) |

### src/pipeline_v2/service.py — old-authority persistence sites

| Site (approx line) | Current behavior | Required change |
|--------------------|------------------|------------------|
| ~2833-2837 `_session_payload()` | Returns `source_boxes`, `source_cuts_v`, `source_cuts_h` from session dict as-is | Derive from manifest via `materialize_manifest()` when `source_path` + manifest exist; fall back to session dict fields (backward-compat read) when no manifest |
| ~4458-4482 `workbench_save_session()` | Accepts `source_boxes` / `source_cuts_v` / `source_cuts_h` from payload, writes directly to session dict | When `source_path` is set: accept these fields as browser-sent manifest draft mutations, flush to sidecar manifest first, then re-derive mirror arrays for session dict |
| ~4512 save response | Returns `source_boxes` count | Return count from manifest-derived state when manifest exists |

### Verification rule

After S2-R6, no code path may write `state.extractedBoxes`, `state.sourceCutsV`,
or `state.sourceCutsH` without an immediately preceding manifest draft update.
The arrays remain in memory for rendering continuity, but they are never the
authority for persistence.

### Interaction graph

1. User draws box in source panel → `workbench.js` updates the local
   manifest draft and its render mirror (`state.extractedBoxes[]`)
   → marks manifest draft dirty → auto-save triggers `PUT /api/workbench/source-manifest`
   → backend writes `<source>.asciicker-source.json` → backend calls `materialize_manifest()`
   → updates session `source_boxes` mirror → session auto-save picks up mirror →
   `_session_payload()` returns manifest-derived boxes.

2. MCP agent calls `source_manifest_write` (via `PUT /api/workbench/source-manifest`)
   → same manifest write path → same session mirror derivation.

3. Browser loads session → `workbench_load_session()` → detects manifest →
   materializes mirror state → browser renders source canvas from manifest-derived
   boxes/cuts.

### Error propagation

- Manifest parse errors → `source_manifest_status` returns `"error"` with parse details,
  browser shows error badge, source panel degrades gracefully (shows raw boxes from session
  mirror if available).
- Manifest validation failures → browser shows validation errors inline in source
  panel. "Save Manifest" is allowed on `WARN` but blocked on `FAIL` (SHA256
  mismatch, out-of-bounds regions, duplicate target slots). The button shows a
  blocking reason when save is not allowed.
- Sidecar write failures (disk full, permissions) → HTTP 500 with clear error, browser
  shows "Save failed" toast, manifest stays in draft state.

### State lifecycle risks

- **Orphaned manifest**: If user uploads a PNG then never saves the source panel, no
  manifest exists. On first save, migration creates one from session arrays.
- **Stale SHA256**: If the source PNG is replaced, the manifest `source.sha256`
  becomes stale. `validate` returns `FAIL` (present-but-mismatched), blocking
  writes. The browser source panel shows "Source changed — manifest may be stale"
  with "Recreate" / "Acknowledge" actions. If `source.sha256` is `null` (migration
  before computation), validation returns `WARN` and writes are still allowed.
- **Manifest without session**: A manifest file may exist without a corresponding
  workbench session. This is valid — the manifest is independent state for headless
  authoring.

### API surface parity

- Browser source panel edits → `PUT /api/workbench/source-manifest`
- MCP source edits → same endpoint
- CLI source edits → same endpoint
- Session save → manifest is authority, session gets derived mirror
- Session load → manifest is read, mirror state derived for backward-compat browser render

### Integration test scenarios

1. Browser draws box, saves manifest → reload page → box reappears (manifest is authority)
2. MCP adds region via `source_manifest_write` → browser refresh → new region visible in source panel
3. MCP adds region → browser assigns target → MCP re-reads → target assignment persisted
4. Validation: duplicate target slots → `FAIL` response → browser shows error
5. Session with old `source_boxes` but no manifest → auto-migration on save → manifest created

## Acceptance Criteria

### S2-R5 Backend

- [ ] `source_manifest.py` module with `load_manifest()`, `save_manifest()`,
  `validate_manifest()`, `materialize_manifest()` functions
- [ ] `<source>.asciicker-source.json` sidecar read/write works for both
  `uniform_grid` and `explicit_regions` layout modes
- [ ] `materialize_manifest()` loads blueprint geometry internally (no caller params)
- [ ] `save_manifest()` uses atomic temp-file-then-rename for crash safety
- [ ] `workbench_save_session()` derives `source_boxes` / `source_cuts_*` from
  manifest when `source_path` + manifest exist
- [ ] `_session_payload()` includes `source_manifest_path` and `source_manifest_status`
- [ ] `workbench_load_session()` materializes manifest mirror state into load response
- [ ] Unit tests for manifest round-trip, validation (including SHA256 mismatch = FAIL),
  materialization, and migration
- [ ] Unit tests reject flattened owner targets: no region may target a raw
  sprite bucket without `entity_key`, `character_key`, `presentation_kind`,
  `layer_owner_kind`, and `slot`
- [ ] Backward compat: sessions without `source_path` work unchanged

### S2-R6 Browser UI

- [ ] Source panel shows manifest path and save status
- [ ] "Save Manifest" / "Reload from Manifest" buttons functional
- [ ] Per-region target assignment UI (presentation_target, angle, frame, projection)
  in source panel when a box is selected, plus explicit entity/character/
  presentation/layer-owner/slot fields
- [ ] Guide vs region visual distinction (authoritative `regions[]` vs editorial
  `guides.*`)
- [ ] Box/cut edits mark manifest dirty, auto-save flushes to sidecar
- [ ] Degraded mode when manifest is missing or invalid (shows session mirror state
  with warning)

### S2-R7 Headless

- [ ] `PUT /api/workbench/source-manifest` — atomic full-manifest write with
  validation (SHA256 mismatch = 409 with recovery instructions)
- [ ] `GET /api/workbench/source-manifest` — manifest metadata + optional
  `?validate=true` and `?materialize=true`
- [ ] MCP tools: `source_manifest_status`, `source_manifest_read`,
  `source_manifest_write`, `source_manifest_validate`,
  `source_manifest_materialize` — all five wired to the same
  `GET`/`PUT /api/workbench/source-manifest` surface
- [ ] SHA256 mismatch is FAIL, blocks writes, requires explicit resolution

### ID mapping and data integrity

- [ ] Manifest string IDs never collide with browser ephemeral numeric IDs
- [ ] Cuts preserve `{id, x/y}` object format through manifest round-trip
- [ ] SHA256 mismatch returns FAIL, blocks PUT (409), requires explicit resolution
- [ ] Target hierarchy validation rejects wearables encoded as character owners,
  presentation kinds encoded as outfits, and mount layers encoded as replacement
  body/character layers

### Integration

- [ ] Browser-and-MCP shared-owner proof: MCP writes manifest via PUT, browser
  reloads and sees regions rendered (with fresh ephemeral IDs), browser assigns
  target through PUT, MCP re-reads via GET and confirms target persisted
- [ ] Validation gate: duplicate `(entity, character, presentation, layer owner,
  slot, target, angle, frame, projection)` returns FAIL
- [ ] Ownership-model proof: one manifest can represent body (`skin/body`),
  wearable (`item/hat` or `item/armor`), and mounted (`mount_rear`/`mount_front`)
  regions without creating a second character owner or treating the mount as a
  replacement character
- [ ] Migration: old session with `source_boxes` but no manifest → auto-creates
  manifest on first save
- [ ] Existing `action-grid/apply` pipeline flow consumes manifest-derived
  `source_boxes` (not raw session dict fields). Proof: deleting raw
  `source_boxes` from session JSON while keeping the manifest does not
  change `action-grid/apply` behavior.
- [ ] `python3 -m pytest tests/ -q` passes for all affected test modules

## Dependencies & Risks

### Dependencies

- UQ-004 CLOSED (normalized registry authority) — satisfied
- UQ-005 CLOSED (export quality contract) — satisfied
- **PRECONDITION — `bundle_blueprint_key` registry truth**: before S2-R5 starts,
  the Step 1 bridge must make current `template_sets` resolve as executable
  `bundle_blueprint_key` values. As of 2026-05-11, grep returned 0 literal
  `bundle_blueprint_key` matches in the template registry, so Step 1 is not
  optional. Do not start S2-R5 until `materialize_manifest()` and
  `validate_manifest()` can load geometry through that bridge.
- Current `source_boxes` / `source_cuts_*` session fields exist — confirmed in
  live code

### Risks

1. **Migration data loss**: Auto-migration from session arrays to manifest could
   lose target assignments if the session arrays don't encode them. Mitigation:
   migration places data in `guides.detected_boxes`, not `regions[]`, so no
   false assignments are created. Label-based auto-assignment (see Migration path)
   reduces but does not eliminate the cliff.

2. **Performance**: Materializing manifest into mirror arrays on every save/load
   adds overhead. Current box counts are small (<100), so this is negligible.
   No caching layer needed initially.

3. **Concurrent edits**: Browser and MCP could race on the manifest file.
   Mitigation: `save_manifest()` uses atomic temp-file-then-rename pattern.
   Last-write-wins for concurrent PUTs is the explicit UQ-006 behavior. If a
   later row adds optimistic concurrency, it must change this contract and tests
   in the same pass.

4. **Sidecar file proliferation**: Every uploaded PNG gets a `.asciicker-source.json`
   sidecar. Cleanup policy: sidecars are cleaned up when their source PNG is deleted
   (standard session cleanup already handles this).

5. **SHA256 staleness**: If source PNG is replaced and manifest carries a
   present-but-mismatched SHA256, validation returns `FAIL` and PUT writes are
   blocked with 409. If SHA256 is `null`/missing (migration-created manifest),
   validation returns `WARN` and writes are allowed. Recovery for FAIL: user must
   either (a) delete the manifest and recreate, or (b) PUT with
   `?ack_stale_sha=true` to explicitly accept the stale alignment. The browser
   source panel shows "Source changed — manifest may be stale" with
   "Recreate" / "Acknowledge" choice for FAIL; for WARN it shows
   "SHA256 not yet computed — save to update."

## Sources & References

### Origin
- **Failure log:** `docs/PLAYWRIGHT_FAILURE_LOG.md` — canonical issue tracking for this repo
- **Canon spec:** `docs/plans/2026-03-23-workbench-canonical-spec.md`
  - §2.3.1: Source sprite sheet layout contract
  - §2.3.2: Source manifest contract
  - §2.3.3: Agent/human slicing workflow contract
  - §2.14.6: runtime appearance hierarchy (`skin_definition_id`,
    `presentation_kind_id`, `layer_definition_id`, mount/wearable composition)
  - §2.5: Section-2 misalignment ledger (gap rows for UQ-006)
  - §2.5.2: Locked design decisions
  - §2.5.4: Open Section-2 contract slices (S2-R5, S2-R6, S2-R7)
  - Unified Sequence Of Actions: UQ-006 row

### Live code
- `src/pipeline_v2/service.py:2788-2847` — `_session_payload()` persists `source_boxes`, `source_cuts_v`, `source_cuts_h`
- `src/pipeline_v2/service.py:4301-4504` — `workbench_save_session()` accepts source array fields
- `src/pipeline_v2/service.py:3170-3176` — `workbench_load_session()`
- `web/workbench.js:86-136` — browser state model includes `sourceCutsV`, `sourceCutsH`, `extractedBoxes`, `sourceBoxes`
- `web/workbench.js:3033-3124` — `renderSourceCanvas()` renders boxes and cuts from state
- `web/workbench.js:4921-5030` — source box/cut interaction handlers
- `src/pipeline_v2/app.py:735-748` — save-session endpoint
- `src/pipeline_v2/app.py:535-547` — load-session endpoints

### Related work
- `scripts/extract_block_face_manifest.py` — block face extraction (matcher-quality slice, just landed)
- `scripts/glyph_assignment/` — glyph assignment shared module (used by block extractor)
- `tests/test_extract_block_face_manifest.py` — block manifest tests
