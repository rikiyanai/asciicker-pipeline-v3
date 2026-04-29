---
title: "feat: Mounted Authoring Aids — Overlay Calibration and Semantic Cell Reviewer"
type: feat
status: active
date: 2026-04-29
deepened: 2026-04-29
origin: docs/plans/2026-03-23-workbench-canonical-spec.md
---

# feat: Mounted Authoring Aids — Overlay Calibration and Semantic Cell Reviewer

## Summary

This plan specifies the two workbench authoring aids that UQ-008 / S2-R9 makes mandatory for mounted-family parity: a non-destructive overlay calibration mode for solving rider/mount visual alignment, and a proposal-first exact-cell semantic matcher/reviewer that gates semantic record promotion behind human confirmation. Both aids can be built independently of the UQ-007 runtime identity layer and are intended as design-ahead deliverables. Neither aid may set `authorable: true` in the registry or unlock the full mounted bundle pipeline — that gate belongs to UQ-008's full execution, which is formally blocked on UQ-007 / S2-R8. This plan is a prerequisite for UQ-008 / S2-R9 full delivery; it does not close either row.

### Plan Completion Signal

This plan is complete when the doc is source-backed, dependency-ordered, and specific enough that an implementing agent can build U1 → U3 → U2/U4 without inventing route contracts, session schema behavior, or review-gate semantics. Runtime parity, bundle/export proof, and any `authorable: true` claim remain out of scope and belong to UQ-008 full execution.

---

## Problem Frame

The mounted families (`wolfie` = mounted idle/walk, `wolack` = mounted attack) carry `specified_not_authorable` status in the registry with two concrete authoring gaps: (1) the only workbench tools for per-frame positioning are the jitter controls, which mutate XP art in place via `shiftFrameContents` and produce no calibration artifact, and (2) there is no review loop for mounted semantic cell assignments — automated analysis would either bypass review or go unrecorded. Both gaps are now explicit in the Section 2 misalignment ledger (`docs/plans/2026-03-23-workbench-canonical-spec.md:2133`), S2-R9, and UQ-008, and are mandatory prerequisites for any mounted authoring claim. The existing jitter controls are explicitly not a mounted calibration owner and must remain untouched by this work.

---

## Requirements

- R1. A non-destructive overlay calibration panel must render a visual composite of player XP on top of a mounted XP at an adjustable (dx, dy), without calling `shiftFrameContents` or `commitWholeSheetDocumentMutation`.
- R2. The calibration panel must expose adjustable search bounds, display per-angle offset candidates with coverage scores, and write a confirmed calibration record to session metadata on acceptance.
- R3. The backend must expose `build_report()` from `mounted_rider_offset.py` via a Flask route and MCP tool, following existing service and `@tool()` decorator patterns.
- R4. A semantic cell matcher/reviewer must generate rider/mount cell-assignment proposals from an explicit exact-cell backend proposal payload keyed to a confirmed calibration record, and display them in a workbench review panel.
- R5. Semantic proposals must be gated by explicit human confirmation before any record is written. In the browser path, the Confirm button must be the only write handler. In the MCP path, writes require an explicit `reviewer_action: "accept"` declaration plus a proposal payload derived from a confirmed calibration record; there is no automatic write path.
- R6. Confirmed semantic records must include: per-angle cell-assignment evidence, a reference to the source calibration record, and confirmation context (timestamp, player/mounted XP paths).
- R7. Neither aid may set `authorable: true` in `config/template_registry.json` or trigger any mounted bundle pipeline path.
- R8. The existing jitter controls must remain unchanged; both aids are additive, not replacements.
- R9. Session save/load must round-trip `mounted_rider_calibration` and `mounted_semantic_review` metadata fields without loss.

---

## Scope Boundaries

- This plan is prerequisite tooling for UQ-008 / S2-R9 mounted-family parity. It does not claim mounted-row closure, runtime parity, or authorable readiness.
- Setting `authorable: true` for wolfie or wolack — blocked on UQ-007; out of scope here.
- Building the mounted bundle pipeline, native builder, or export flow — the rest of UQ-008.
- `bigbee` — explicitly deferred by canon; must not be pulled in.
- Resolving the AHSW×mounted authoring scope question (how many per-variant XPs are required) — a product decision that precedes UQ-008 full execution.
- Modifying jitter controls in any way.

### Deferred to Follow-Up Work

- Updating `bundle_contract.mjs` mounted row `mapping_status` from `specified_not_authorable` to an intermediate `calibration_confirmed` state — deferred to UQ-008 full execution.
- Updating `semantic_runtime_contract.test.mjs` hard-assertions on `specified_not_authorable` — same milestone.

---

## Context & Research

### Relevant Code and Patterns

- `web/workbench.js:3115` — `renderPreviewFrame()` reads only from `state.layers` via `cellForRender()`. An overlay canvas can render an independent pass without touching root editor state.
- `web/workbench.js:5707` — `shiftFrameContents()` and `web/workbench.js:6700` — `commitWholeSheetDocumentMutation()` are the exact boundary the calibration mode must never cross.
- `web/workbench.js:5760-5854` — existing jitter controls (`nudgeSelectedFrames`, `autoAlignFrameJitter`); the reference for the destructive mutation pattern the new aids must not follow.
- `web/workbench.html:301-326` — jitter panel HTML; calibration panel should be a sibling section with a distinct label.
- `scripts/mounted_rider_offset.py::build_report()` — clean importable function returning per-angle `{dx, dy, matches, overlaps, mismatches, coverage}` plus layout metadata and XP paths. Direct import into the service is safe (script conditionally inserts `src/` into `sys.path`).
- `scripts/mounted_rider_offset.py::_best_offset()` — asserts on an empty search space (`min_dx > max_dx` or `min_dy > max_dy`), so the service wrapper must reject inverted bounds before dispatch instead of surfacing a 500.
- `scripts/mounted_rider_offset.py::_resolve_file()` — private CLI helper that accepts loose repo/sprites-relative names. The Flask route must not reuse it implicitly; the service needs an explicit repo-relative resolution policy.
- `scripts/mounted_rider_residual_compare.py` — residual-subtraction pattern: mounted XP minus aligned wolf-layer ≈ rider pixels. Port as the in-browser three-pass composite preview.
- `src/pipeline_v2/service.py:3849` — `workbench_save_session()` accepts arbitrary passthrough fields and persists them to the session JSON on disk. However, `workbench_load_session()` returns only the fields enumerated in `_session_payload()` (lines 2468–2520), which is a hard-coded return dict. `mounted_rider_calibration` and `mounted_semantic_review` are not in it — U3 must explicitly add both fields to `_session_payload()` (null when absent) for the load path to surface them.
- `scripts/workbench_mcp_server.py` — existing `@tool()` decorator and Flask proxy pattern for new MCP tool additions.
- `scripts/xp_fidelity_test/bundle_contract.mjs:302-347` — `getSemanticRuntimeParityContract()` mounted extension rows; both wolfie and wolack are `mapping_status: 'specified_not_authorable'`.
- `tests/xp_fidelity_test/semantic_runtime_contract.test.mjs:64-67` — hard-asserts `specified_not_authorable` for both mounted rows; these assertions remain frozen throughout this plan.
- `docs/plans/2026-03-23-workbench-canonical-spec.md §1.8` — overlay architecture rule: overlay must render on its own canvas element, not the root editor canvas, and must hold no independent document state.

### Institutional Learnings

- §2.3.3 source-slicing contract establishes the product-wide pattern: automated analysis is assistive, not authoritative. Computed offset candidates are proposals; human confirmation is the gate. Do not auto-apply a computed offset even when coverage is high.
- Skin Dock gate plan (`docs/plans/2026-04-13-skin-dock-visual-gate-plan.md`): never ship a calibration without seeding from a known-good sprite pair first. Seed the calibration artifact using `player-0100.xp` + `wolfie-0100.xp` before using the tool for novel XPs.
- Default search range in `mounted_rider_offset.py` is −4 to +8 — a starting point, not ground truth. Validate against actual wolfie/wolack geometry at implementation time; always surface as a configurable parameter in the UI.
- Session disk persistence (write path) supports arbitrary fields via `workbench_save_session()`. The load path returns only fields enumerated in `_session_payload()` — new fields are silently dropped on load unless explicitly added to that function. U3 must update `_session_payload()` in addition to the save path.

---

## Key Technical Decisions

- **Overlay renders on its own canvas element, never the root editor canvas**: Consistent with §1.8 overlay architecture rule. The calibration panel creates and owns a dedicated `<canvas>` element for composite previews, preventing any accidental root editor state contamination.
- **Compute is always server-side via `build_report()`**: Offset computation runs as a backend call rather than a browser reimplementation. This keeps one algorithm shared across UI, MCP, and CLI consumers and avoids XP codec divergence.
- **Confirmation is browser-structural and MCP-explicit**: In the browser, the save handler for semantic records is wired only to the Confirm button. In MCP, the `accept` tool explicitly requires `reviewer_action: "accept"` plus a non-empty proposal payload rooted in a confirmed calibration record. There is no automatic trigger or background write path, but MCP still relies on explicit caller policy rather than a hidden browser-only invariant.
- **Session persistence via explicit `_session_payload()` registration**: Using `workbench_save_session()` for disk persistence, and adding both new fields to `_session_payload()` for the load path. The save function accepts arbitrary fields (write-side passthrough), but `workbench_load_session()` returns only the `_session_payload()` enumerated dict — new fields must be added explicitly to surface on load. U3 owns both changes. Using session metadata (rather than a sidecar) is a design-ahead convention until UQ-008 full execution defines canonical mounted session state.
- **Jitter controls remain destructive and unchanged**: The non-destructive calibration mode is additive. Jitter = per-frame art nudge; calibration = whole-sheet non-destructive offset solver for mounted families. Different contracts, different panels.
- **Scope freeze at artifact-produced, pre-authorable state**: Neither aid advances wolfie/wolack to `authorable: true`. They produce durable, human-confirmed artifacts that UQ-008 full execution can consume when UQ-007 unblocks.

---

## Open Questions

### Answered During Planning

- *Can `build_report()` be imported directly from the Flask service?* Yes — the script conditionally inserts `src/` into `sys.path` and the service process already runs with `PYTHONPATH=src`.
- *Does session save already support arbitrary passthrough fields?* Partially — `workbench_save_session()` writes arbitrary fields to the session JSON on disk (write-side passthrough is real). But `workbench_load_session()` returns only the `_session_payload()` enumerated dict (service.py:2468–2520); fields not in that dict are silently dropped on load. U3 must add both new fields to `_session_payload()` explicitly (null when absent) in addition to naming them in the save path.
- *Should the calibration panel replace the jitter panel visually?* No. Jitter and overlay calibration are separate workflows with separate mutation contracts. Adjacent sections, distinct labels.
- *Can both aids be built before UQ-007?* Yes — both aids produce artifacts that read XP files and write session metadata; they do not touch the registry `authorable` flag or bundle pipeline paths that require UQ-007's identity layer.

### Deferred to Implementation

- *Exact rendering approach for the in-browser composite preview*: The residual-subtraction pattern from `mounted_rider_residual_compare.py` is the reference, but the mapping to canvas drawing calls depends on how `renderPreviewFrame()` encodes character + fg/bg color. Resolve at implementation time by reading that function.
- *Whether MCP `accept_mounted_cell_proposals` operates on the currently-loaded session or requires an explicit `session_id`*: Use explicit `session_id`. The MCP server is a stateless HTTP proxy today, so hidden “current session” behavior would be ambiguous and drift-prone.
- *Exact (dx_range, dy_range) defaults for wolfie vs wolack*: Validate empirically against the canonical sprite pairs before setting UI defaults; −4/+8 is a starting point.
- *Whether wolfie and wolack share one calibration record per session or maintain separate records*: Store records keyed by `mounted_xp` path (single session may hold multiple mounted-family records). Do not collapse wolfie and wolack into one undifferentiated session-global calibration blob.

---

## High-Level Technical Design

> *This illustrates the intended approach and is directional guidance for review, not implementation specification. The implementing agent should treat it as context, not code to reproduce.*

The two aids share a single compute backend and produce a sequential chain of session artifacts:

```
Aid A (Overlay Calibration)                 Aid B (Semantic Cell Review)
─────────────────────────────               ──────────────────────────────────────

[U1: Flask route + MCP tool]
     mounted_rider_offset.py
         build_report()
              │
              ▼
[U2: Browser calibration panel]
   player XP  ──┐
   mounted XP ──┼──► read-only composite preview
   dx/dy input ─┘     (always-on two-file overlay; optional residual/subtracted preview when a validated bare-mount base is configured)
              │
         [Accept]  ◄── human confirms visual alignment
              │
              ▼
[U3: Session save]
   mounted_rider_calibration: {
     per_angle: [{dx, dy, coverage, ...}],
     accepted_angle, accepted_dx, accepted_dy, accepted_at,
     player_xp, mounted_xp
   }
              │
              ▼                           [U4: Backend proposal payload]
                                         exact-cell proposals from confirmed calibration
                                                          │
                                                          ▼
                                        [U4: Browser semantic review panel]
                                              reads proposal payload + session calibration
                                                          │
                                           displays per-angle cell categories:
                                             rider-only / mount-only / overlap / unresolved
                                                          │
                                           color-coded cell-map preview (read-only)
                                                          │
                                    ┌── "I have reviewed the proposals" checkbox
                                    │
                                    └── [Confirm]  ◄── human confirms proposals
                                                  │
                                            [U3: Session save]
                                   mounted_semantic_review: {
                                     per_angle_assignments: [... exact cells ...],
                                     calibration_record_ref: {...},
                                     confirmed_at, player_xp, mounted_xp
                                   }
```

MCP surface mirrors the browser surface: `compute_mounted_rider_calibration` (read), `get_mounted_cell_proposals` (read), `accept_mounted_cell_proposals` (write, requires explicit `reviewer_action: "accept"`).

---

## Implementation Units

**Implementation order:** U1 first (no deps), then U3 (session fields and typed write endpoints), then U2 and U4 in parallel. U2 and U4 both depend on U3 being real because both panels write session-backed artifacts.

- U1. **Backend calibration compute endpoint and MCP tool**

**Goal:** Expose `mounted_rider_offset.py::build_report()` via a Flask API route and a workbench MCP tool. This is the compute foundation shared by both aids and the CLI workflow.

**Requirements:** R3

**Dependencies:** None

**Files:**
- Modify: `src/pipeline_v2/app.py` — new route `POST /api/wb/mounted-calibration/compute`
- Modify: `src/pipeline_v2/service.py` — new service function `compute_mounted_rider_calibration()`
- Modify: `scripts/workbench_mcp_server.py` — new MCP tool `compute_mounted_rider_calibration`
- Reference: `scripts/mounted_rider_offset.py` (import `build_report` — no changes to the script)
- Test: `tests/test_mounted_calibration_backend.py`

**Approach:**
- Route accepts `{player_xp, mounted_xp}` (repo-relative paths) plus optional `{min_dx, max_dx, min_dy, max_dy}` search bounds and optional `{anim_index, frame_index, proj, layer}` parameters (defaults: `anim_index=0`, `frame_index=0`, `proj=0`, `layer="auto"` — validate these defaults against actual wolfie/wolack geometry at implementation time).
- Path resolution: validate that `player_xp` and `mounted_xp` are repo-relative; resolve against `ROOT`; reject paths containing `..`. Do not call `_resolve_file()` from the CLI script (private helper); replicate the resolution logic in the service wrapper.
- Bounds validation: validate `min_dx <= max_dx` and `min_dy <= max_dy` before calling `build_report()`; return HTTP 422 with a descriptive error if inverted. (`_best_offset()` raises `AssertionError`, not `ValueError`, on an empty search range — the service must gate this before dispatch.)
- Service function imports `build_report` directly (not subprocess); search bounds default to `mounted_rider_offset.py` defaults but are always surfaced as configurable.
- Response shape matches `build_report()` output exactly — no transformation; this JSON is the calibration artifact format.
- MCP tool follows the existing `@tool()` pattern and proxies to the Flask route.

**Patterns to follow:**
- Existing `@tool()` wrapped MCP tools in `scripts/workbench_mcp_server.py`
- Existing Flask route + service function split in `src/pipeline_v2/app.py` + `service.py`

**Test scenarios:**
- Happy path: valid `player-0100.xp` + `wolfie-0100.xp` → per-angle offset report with coverage > 0
- Happy path: valid `player-0100.xp` + `wolack-0001.xp` → returns per-angle report
- Happy path: custom search bounds narrower than default → offsets constrained to those bounds
- Error path: player XP path does not exist → 404 with descriptive `error` field
- Error path: player and mounted XP have different angle counts → 400 with ValueError detail surfaced
- Error path: inverted search bounds (min_dx > max_dx or min_dy > max_dy) → 422 with descriptive error; `build_report()` is not called
- Edge case: search range too narrow to include the true best offset → best-in-range returned without error (caller checks coverage)
- Integration: MCP tool `compute_mounted_rider_calibration` returns same JSON shape as the HTTP route

**Verification:**
- `POST /api/wb/mounted-calibration/compute` with canonical reference pair returns non-empty `per_angle` list
- MCP tool is listed in the MCP server tool manifest
- Test suite passes; no XP art files are modified

---

- U2. **Non-destructive overlay calibration panel (workbench UI)**

**Goal:** A workbench panel that renders a read-only composite of player XP over a mounted XP at an adjustable (dx, dy). Confirms and writes a calibration record to session metadata on accept. Never calls `shiftFrameContents` or `commitWholeSheetDocumentMutation`.

**Requirements:** R1, R2, R8

**Dependencies:** U1, U3

**Files:**
- Modify: `web/workbench.html` — new panel section after the jitter panel, labeled "Mounted Overlay Calibration" (not "Frame Jitter")
- Modify: `web/workbench.js` — dedicated `<canvas>` overlay rendering, calibration UI state (`pendingCalibration`), compute dispatch, accept/discard handlers, session calibration save call

**Approach:**
- Panel controls: player XP path input (default: current session player XP), mounted XP selector — two-option radio group labeled "wolfie (idle/walk)" and "wolack (attack)", defaulting to wolfie; no unselected state possible, dx/dy number inputs with ±1 step buttons, collapsible search bounds (`min_dx`/`max_dx`/`min_dy`/`max_dy`) — default collapsed; values preserved across collapse/expand, `Compute Offset Candidates` button, dedicated composite preview `<canvas>`, per-angle best-offset table (dx, dy, coverage), accept and discard buttons.
- **Compute:** calls `POST /api/wb/mounted-calibration/compute`; Compute button disables and label changes to "Computing…" while the request is in-flight; re-enables on success or error. Populates the candidate table; auto-selects the best-coverage angle as the initial preview offset. Clicking a row in the per-angle table switches the preview canvas to that angle's offset; the selected row is highlighted; dx/dy inputs update to reflect the selected angle so the user can fine-tune from there.
- **Composite preview:** always provide a two-file overlay preview (mounted XP plus shifted player). If a validated bare-mount base is configured for the selected mounted family, also expose a residual/subtracted preview mode. Because this repo snapshot only has one checked-in bare wolf base (`sprites/wolfie.xp`), residual preview is optional and family-mapped, not assumed universally available. No writes to `state.layers`.
- **Calibration state:** `state.pendingCalibration = {player_xp, mounted_xp, dx, dy, report}` during preview; pure UI state, no document side effects. Discarding clears it; no undo entry needed. Step buttons (±1) re-render the preview immediately on click; typed dx/dy input re-renders on blur or Enter (not on each keystroke).
- **Accept:** sends confirmed record to `POST /api/wb/session/mounted-calibration` (U3). Confirmed payload stores `accepted_angle` alongside the selected display `accepted_dx` / `accepted_dy`; future semantic derivation must still use each angle's own `per_angle[i].dx` / `per_angle[i].dy`. Accept button disables while the save is in-flight. On success: clears pending state, shows "Calibration confirmed at [timestamp]" status message. On error: re-enables Accept (pending calibration state preserved for retry), shows a specific error message in the panel status area.
- **§1.8 compliance:** the panel's `<canvas>` is a sibling element to, not a child of, the root editor canvas; the panel holds no document state.
- **Accessibility minimum:** use a native checkbox for any gating control; the step buttons must respond to Space/Enter; table rows must be focusable and selectable via Enter.

**Patterns to follow:**
- `web/workbench.html:298-327` jitter panel HTML for section structure reference
- `web/workbench.js:3115` `renderPreviewFrame()` for cell-by-cell rendering conventions (adapt for off-document canvas)
- `scripts/mounted_rider_residual_compare.py` for residual/subtraction preview logic when a validated bare-mount base exists

**Test scenarios:**
- Happy path: select player + wolfie, click Compute → preview canvas renders; per-angle table populated
- Happy path: manually adjust dx/dy inputs → preview canvas re-renders at new offset without a new Compute call (step buttons: on click; typed input: on blur or Enter)
- Happy path: click non-default angle row in the per-angle table → preview canvas switches to that angle; dx/dy inputs update to that angle's offset; selected row is highlighted
- Happy path: Accept → session includes `mounted_rider_calibration` field; panel shows confirmation message
- Happy path: Discard → session unchanged; XP files byte-identical
- Happy path: switch mounted file → Compute re-runs; prior pending state cleared
- Edge case: incompatible layout (angle mismatch) → error shown in panel status; Accept button disabled
- Edge case: coverage < 10% on all angles → Accept allowed but warning displayed
- Edge case: compute request pending → button disabled, label `Computing…`, repeat clicks ignored
- Edge case: Accept save error → pending state preserved; Accept re-enabled; explicit error shown
- Integration: session save after Accept → session reload → `mounted_rider_calibration` field present and value-identical

**Verification:**
- After Accept, `GET /api/wb/session/{id}` response includes `mounted_rider_calibration` with per-angle offsets
- No calls to `shiftFrameContents` or `commitWholeSheetDocumentMutation` in the calibration panel code path
- XP files byte-identical before and after any calibration panel interaction

---

- U3. **Session persistence for calibration and semantic review records**

**Goal:** Ensure `mounted_rider_calibration` and `mounted_semantic_review` fields round-trip through session save/load. Adds typed write endpoints so both panels have a reliable save path, and names the fields explicitly in service code so they survive future schema cleanup.

**Requirements:** R9

**Dependencies:** U1

**Files:**
- Modify: `src/pipeline_v2/app.py` — new routes `POST /api/wb/session/mounted-calibration` and `POST /api/wb/session/mounted-semantic-review`
- Modify: `src/pipeline_v2/service.py` — update `workbench_save_session()` to explicitly preserve both new fields; update `_session_payload()` to include `mounted_rider_calibration` and `mounted_semantic_review` in its return dict (null when absent, so `workbench_load_session()` surfaces them on load)
- Test: `tests/test_mounted_calibration_backend.py` (extend with session round-trip cases)

**Approach:**
- Both routes accept `{session_id, data: {...}}` and merge the typed field into the session JSON via `workbench_save_session()`.
- Both fields are explicitly named in save/load code rather than relying on the generic passthrough, so they survive any future cleanup that strips unknown fields.
- `workbench_load_session()` returns both fields when present; absent fields return `null` without an error.
- Malformed data body (missing required subfields) returns 400; session is not mutated.

**Test scenarios:**
- Happy path: POST calibration record → GET session → field present and value-identical
- Happy path: POST semantic review record → GET session → field present
- Happy path: session without these fields → load → both fields return null; no error
- Happy path: overwrite existing calibration record with a new one → GET session → latest record returned
- Edge case: malformed data body → 400 response; session not mutated

**Verification:**
- Session JSON files on disk contain both fields after save
- Session reload in the workbench UI correctly surfaces `mounted_rider_calibration` when present

---

- U4. **Exact-cell semantic matcher/reviewer panel (workbench UI + MCP)**

**Goal:** A workbench review panel that reads a confirmed calibration record, consumes an exact-cell proposal payload from the backend, displays the proposals in a color-coded review panel, and writes a confirmed semantic review record only after explicit human confirmation. Structurally prevents any browser-side heuristic-to-semantic write path.

**Requirements:** R4, R5, R6, R7

**Dependencies:** U2, U3

**Files:**
- Modify: `web/workbench.html` — new review panel section adjacent to the calibration panel, labeled "Mounted Semantic Cell Review"
- Modify: `web/workbench.js` — proposal fetch from backend, cell-category display, mandatory review checkbox, confirm handler, save-semantic-review call
- Modify: `src/pipeline_v2/app.py` — new route `POST /api/wb/mounted-semantic/proposals`
- Modify: `src/pipeline_v2/service.py` — new service function `compute_mounted_semantic_proposals()`
- Modify: `scripts/workbench_mcp_server.py` — two new MCP tools: `get_mounted_cell_proposals` (read-only) and `accept_mounted_cell_proposals` (write, requires `reviewer_action: "accept"`)
- Test: `tests/test_mounted_semantic_review.py`

**Approach:**
- Panel activates when `mounted_rider_calibration` is non-null in the loaded session.
- **Proposal data source:** do not derive proposals from the saved calibration record in the browser. `build_report()` only returns aggregate counts and per-angle offsets, not exact cell arrays. U4 therefore adds a backend proposals route/tool that returns exact per-angle cell sets and category counts rooted in the confirmed calibration record.
- **Proposal derivation:** the backend proposal payload uses each angle's own calibration (`per_angle[i].dx`, `per_angle[i].dy`), not the single `accepted_dx` / `accepted_dy` display offset. Categories are `rider_only`, `mount_only`, `overlap`, and `unresolved`. Residual/subtraction logic may contribute when a validated bare-mount base exists; otherwise unresolved cells remain explicit instead of being silently forced into a semantic bucket.
- **Display:** per-angle table showing rider-only / mount-only / overlap / unresolved counts, plus a color-coded cell-map preview. Clicking a row switches the preview to that angle.
- **Confirmation gate:** a "I have reviewed the proposals" checkbox must be checked before the Confirm button is enabled. The Confirm button is the only write path for `mounted_semantic_review`.
- **On confirm:** writes `{player_xp, mounted_xp, calibration_record_ref: <the accepted calibration record>, per_angle_assignments: [... exact cells ...], confirmed_at: ISO-timestamp}` via `POST /api/wb/session/mounted-semantic-review` (U3). While save is pending, Confirm disables. On success: Confirm stays disabled, checkbox unchecks, panel shows "Semantic review confirmed at [timestamp]" — matching the calibration panel's post-accept feedback pattern.
- **Stale-review behavior:** if calibration is re-accepted after a semantic review exists, the saved semantic review record is preserved but marked stale in the panel, the reviewed checkbox is cleared, the banner explains that proposals were regenerated from a newer calibration, and Confirm remains disabled until the refreshed proposals are re-reviewed.
- **MCP `get_mounted_cell_proposals`:** requires explicit `session_id`; returns proposals derived from that session's current confirmed calibration record; no write side effects.
- **MCP `accept_mounted_cell_proposals`:** requires explicit `session_id`, `reviewer_action: "accept"`, and non-empty proposals that match the current confirmed calibration record; writes the semantic review record; returns the saved record.
- `authorable` in `config/template_registry.json` must remain `false` for wolfie and wolack after any combination of calibration + semantic review confirmations. Verified in the test suite.
- **Accessibility minimum:** checkbox is native, per-angle rows are keyboard focusable/selectable, and any status banner is announced via a standard live-region pattern.

**Patterns to follow:**
- §2.3.3 source-slicing proposal-first pattern (analyze → propose → review → confirm)
- `scripts/mounted_rider_residual_compare.py` for cell-category derivation logic

**Test scenarios:**
- Happy path: session has confirmed calibration → panel shows per-angle proposal table with rider/mount/overlap/unresolved counts
- Happy path: user checks reviewed checkbox and clicks Confirm → `mounted_semantic_review` written to session
- Happy path: saved semantic review → panel shows `confirmed at <timestamp>` and cleared checkbox
- Guard: user clicks Confirm without checking reviewed checkbox → Confirm button remains disabled; no write occurs
- Happy path: calibration record updated (new accept from U2) → proposals regenerate from new calibration data; prior semantic review record is stale-flagged in the panel, checkbox cleared, Confirm disabled until re-review
- Edge case: calibration record absent in session → panel shows "Run overlay calibration first"; Confirm disabled
- Edge case: XP path in calibration record no longer exists on disk → panel shows file-not-found error; Confirm disabled
- Edge case: semantic Confirm save error → proposals remain visible; Confirm re-enabled; explicit error shown
- Integration: after semantic review confirmed → session reload → `mounted_semantic_review` present with `calibration_record_ref` and `confirmed_at`
- MCP `get_mounted_cell_proposals` with no session calibration record → returns `{status: "no_calibration_record"}`
- MCP `accept_mounted_cell_proposals` missing `reviewer_action: "accept"` → 400 error; session not mutated
- MCP `accept_mounted_cell_proposals` with valid input → writes record; returns saved record
- Invariant: after full calibration + semantic review flow, `config/template_registry.json` wolfie and wolack entries still have `"authorable": false`

**Verification:**
- Confirm button enabled only after the reviewed checkbox is checked
- No browser code path writes `mounted_semantic_review` without passing through the Confirm handler; MCP writes must include explicit `reviewer_action: "accept"`
- Session `mounted_semantic_review.calibration_record_ref` matches the session's `mounted_rider_calibration` record
- `authorable` remains `false` for wolfie/wolack throughout all test runs

---

## System-Wide Impact

- **Interaction graph:** The calibration panel reads session asset paths via the backend and renders to its own canvas; it does not interact with the root editor render loop, undo stack, or document state. The semantic review panel reads calibration metadata from the session and a backend proposal payload; it has no document side effects until Confirm is pressed.
- **Error propagation:** Compute errors (invalid XP paths, layout mismatch, inverted bounds) surface in the calibration panel status area and disable Accept. Session save errors surface in the active panel; pending calibration/proposal state is preserved for retry without loss.
- **State lifecycle risks:** `state.pendingCalibration` is UI-only state and does not persist to session until Accept is pressed. A browser reload clears any unaccepted calibration state; this plan does not require a tab-close warning, but the panel must make the unsaved/pending state explicit before the user leaves it.
- **API surface parity:** The new MCP tools (`compute_mounted_rider_calibration`, `get_mounted_cell_proposals`, `accept_mounted_cell_proposals`) expose the same semantic gates available in the browser, consistent with the headless parity principle in §2.7 and §2.10.
- **Integration coverage:** Full end-to-end path: compute offsets (U1) → preview + accept calibration (U2) → session saved (U3) → derive cell proposals (U4) → human review checkbox + Confirm → session saved (U3) → session reload → both records present. This sequence is the integration test path that unit tests alone will not prove.
- **Unchanged invariants:** `authorable: false` for wolfie/wolack in `config/template_registry.json` must remain false throughout this plan's execution. Jitter panel HTML and JS functions must remain byte-identical to their current state.

---

## Risks & Dependencies

| Risk | Mitigation |
|------|------------|
| Session passthrough fields silently dropped by future schema cleanup | Name both fields explicitly in save/load service code (U3) rather than relying on generic passthrough |
| Composite preview rendering diverges from root-editor XP rendering | Follow `renderPreviewFrame()` cell-rendering conventions; cell-by-cell, not pixel-level; resolve exact mapping at implementation time |
| MCP `accept_mounted_cell_proposals` used by an agent to bypass human review | MCP cannot inherit the browser's structural Confirm-button guarantee. Require explicit `reviewer_action: "accept"`, explicit `session_id`, proposal/calibration hash matching, and tool docstrings that state human confirmation is policy-required before calling accept |
| Default offset search range (−4/+8) does not cover actual wolfie/wolack geometry | Validate empirically against canonical sprite pair at implementation time; UI always exposes adjustable bounds |
| Calibration artifact built before UQ-007 used to justify skipping UQ-007 | This plan explicitly restricts `authorable: true` to UQ-008 full execution; both aids produce pre-authorable artifacts only |

---

## Sources & References

- **Origin document:** `docs/plans/2026-03-23-workbench-canonical-spec.md` (S2-R9 at line 2251, UQ-008 at line 2905, Section 2 misalignment ledger at line 2133)
- Compute scripts: `scripts/mounted_rider_offset.py`, `scripts/mounted_rider_residual_compare.py`, `scripts/mounted_rider_terminal_compare.py`
- Jitter reference: `web/workbench.js:5760-5854`, `web/workbench.html:301-326`
- Bundle contract: `scripts/xp_fidelity_test/bundle_contract.mjs:302-347`
- Semantic tests (frozen): `tests/xp_fidelity_test/semantic_runtime_contract.test.mjs:64-67`
- Related plan: `docs/plans/2026-04-13-skin-dock-visual-gate-plan.md` (calibration seeding pattern)
- Registry: `config/template_registry.json` (wolfie/wolack `specified_not_authorable` entries)
