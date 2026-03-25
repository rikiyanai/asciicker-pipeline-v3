# M2 Capability Canon Inventory

**Created:** 2026-03-23
**Last updated:** 2026-03-25
**Branch:** master @ 1828979
**Purpose:** Canonical answer to "what user-reachable workbench behaviors should be possible right now?" — distinguishing intent, code wiring, and verified proof.
**Supersedes:** No prior canonical capability inventory existed. This doc synthesizes claims from the full doc set and measures them against code and failure-log reality.

---

## How To Read This Doc

Each capability row has five columns:

| Column | Meaning |
|--------|---------|
| **Canon Source** | Which doc(s) first defined or claimed this behavior |
| **Code Evidence** | Is the handler wired in workbench.js / whole-sheet-init.js? (file:line if known) |
| **Proof Evidence** | Is there failure-log, verifier, or screenshot evidence it actually works? |
| **Status** | PROVEN / WIRED / PARTIAL / PLANNED / BLOCKED / DEFERRED (see key below) |
| **M2 Scope** | Which M2 sub-phase owns this (A/B/C/D/E/F) or M1-closed |

### Status Key

- **PROVEN** — Failure log or verifier evidence confirms the behavior works end-to-end
- **WIRED** — Code exists with complete handler + implementation, but no verifier/failure-log proof yet
- **PARTIAL** — Handler exists but implementation is incomplete (stubs, known bugs, missing pushHistory)
- **PLANNED** — Doc claims intent but code doesn't exist yet
- **BLOCKED** — Depends on unresolved bug or missing infrastructure
- **DEFERRED** — Explicitly deferred from M2 scope

### Evidence Hierarchy (from AGENT_PROTOCOL.md §13)

1. Canonical verifier path (truth_table → recipe → run) — highest
2. PLAYWRIGHT_FAILURE_LOG.md entries with structured evidence
3. Direct code audit (handler exists, API endpoint exists)
4. Screenshot-backed doc claims
5. SAR blueprint / planning doc claims — lowest

---

## Part 1: Milestone Status Reality

| Claim | Source | Reality | Evidence |
|-------|--------|---------|----------|
| M1 is open | INDEX.md line 90 (2026-03-21) | **STALE — M1 is CLOSED** | PLAYWRIGHT_FAILURE_LOG.md: commit 14e8e95, 7/7 edge workflows PASS, Skin Dock PASS, base-path 0 regressions |
| M2-A structural baseline established | CLAUDE.md, failure log | **CORRECT** | 9/9 structural gate verdicts PASS (G10 dims, G11 layers, G12 L0 metadata) for idle/attack/death |
| Verifier drift between master and feat/base-path-support | failure log | **CORRECT but narrowing** | Base-path branch merged; drift was flagged pre-merge |
| Cell mismatches block M1 | bug-gap-index Wave 0 | **STALE** — classified as NON-BLOCKING | 5 remaining mismatches are canvas-edge harness artifacts (rows 0-1, col 143, corners) |
| PB-04 root-relative HTML paths | bug-gap-index | **STALE-DOC** — fixed by server-side rewrite | `_serve_web_html()` at app.py:79-99 rewrites all 4 paths |

---

## Part 2: Capability Inventory by Action Family

### Family 1: Template/Bundle Controls (8 actions)

| # | Action | Canon Source | Code Evidence | Proof Evidence | Status | M2 Scope |
|---|--------|-------------|---------------|----------------|--------|----------|
| T1 | Apply template | SAR blueprint | `applyTemplate()` workbench.js — wired | M1 edge-workflow PASS (action_tab_hydration) | PROVEN | M1-closed |
| T2 | Switch action tab | SAR blueprint | `switchBundleAction()` — wired | M1 edge-workflow PASS (action_tab_hydration) | PROVEN | M1-closed |
| T3 | Save session | SAR blueprint | `saveCurrentActionProgress()` → `/api/workbench/save-session` | M1 save-first workflow PASS | PROVEN | M1-closed |
| T4 | Export XP | SAR blueprint | `exportXp()` → `/api/workbench/export-xp` | M1 full_recreation PASS | PROVEN | M1-closed |
| T5 | New XP | SAR blueprint | `newXp()` → `/api/workbench/create-blank-session` | Wired, no specific proof entry | WIRED | M2-D |
| T6 | Import XP | SAR blueprint | `importXp()` → `/api/workbench/upload-xp` | XP roundtrip test PASS (2686 cells consistent) | PROVEN | M1-closed |
| T7 | Test skin (Skin Dock) | SAR blueprint | `testCurrentSkinInDock()` → `/api/workbench/web-skin-payload` | M1 Skin Dock PASS | PROVEN | M1-closed |
| T8 | Delete action | SAR blueprint | Not visible in current UI | No handler found | PLANNED | M2-D |

### Family 2: Upload/Convert (3 actions)

| # | Action | Canon Source | Code Evidence | Proof Evidence | Status | M2 Scope |
|---|--------|-------------|---------------|----------------|--------|----------|
| U1 | Upload PNG | M2 plan, SAR blueprint | `wbUpload()` → `/api/upload` | M2-A structural-contract PASS (API-driven, not UI proof); M2-B source-panel UI-driven PASS (file input + button click) | PROVEN (structural + UI) | M2-A, M2-B |
| U2 | Analyze | M2 plan | `wbAnalyze()` → `/api/analyze` | Wired, no specific proof entry | WIRED | M2-F |
| U3 | Convert to XP (Run pipeline) | M2 plan | `wbRun()` → `/api/run` | M2-A structural-contract PASS (API-driven, not UI proof) | PROVEN (structural-contract only) | M2-A |

### Family 3: Source Panel (19 actions)

| # | Action | Canon Source | Code Evidence | Proof Evidence | Status | M2 Scope |
|---|--------|-------------|---------------|----------------|--------|----------|
| S1 | Set mode: Select | UX checklist §1 | `setSourceMode("select")` — wired | M2-B runner step 5 | **PROVEN** | M2-B |
| S2 | Set mode: Draw Box | UX checklist §2 | `setSourceMode("draw_box")` — wired | M2-B runner step 2 | **PROVEN** | M2-B |
| S3 | Set mode: Drag Row | UX checklist §7 | `setSourceMode("row_select")` — wired | `#rowSelectBtn` click → `sourceMode === 'row_select'` PASS (2026-03-24, `run_m2d_action_proof_test.mjs`) | **PROVEN** | M2-D |
| S4 | Set mode: Drag Column | UX checklist §8 | `setSourceMode("col_select")` — wired | `#colSelectBtn` click → `sourceMode === 'col_select'` PASS (2026-03-24, `run_m2d_action_proof_test.mjs`) | **PROVEN** | M2-D |
| S5 | Set mode: Vertical Cut | UX checklist §9 | `setSourceMode("cut_v")` — wired | `#cutVBtn` click → `sourceMode === 'cut_v'` PASS (2026-03-24, `run_m2d_action_proof_test.mjs`) | **PROVEN** | M2-D |
| S6 | Delete box action | UX checklist §4 | `deleteSourceBox()` — wired | `#deleteBoxBtn` click → `extractedBoxes === 0, anchorBox === null` PASS (2026-03-24, `run_m2d_action_proof_test.mjs`) | **PROVEN** | M2-D |
| S7 | Draw box (draft → commit) | UX checklist §2 | `onSourceMouseDown/Move/Up` + `commitDraftSource()` | M2-B runner steps 3, 4, 7 | **PROVEN** | M2-B |
| S8 | Select box | UX checklist §1 | Click handler in source canvas — wired | M2-B runner step 5 | **PROVEN** | M2-B |
| S9 | Move box (drag) | UX checklist §1 | Drag handler in source canvas — wired | No verifier coverage | WIRED | M2-D |
| S10 | Resize box (handles) | UX checklist §1 | Resize handles in source canvas — wired | No verifier coverage | WIRED | M2-D |
| S11 | Delete box | UX checklist §4 | `deleteSourceBox()` — wired | No verifier coverage | WIRED | M2-D |
| S12 | Find Sprites | UX checklist §6 | `extractSprites()` — wired | M2-B runner step 8 | **PROVEN** | M2-B |
| S13 | Drag row borders | UX checklist §7 | Row drag in source canvas — wired | No verifier coverage | WIRED | M2-D |
| S14 | Drag column borders | UX checklist §8 | Column drag in source canvas — wired | No verifier coverage | WIRED | M2-D |
| S15 | Set anchor | UX checklist §5 | `setAnchorBox()` — wired | M2-B runner step 6 | **PROVEN** | M2-B |
| S16 | Pad box to anchor size | UX checklist §5 | `padBoxToAnchorSize()` — wired | M2-B runner step 7 (PB-02 fixed) | **PROVEN** | M2-B |
| S17 | Vertical cut insert | UX checklist §9 | Cut-v mode in source canvas — wired | No verifier coverage | WIRED | M2-D |
| S18 | Source zoom | UX checklist §10 | `sourceZoomInput` → `renderSourceCanvas()` | No verifier coverage | WIRED | M2-D |
| S19 | Source undo/redo participation | SAR blueprint | `pushHistory()` called from findSprites, cut-line | **GAP**: anchor ops (PB-01/03) do NOT pushHistory | PARTIAL | M2-D |

**Source Panel Known Bugs:**
- ~~PB-01~~: **FIXED** (2026-03-24) — `setAnchorFromTarget()` now calls `pushHistory()` before `state.anchorBox` mutation and `saveSessionState()` after. Both draft-anchor and box-anchor paths covered.
- ~~PB-02~~: **CLOSED** — Implicit anchor override removed from `setDraftBox()` (2026-03-23)
- PB-03: **RECLASSIFIED as UX hardening** (2026-03-24) — `hydrateLoadedSession()` intentionally clears history at session boundaries (workbench.js:3833-3834). Cross-session undo is architecturally out of scope. Dirty-session confirmation dialog added before `applyTemplate()` (workbench.js:6495). Not classified as a blocking undo bug.

### Family 4: Context Menu (9 actions)

| # | Action | Canon Source | Code Evidence | Proof Evidence | Status | M2 Scope |
|---|--------|-------------|---------------|----------------|--------|----------|
| C1 | Add as 1 sprite | SAR blueprint | `addSpriteFromSelectedBox()` — wired | M2-B runner step 4 | **PROVEN** | M2-B |
| C2 | Add to selected row sequence | SAR blueprint | `addSpriteToRowSequence()` — wired | Source-to-grid runner steps 6, 8: add_to_row PASS (root + /xpedit) | **PROVEN** | M2-B |
| C3 | Set as anchor for Find Sprites | SAR blueprint | `setAnchorBox()` — wired | M2-B runner step 6; PB-01 undo gap remains | **PROVEN** | M2-B |
| C4 | Pad this bbox to anchor size | SAR blueprint | `padBoxToAnchorSize()` — wired | M2-B runner step 7; PB-02 CLOSED | **PROVEN** | M2-B |
| C5 | Delete (source context) | SAR blueprint | `deleteSourceBox()` — wired | No verifier | WIRED | M2-D |
| C6 | Copy frame (grid context) | SAR blueprint | `copySelectedFrame()` — wired | No verifier | WIRED | M2-D |
| C7 | Paste frame (grid context) | SAR blueprint | `pasteFrame()` — wired | No verifier | WIRED | M2-D |
| C8 | Focus Whole-Sheet (grid context) | SAR blueprint | `openInspectorForSelectedFrame()` — wired | No verifier | WIRED | M2-C |
| C9 | Delete (grid context) | SAR blueprint | `deleteSelectedFrames()` — wired | No verifier | WIRED | M2-D |

### Family 5: Source-to-Grid (2 actions)

| # | Action | Canon Source | Code Evidence | Proof Evidence | Status | M2 Scope |
|---|--------|-------------|---------------|----------------|--------|----------|
| D1 | Drag source to grid | UX checklist §11, M2 plan | Drag/drop handler — wired | Source-to-grid runner step 12: d1_drag PASS (root + /xpedit) | **PROVEN** | M2-B |
| D2 | Add to row sequence | UX checklist §12, M2 plan | `addSpriteToRowSequence()` — wired | Source-to-grid runner steps 6, 8: add_to_row PASS (root + /xpedit) | **PROVEN** | M2-B |

### Family 6: Grid Panel (14 actions)

| # | Action | Canon Source | Code Evidence | Proof Evidence | Status | M2 Scope |
|---|--------|-------------|---------------|----------------|--------|----------|
| G1 | Select frame (click) | UI control ref §6 | Click handler on grid — wired | Source-to-grid runner step 3: grid_select PASS (root + /xpedit) | **PROVEN** | M2-B |
| G2 | Shift-select (multi) | UI control ref §6 | Shift+click — wired | No verifier | WIRED | M2-D |
| G3 | Move row up/down | UI control ref §6 | `moveSelectedRow()` — wired | No verifier | WIRED | M2-D |
| G4 | Move col left/right | UI control ref §6 | `moveSelectedCols()` — wired | No verifier | WIRED | M2-D |
| G5 | Add frame | UI control ref §6 | `addGridFrameSlot()` — wired | `#addFrameBtn` click with `selectedRow >= 0` → `gridCols` increased PASS (2026-03-24, `run_m2d_action_proof_test.mjs`) | **PROVEN** | M2-D |
| G6 | Delete selected | UI control ref §6 | `deleteSelectedFrames()` — wired | `#deleteCellBtn` click on non-empty frame → frame signature changed (content cleared) PASS (2026-03-24, `run_m2d_action_proof_test.mjs`) | **PROVEN** | M2-D |
| G7 | Copy frame | SAR blueprint | `copySelectedFrame()` — wired | No verifier | WIRED | M2-D |
| G8 | Paste frame | SAR blueprint | `pasteFrame()` — wired | No verifier | WIRED | M2-D |
| G9 | Assign row category | UI control ref §8 | `assignRowCategory()` — wired | `#assignAnimCategoryBtn` click → `rowCategories[0]` set PASS (2026-03-24, `run_m2d_action_proof_test.mjs`) | **PROVEN** | M2-D |
| G10 | Assign frame group | UI control ref §8 | `assignFrameGroup()` — wired | `#assignFrameGroupBtn` click → `frameGroups` contains entry PASS (2026-03-24, `run_m2d_action_proof_test.mjs`) | **PROVEN** | M2-D |
| G11 | Apply groups to metadata | UI control ref §8 | `applyGroupsToAnims()` — wired | `#applyGroupsToAnimsBtn` click → `anims` array updated PASS (2026-03-24, `run_m2d_action_proof_test.mjs`) | **PROVEN** | M2-D |
| G12 | Double-click → open WS editor | UI control ref §6 | `openInspectorForSelectedFrame()` — wired | No verifier | WIRED | M2-C |
| G13 | Grid zoom | UI control ref §6 | `gridZoomInput` → `renderGrid()` — wired | No verifier | WIRED | M2-D |
| G14 | Drag-select frames | SAR blueprint | Drag handler on grid — wired | No verifier | WIRED | M2-D |

### Family 7: Whole-Sheet Editor (18 actions in SAR baseline + 13 planned parity extension)

| # | Action | Canon Source | Code Evidence | Proof Evidence | Status | M2 Scope |
|---|--------|-------------|---------------|----------------|--------|----------|
| W1 | Focus whole-sheet | M2 plan, UI ref | `openInspectorForSelectedFrame()` → WS hydration | WS tools runner: dblclick grid frame cell → WS mounted PASS (root + /xpedit) | **PROVEN** | M2-C |
| W2 | Paint cell (Cell tool) | REXPaint parity spec | whole-sheet-init.js Cell tool — wired | Fidelity runner ws_paint_cell PASS (root + /xpedit, acceptance mode) | **PROVEN** | M2-C |
| W3 | Eyedropper | REXPaint parity spec | whole-sheet-init.js Eyedropper — wired | Fidelity runner ws_eyedropper_sample PASS (root + /xpedit, acceptance mode) | **PROVEN** | M2-C |
| W4 | Erase cell | REXPaint parity spec | whole-sheet-init.js Erase — wired | WS tools runner: erase click → glyph=0 PASS (root + /xpedit) | **PROVEN** | M2-C |
| W5 | Erase drag | REXPaint parity spec | whole-sheet-init.js Erase (drag) — wired | Fidelity runner ws_erase_drag PASS (root + /xpedit, acceptance mode) | **PROVEN** | M2-C |
| W6 | Flood fill | REXPaint parity spec | whole-sheet-init.js Fill tool — wired | WS tools runner: fill click → glyph changed PASS (root + /xpedit) | **PROVEN** | M2-C |
| W7 | Rectangle tool | REXPaint parity spec | whole-sheet-init.js Rect tool — wired | WS tools runner: drag rect → corner glyphs painted PASS (root + /xpedit) | **PROVEN** | M2-C |
| W8 | Line tool | REXPaint parity spec | whole-sheet-init.js Line tool — wired | Fidelity runner ws_draw_line PASS (root + /xpedit, acceptance mode) | **PROVEN** | M2-C |
| W9 | Switch tool (keyboard) | REXPaint parity spec | Keyboard shortcuts C/E/D/L/R/I — wired | Fidelity runner ws_tool_activate PASS (root + /xpedit, acceptance mode) | **PROVEN** | M2-C |
| W10 | Switch layer | UI control ref §7 | `switchToLayer()` — wired | Layer runner step 2: w10_switch PASS (root + /xpedit) | **PROVEN** | M2-C |
| W11 | Toggle layer visibility | UI control ref §7 | Layer visibility checkboxes — wired | Layer runner step 3: w11_visibility PASS (root + /xpedit) | **PROVEN** | M2-C |
| W12 | Add layer | SAR blueprint | `_addLayer()` whole-sheet-init.js:1168, `.ws-layer-add-btn` click handler | Layer runner step 4: w12_add PASS (root + /xpedit) | **PROVEN** | M2-C |
| W13 | Delete layer | SAR blueprint | `_deleteActiveLayer()` whole-sheet-init.js:1178, delete btn click handler | Layer runner step 6: w13_delete PASS (root + /xpedit) | **PROVEN** | M2-C |
| W14 | Move layer | SAR blueprint | `_moveLayerUp/Down()` whole-sheet-init.js:1189/1198, up/down btn handlers | Layer runner step 5: w14_move PASS (root + /xpedit) | **PROVEN** | M2-C |
| W15 | Select tool | Implementation checklist | SelectToolAdapter wired, button `#wsToolSelect`, shortcut `S`; visualization hookup connected in `2d9aa30`; `selectionBounds` added to `getState()` observation surface | Three-part proof (2026-03-24): (1) activeTool='select' after button click, (2) selectionBounds={x:2,y:2,width:4,height:4} after canvas drag, (3) marching-ants screenshot (`step07b_w15_select_drag_marching_ants.png`). 8/8 PASS root-hosted. Runner: `run_whole_sheet_tools_test.mjs` step 7. | **PROVEN** | M2-C |
| W16 | Oval tool | Implementation checklist | Code exists on disk but NOT wired (PB-05) | No evidence | DEFERRED | M2-C |
| W17 | Text tool | Implementation checklist | Code exists on disk but NOT wired (PB-07) | No evidence | DEFERRED | M2-C |
| W18 | Per-stroke undo/redo | SAR blueprint, implementation checklist | Ctrl+Z/Y wired to workbench undo/redo (25dc204, b497090); sidebar buttons already worked | WS tools runner: paint→Ctrl+Z→glyph reverted PASS (root + /xpedit) | **PROVEN** | M2-C |

**Whole-Sheet Known Gaps:**
- PB-05: OvalTool exists on disk, not wired — DEFERRED
- ~~PB-06~~: **PROVEN** (2026-03-24) — SelectTool visualization fixed (`2d9aa30`), three-part verifier proof committed: activeTool='select', selectionBounds={x:2,y:2,w:4,h:4}, marching-ants screenshot. Runner: `run_whole_sheet_tools_test.mjs` step 7.
- PB-07: TextTool exists on disk, not wired — DEFERRED
- ~~W12-W14~~: **CORRECTED + PROVEN** — code exists at whole-sheet-init.js:1168-1204. Now PROVEN via layer runner (7bdab92).
- ~~W18~~: **PROVEN** — Ctrl+Z/Y keyboard shortcuts wired at 25dc204, sidebar buttons already worked. Proven via tools runner paint→Ctrl+Z→revert at 8f79b35. Note: editor-app.js internal undo stack stubs remain (line 950-960) but workbench snapshot undo works end-to-end.

#### Post-Audit Parity Extension (2026-03-25 REXPaint parity audit)

> **Scope note:** The 13 actions below are a post-audit parity extension discovered by the 2026-03-25 audit. They are tracked separately from the existing 96-action SAR count to avoid silently inflating the denominator. They will be folded into the SAR denominator at the next canon rebaseline. Until then, aggregate statistics reference "35/96 SAR + 8/13 parity extension proven."

**Structural finding:** whole-sheet-init.js does NOT use EditorApp. It imports tool classes directly. W19-W22 (clipboard: copy/paste/cut/delete) were implemented directly in whole-sheet-init.js (landed `0383b31`, proven `431b437`). W23 (select all) is wired but has a known bounds-update bug when the select tool is already active. W24-W27 (selection transforms) implemented and PROVEN (`6af8b86`, `1828979`): 4 shipped sidebar buttons + `]`/`[` keyboard shortcuts, single undo per transform, bounds update after rotate. W28-W31 (bulk-edit) remain unimplemented.

**Planned whole-sheet actions:**

| # | Action | Code Basis | Status | Priority | M2 Scope |
|---|--------|-----------|--------|----------|----------|
| W19 | Copy selection (Ctrl+C) | Implemented in whole-sheet-init.js (`0383b31`) | **PROVEN** | HIGH | Post-M2-C parity | UI-driven proof `431b437` via `run_whole_sheet_clipboard_test.mjs`. Copies selected cell data to internal clipboard. |
| W20 | Paste selection (Ctrl+V) | Implemented in whole-sheet-init.js (`0383b31`) | **PROVEN** | HIGH | Post-M2-C parity | UI-driven proof `431b437`. Ctrl+V enters paste mode, click places content at target. |
| W21 | Cut selection (Ctrl+X) | Implemented in whole-sheet-init.js (`0383b31`) | **PROVEN** | HIGH | Post-M2-C parity | UI-driven proof `431b437`. Copies then clears source region. |
| W22 | Delete/clear selection (Del) | Implemented in whole-sheet-init.js (`0383b31`) | **PROVEN** | HIGH | Post-M2-C parity | UI-driven proof `431b437`. Delete key clears selected cells to glyph=0. |
| W23 | Select all (Ctrl+A) | Implemented in whole-sheet-init.js (`0383b31`) | **WIRED** | MEDIUM | Post-M2-C parity | Known bug: bounds not updated when select tool already active. Non-blocking. |
| W24 | Rotate selection CW | Implemented in whole-sheet-init.js (`6af8b86`) | **PROVEN** | MEDIUM | Post-M2-C parity | Button `#wsRotateCW` + keyboard `]`. Single undo op, bounds update. 9/9 PASS `run_whole_sheet_transform_test.mjs` (`1828979`). |
| W25 | Rotate selection CCW | Implemented in whole-sheet-init.js (`6af8b86`) | **PROVEN** | MEDIUM | Post-M2-C parity | Button `#wsRotateCCW` + keyboard `[`. Verified restores original from CW state. |
| W26 | Flip selection H | Implemented in whole-sheet-init.js (`6af8b86`) | **PROVEN** | MEDIUM | Post-M2-C parity | Button `#wsFlipH`. Single undo op verified (Ctrl+Z reverts). |
| W27 | Flip selection V | Implemented in whole-sheet-init.js (`6af8b86`) | **PROVEN** | MEDIUM | Post-M2-C parity | Button `#wsFlipV`. Cell positions verified via diagnostic observation. |
| W28 | Fill selection | Port `fillInspectorSelectionWithGlyph()` logic from workbench.js:3199 | PLANNED | MEDIUM | Post-M2-C parity |
| W29 | Replace FG in selection | Port `replaceInspectorSelectionColor('fg')` logic from workbench.js:3236 | PLANNED | MEDIUM | Post-M2-C parity |
| W30 | Replace BG in selection | Port `replaceInspectorSelectionColor('bg')` logic from workbench.js:3236 | PLANNED | MEDIUM | Post-M2-C parity |
| W31 | Find & Replace | Port `applyInspectorFindReplace()` from workbench.js:3285; needs dialog UI | PLANNED | LOW | Post-M2-C parity |

**Parity decision items (ownership undecided):**

These inspector operations work at the frame level, not the whole-sheet canvas level. Product must decide whether they become grid-panel actions, whole-sheet actions, or remain inspector-only residuals:

| Operation | Inspector Function | Notes |
|-----------|-------------------|-------|
| Copy frame | `copyInspectorFrame()` workbench.js:3374 | Operates on single sprite frame, not canvas region |
| Paste frame | `pasteInspectorFrame()` workbench.js:3384 | Same |
| Flip frame H | `flipInspectorFrameHorizontal()` workbench.js:3402 | Same |
| Clear frame | `clearInspectorFrame()` workbench.js:3419 | Same |

**Inspector-only residuals (intentionally not ported):**

| Operation | Reason |
|-----------|--------|
| Half-cell paint (top/bottom) | Inspector-specific rendering; not a REXPaint or whole-sheet concept |
| Cell inspect tool (hover readout) | Replaced by WS Info panel |

**Inspector demotion status:** W19-W22 (clipboard) PROVEN (`431b437`). W24-W27 (transforms) PROVEN (`1828979`). Remaining blocker: W28-W31 (bulk-edit). Phase 1 (collapse to `<details>`) can proceed. Phase 2-6 (progressive absorption) unblocked for clipboard + transforms. Phase 7 (full demotion) blocked until at minimum W28-W31 are shipped.

### Family 8: Jitter/Alignment (6 actions)

| # | Action | Canon Source | Code Evidence | Proof Evidence | Status | M2 Scope |
|---|--------|-------------|---------------|----------------|--------|----------|
| J1 | Nudge left | UX checklist §20 | `nudgeFrameJitter("left")` — wired | No verifier | WIRED | M2-D |
| J2 | Nudge right | UX checklist §20 | `nudgeFrameJitter("right")` — wired | No verifier | WIRED | M2-D |
| J3 | Nudge up | UX checklist §20 | `nudgeFrameJitter("up")` — wired | No verifier | WIRED | M2-D |
| J4 | Nudge down | UX checklist §20 | `nudgeFrameJitter("down")` — wired | No verifier | WIRED | M2-D |
| J5 | Auto-align selected | UX checklist §20 | `autoAlignFrameJitter(false)` — wired | No verifier | WIRED | M2-D |
| J6 | Auto-align row | UX checklist §20 | `autoAlignFrameJitter(true)` — wired | No verifier | WIRED | M2-D |

### Family 9: Lifecycle (3 actions)

| # | Action | Canon Source | Code Evidence | Proof Evidence | Status | M2 Scope |
|---|--------|-------------|---------------|----------------|--------|----------|
| L1 | Save session | SAR blueprint | `saveCurrentActionProgress()` — wired | M1 PROVEN | PROVEN | M1-closed |
| L2 | Undo (workbench snapshot) | UI control ref §2 | `undo()` — wired, max 50 history | Wired with ~40 pushHistory call sites | WIRED | M2-D |
| L3 | Redo (workbench snapshot) | UI control ref §2 | `redo()` — wired | Wired | WIRED | M2-D |

### Family 10: Runtime Dock (7 actions)

| # | Action | Canon Source | Code Evidence | Proof Evidence | Status | M2 Scope |
|---|--------|-------------|---------------|----------------|--------|----------|
| R1 | Test This Skin | UI control ref §10 | `testCurrentSkinInDock()` → iframe | M1 Skin Dock PASS | PROVEN | M1-closed |
| R2 | Apply In Place | UI control ref §10 | `applyCurrentXpAsWebSkin({restart_if_overlay_hidden: false})` | Hidden/experimental, no proof | WIRED | M2-D |
| R3 | Apply + Restart | UI control ref §10 | `applyCurrentXpAsWebSkin({force_restart: true})` | Hidden/experimental, no proof | WIRED | M2-D |
| R4 | Open Preview | UI control ref §10 | `openWebbuild()` → iframe creation | No specific proof | WIRED | M2-D |
| R5 | Reload Preview | UI control ref §10 | `reloadWebbuild()` | No specific proof | WIRED | M2-D |
| R6 | Upload Skin (file) | UI control ref §10 | `onWebbuildUploadTestClick()` | No specific proof | WIRED | M2-D |
| R7 | Apply Current XP (Advanced) | UI control ref §10 | `applyCurrentXpAsWebSkin()` → API | Hidden/experimental, no proof | WIRED | M2-D |

### Family 11: Bug Report / UI Recorder (7 actions)

| # | Action | Canon Source | Code Evidence | Proof Evidence | Status | M2 Scope |
|---|--------|-------------|---------------|----------------|--------|----------|
| B1 | Open bug report | UI control ref §14 | `openBugReportModal()` — wired | Playwright browser test on live `rikiworld.com/xpedit`: modal opens on click (2026-03-24) | **PROVEN** | M1-closed |
| B2 | Submit bug report | UI control ref §14 | `submitBugReport()` → `/api/workbench/report-bug` | Playwright browser test: GitHub Issue #7 created via live Cloud Run (2026-03-24). API test: Issue #6 created. GitHub delivery wired via Secret Manager. | **PROVEN** | M1-closed |
| B3 | Dismiss bug report | UI control ref §14 | Modal close handler — wired | Playwright browser test: modal auto-closes after submit (2026-03-24) | **PROVEN** | M1-closed |
| B4 | Start UI recording | UI control ref §15 | `startUiRecorder()` — wired | No specific proof | WIRED | M1-closed |
| B5 | Stop UI recording | UI control ref §15 | `stopUiRecorder()` — wired | No specific proof | WIRED | M1-closed |
| B6 | Clear recording | UI control ref §15 | `clearUiRecorder()` — wired | No specific proof | WIRED | M1-closed |
| B7 | Download recording JSON | UI control ref §15 | `downloadUiRecorder()` — wired | No specific proof | WIRED | M1-closed |

### Family 12: XP Preview (4 actions, not in SAR 96-count)

| # | Action | Canon Source | Code Evidence | Proof Evidence | Status | M2 Scope |
|---|--------|-------------|---------------|----------------|--------|----------|
| P1 | Play animation preview | UI control ref §9 | `startPreview()` — wired | No specific proof | WIRED | M1-closed |
| P2 | Stop animation preview | UI control ref §9 | `stopPreview()` — wired | No specific proof | WIRED | M1-closed |
| P3 | Change FPS | UI control ref §9 | `fpsInput` change handler — wired | No specific proof | WIRED | M1-closed |
| P4 | Change angle/direction | UI control ref §9 | `previewAngle` change handler — wired | No specific proof | WIRED | M1-closed |

### Family 13: Legacy Inspector (cell-level editing, 25+ actions)

The legacy XP Frame Inspector is fully wired with complete implementations for all tools (Inspect, Select, Glyph, Paint, Erase, Dropper), frame operations (Copy, Paste, Flip H, Clear), selection operations (Copy, Paste, Cut, Clear, Select All, Fill, Replace FG/BG), transforms (Rotate CW/CCW, Flip H/V), BG=Transparent, and Find & Replace.

**Status:** All handlers are WIRED and fully implemented. However, the legacy inspector is a **Milestone 2 demotion target** (M2-C.1) — the whole-sheet editor should become the primary correction surface, with the inspector as a collapsed debug fallback.

**Proof:** No specific verifier coverage for inspector-level actions. The inspector was the primary editing surface during M1, but verification focused on the save/export/runtime loop, not individual editing operations.

**2026-03-25 parity audit finding (updated):** W19-W22 (clipboard) **PROVEN** (`431b437`). W24-W27 (transforms) **PROVEN** (`1828979`). Inspector demotion remains blocked on W28-W31 (bulk-edit) only. Phase 1 (collapse to `<details>`) can proceed. Phase 2-6 unblocked for clipboard + transforms. Phase 7 blocked until W28-W31 are shipped.

---

## Part 3: Workflow Proof Summary

### End-to-End Workflows

| Workflow | Steps | Proof Level | Evidence |
|----------|-------|-------------|----------|
| **XP import → edit → save → export → runtime** | T6 → edit → T3 → T4 → T7 | **PROVEN** | M1 full_recreation PASS, 7/7 edge workflows |
| **Bundle: apply → per-action edit → save → test** | T1 → T2 → edit → T3 → T7 | **PROVEN** | M1 action_tab_hydration + partial_bundle_gating PASS |
| **PNG upload → analyze → convert → session** | U1 → U2 → U3 → T3 | **PROVEN (structural-contract only, API-driven)** | M2-A 9/9 structural gates PASS via fetch() — does NOT prove UI button workflow |
| **PNG → source panel → manual assembly → grid → WS → export** | U1 → S12 → S7 → D1 → W2 → T3 → T4 | **PARTIAL** | U1→S12→S7→D1 PROVEN; W2 and WS entry/editing now PROVEN; T3→T4 proven separately. No single committed end-to-end run yet. |
| **Source panel → manual box draw → drag to grid** | S2 → S7 → D1 | **PROVEN** | Source-to-grid runner: 13/13 PASS (root + /xpedit). D1 drag, D2/C2 context menu, G1 grid select all verified. |
| **Whole-sheet correction → save → export** | W1 → W2-W8 → T3 → T4 | **PARTIAL** | W1 and W2-W8 are now PROVEN across Slice 1 and Slice 3; T3/T4 are proven separately. No single committed integrated workflow run yet. |
| **Semantic editing (region-based)** | Dict lookup → W2 → T3 → T4 | **NOT PROVEN** | M2-E scope, dictionaries exist, no verifier |
| **Base-path parity** | Any workflow at /xpedit | **PROVEN (structural-contract + M2-B/C UI)** | M2-A structural-contract PASS at both root + /xpedit; M2-B source-panel + source-to-grid PASS at both; M2-C whole-sheet slices PASS at both; no `/xpedit`-specific regressions in committed proof lanes |

---

## Part 4: Aggregate Statistics

### By Status (96-action SAR baseline)

> **Updated 2026-03-25** — 2026-03-25 REXPaint parity audit added 13 planned whole-sheet parity actions (W19-W31) as a post-audit extension. These are tracked separately and NOT included in the 96-action SAR denominator below. They will be folded in at the next canon rebaseline.

| Status | Count | % of 96 SAR actions |
|--------|-------|---------------------|
| PROVEN | 31 | 32% |
| WIRED | 56 | 58% |
| PARTIAL | 2 | 2% |
| PLANNED | 4 | 4% |
| BLOCKED | 1 | 1% |
| DEFERRED | 2 | 2% |
| *Outside SAR 96* | ~36 | (inspector, preview, recorder, bug report) |
| *Post-audit parity extension* | 13 | (4 PROVEN, 1 WIRED, 8 PLANNED — tracked separately) |
| *Parity decision items* | 4 | (frame copy/paste/flip/clear: ownership undecided) |

### By M2 Sub-Phase (96-action SAR baseline only)

| Sub-Phase | Total Actions | Proven | Wired | Partial/Blocked/Planned |
|-----------|---------------|--------|-------|-------------------------|
| M1-closed | 15 | 8 | 7 | 0 |
| M2-A (structural baseline) | 2 | 2 | 0 | 0 |
| M2-B (source-panel assembly) | 13 | 10 | 3 | 0 |
| M2-C (WS primary) | 20 | 14 | 2 | 4 (1 BLOCKED, 2 DEFERRED, 1 PARTIAL) |
| M2-D (full SAR coverage) | 45 | 0 | 43 | 2 (1 PARTIAL, 1 PLANNED) |
| M2-E (semantic dicts) | 0 | 0 | 0 | 0 (workflow-level, not action-level) |
| M2-F (analyze assistive) | 1 | 0 | 1 | 0 |
| *Post-M2-C parity (W19-W31)* | 13 | 8 | 1 | 4 (W28-W31 PLANNED) |

### Verifier Slice Readiness (from M2 verifier design)

| Slice | Purpose | Acceptance? | Built? |
|-------|---------|-------------|--------|
| Slice 1 | PNG Structural Baseline | YES | Ad-hoc proof only (M2-A 9/9 structural gates PASS via `run_structural_baseline_test.mjs`); not a formal unified-architecture slice |
| Slice 2 | Source-Panel Contract | diagnostic | **YES** — committed runner `run_source_panel_workflow_test.mjs` (5c67ef2), 10/10 PASS; not yet a unified-architecture recipe but committed proof exists |
| Slice 3 | Source-to-Grid Contract | YES | **YES** — committed runner `run_source_to_grid_workflow_test.mjs` (380edee), 13/13 PASS root + /xpedit; D1/D2/G1 PROVEN |
| Slice 4 | Whole-Sheet Tools + Layers | YES | **YES** — 16/18 W-actions PROVEN: fidelity rerun (46fe06f) W2/W3/W5/W8/W9; layer runner (7bdab92) W10-W14; tools runner (daf161b→8f79b35) W1/W4/W6/W7/W18; W15 three-part proof (2026-03-24). W16/W17 DEFERRED. |
| Slice 5 | Manual Assembly E2E | YES | **YES** — committed UI-driven E2E run (2026-03-24), 13/13 PASS. Runner: `run_manual_assembly_e2e_test.mjs`. Workflow: template→upload→draw→anchor→pad→add-to-row→WS-focus→paint→save→export. |

**All 5 slices have committed proof** (Slice 1 structural, Slice 2 source-panel, Slice 3 source-to-grid, Slice 4 whole-sheet 16/18, Slice 5 manual assembly E2E). The unified M2 verifier architecture (canonical spec §5) can now focus on recipe generation and automated execution for remaining WIRED actions rather than infrastructure building.

---

## Part 5: Canon Conflicts (ranked by severity)

### Conflict 1: M1 open vs closed (CRITICAL — doc drift)

- **INDEX.md line 90** (2026-03-21): "Milestone 1 is not closed until they are verified"
- **CLAUDE.md** (2026-03-23): "Milestone 1 is closed on canonical root-hosted master"
- **PLAYWRIGHT_FAILURE_LOG.md**: M1 closed with commit 14e8e95, 7/7 edge workflows PASS
- **Resolution:** INDEX.md now records M1 closed as baseline and Milestone 2 as the active workstream

### Conflict 2: Undo/Redo implementation status (HIGH — functional gap)

- **UI control ref §2**: Lists undo/redo as UI elements (#8-9) — TRUE
- **UX checklist §13**: Claims undo/redo "participate in mutations" — PARTIALLY TRUE
- **Feature inventory**: Marks undo/redo ❌ "NOT IMPLEMENTED" (EditorApp stubs) — TRUE for WS per-stroke
- **Reality:** Workbench-level snapshot undo/redo (50-deep) IS wired and works. Whole-sheet per-stroke undo has stubs but is NOT connected. Anchor operations (PB-01/02/03) don't push history at all.

### Conflict 3: PB-10/PB-13 blocker status (MEDIUM — stale-doc)

- **Bug-gap-index Wave 0**: Lists PB-10 (runtime files) and PB-13 (Skin Dock stall) as M1 blockers
- **Same doc, lower section**: Marks both as CLOSED (M1 closeout)
- **Resolution:** Wave 0 precondition text is stale; the bugs are genuinely closed

### Conflict 4: COMPLETE_UI_CONTROL_REFERENCE.md scope (MEDIUM — misread risk)

- **Doc header**: "Append-only comprehensive reference" listing 189 elements
- **Reality:** It is a control-level inventory (buttons, inputs, handlers), not a capability-truth doc. Presence of a control does not prove the workflow it belongs to is functional or verified.
- **Resolution:** This doc needs a scope clarification note (added in this audit)

### Conflict 5: Cell mismatch severity (LOW — resolved)

- **Bug-gap-index Wave 0**: "Fix 50 L2 cell mismatches" as M1 blocker
- **Failure log**: 5 remaining mismatches, all canvas-edge artifacts, explicitly NON-BLOCKING
- **Resolution:** Already resolved; Wave 0 text is stale

---

## Part 6: Biggest Intended-But-Not-Proven Workflows

Ranked by M2 acceptance importance:

1. **PNG → source panel → manual assembly → grid → WS → export** (M2-B/C/D)
   - Every individual step is WIRED. Zero end-to-end proof.
   - This is THE critical M2 acceptance workflow.

2. **Source panel full cycle** (draw box → commit → select → move → resize → delete)
   - 7 of 19 source-panel actions PROVEN via M2-B runner (S1, S2, S7, S8, S12, S15, S16).
   - 12 remaining actions WIRED but unverified (move, resize, row/col drag, cut, delete, zoom).

3. **Whole-sheet correction** (focus → paint → eyedropper → erase → save)
   - W1/W2-W8/W18 are PROVEN across committed whole-sheet runners.
   - W15 visualization is connected but still lacks committed end-to-end proof; W16/W17 remain deferred.
   - Save/export are proven separately, but no single committed integrated whole-sheet correction lane exists yet.

4. **Context menu outcomes** (add sprite, add to row, set anchor, pad, delete)
   - All handlers WIRED. DOM-only probed in coverage agent. No state assertions.
   - Anchor operations have undo gaps (PB-01/02/03).

5. **Grid stability after insertions** (add frame → move → delete → copy/paste)
   - All 14 grid actions WIRED. Zero verifier coverage.

6. **Semantic editing** (region lookup → targeted paint → save)
   - Dictionaries exist (player-0100, attack-0001, plydie-0000). No verifier, no agent API.
   - M2-E scope, lowest priority.

---

## Part 7: Recommended Next Acceptance/Debug Slice

Based on this audit, the highest-value next work is:

### Priority 1: Manual Assembly E2E (Slice 5)

Build verifier Slice 5 to prove the critical M2 acceptance workflow:
`Upload PNG → Find Sprites → Draw/commit box → Drag to grid → Focus WS → Paint correction → Save → Export → Runtime test`

This is the single workflow that, if proven, demonstrates M2-B/C/D are functional. It exercises:
- Source panel (S2, S7, S12)
- Source-to-grid (D1)
- Whole-sheet (W1, W2)
- Lifecycle (L1, T3, T4)
- Runtime (T7)

### Priority 2: Source Panel Contract (Slice 2) — expand coverage

The source panel has 7 of 19 actions PROVEN via committed M2-B runner (`run_source_panel_workflow_test.mjs`, 5c67ef2). The remaining 12 actions (move, resize, row/col drag, cut, delete, zoom) have zero verifier coverage. A contract expansion proving box CRUD (move, resize, delete) would close the highest remaining gap.

### Priority 3: Fix Anchor Undo Gaps (PB-01/02/03)

3 code locations where `pushHistory()` is missing. Blocks undo verification for the entire source panel.

---

## Part 8: Generator Readiness by Family

> **Purpose:** This section classifies each action family's readiness for extraction into `action_registry.json` — the first stage of the unified M2 verifier architecture (see canonical spec §5).

### Generator Readiness Key

- **READY** — All actions in this family have: (a) known DOM selector, (b) known handler, (c) clear preconditions/postconditions. Can be extracted to action_registry.json now.
- **MOSTLY READY** — Most actions have selectors/handlers, but 1-2 have canvas-coordinate or drag-gesture complexity requiring a selector abstraction.
- **NEEDS DESIGN** — Actions require new selector patterns (canvas coordinates, drag gestures, keyboard shortcuts) or state observation not yet in `getState()`.
- **DEFERRED** — Not in M2 scope or blocked.

### Readiness Assessment

| Family | # Actions | Generator Readiness | Registry Status | Blocking Issue |
|--------|-----------|--------------------|-----------------|----|
| F1: Template/Bundle (T1-T8) | 8 | **READY** | 8/8 in registry (85ff3b8) | None |
| F2: Upload/Convert (U1-U3) | 3 | **READY** | 3/3 in registry (85ff3b8) | None |
| F3: Source Panel (S1-S19) | 19 | **MOSTLY READY** | 7/19 in M2-D pass (S1-S6, S12) | S7-S10/S13-S14/S17 need canvas gestures; S18 needs inputRange in runner; S11 duplicate of S6; S15/S16 deferred alias rows (=C3/C4); S19 PARTIAL |
| F4: Context Menu (C1-C9) | 9 | **READY** | 9/9 in registry (85ff3b8) | None |
| F5: Source-to-Grid (D1-D2) | 2 | **PROVEN** | 0/2 — cross-panel drag abstraction needed | D1 drag and D2/C2 context menu verified but gestureType not in registry model |
| F6: Grid Panel (G1-G14) | 14 | **MOSTLY READY** | 5/14 in M2-D pass (G5-G6, G9-G11) | G3/G4 dual-button schema gap; G7/G8 deferred alias rows (=C6/C7); G13 needs inputRange; G1/G2/G12/G14 need canvas gestures |
| F7: Whole-Sheet Editor (W1-W18) | 18 | **PARTIALLY PROVEN** | 2/18 executable (W12-W13) + 16 stubs in M2-D pass | 15/18 PROVEN but most need canvas/keyboard/dynamic-row gesture abstractions. W15 WIRED (visualization connected, proof gap remains). W16-W17 DEFERRED. W18 PROVEN but deferred (dual-button schema gap). |
| F8: Jitter/Alignment (J1-J6) | 6 | **READY** | 6/6 in registry (85ff3b8) | None |
| F9: Lifecycle (L1-L3) | 3 | **READY** | 3/3 in registry (85ff3b8) | None |
| F10: Runtime Dock (R1-R7) | 7 | **READY** | 7/7 in registry (85ff3b8) | None |
| F11: Bug Report (B1-B7) | 7 | **READY** | 7/7 in registry (85ff3b8) | None |
| F12: XP Preview (P1-P4) | 4 | **READY** | 4/4 in registry (85ff3b8) | None |

**Registry coverage summary (after M2-D pass):**

| Category | Families | Action Count |
|----------|---------|-------------|
| Fully in registry | F1(8), F2(3), F4(9), F8(6), F9(3), F10(7), F11(7), F12(4) | **47** |
| Partially in registry (M2-D) | F3(7/19), F6(5/14), F7(2+16 stubs/18) | **30 new** |
| Not in registry | F5(0/2) | **2** |
| **Total registry entries after M2-D** | | **77** (61 executable + 16 stubs) |

**Deferred to schema evolution:** G3/G4/W18 (dual-button), S18/G13 (inputRange), S15/S16/G7/G8 (alias rows), S7-S10/S13-S14/S17/G1/G2/G12/G14/W1-W9 (canvas/keyboard gestures), W10-W11/W14 (dynamic row selectors).

### DOM Selector Authority

This inventory absorbs and supersedes the control-level selector truth from these source documents:

| Source Doc | Role | What This Inventory Absorbs | Remaining Role |
|-----------|------|---------------------------|----------------|
| `docs/COMPLETE_UI_CONTROL_REFERENCE.md` | 189-element control inventory (2026-03-08) | DOM IDs, handler names, bundle-mode notes per element | **Reference** — control-level detail beyond what the action families need; does not claim active workflow state |
| `docs/WORKBENCH_DOCS_ARCHIVE.md#workbench-source-panel-ux-checklist` | Source panel feature tracking (2026-02-23) | IMPLEMENTED status per feature; proof-status caveat (2026-03-23 update) | **Reference** — UX design intent and acceptance criteria per feature |
| `docs/WORKBENCH_DOCS_ARCHIVE.md#claude-workbench-ui-inventory` | 189-element inventory (historical) | Superseded by COMPLETE_UI_CONTROL_REFERENCE.md; no additional truth | **Archived** (2026-03-23) |
| `docs/WORKBENCH_DOCS_ARCHIVE.md#2026-03-22-workbench-verifier-sar-model` | SAR architecture explanation | Architecture absorbed into canonical spec §5; enumeration absorbed here | **Archived** (2026-03-23) |
| `docs/plans/2026-03-22-workbench-sar-table-blueprint.md` | Exhaustive SAR field mapping | State field inventory (getState/\_state coverage) informs action_registry.json design | **Reference** — state-field detail needed during action_registry implementation; retain until action_registry.json is built |

### State/Debug Debt Affecting Generator

The following `getState()` gaps block full generator autonomy:

| Field | Current Access | Impact | Resolution Path |
|-------|---------------|--------|----------------|
| `actionStates` | `_state()` only | Tab-switch postconditions require raw state access | Add curated `actionStates` to `getState()` P3 batch |
| `sourceCutsV` / `sourceCutsH` | `_state()` only | Vertical/horizontal cut postconditions unavailable via safe API | Add to `getState()` P3 batch |
| `sourceCanvasZoom` | `_state()` only | Zoom postconditions unavailable | Add to `getState()` P3 batch |
| `templateSetKey`, `bundleId`, `activeActionKey` | `_state()` only per SAR blueprint (but `getState()` has them per state-capture contract P1) | **Already resolved** — state-capture contract confirms P1 additions | No action needed |
| `gridCols`, `gridRows`, `sessionDirty` | `_state()` only per SAR blueprint (but `getState()` has them per state-capture contract P1) | **Already resolved** | No action needed |

> **Note:** The SAR table blueprint (2026-03-22) listed several fields as not in `getState()` that the state-capture contract (2026-03-23) confirms were added in the P1 batch. The contract is authoritative for current `getState()` coverage; the blueprint is authoritative for the full state surface.

---

## Appendix: Doc Cross-Reference Map

| Doc | Role in Canon | Freshness | Key Update Needed |
|-----|---------------|-----------|-------------------|
| CLAUDE.md | Entry point, milestone status | Current (2026-03-23) | None |
| docs/INDEX.md | Navigation hub, milestone definitions | Updated 2026-03-24: branch truth aligned to current master; M1 baseline and M2 active status made explicit | None |
| PLAYWRIGHT_FAILURE_LOG.md | Reality/proof ground truth | Current (2026-03-23) | None |
| docs/COMPLETE_UI_CONTROL_REFERENCE.md | Control-level inventory | Updated 2026-03-23: scope clarification appended by stitch script | None |
| docs/WORKBENCH_DOCS_ARCHIVE.md#workbench-source-panel-ux-checklist | Source panel feature tracking | Updated 2026-03-23: proof-status note added, provisional/uncommitted language removed | None |
| docs/WORKBENCH_DOCS_ARCHIVE.md#claude-workbench-ui-inventory | Historical UI inventory | Archived 2026-03-23 | N/A |
| docs/plans/2026-03-22-workbench-sar-table-blueprint.md | SAR action enumeration | Current (2026-03-22) | None |
| docs/WORKBENCH_DOCS_ARCHIVE.md#2026-03-23-milestone-2-bug-gap-index | Bug/gap tracking | Current (2026-03-23) | None |
| **This doc** | Canonical capability inventory | Created 2026-03-23 | — |

---

## Appendix B: Non-Canonical Doc Inventory

> **Purpose:** Explicit classification of all non-canonical docs with archive-readiness assessment. See also `docs/INDEX.md` for the navigation view.

### Classification Tiers

| Tier | Count | Rule |
|------|-------|------|
| Canonical | 3 | Protected — never archive |
| Structural Contract | 2 | Protected — update only on milestone boundary |
| Reference | ~12 | Stable reference — retain as long as content is not fully absorbed into canon |
| Active Plan | ~8 | In-progress implementation guidance — retain until completed or superseded |
| Worksheet | ~80 | Historical — retire via stitch when safe |

### Tier 1: Structural Contracts (retain)

| Path | Why Not Archived | Archive When |
|------|-----------------|-------------|
| `docs/XP_EDITOR_ACCEPTANCE_CONTRACT.md` | Normative contract for full XP-editor parity; still live acceptance criteria | When all parity goals are met or explicitly descoped |
| `docs/PNG_STRUCTURAL_BASELINE_CONTRACT.md` | Non-regression contract for PNG ingest; actively referenced by M2-A verifier | When M2-A structural slice is automated and passes continuously |

### Tier 2: Reference Docs (retain)

| Path | Classification | Why Not Archived | Archive When |
|------|---------------|-----------------|-------------|
| `docs/COMPLETE_UI_CONTROL_REFERENCE.md` | Reference | 189-element control inventory with DOM IDs and handlers; needed as implementation reference for `action_registry.json` and `selectors.mjs` | After action_registry.json fully absorbs selector truth |
| `docs/WORKBENCH_DOCS_ARCHIVE.md#workbench-source-panel-ux-checklist` | Reference | UX design intent and acceptance criteria per source-panel feature; still the spec for unverified features | After all source-panel features are PROVEN in capability canon |
| `docs/WORKBENCH_DOCS_ARCHIVE.md#rexpaint-ui-complete-index` | Reference | REXPaint v1.70 UI reference implementation; stable, external product reference | Retain indefinitely — external reference, not repo-specific |
| `docs/WORKBENCH_DOCS_ARCHIVE.md#feature-button-index-with-rexpaint-manual` | Reference | Feature button reference + REXPaint manual text | Retain — reference material |
| `docs/research/ascii/2026-03-15-xp-data-contract.md` | Reference | Code-backed XP binary format contract | Retain — format reference not duplicated elsewhere |
| `docs/research/ascii/2026-03-20-bundle-animation-types.md` | Reference | Bundle/animation type map | Retain — animation reference not duplicated elsewhere |
| `docs/research/ascii/2026-03-21-player-sprite-semantic-dictionary-seed.md` | Reference | Semantic dictionary seed | Retain — M2-E prerequisite |
| `docs/plans/2026-03-22-workbench-sar-table-blueprint.md` | Reference | Exhaustive SAR state-field mapping from code; needed during action_registry.json implementation | After action_registry.json is built and state-capture contract absorbs remaining fields |
| `docs/plans/2026-03-23-state-capture-contract.md` | Reference | getState/\_state API contract; normative for all verifier code | Retain — live verifier contract |
| `docs/WORKBENCH_DOCS_ARCHIVE.md#2026-03-23-milestone-2-bug-gap-index` | Reference | Active bug/gap tracking | Archive when all tracked bugs are resolved |
| `docs/WORKBENCH_DOCS_ARCHIVE.md#mvp-deployment` | Reference | Deployment architecture truth | Retain — deployment reference |
| `docs/WORKBENCH_DOCS_ARCHIVE.md#reskin-prep` | Reference | Safe reskin surface definition | Retain — UI constraint reference |

### Tier 3: Active Plans (retain until completed/superseded)

| Path | Why Not Archived | Archive When |
|------|-----------------|-------------|
| `docs/plans/2026-03-21-milestone-2-practical-png-ingest-plan.md` | Strategic M2 plan — still the active roadmap for M2 phases | After M2 closes or plan is superseded |
| `docs/plans/2026-03-21-milestone-2-png-verifier-design.md` | M2 verifier design — architecture input for canonical spec §5 | After unified M2 verifier architecture is fully built (action_registry + dom_runner) |
| `docs/WORKBENCH_DOCS_ARCHIVE.md#2026-03-21-milestone-2-implementation-checklist` | Implementation checklist with EXISTS/PARTIAL/MISSING status | After all M2-B/C/D items are PROVEN |
| `docs/WORKBENCH_DOCS_ARCHIVE.md#2026-03-22-base-path-support-plan` | Base-path implementation plan — partially implemented | After base-path work is complete |
| `docs/WORKBENCH_DOCS_ARCHIVE.md#2026-03-22-milestone-1-edge-case-verifier-plan` | M1 edge-case verifier design — M1 is closed but plan informed M2 architecture | Safe to archive now (M1 closed, architecture absorbed into spec §5) |
| `docs/WORKBENCH_DOCS_ARCHIVE.md#2026-03-23-milestone-2-base-path-unified-verifier-plan` | Unified verifier plan | After verifier_lib.mjs fully supports all M2 slices |
| `docs/WORKBENCH_DOCS_ARCHIVE.md#2026-03-15-xp-editor-hard-fail-plan` | Hard-fail plan — still active for verifier discipline | After M2 verifier architecture replaces ad-hoc hard-fail patterns |
| `docs/WORKBENCH_DOCS_ARCHIVE.md#2026-03-21-legacy-inspector-retirement-checklist` | Inspector demotion checklist — M2-C.1 scope | After legacy inspector is demoted to debug-only |

### Tier 4: Worksheets — Retired (2026-03-23)

These 4 docs were archived via `scripts/doc_lifecycle_stitch.sh` during the 2026-03-23 canon-absorption session:

| Path | Superseded By | Safe to Retire? |
|------|--------------|----------------|
| `docs/WORKBENCH_DOCS_ARCHIVE.md#claude-workbench-ui-inventory` | `docs/COMPLETE_UI_CONTROL_REFERENCE.md` | **YES** — fully superseded, no unique truth |
| `docs/WORKBENCH_DOCS_ARCHIVE.md#2026-03-22-workbench-verifier-sar-model` | Canonical spec §5 (unified M2 verifier architecture) + this doc Part 8 | **YES** — architecture absorbed into canonical spec; enumeration absorbed here |
| `docs/WORKBENCH_DOCS_ARCHIVE.md#2026-03-21-claude-handoff-m2-png-verifier-design` | `docs/plans/2026-03-21-milestone-2-png-verifier-design.md` (completed design) | **YES** — handoff for completed deliverable |
| `docs/WORKBENCH_DOCS_ARCHIVE.md#2026-03-22-edge-case-verifier-impl-plan` | M1 closed; implementation details no longer active | **YES** — M1 implementation complete |

### Tier 5: Worksheets — Historical Handoffs (bulk classification)

~11 `CLAUDE-HANDOFF-*.md` files from 2026-03-10 through 2026-03-20. These are session handoffs that predate the 3-doc canonical model. They contain historical context but no unique normative truth not captured in the canon.

**Why not archived yet:** Bulk retirement requires verifying no remaining doc links point to them as active references. The `doc_lifecycle_stitch.sh` script handles link rewriting, but 11 files is a large batch.

**Archive when:** After this canon-absorption session, as a separate batch retirement pass. The stitch script should be run per-file to ensure safe link rewriting.

### Tier 6: Worksheets — Old Plans and Research (bulk classification)

~30 files in `docs/plans/2026-02-*`, `docs/plans/2026-03-04-web-rexpaint-editor/claude-*.md` (except UI inventory), `docs/plans/2026-03-08-*`, `docs/plans/2026-03-10-*`, and miscellaneous `docs/` root files (audit reports, gap analyses, execution summaries).

**Why not archived yet:** Pre-M1 historical material. No unique normative truth. Bulk retirement blocked only by volume and link-rewriting safety.

**Archive when:** Same batch retirement pass as Tier 5. Prioritize docs that are still referenced from INDEX.md's "Active High-Signal Docs" section (which needs cleanup — see INDEX.md update below).
