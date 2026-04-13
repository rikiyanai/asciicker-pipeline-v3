# Workbench Canonical Spec

**Authority:** This is one of the 3 canonical authority docs for this repo. See Section 6 below.

**Last updated:** 2026-04-13
**Branch:** master @ 9693d8a

---

## 1. Milestone Definitions & Pass Criteria

### Milestone 1: Bundle-Native New-XP Authoring Viability

**Status: CLOSED** (2026-03-23)

Evidence: `PLAYWRIGHT_FAILURE_LOG.md` commit 14e8e95 — 7/7 edge workflows PASS, Skin Dock PASS, base-path 0 regressions. M1 is the closed baseline. Do not re-litigate M1 pass criteria; refer to the failure log for the closeout record.

### Milestone 2: Practical PNG Ingest and Manual Assembly

**Status: ACTIVE**

M2 passes only when:

- all user-reachable actions are mapped in a canonical SAR table
- the SAR model defines starting state, allowed actions, required responses, and valid next states for each workflow family
- the verifier executes predefined contract-driven workflow sequences on both root-hosted and base-path hosting
- acceptance-critical M2 lanes pass without errors

M2 is NOT: perfect automatic slicing, full existing-XP parity, or full REXPaint parity.

### Future Milestones

Placeholder. No milestone beyond M2 is currently defined.

---

## 2. M2 Sub-Phase Execution Order

| Phase | Scope | Depends On | Status |
|-------|-------|-----------|--------|
| **M2-A** | Structural PNG baseline (dims, layers, metadata gates) | M1 closed | ESTABLISHED |
| **M2-B** | Source panel + grid assembly (draw box, find sprites, drag-to-grid) | M2-A | ESTABLISHED — source-panel 10/10 PASS (5c67ef2); source-to-grid 13/13 PASS (380edee) at root + /xpedit. D1, D2/C2, G1 PROVEN. |
| **M2-C** | Whole-sheet editor coverage (tools, layers, undo) | M2-A | ESTABLISHED — 16/18 W-actions PROVEN. W15 three-part proof committed (2026-03-24): activeTool + bounds + marching-ants screenshot. W16/W17 DEFERRED. |
| **M2-D** | Full SAR workflow coverage (all remaining WIRED actions get verifier proof) | M2-B, M2-C | ADVANCING — registry 77/77 entries landed (5c2aab1–d7e791c). 14 executable + 16 stubs. 31 WS selectors. 2 new recipes. W15 PROVEN (three-part). S3-S6/G5-G6/G9-G11 PROVEN. W19-W22 clipboard PROVEN (`431b437`). PB-01 FIXED. PB-03 reclassified (UX hardening). Slice 5 E2E 13/13 PASS. 35/96 actions now PROVEN (was 31). |
| **M2-E** | Semantic editing (region-based dictionary-driven edits) | M2-D | NOT STARTED |
| **M2-F** | Analyze/auto-slice (assistive, not authoritative) | M2-D | NOT STARTED |

Execute in dependency order. M2-B and M2-C may run in parallel after M2-A.

---

## 3. Current Priority Stack

**Last reviewed:** 2026-04-13

1. **G-RANDOM visual fidelity — machine-readable runtime sprite check** — IMMEDIATE BLOCKER on G-RANDOM gate closure. Custom skin appeared invisible in Skin Dock during seeds 2+3 (2026-04-13). The gate currently proves only pipeline stability; it does NOT prove the authored XP is visually rendered by the runtime. Required next work:

   **Goal:** determine programmatically what pixels the TERM++ runtime renders for each angle of the player skin while it runs around, and compare against the expected cell colors from the exported XP.

   **Diagnostic split:**
   - Branch A — Extract TERM++ runtime standalone: run the same `.wasm`/JS bundle outside the Skin Dock iframe with a known XP injected. If the extracted runtime renders the expected `#ffff55` cells at known sprite frame positions → the editor and pipeline are correct, and the Skin Dock skin injection path is the bug.
   - Branch B — Skin Dock canvas pixel sampling: inside the existing Playwright runaround test, after arrowing to a known angle, pause movement, call `canvas.getContext('2d').getImageData(x, y, w, h)` on the game canvas at the predicted character position, and compare sampled colors against the XP's visual layer cell colors (derivable via `scripts/xp_cat.py`).
   - Branch C — Runtime debug API probe: query `window.__ak_diag` or any skin-state surface exposed by the runtime to confirm which XP files are actually loaded into the running skin slot.

   **Research completed (2026-04-13).** Full plan: `docs/plans/2026-04-13-skin-dock-visual-gate-plan.md`.

   **Key findings:**
   - Canvas `#asciicker_canvas` is same-origin, no sandbox. `getImageData()` is callable from `frameHandle.evaluate()` in Playwright — no runtime mod needed for Phase 1.
   - `window.ak_buf` (WASM cell buffer) is NOT exposed in this repo's runtime. Phase 2 oracle requires 1-line patch to `runtime/termpp-skin-lab-static/termpp-web-flat/index.html`.
   - `injectBundleIntoWebbuild()` (workbench.js:1314) returns byte counts per action but those are never logged by the Playwright runner — we have zero visibility into whether xp_b64 was non-empty at injection time.
   - Render oracle from Y9-2 is portable at 3/5 difficulty: isometric math and glyph scanner reuse as-is; ~65-90 lines of adaptation needed for single-player.

   **Execution order:**
   1. **Phase 0** (immediate) — add injection diagnostics to runner: log `xp_b64_len` and `override_names` per action before `Load()`. Determines if invisibility is injection bug or rendering bug.
   2. **Phase 1** (canvas pixel probe) — after runaround, `frameHandle.evaluate()` calls `getImageData()` at canvas center, counts non-background pixels. ~30 lines, no runtime modification. Wire as `render_skin_pixels_ok` gate.
   3. **Phase 2** (oracle, if Phase 1 insufficient) — expose `ak_buf`, port `scripts/skin_dock_oracle.js` (~150 lines), cell-level glyph verification.

   **Tool available:** `scripts/xp_cat.py` — `python3 scripts/xp_cat.py <file.xp>` renders any XP visual layer to ANSI true-color. Use `--info` for dims, `--hb` for half-block pixel mode.

   **Success criteria:** runner step that samples canvas pixels at character position and passes only when non-background pixels (or specific XP colors) are present. G-RANDOM gate promoted to full visual fidelity proof when this passes.

2. **MVP deployment to `rikiworld.com/xpedit`** — LIVE. GitHub Actions run `23479759126` passed all 3 jobs. Bug report → GitHub Issue delivery wired via Secret Manager (verified: Issues #6, #7). Bare `/xpedit` route fixed (`8ede2c6`). Remaining follow-up: refresh Node-20-based GitHub Actions before GitHub's Node 24 cutoff. Pipeline runs on Cloud Run free tier are too slow (>5 min) for verifier tests — UI-only flows work fine.
2. **Slice 5 manual assembly E2E** — PROVEN 13/13 (2026-03-24). Covers U1→S12→S7→D1→W1→W2→T3→T4. Demonstrates M2-B/C/D functional end-to-end. Runner: `run_manual_assembly_e2e_test.mjs`.
3. **M2-D full SAR workflow coverage** — 35/96 SAR + 13/13 parity extension PROVEN. W23 select-all now proven (adapter proxy fix + 8/8 PASS). W28-W31 bulk-edit proven (10/10 PASS via `run_whole_sheet_bulkedit_test.mjs`). W24-W27 selection transforms proven (`1828979`). W19-W22 clipboard proven (`431b437`). Inspector demotion Phase 7 now **unblocked**. 31 WS selectors, 77 registry entries, 2 recipes. W15 three-part proof committed. S3-S6/G5-G6/G9-G11 proven. Remaining 48 WIRED actions need committed proof in future M2-D/E passes.
4. **Workbench UI audit follow-up** — 2026-03-24 audit found 39 user-facing issues after BUG-01 was fixed: 3 critical, 7 high, 14 medium, 15 low. BUG-02, BUG-03, BUG-04, BUG-05, BUG-10 now FIXED. Remaining open bugs: BUG-06 (fetch error), BUG-07 (disabled control contrast), BUG-08 (debug panel exposed).
5. **Mobile/touch support is now an explicit roadmap requirement** — current mobile behavior may load but is not yet a truthful supported surface. BUG-04 is one concrete blocking symptom, but the broader requirement is: no milestone closeout or product-language upgrade should imply practical mobile support until touch interactions, modal behavior, viewport fit, and control usability are explicitly audited and improved.
6. **PB-03 UX hardening** — confirm dialog on session-boundary loads. Cross-session undo remains architecturally out of scope. Low-priority UX refinement.
7. **Bundle-family expansion roadmap is still under-scoped** — the 2026-03-24 player-state parity audit confirmed three concrete gaps: (a) non-bundle override naming mismatch — **FIXED** (BUG-09: all override paths now use per-family W semantics matching the bundle contract), (b) mounted families exist in runtime/debug surfaces but not in bundle templates or native family builders, and (c) the native sandbox overwrite helper is template-agnostic internally while the exposed workbench flow is still session/export driven. Gaps (b) and (c) remain roadmap work.

This stack is execution priority, not timeless truth. Re-evaluate when any sub-phase status changes.

**Note:** PB-01 (anchor undo) FIXED — `pushHistory()` added to `setAnchorFromTarget()`. PB-02 remains CLOSED. PB-06 (W15 visualization) FIXED and PROVEN (three-part evidence committed 2026-03-24).

### Active Bugs

| ID | Summary | Status | Notes |
|----|---------|--------|-------|
| BUG-01 | Grid toggle overlay is incorrect — uses simple lines instead of cross marks at intersections; grid size is not user-customizable | FIXED | Fixed in `6fb3375`..`fef0e78` (4 commits). Cross marks at intersections, grid-step select (Frame/1×1–16×16) on both whole-sheet editor and legacy inspector. Default "Frame" shows crosses at sprite frame boundaries. Separate X/Y step for non-square frames. Opacity tuned for visibility. UI-proven via screenshots. |
| BUG-02 | PNG upload silently fails on decode/load error because the source-image path has no `img.onerror` handler | FIXED | Fixed in `fd6973a`. Added `img.onerror` at both image loading sites (wbUpload + file-change handler). Error clears stale sourceImage, revokes object URL, shows user-visible status message. |
| BUG-03 | Whole-sheet canvas binds `mouseleave` twice, allowing spurious stroke-complete callbacks and empty undo entries | FIXED | Fixed in `fd6973a`. Removed duplicate mouseleave→_onStrokeEnd binding. _onCanvasMouseLeave now calls _onStrokeEnd() first, then clears hover display. Single handler, no duplicate stroke-complete risk. |
| BUG-04 | Overlay modal clips content on mobile/tablet because `.overlay-card` relies on `100vh` and a weak internal scrollbar | FIXED | Fixed: `dvh` fallback, `box-sizing: border-box`, `align-items: flex-start` + `overflow-y: auto` on mobile (`@media max-width:600px` and `max-height:500px`). Verified: `run_bug04_mobile_modal_test.mjs` 3/3 PASS (iPhone SE 375x667, iPad 768x1024, phone landscape 667x375). Submit button reachable on all viewports. **Note:** fixing BUG-04 does not solve mobile/touch support broadly — that remains an explicit roadmap requirement per §5. |
| BUG-05 | Whole-sheet/REXPaint grid draws every cross mark for the entire sheet even when most cells are off-screen | FIXED | Viewport-aware culling added to `_drawGrid()` in `canvas.js`. Computes visible cell range from scroll-container geometry (or offset fallback) with safety margin, only draws cross marks in visible region. Grid test 7/7 PASS at step=1, step=16, with selection, after scroll. No visual regression. |
| BUG-06 | Bug-report known-issue dropdown fails silently when `fetchKnownBugs()` errors | FIXED | `fetchKnownBugs()` catch block now appends a disabled `"(failed to load known issues)"` option to the dropdown so users know the fetch failed. |
| BUG-07 | Disabled controls are too visually similar to enabled controls on the dark theme | FIXED | `button:disabled` rule changed from `opacity: 0.5` to `opacity: 0.35; filter: grayscale(0.5)`. Same treatment applied to `select:disabled, input:disabled`. Verified in Playwright: disabled buttons now show opacity 0.35 + grayscale. |
| BUG-08 | Legacy Char Grid debug panel is exposed in production UI | FIXED | Added `hidden` attribute to `<details id="legacyGridDetails">` in `workbench.html`. Panel is no longer visible to production users. |
| BUG-09 | Non-bundle skin override paths still use binary W encoding and miss `W=2` equipment variants | FIXED | Non-bundle override generators now align with current product family semantics: shared `FAMILY_W_RANGE` rule applies `all_16` (W∈{0,1,2}) to player/plydie/wolfie and `weapon_gte_1` (W∈{1,2}) to attack/wolack. One rule concept used by all four generators (`_termpp_skin_override_names`, `WEBBUILD_DEFAULT_OVERRIDE_NAMES`, both `DEFAULT_OVERRIDE_SETS`). Override count: 81→105 (full parity), 49→65 (mounted mode). For enabled bundle families (player/attack/plydie), non-bundle names exactly equal bundle-path names. Tests pass. **Open residual:** committed native attack/wolack sprite inventory on disk (W=1 only) is narrower than the generated override contract (W∈{1,2}); this is an inherited runtime-truth question, not a naming bug. |
| BUG-10 | G-BUNDLE Skin Dock button stays disabled despite "3/3 actions ready" | FIXED | Root cause: `persistBundleActionStatus()` called `updateBundleUI()` (text only) but not `updateWebbuildUI()` (which manages button disabled state). Fix: added `updateWebbuildUI()` call in `persistBundleActionStatus()` (`6af8b86`). Verified: `quickBtnDisabled: false` in bundle test snapshot, G-RANDOM seed 42 PASS with skin_dock=true. |
| BUG-11 | G-BUNDLE deterministic Skin Dock readiness path often never reaches playable state | FIXED | Root cause: headless Chromium lacked a WebGL context. The Asciicker runtime calls `canvas.getContext("webgl")` → null in headless, so the font texture chain stalls and `_wasmReady` stays false. Fix: (1) added `--enable-webgl --use-gl=angle` to runner `chromium.launch` args in headless mode; (2) added `_wasmReady` safety gate to `detectWebbuildReady()` in workbench.js. Verified: G-BUNDLE 3/3 consecutive PASS, G-RANDOM seed 42 PASS (no regression). |
| BUG-12 | Drag-paint glyph shifts left on release (Issue #8) — Safari visual corruption on mouseup | FIXED | Root cause: `render()` in `canvas.js` fell through to a full clear+redraw on mouseup when `dirtyCells.size === 0` and no full-render flag was set, causing a gratuitous full redraw that visually shifted painted content. Fix (`c4f1ae5`): added early return when `!needsFull && dirtyCells.size === 0`. Follow-up (`8b8b496`): `setFontSize`, `setOffset`, and `syncFromState` relied on the old fallthrough — added explicit `_fullRenderNeeded = true` in those paths so the early-return guard does not skip them. |

**UI audit note:** the 2026-03-24 workbench UI audit found 39 verified issues total (3 critical, 7 high, 14 medium, 15 low). The active-bug table above promotes the critical issues and highest-signal open production issues into canon; the broader severity breakdown is preserved in `PLAYWRIGHT_FAILURE_LOG.md`.

### Whole-Sheet Parity Gap (2026-03-25 audit)

The 2026-03-25 REXPaint parity audit identified that the shipped whole-sheet editor surface (whole-sheet-init.js) lacked clipboard, selection-transform, and bulk-edit operations. All gaps are now closed:

- Clipboard (W19-W22): **PROVEN** (`431b437`)
- Selection transforms (W24-W27): **PROVEN** (`1828979`, 9/9 PASS)
- Bulk-edit (W28-W31): **PROVEN** (`run_whole_sheet_bulkedit_test.mjs`, 10/10 PASS)

Inspector demotion Phase 7 is **unblocked**.

**Structural finding:** whole-sheet-init.js does NOT use EditorApp. It imports tool classes directly. W19-W22 (clipboard: copy/paste/cut/delete) were implemented directly in whole-sheet-init.js (landed `0383b31`, proven `431b437`). W23 (select all) now **PROVEN** — root cause was missing SelectToolAdapter proxy methods for `startSelection`/`updateSelection`/`endSelection`; fix added 3 proxy methods, 8/8 PASS. W24-W27 (selection transforms) implemented and proven (`6af8b86`, `1828979`): 4 shipped sidebar buttons (Rot CW, Rot CCW, Flip H, Flip V) + keyboard shortcuts `]`/`[` for rotate. W28-W31 (bulk-edit) implemented and proven: 3 shipped sidebar buttons (Fill Sel, Repl FG, Repl BG) + collapsible Find & Replace sidebar section. Match-source contract for Replace FG/BG: `lastSampledCell` is set only by the eyedropper tool. W31 Find & Replace scope: 'selection' (current selection) or 'canvas' (entire whole-sheet canvas). Each bulk-edit operation is a single undo operation.

#### Planned Whole-Sheet Actions (post-audit parity extension)

These are tracked as a planned parity extension outside the existing 96-action SAR count (see `m2-capability-canon-inventory.md` Family 7 post-audit section). They will be folded into the SAR denominator at the next canon rebaseline.

| ID | Action | Code Basis | Priority | Notes |
|----|--------|-----------|----------|-------|
| W19 | Copy selection (Ctrl+C) | Implemented in whole-sheet-init.js | HIGH | **PROVEN** `431b437` — UI-driven proof via `run_whole_sheet_clipboard_test.mjs`. Copies selected cell data to internal clipboard. |
| W20 | Paste selection (Ctrl+V) | Implemented in whole-sheet-init.js | HIGH | **PROVEN** `431b437` — Ctrl+V enters paste mode, click places clipboard content at target position. Paste mode exits after placement. |
| W21 | Cut selection (Ctrl+X) | Implemented in whole-sheet-init.js | HIGH | **PROVEN** `431b437` — Copies selection to clipboard, clears source region. Both clipboard population and source clearing verified. |
| W22 | Delete/clear selection (Del) | Implemented in whole-sheet-init.js | HIGH | **PROVEN** `431b437` — Delete key clears selected cells to glyph=0. Undo integration via stroke-complete callback. |
| W23 | Select all (Ctrl+A) | Implemented in whole-sheet-init.js | MEDIUM | **PROVEN** — Root cause was missing `startSelection`/`updateSelection`/`endSelection` proxy methods on `SelectToolAdapter`. Fix: added 3 proxy methods. 8/8 PASS `run_whole_sheet_clipboard_test.mjs` (W23 now blocking). Selection bounds verified: `{x:0, y:0, width:gridCols, height:gridRows}`. |
| W24 | Rotate selection CW | Implemented in whole-sheet-init.js (`6af8b86`) | MEDIUM | **PROVEN** `1828979` — Button `#wsRotateCW` + keyboard `]`. Single undo op, bounds updated after rotate. 9/9 PASS via `run_whole_sheet_transform_test.mjs`. |
| W25 | Rotate selection CCW | Implemented in whole-sheet-init.js (`6af8b86`) | MEDIUM | **PROVEN** `1828979` — Button `#wsRotateCCW` + keyboard `[`. Restores original from CW-rotated state. |
| W26 | Flip selection H | Implemented in whole-sheet-init.js (`6af8b86`) | MEDIUM | **PROVEN** `1828979` — Button `#wsFlipH`. Undo reverts as single operation. |
| W27 | Flip selection V | Implemented in whole-sheet-init.js (`6af8b86`) | MEDIUM | **PROVEN** `1828979` — Button `#wsFlipV`. Cell positions verified via diagnostic observation. |
| W28 | Fill selection | Implemented in whole-sheet-init.js — `_fillSelection()` | MEDIUM | **PROVEN** — Button `#wsFillSel`. Fills selection with active glyph/fg/bg. Single undo. 10/10 PASS `run_whole_sheet_bulkedit_test.mjs`. |
| W29 | Replace FG in selection | Implemented in whole-sheet-init.js — `_replaceSelectionColor('fg')` | MEDIUM | **PROVEN** — Button `#wsReplaceFg`. Match source: `lastSampledCell.fg` (eyedropper). Replacement: current `drawFg`. |
| W30 | Replace BG in selection | Implemented in whole-sheet-init.js — `_replaceSelectionColor('bg')` | MEDIUM | **PROVEN** — Button `#wsReplaceBg`. Match source: `lastSampledCell.bg` (eyedropper). Replacement: current `drawBg`. |
| W31 | Find & Replace | Implemented in whole-sheet-init.js — `_findReplace()` + sidebar UI | LOW | **PROVEN** — Sidebar collapsible section, button `#wsFrApply`. Scope: 'selection' or 'canvas' (whole-sheet canvas, not inspector "frame"). |

#### Parity Decision Items (ownership undecided)

These inspector operations work at the frame level, not the whole-sheet canvas level. The product must decide whether they become grid-panel actions, whole-sheet actions, or remain inspector-only residuals.

| Operation | Inspector Function | Decision Needed |
|-----------|-------------------|----------------|
| Copy frame | `copyInspectorFrame()` | Grid panel action? Inspector-only residual? |
| Paste frame | `pasteInspectorFrame()` | Same |
| Flip frame H | `flipInspectorFrameHorizontal()` | Same |
| Clear frame | `clearInspectorFrame()` | Same |

#### Inspector-Only Residuals (intentionally not ported)

| Operation | Reason |
|-----------|--------|
| Half-cell paint (top/bottom color) | Inspector-specific; not a REXPaint or whole-sheet concept |
| Cell inspect tool (hover readout) | Replaced by WS Info panel |
| Per-cell glyph/color hover preview | WS Eyedropper covers the sampling use case |

#### Inspector Demotion Status

**Fully unblocked.** Clipboard (W19-W22), transforms (W24-W27), and bulk-edit (W28-W31) are now PROVEN.

- Phase 1 (collapse inspector to `<details>` tag): **can proceed**
- Phase 2-6 (progressive capability absorption): **all parity actions PROVEN** — W19-W22 (`431b437`), W24-W27 (`1828979`), W28-W31 (`run_whole_sheet_bulkedit_test.mjs` 10/10 PASS)
- Phase 7 (full demotion — never auto-open inspector): **unblocked** — all bulk-edit operations are now in the shipped whole-sheet surface

The whole-sheet editor has full parity with the inspector for clipboard, transform, and bulk-edit operations. The "whole-sheet editor should become the primary correction surface" claim is now operationally achievable.

---

## 3a. Player-State Bundle Expansion Goals

These are roadmap goals, not current completion claims. They exist because current
product truth still targets only `player`, `attack`, and `plydie`, while the runtime
and research surfaces already require broader player-state coverage.

### Expansion Axis 1: Runtime Families

The family-expansion roadmap must explicitly cover:

- `player-nude`
- `player`
- `attack`
- `plydie`
- `wolfie`
- `wolack`

This axis is about **which filename families are authorable and overridable at all**.
It is distinct from gameplay-state coverage.

### Expansion Axis 2: Gameplay / State Coverage

The gameplay/state roadmap must explicitly cover:

- unmounted vs mounted
- nude/spawn vs equipped
- weapon/no-weapon and ternary weapon states where they exist
- attack / death transitions
- wearable/equipment state transitions across AHSW
- item/world/inventory visuals as a separate non-player track

This axis is about **when the engine switches between families/variants during play**.
It is distinct from family-count expansion.

### Required Roadmap Goals

1. **Full player-state bundle parity**
   - expand from the current 3-family product truth to the full player-state set:
     `player-nude`, `player`, `attack`, `plydie`, `wolfie`, `wolack`
   - include ternary `W=0/1/2` coverage anywhere the runtime actually distinguishes it
   - ~~remove remaining binary-only debug assumptions from browser override lists~~ **DONE** (BUG-09)

2. **Mounted/unmounted parity as a first-class milestone goal**
   - mounted idle/walk and mounted attack must not fall back to native defaults
   - transitions between unmounted and mounted states must preserve skin identity

3. **Equipment/wearable state parity**
   - AHSW transitions must map cleanly through the bundle/runtime contract
   - equipping armor/helmet/shield/weapon must not expose fallback-native frames

4. **Template-less native-runtime apply**
   - support applying a skin/session to the native runtime without forcing a template-shaped
     workbench action model first
   - this is a distinct product goal from browser/webbuild debug injection

5. **Separate non-player family track**
   - `item-*`, `grid-*`, and similar non-player assets must be tracked separately from
     player-skin bundle expansion
   - do not blur item/UI family work into player-state parity claims

6. **Native-runtime parity over browser-debug parity**
   - browser/webbuild override modes are useful diagnostics
   - native runtime behavior is the authority for “does the skin system actually work”

### Current Gap Statement

Current config still exposes only:

- `player`
- `attack`
- `plydie`

via `ENABLED_FAMILIES` in `src/pipeline_v2/config.py`.

Research already shows the larger real player-state map and the current missing areas:

- `player-nude`
- `wolfie`
- `wolack`
- browser override parity gaps for ternary weapon state coverage

So the roadmap must explicitly upgrade from a **3-family bundle model** to a
**full player-state bundle parity model**.

### 2026-03-24 Audit Findings (Evidence-Backed)

The player-state parity audit established these current truths:

1. **Current authoring contract = one PNG per family action, not per AHSW variant.**
   - The product converts one authored PNG to one exported XP for a given family/action, then
     broadcasts those same XP bytes to every generated override filename for that family.
   - Users do not currently author helmet/shield/weapon variants separately.

2. **AHSW is a filename-selection contract in the current product, not a workbench composition system.**
   - Equipment state is encoded in sprite filenames such as `player-0102.xp`.
   - The current custom-skin contract flattens equipment visual differentiation by stamping the
     same XP across those variants.

3. **Mounted families are partially present but not productized.**
   - `wolfie` and `wolack` exist in committed sprites and in debug/native override name lists.
   - They are not in `ENABLED_FAMILIES`, not in `template_registry.json`, and have no native
     layer builders in `_build_native_layers()`.

4. **Template-less native overwrite already exists internally, but not as a first-class user flow.**
   - `_stage_termpp_skin_sandbox()` copies an exported XP across runtime override filenames
     without consulting template metadata.
   - The exposed workbench entrypoint still requires `session_id -> export -> xp_path`, so the
     user-facing flow remains template/session driven today.

5. **W-encoding parity now aligns with product family semantics (BUG-09 FIXED).**
   - All override generators use a shared per-family W-range rule: `all_16` (W∈{0,1,2}) for
     player/plydie/wolfie, `weapon_gte_1` (W∈{1,2}) for attack/wolack.
   - Non-bundle names exactly equal bundle-path names for enabled families.
   - **Open residual:** committed native attack/wolack sprite inventory on disk has W=1 only,
     while the generated override contract includes W=2. This is an inherited runtime-truth
     question, not a naming bug.

### Wolfie / Wolack Template Specs (Proven from Committed XP)

Extracted from committed sprites on 2026-03-24. Full evidence at `/tmp/claude-mounted-family-specs.md`.

| Property | wolfie (mounted idle) | wolack (mounted attack) |
|----------|----------------------|------------------------|
| Files | 24 (all_16, W=0/1/2) | 8 (W=1 only) |
| Width | 180 | 160 |
| Height | 96 (H=0) / 104 (H=1) | 104 (fixed) |
| Angles | 8 | 8 |
| Projs | 2 | 2 |
| Anims | [1,8] | [8] |
| cell_w | 10 | 10 |
| cell_h | 12 (H=0) / 13 (H=1) | 13 |
| Layers | 3–7 (variable by equip) | 5–8 (variable by equip) |
| L0 metadata | "8","1","8" | "8","8" |
| ahsw_range | all_16 | weapon_gte_1 |

**Key structural differences from player/attack/plydie:**
- Variable layer counts driven by equipment overlay complexity (player=4, attack=4, plydie=3 — all fixed).
- wolfie height depends on helmet state (H digit), requiring two dimension variants.
- wolack has no W=2 variants (same as attack).

### Remaining Open Design Questions

- Does the original runtime ever compose equipment visuals dynamically, or are the committed
  per-AHSW XP files always the whole contract? Current repo evidence only proves filename-level
  selection in the custom-skin pipeline.
- Which non-bundle fallback states are acceptable during phased rollout, and which must be
  treated as blocking parity gaps?
- What is the minimal lightweight validation contract for a first-class template-less native
  apply path once session/template coupling is removed from the user flow?
- How should the template registry handle wolfie's variable dimensions (two xp_dims entries?
  per-variant layer counts?) and wolack's restricted W range?

### Legacy Runtime Lane Classification

The native TERM++ "run around for 10 seconds" path is an **external diagnostic lane**, not
acceptance. It depends on an external `game_term` binary and `legacy_verify_e2e.py` script
that are not committed to this repo.

**Classification:** external diagnostic — visual runtime verification only, never acceptance evidence.

**Preserved wiring (regression-guarded in `test_contracts.py`):**

| Surface | Location |
|---------|----------|
| Test This Skin button | `web/workbench.html:313` (canon-proven R1) |
| `verifyProfile = legacy_verify_e2e` | `web/workbench.html:375`, `web/workbench.js:621` |
| Command template generation | `src/pipeline_v2/service.py:2496` |
| `/api/workbench/open-termpp-skin` | `src/pipeline_v2/app.py:638` |
| `/api/workbench/termpp-stream/start` | `src/pipeline_v2/app.py:673` |

**Canonical in-repo proof lane** for skin testing is the iframe Skin Dock (Test This Skin / R1),
which requires no external binary.

---

## 4. Acceptance vs Diagnostic Boundary

The canonical verifier path (`truth_table → recipe → run`) is the only source of acceptance evidence. See `docs/AGENT_PROTOCOL.md` Section 13 for the full protocol.

Project-specific narrowing:

- **Acceptance mode** (`--mode acceptance`): user-reachable actions through the shipped whole-sheet editor surface only. Inspector-only and debug-only actions are refused.
- **Diagnostic mode** (`--mode diagnostic`): may use inspector-primary actions for implementation debugging. Results must be labeled diagnostic.
- Ad hoc scripts, `page.evaluate()` probes, and `window.__wb_debug` calls are diagnostic-only — never acceptance evidence.
- If the verifier cannot express a required workflow, that is a verifier bug, not permission to bypass it.

### Runner Classification (2026-03-23 reconciliation)

| Runner | Action Path | Observation | Classification |
|--------|------------|-------------|----------------|
| `run_fidelity_test.mjs` | XP import via file input; painting via canvas mouse events (acceptance mode) | Cell reads via `readFrameCell()`/`frameSignature()` | UI-driven with diagnostic observation layer |
| `run_bundle_fidelity_test.mjs` | Tab switch via DOM click; painting via canvas mouse events | State waits via `_state()`, readiness via `getState()` | Mixed — UI actions + diagnostic observation. M1 historical evidence only. |
| `run_randomized_bundle_test.mjs` | Tab switch, 3 authoring methods (new_xp draw, upload_xp import, upload_png pipeline), WS random actions (paint/fill/rect/line/erase), Skin Dock test, 10s runaround crash detection | `_state()` for actionStates, `__ak_diag` for crash/RAF probes | Mixed — UI actions + diagnostic observation. Randomized smoke gate. |
| `run_edge_workflow_test.mjs` | Tab switch via DOM click; button clicks; DOM waits | Core state via `getState()` + `_state()` | Mixed — UI actions + diagnostic observation. M1 historical evidence only. |
| `run_structural_baseline_test.mjs` | ALL actions via `fetch()` API calls — zero DOM interaction | API response JSON | Structural-contract only (per `PNG_STRUCTURAL_BASELINE_CONTRACT.md`). NOT UI proof. |
| `run_source_panel_workflow_test.mjs` | ALL actions via DOM clicks, canvas drags, file input, context menu | State reads via `getState()` | UI-driven with diagnostic observation layer |
| `run_source_to_grid_workflow_test.mjs` | ALL actions via DOM clicks, canvas drags, file input, context menu, cross-panel drag/drop | State reads via `getState()` + `readFrameSignature()` | UI-driven with diagnostic observation layer |
| `run_whole_sheet_layer_test.mjs` | ALL actions via DOM clicks on layer panel buttons/rows | State reads via `__wholeSheetEditor.getState()` + DOM class checks | UI-driven with diagnostic observation layer |
| `run_whole_sheet_tools_test.mjs` | ALL actions via DOM clicks, grid dblclick, canvas mouse events | State reads via `readFrameCell()` | UI-driven with diagnostic observation layer |
| `workbench_agents.mjs` (subagents) | DOM clicks + file inputs | `getState()` reads + request interception | Diagnostic / subagent coverage |
| `workbench_coverage_agent.mjs` | DOM clicks, drags, screenshots | Element probes via `evaluate()` | Diagnostic coverage |

**Standard for M2 UI acceptance (2026-03-23):**

1. **UI-driven actions are required.** Every user-facing workflow step (click button, drag on canvas, select file, switch tab) must be performed through the shipped DOM surface — not via `fetch()` or `page.evaluate(async => ...)` action calls.
2. **Read-only diagnostic observation is tolerated.** Using `getState()`, `readFrameCell()`, or `frameSignature()` to *verify* outcomes after a UI action is acceptable. The observation layer does not replace user actions — it confirms their effect.
3. **`fetch()` / API action driving is not acceptance for workflow slices** unless a live structural contract (e.g., `PNG_STRUCTURAL_BASELINE_CONTRACT.md`) explicitly defines that API-backed path for a narrow structural-safety purpose.

**Rule:** Only runners classified as "UI-driven" may produce evidence labeled as acceptance. Structural-contract runners prove API/gate contracts only. Mixed runners are M1 historical evidence — not pure UI-driven acceptance going forward.

### Verification Gates

These gates must pass before any milestone closeout or deployment.

| Gate | Runner | Pass Criteria | Classification |
|------|--------|---------------|----------------|
| G-BUNDLE | `run_bundle.sh` | Deterministic 3-action bundle (idle/attack/death) passes with fidelity + Skin Dock playable + 10s runaround 0 crashes | Regression — fixed inputs. BUG-11 FIXED: 3/3 consecutive PASS (2026-03-25). |
| G-RANDOM | `run_randomized_bundle.sh` | Randomized 3-action bundle passes with all 3 authoring methods (new_xp/upload_xp/upload_png), Skin Dock playable, 10s runaround 0 crashes. Must pass on at least 3 different seeds. | Smoke — randomized inputs. **PARTIALLY MET: stability proven on 3/3 seeds, visual fidelity NOT proven.** Custom skin appeared invisible in Skin Dock during seeds 2+3. Gate proves pipeline does not crash; does NOT prove the custom skin is visually rendered. See PLAYWRIGHT_FAILURE_LOG.md § "G-RANDOM Gate: Visual Fidelity Gap". |

**G-RANDOM details:**
- Each run randomly permutes 3 authoring methods across 3 actions (6 possible combinations)
- `new_xp`: random WS editor scribbles with action-specific glyph (I/A/D), random colors, random tools (paint/fill/rect/line/erase). Render suppressed during rapid drawing (performance optimization — cells are painted, visual update deferred until unsuppress).
- `upload_xp`: imports reference XP via UI file input
- `upload_png`: uploads PNG from baseline pool → server pipeline conversion
- Seeded RNG (`--seed`) for reproducibility. Failing seed must be recorded.
- Stubbed actions (copy/paste, select, undo/redo) are excluded until WS editor supports them
- **Stability runs (3/3):**
  - seed 42 (idle=upload_png, attack=upload_xp, death=new_xp) — commit `7ce9d72`
  - seed 2 (idle=upload_xp, attack=upload_png, death=new_xp) — PASS 2026-04-13 (stability only)
  - seed 3 (idle=upload_xp, attack=upload_png, death=new_xp) — PASS 2026-04-13 (stability only)
- **Visual fidelity:** NOT PROVEN. Custom skin invisible in Skin Dock — root cause under investigation.
- **Gate: PARTIALLY MET** — stability proven, visual fidelity gap unresolved. Gate cannot be fully cleared until Skin Dock visual check is added.

---

## 5. Unified M2 Verifier Architecture

### The Problem

M1 used hand-written runners with inline readiness patterns. This worked because M1 scope was small (7 edge workflows, 1 fidelity test, 1 bundle test). M2 has 96+ SAR-enumerated actions across 13 families — hand-writing a runner per workflow does not scale.

### Required Architecture: Capability Canon → Recipe → Run → Proof

The M2 verifier is a pipeline with five stages:

```
┌─────────────────────┐
│ 1. Capability Canon  │  docs/plans/2026-03-23-m2-capability-canon-inventory.md
│    (human-curated)   │  Action families, status, code evidence, proof evidence
└──────────┬──────────┘
           │ machine-readable extraction
           ▼
┌─────────────────────┐
│ 2. Action Registry   │  scripts/xp_fidelity_test/action_registry.json
│    (generated)       │  Per-action: id, family, selectors, preconditions, postconditions
└──────────┬──────────┘
           │ recipe generation
           ▼
┌─────────────────────┐
│ 3. Recipe Generator  │  scripts/xp_fidelity_test/recipe_generator.mjs
│    (UI-only recipes) │  Combines actions into bounded workflow sequences
│                      │  Each step = DOM selector + user gesture (click/drag/input)
│                      │  No page.evaluate() action calls — UI gestures only
└──────────┬──────────┘
           │ execution
           ▼
┌─────────────────────┐
│ 4. DOM Runner        │  scripts/xp_fidelity_test/dom_runner.mjs
│    (Playwright)      │  Executes recipe steps via Playwright actions
│                      │  Uses verifier_lib.mjs for readiness, base-path, reporting
└──────────┬──────────┘
           │ read-only observation
           ▼
┌─────────────────────┐
│ 5. Observation Layer │  getState() primary, _state() fallback (actionStates only)
│    + Proof Artifacts │  Per docs/plans/2026-03-23-state-capture-contract.md
│                      │  Output: structured report JSON + failure-log entries
└─────────────────────┘
```

### Stage Details

**Stage 1 — Capability Canon** is human-curated and already exists (`m2-capability-canon-inventory.md`). It classifies every action as PROVEN/WIRED/PARTIAL/PLANNED/BLOCKED/DEFERRED and tracks code evidence and proof evidence.

**Stage 2 — Action Registry** (`action_registry.json`) exists and was expanded in the current M2-D pass. Machine-readable extraction of the capability canon: one entry per action with `id`, `family`, `selectorKey` (reference into `selectors.mjs`), `gestureType` (constrained enum), `paramBindings` (preparatory input steps), `preconditions`, `postconditions`, `acceptanceEligible`, and `generatorReadiness`. Schema: `action_registry_schema.json` (JSON Schema draft-07). Current coverage: 47 READY-family actions; M2-D pass adds 30 more (14 executable + 16 stubs).

**Stage 3 — Recipe Generator** (`recipe_generator.mjs`) exists. Reads the action registry and composes bounded workflow sequences. A recipe is an ordered list of `{ actionId, params, expectedOutcome }` steps with `_derived` metadata for runner consumption. Currently produces 8 fixed regression recipes for READY-family workflows. Import-safe (no side effects on module import). Bounded-random generation is future work.

**Stage 4 — DOM Runner** (`dom_runner.mjs`) exists (committed 85ff3b8). Executes recipe steps via Playwright DOM actions — never `page.evaluate()` for action driving. Supports gestures: click, setInputFiles, selectOption, fill. Enforces recipe-level precondition gates, refuses blocked gestures, constrains main gestures to value-less types (click, rightClick). Uses `verifier_lib.mjs` for `openWorkbench()`, `captureState()`, base-path resolution, and structured reporting. Proof: 3 recipes pass (bundle_template_apply, bug_report_dismiss, xp_import_roundtrip).

**Stage 5 — Observation Layer** exists via `getState()` and the state-capture contract. Known debt: `actionStates` still requires `_state()` fallback (see state-capture contract §4). The DOM runner captures state after each recipe step and evaluates postconditions using operator-based assertions (eq, gt, truthy, changed, etc.).

### Selector Infrastructure

`selectors.mjs` centralizes DOM selectors used by both the action registry and runners. 102+ selector keys verified against `web/workbench.html`. Gesture types defined with blocked flags for canvas/keyboard. M2-D pass adds 31 whole-sheet selectors.

### Relationship to Existing Infrastructure

| Existing | Role in M2 Architecture |
|----------|------------------------|
| `truth_table.py` | XP fidelity oracle — orthogonal to SAR; kept for export/cell truth |
| `verifier_lib.mjs` | Foundation for DOM runner (readiness, state capture, reporting) |
| `run_source_panel_workflow_test.mjs` | M2-B source-panel proof runner — will be replaced by generated recipe + DOM runner |
| `run_source_to_grid_workflow_test.mjs` | M2-B source-to-grid proof runner (D1/D2/G1) — will be replaced by generated recipe + DOM runner |
| `run_structural_baseline_test.mjs` | Structural-contract only — stays standalone, not part of SAR pipeline |
| M1 runners (fidelity, bundle, edge-workflow) | Frozen — M1 is closed, do not refactor |

### Known Design Debt

- `actionStates` not yet in `getState()` — requires `_state()` fallback (state-capture contract §4)
- Tab hydration readiness uses `_state().activeActionKey` — should migrate to `getState()` P3 batch
- Canvas-coordinate actions (source panel drawing, grid drag) need a selector abstraction beyond CSS — likely `{ type: "canvas", target: "sourceCanvas", gesture: "drag", from: [x1,y1], to: [x2,y2] }`
- Dual-button branching: G3 (row up/down), G4 (col left/right), W18 (undo/redo) each map one canon ID to two physical buttons. Current schema's `paramBindings` only supports input-setting gestures, not conditional click dispatch. Needs schema evolution or canon ID split.
- inputRange gesture: S18 (source zoom), G13 (grid zoom) need `inputRange` added to dom_runner.mjs gesture executors.
- Alias rows: S15=C3, S16=C4, G7=C6, G8=C7 are distinct canon IDs sharing selectors/gestures. Schema allows separate entries; deferred to alias-row pass.

### Implementation Status

| # | Component | Status | Commit |
|---|-----------|--------|--------|
| 1 | `selectors.mjs` | **Done** | foundation landed earlier; expanded in `5c2aab1` |
| 2 | `action_registry_schema.json` | **Done** | foundation landed earlier |
| 3 | `action_registry.json` | **Done** — 77 entries (47 foundation + 30 M2-D expansion) | current master; latest M2-D expansion in `757cf74`, reconciled in `d7e791c` |
| 4 | `recipe_generator.mjs` | **Done** (8 fixed recipes) | current master; latest addition `70da189` |
| 5 | `dom_runner.mjs` | **Done** (click, setInputFiles, selectOption, fill) | foundation landed earlier |
| 6 | M2-D registry expansion | **Done** — 31 selectors, 14 executable + 16 stub entries, W15 fix, 2 recipes | `5c2aab1`–`d7e791c` |

---

## 6. Document Authority Model

This repo uses a 3-doc canonical authority model:

| # | Doc | Role |
|---|-----|------|
| 1 | `PLAYWRIGHT_FAILURE_LOG.md` | Reality/failure/proof log — what actually happened |
| 2 | This doc (`docs/plans/2026-03-23-workbench-canonical-spec.md`) | Normative requirements, roadmap, priority, policy |
| 3 | `docs/plans/2026-03-23-m2-capability-canon-inventory.md` | Capability inventory, truth-table, SAR canon |

### Doc Classifications

| Classification | Rule |
|---------------|------|
| **Canonical** | Only source of active truth; update in-place |
| **Structural Contract** | Stable normative contracts; update only on milestone boundary |
| **Reference** | Stable reference material; does not claim active state |
| **Worksheet** | Temporary session/plan docs; retire via `scripts/doc_lifecycle_stitch.sh` after completion |
| **Archive** | `docs/WORKBENCH_DOCS_ARCHIVE.md` — retired worksheets, append-only via stitch script |

### Retirement Policy

- Completed or superseded worksheets MUST be retired using `scripts/doc_lifecycle_stitch.sh`.
- The script appends to the archive, rewrites repo-wide references, deletes the original, and logs to the failure log.
- Canonical docs and structural contracts are protected — the script refuses to archive them.
- Do not create new authority docs. If a canonical doc is insufficient, update it in-place.

---

## 7. Non-Negotiable Constraints

- **Self-containment**: No runtime, test, or build dependency on external folders. Enforced by `scripts/self_containment_audit.py`.
- **Claim discipline**: No "fixed" / "restored" / "working" claims without branch, commit, and verification evidence. See `docs/AGENT_PROTOCOL.md` Section 8.
- **Drift guardrail**: Do not build M2 work on drifted verifier code or stale planning docs. See `AGENTS.md` § Drift Guardrail.

---

## 8. Structural Contract Pointers

- `docs/XP_EDITOR_ACCEPTANCE_CONTRACT.md` — canonical acceptance contract for XP-editor parity
- `docs/PNG_STRUCTURAL_BASELINE_CONTRACT.md` — non-regression contract for the PNG structural ingest path

---

## 9. Canonical Read Order

Agents must read in this order at session start:

1. `AGENTS.md` — startup guardrails
2. `docs/INDEX.md` — doc hub and navigation
3. `docs/AGENT_PROTOCOL.md` — behavioral rules
4. This doc — normative spec and policy
5. `PLAYWRIGHT_FAILURE_LOG.md` — reality log
6. `docs/plans/2026-03-23-m2-capability-canon-inventory.md` — capability canon
7. Task-specific reference docs as needed
