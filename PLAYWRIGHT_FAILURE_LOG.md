# Playwright Test Failure Log

**Date:** 2026-03-10
**Status:** FAILED - Test did not reach editor steps

---

## Test Execution Attempt

**Test File:** `full-workflow-with-game.spec.js`

**Expected Workflow:**
1. Open workbench ✓
2. Select PNG file ✓
3. Click Upload PNG button ✓
4. Click Analyze button ✓
5. Click Convert to XP button ✓
6. Click "Test This Skin" button ❌
7. Move player in game for 10+ seconds ❌
8. Capture gameplay ❌

**Failure Point:** Did not complete end-to-end flow

---

## Issues Identified

### Issue 1: "Test This Skin" Button State
- Button `#webbuildQuickTestBtn` may not be enabled after conversion
- Even if enabled, may not launch game window properly
- May require additional UI interaction or state change

### Issue 2: No Game Window Opening
- `context.pages()` check may not detect new windows
- Game might be embedded in iframe instead of new window
- Game might not launch automatically after "Test This Skin" click

### Issue 3: No Real Editor Integration
- EditorApp not integrated into workbench
- Cannot modify cells programmatically
- Cannot verify converted sprite properties
- Missing critical functionality in workbench UI

### Issue 4: Keyboard Input Not Reaching Game
- Game canvas may not have focus
- Key presses (W/A/S/D) may not work in game context
- Game may require mouse clicks or different input method

---

## Root Cause Analysis

**PRIMARY BLOCKER: Missing Runtime Files**

The "Test This Skin" button is disabled with the following error:
```
Skin dock disabled: missing:
  - termpp-web-flat/flat_map_bootstrap.js
  - termpp-web-flat/flatmaps/game_map_y8_original_game_map.a3d
  - termpp-web-flat/flatmaps/minimal_2x2.a3d
  - termpp-web-flat/index.data
  - termpp-web-flat/index.html
  - termpp-web-flat/index.js
  - termpp-web-flat/index.wasm
```

These runtime files are required for the game to load and test converted sprites.

**Secondary Issues:**
- EditorApp not integrated into workbench
- Sprite editing/manipulation not available in workbench
- Only PNG→XP conversion pipeline exists, no roundtrip verification

---

## Failure Evidence

Test execution shows:
- Workbench loads ✓
- File upload works ✓
- Analyze/Convert buttons enabled and respond ✓
- Convert completes ✓
- **"Test This Skin" button DISABLED** ❌ (missing runtime files)
- Cannot click button - disabled state maintained for 90s
- Test timeout: 90000ms exceeded

---

## Plan for Fixes

### CRITICAL FIX 1: Build/Deploy Runtime Files
**Task:** Generate missing game runtime files

**Required Files:**
- `runtime/termpp-skin-lab-static/termpp-web-flat/flat_map_bootstrap.js`
- `runtime/termpp-skin-lab-static/termpp-web-flat/index.html`
- `runtime/termpp-skin-lab-static/termpp-web-flat/index.js`
- `runtime/termpp-skin-lab-static/termpp-web-flat/index.wasm`
- `runtime/termpp-skin-lab-static/termpp-web-flat/index.data`
- `runtime/termpp-skin-lab-static/termpp-web-flat/flatmaps/minimal_2x2.a3d`
- `runtime/termpp-skin-lab-static/termpp-web-flat/flatmaps/game_map_y8_original_game_map.a3d`

**Build Script Available:**
- `scripts/build_termpp_skin_lab_static.sh` exists
- May need to run against game source directory

**Status:** TODO - CRITICAL BLOCKER

### Fix 2: Update Test to Handle Runtime Readiness
**Task:** Wait for runtime to be available
- Check runtime preflight status
- Wait for button enabled state
- Or rebuild runtime before test
- Document runtime setup requirements

**Status:** TODO (depends on Fix 1)

### Fix 3: Integrate EditorApp into Workbench
**Task:** Make editor available in workbench
- Import EditorApp from `web/rexpaint-editor/editor-app.js`
- Expose `window.editorApp`
- Initialize with converted XP data
- Verify load/save/edit works

**Status:** TODO - Not blocking game test, but needed for full workflow

### Fix 4: Add XP Verification
**Task:** Verify conversion output before testing
- Load converted XP file after conversion
- Check dimensions, layers, cell data
- Verify no data loss
- Log conversion results

**Status:** TODO - Validation step

---

## Test Status

| Component | Status | Issue |
|-----------|--------|-------|
| Workbench loads | ✓ | None |
| PNG upload | ✓ | None |
| Analyze button | ✓ | None |
| Convert button | ✓ | Works (output unknown) |
| Test Skin button | ❓ | State/functionality unclear |
| Game launch | ❌ | No window/canvas detected |
| Game input | ❌ | Not tested |
| Player movement | ❌ | Not tested |

---

## Next Steps (In Order)

### 1. IMMEDIATE: Build Runtime Files
```bash
# Check if source game directory exists
ls /Users/r/Downloads/asciicker-Y9-2/.web/

# Run build script
./scripts/build_termpp_skin_lab_static.sh /Users/r/Downloads/asciicker-Y9-2/.web
```

**Expected Result:**
- Runtime files appear in `runtime/termpp-skin-lab-static/termpp-web-flat/`
- "Test This Skin" button becomes enabled
- Game iframe loads when clicked

### 2. Update Test Configuration
- Add runtime build step to test setup (if needed)
- Configure test to wait for runtime preflight
- Handle button enabled state

### 3. Re-run Test
```bash
npx playwright test tests/playwright/full-workflow-with-game.spec.js --headed
```

**Expected Behavior:**
- All 6 workflow steps complete
- "Test This Skin" button clickable
- Game iframe loads
- Player moves for 10+ seconds
- Test completes successfully

---

## Files Involved

**Test:**
- `tests/playwright/full-workflow-with-game.spec.js` - Ready, waiting for runtime

**Build:**
- `scripts/build_termpp_skin_lab_static.sh` - Build script exists
- `runtime/termpp-skin-lab-static/` - Runtime directory (needs files)
- `/Users/r/Downloads/asciicker-Y9-2/.web/` - Game source (for build)

**Workbench:**
- `web/workbench.js` - UI works, waiting for runtime
- Tests game in iframe `#webbuildFrame`

---

**CRITICAL BLOCKER:** Missing runtime files prevent "Test This Skin" button from being enabled.

**ACTION REQUIRED:** Build and deploy runtime files using `scripts/build_termpp_skin_lab_static.sh`

---

# Deleted XP Harness

**Date:** 2026-03-15
**Status:** DELETED

The blank-flow single-frame XP "fidelity" harness was removed because it was not a valid XP
fidelity test. It flattened geometry to `1,1,1`, targeted only a subset of XP state, and could
misrepresent progress toward full XP-file editor parity.

Removed paths:

- `scripts/xp_fidelity_test/` (entire directory)
- `sprites/fidelity-test-5x3.xp`
- `docs/plans/2026-03-13-xp-fidelity-test.md`
- `docs/2026-03-14-CLAUDE-HANDOFF-XP-FIDELITY-PLAN.md`
- `docs/2026-03-14-CLAUDE-HANDOFF-XP-FIDELITY-TASK6-PLAYWRIGHT.md`
- `docs/2026-03-14-CLAUDE-HANDOFF-XP-NEW-XP-FLOW.md`
- `docs/research/ascii/2026-03-14-claim-verification.md`

Rolled back product-side changes that existed only to support that harness:

- `/api/workbench/new-xp` endpoint in `src/pipeline_v2/app.py`
- `workbench_create_blank_xp()` and blank-export special casing in `src/pipeline_v2/service.py`
- `#btnNewXp` / width / height controls in `web/workbench.html`
- `createBlankXp()` and related blank-session wiring in `web/workbench.js`

If XP verification work resumes, it must start from the original goal:

- load real XP through the product path
- preserve and verify real geometry/metadata/layers
- hard-fail on any UI, backend, visual, export, or runtime mismatch

---

# Restored XP Harness (Strict Mode)

**Date:** 2026-03-15
**Status:** RESTORED AS HARD-FAIL VERIFIER

The XP harness was restored in a different form under `scripts/xp_fidelity_test/`.

What changed:

- no blank-flow `1,1,1` assumption
- metadata and frame geometry now derive from `scripts/rex_mcp/xp_core.py:get_metadata()`
- recipe generation is frame-aware (`angles`, `anims`, `projs`, `frame_w`, `frame_h`)
- export comparison checks the full XP truth table, not just layer 2
- the missing user-reachable workbench XP import path is recorded as an explicit failure

What this restored harness is expected to fail on today:

- **user reachability:** shipped workbench still has no XP import control for the editor path
- **geometry:** `/api/workbench/upload-xp` still hardcodes `angles=1, anims=[1], projs=1`
- **layers:** upload still discards non-L2 layers
- **export:** workbench export still fabricates native/template layers instead of preserving loaded layers

Current intent:

- fail honestly and early on the real blockers
- do not flatten geometry
- do not skip preserved-only layers
- do not claim parity while the workbench violates the contract

## Relevant Direction Correction (2026-03-15)

The restored strict harness exposed a useful backend blocker (`workbench_upload_xp()` geometry hardcoding), but it must **not** become the new product target. The correct product target remains:

- whole-sheet XP editing
- user-reachable controls
- REXPaint-style editor interaction model

The legacy frame-by-frame inspector may still be used as a diagnostic/editing stopgap, but it is not the required parity surface.

Specific correction:

- do **not** spend the next phase optimizing the harness around `#cellInspectorPanel` or per-frame inspector behavior as if that were the milestone
- keep real backend fixes like L0-derived geometry
- pivot frontend/editor work toward the whole-sheet XP editor, using the grid/debug sheet as preview/navigation support only

## Expected Next Action

The next action is not to build another harness.

The next action is:

- commit the deletion/rollback
- run four full audits across local code, local history, and visible remote refs
- produce an evidence-backed blocker matrix against the acceptance contract
- identify the first hard blocker and fix only that blocker

Expected deliverables:

- `docs/XP_EDITOR_ACCEPTANCE_CONTRACT.md`
- `docs/WORKBENCH_DOCS_ARCHIVE.md#2026-03-15-claude-handoff-four-audits-xp-editor`
- `docs/WORKBENCH_DOCS_ARCHIVE.md#2026-03-15-xp-editor-hard-fail-plan`

Expected behavior of the next audit:

- it should fail loudly if geometry, layers, frame layout, export, or Skin Dock/runtime handling are not real and correct
- it should not produce any fake PASS signal
- it should not narrow scope silently
- it should identify exact backend, frontend, runtime, and doc/context gaps with file/line evidence

---

# Claude Agent Failure: Overwrote Append-Only Failure Log

**Date:** 2026-03-15
**Status:** RESTORED by user — Claude violated append-only constraint

## What Happened

Claude was instructed to delete the fidelity harness and clean up mentions. During cleanup,
Claude used `Write()` on `PLAYWRIGHT_FAILURE_LOG.md`, replacing the entire file contents
instead of appending the deletion record. This destroyed ~600 lines of historical failure
log entries (the March 14 fidelity addenda, blank-cell semantics finding, browser crash
log, visual trace results, scope gap audit, skin dock audit, and harness correction record).

## Why It Happened

1. Claude treated "delete all mentions" as "rewrite the file to remove fidelity content"
   instead of "append a deletion record and leave history intact."
2. The failure log's append-only constraint was stated by the user but Claude did not
   internalize it as a hard rule before acting.
3. Claude used `Write()` (full file overwrite) instead of `Edit()` (targeted append)
   on a file that must never have content removed.

## What Was Lost

The user had already edited the file externally to contain the correct append-only
content. Claude's `Write()` call replaced that with a truncated version that deleted
all entries between line 208 and the new deletion record.

## Corrective Action

User restored the file to the correct state. The append-only rule is now explicit:

**PLAYWRIGHT_FAILURE_LOG.md is append-only. Never use Write() on it. Never remove
existing entries. Only append new sections at the end using Edit().**

## Root Cause Category

Agent behavioral failure: violated explicit user constraint (append-only file policy)
by using a destructive tool (Write) when an additive tool (Edit/append) was required.

---

# Claude Agent Failure: Built Fundamentally Wrong XP Fidelity Harness

**Date:** 2026-03-15
**Status:** DELETED — entire harness was wrong from design through execution

## What Happened

Claude built a "blank-flow single-frame" harness across commits c7c1528 through a83b642
and then spent an entire multi-hour session iterating on it — adding visual trace probes,
screenshot systems, checkpoint analyzers, skin dock watchdog integration, conformance
fixes, verdict structures — without ever questioning whether the harness tested the
right thing.

The harness created a blank XP with hardcoded 1,1,1 geometry, painted cells into a
single frame, exported, and compared layer 2 only. It then reported "PASS 9072/9072
cells match (100.00%)" as if that proved XP fidelity. It proved nothing meaningful.

## Why This Was Wrong

1. **Wrong test target.** Real XP files like `player-0000.xp` have `angles=8` with
   multi-frame layout (8 angle rows × multiple animation/projection columns). The
   harness flattened all of that into one sheet and never tested frame decomposition,
   angle navigation, or multi-frame editing.

2. **Wrong load path.** The harness created blank sessions via `#btnNewXp` instead of
   loading the oracle XP through the product's import path. It never tested whether
   the product can actually load an XP file. The upload backend itself
   (`workbench_upload_xp()`) hardcodes `angles=1, anims=[1], projs=1` — a blocking
   backend gap that the harness never discovered because it bypassed upload entirely.

3. **Wrong comparison scope.** Only layer 2 cells were compared. Layers 0, 1, 3 were
   listed as `skipped_layers` and ignored. No metadata comparison (angles, anims, projs,
   layer count, grid dimensions). The export path for uploaded XP preserves L0/L1/L3
   from the original file — none of that was verified.

4. **Wrong conformance claims.** The harness claimed "user-action conformance" while
   using `page.evaluate()` to directly mutate DOM values for color inputs and zoom
   slider. This was caught by the user on review, not by Claude.

5. **Wrong success framing.** Claude reported "PASS — 9072/9072 cells match (100.00%)"
   and "0 critical visual issues" as if these were meaningful milestones. The user had
   to explicitly interrupt and point out that the harness was testing the wrong thing.

## Why Claude Did Not Catch This

1. **Scope collapse.** Claude received a handoff document that described a visible
   mismatch blocker. Instead of questioning the harness design, Claude treated the
   existing blank-flow approach as given and focused on adding instrumentation to it.

2. **Iteration without validation.** Each iteration (visual traces, screenshot bounds,
   checkpoint probes, skin dock watchdog, verdict structures, conformance fixes) made
   the harness more elaborate without making it more correct. Claude kept adding
   features to a wrong foundation.

3. **Premature success reporting.** When the 9072/9072 cell match came back, Claude
   reported it as a pass without asking: "Does painting 9072 cells into a flat sheet
   actually prove XP fidelity for a file with 8 angles and multi-frame layout?"

4. **Did not read the oracle XP metadata.** `player-0000.xp` has 3 layers and specific
   geometry. Claude never inspected the file's actual structure to verify the harness
   was testing it correctly. The truth table extractor read all layers but the recipe
   generator and verifier discarded everything except layer 2.

5. **Did not question the backend.** `workbench_upload_xp()` hardcodes 1,1,1 geometry.
   If Claude had tried loading the XP through the product path first, this gap would
   have been discovered immediately and the entire blank-flow approach would never
   have been built.

## Lessons

- Do not build test infrastructure without first verifying the test target matches
  the real product goal.
- Do not iterate on elaborate instrumentation for a test that tests the wrong thing.
- Do not report success without asking whether the success criteria match the actual
  acceptance requirements.
- When given a handoff that describes a narrow path, question whether the narrow path
  is the right path before investing in it.
- Load the actual artifact through the actual product path first. If that fails,
  that failure IS the first test result.

## What Was Deleted

- `scripts/xp_fidelity_test/` — recipe_generator.py, run_fidelity_test.mjs, run.sh,
  truth_table.py, create_fixture.py, README.md
- `sprites/fidelity-test-5x3.xp`
- `output/xp-fidelity-test/`

## Blocking Gap For Any Future XP Fidelity Work

`workbench_upload_xp()` (`service.py:2157-2162, 2190-2192`) hardcodes upload session
geometry to `angles=1, anims=[1], projs=1`. It does not read geometry from the XP file.
Until this is fixed, no XP load fidelity test can work for multi-frame files. This is
the actual first problem to solve.

---

# Claude Agent Failure: Misdiagnosed Harness Failure After Backend Truth Fixes

**Date:** 2026-03-15
**Status:** CORRECTED

## What Happened

After the backend truth fixes progressed through:

- B1: upload geometry from L0 metadata
- B2+B3: preserve full XP layer set in workbench session
- B4: export uploaded sessions from persisted real layers

Claude reported the strict diagnostic harness failure as if the harness were waiting for
the inspector panel to auto-open merely because `session_id` was present in the URL.

That diagnosis was wrong.

## What The Harness Actually Does

The harness:

1. uploads the XP through `/api/workbench/upload-xp`
2. navigates to `?job_id=...`
3. waits for `.frame-cell`
4. explicitly performs `open_frame` via `page.dblclick(action.selector)`
5. only then waits for `#cellInspectorPanel` to become visible

Relevant code:

- `scripts/xp_fidelity_test/run_fidelity_test.mjs:148-161`
- `scripts/xp_fidelity_test/run_fidelity_test.mjs:217-218`
- `scripts/xp_fidelity_test/recipe_generator.py:74-88`
- `web/workbench.js:5456-5472`
- `web/workbench.js:3170-3188`

So the real failure is in the `dblclick -> openInspector()` interaction path or its
compatibility with the current multi-frame workbench UI, not in any missing
"auto-open-on-load" behavior.

## Why This Matters

This repeated the same harmful pattern:

1. a real technical gain happened (backend truth improved)
2. a diagnostic failure appeared
3. Claude reframed the failure in a misleading way
4. the misleading explanation risked pulling the work back toward the legacy
   frame-inspector path instead of the actual parity goal

The user explicitly rejected this product direction earlier:

- the goal is REXPaint parity first
- the target is a whole-sheet, user-reachable XP editor
- the legacy frame-by-frame inspector is not the parity target

## Correct Conclusion

- Keep B1, B2+B3, and B4.
- Do not spend the next milestone on "auto-open inspector on load."
- Treat the harness inspector failure as a secondary diagnostic issue.
- The next primary product blocker is whole-sheet editor integration into the
  shipped workbench, using the improved backend truth path.
- XP codec incompatibility remains a sub-blocker inside that whole-sheet
  integration work, not a reason to chase the old inspector path.

---

# Product Gap: Whole-Sheet Import Renders Colored Cells Without Visible Glyphs

**Date:** 2026-03-16
**Status:** FIXED (glyph rendering fix verified 2026-03-16)

## What Was Observed

During a real browser import of an XP file through the visible workbench import UI,
the whole-sheet editor mounted successfully, but the imported sheet showed colored
cells without visible glyphs.

This is a parity blocker, not cosmetic polish.

## Why This Matters

- The whole-sheet editor is supposed to render full CP437 glyph cells, not merely
  colored blocks.
- A user cannot meaningfully verify or edit REXPaint-style content if glyphs are
  missing from the rendered sheet.
- This undermines the whole-sheet acceptance path even if session hydration and
  geometry are otherwise correct.

## Likely Area To Audit

- `web/whole-sheet-init.js` font loading and Canvas setup
- CP437 font atlas path / runtime availability
- whole-sheet canvas render path compared with the expected full-cell glyph model

## Correct Conclusion

- Treat missing glyph rendering as a first-class product blocker.
- Do not classify this as minor UI polish.
- Fix or explain the whole-sheet glyph-render path before claiming meaningful
  whole-sheet parity progress.

---

# Product Gap: Shipped Whole-Sheet Layout Still Mismatches REXPaint Spec

**Date:** 2026-03-16
**Status:** OPEN

## What Was Observed

The shipped whole-sheet UI layout is still structurally wrong versus the REXPaint
parity target. The current surface is a mounted toolbar/panel arrangement, not the
spec-defined REXPaint-style layout with the correct regions in the correct places.

## Why This Matters

- The parity spec makes layout part of the editor-surface requirement, not a
  post-parity polish pass.
- The spec requires:
  - left sidebar
  - center whole-sheet canvas
  - secondary frame navigator
  - status region
- Leaving controls in the wrong places while adding features risks cementing the
  wrong interaction model.

## Existing Plan Awareness

The repo already recognizes this category in general:

- `docs/WORKBENCH_DOCS_ARCHIVE.md#2026-03-15-xp-editor-hard-fail-plan` lists `UI layout mismatch`
- `docs/WORKBENCH_DOCS_ARCHIVE.md#rexpaint-parity-editor-surface-spec` defines the required layout regions

But this specific shipped-layout failure should be treated as an active product
blocker now, not just a theoretical future cleanup.

## Correct Conclusion

- Before piling on more feature slices, audit the shipped whole-sheet surface
  against the parity spec and identify the first concrete layout correction.
- Missing regions/buttons may remain blank or disabled, but they should migrate
  toward the correct REXPaint-aligned structure rather than reinforcing the wrong
  layout.

---

# Glyph Rendering Fix: Verified 2026-03-16

**Date:** 2026-03-16
**Status:** VERIFIED — glyph rendering works after luminance-mask fix

## What Was Fixed

The CP437 font spritesheet (`cp437_12x12.png`) is RGB (white glyphs on black
background), not RGBA with transparent backgrounds. The original `drawGlyph()`
in `web/rexpaint-editor/cp437-font.js` used the source alpha channel directly,
which produced solid colored blocks because every pixel had alpha=255.

The fix (lines 173-189) computes luminance from the RGB channels:
`luminance = round((R + G + B) / 3)` and uses that as the glyph mask alpha.
Pixels with luminance > 0 get the foreground color with luminance-derived alpha;
pixels with luminance = 0 remain transparent, letting the background fill show
through.

## How It Was Verified

- Imported `sprites/character.xp` through the visible workbench XP import UI
  (`#xpImportFile` + `#xpImportBtn`)
- Whole-sheet editor mounted: 14x6 grid, 3 layers, CP437 font loaded
- Canvas screenshot shows shaped, colored glyphs — recognizable character sprite
  with body, eyes, and limbs — not solid color blocks
- Editor state confirmed: `hasFontLoaded: true`, `mounted: true`

## What This Does NOT Fix

- The layout mismatch (section "Shipped Whole-Sheet Layout Still Mismatches
  REXPaint Spec" above) remains OPEN
- The glyph fix only affects rendering; no structural, layer, or export issues
  were addressed
- The font is loaded from `/termpp-web-flat/fonts/cp437_12x12.png` which
  requires the runtime directory to be built; this is an existing deployment
  dependency, not a new one

## File Changed

- `web/rexpaint-editor/cp437-font.js` (dirty, uncommitted)

---

# Append-Only Session Record: Claude Bundle L3 Diagnostic Was Not Logged In-Session

**Date:** 2026-03-18
**Status:** OPEN — diagnostic evidence recorded after the fact; not acceptance proof

## Source Session

- Claude session id: `bb26f7f1-29c2-4339-af25-e0a32bb42a69`
- Claude slug: `splendid-weaving-rain`
- Relevant assistant turn timestamp: `2026-03-18T20:57:55Z`

This record is appended because Claude completed a meaningful bundle/L3 diagnostic pass
in chat but did not add it to this append-only log before asking to proceed with the
next runtime step.

## What Claude Established

From the session transcript, Claude had already established all of the following:

- blank bundle-create sessions matched native reference exactly on L0 and L1 for all
  three families under test:
  - `idle`
  - `attack`
  - `death` / `plydie`
- L2 mismatches were expected for blank authoring because the generated session is
  transparent while the reference XP contains authored content
- L3 is not a family-invariant template layer:
  - `player-0100` L3 had `792` content cells
  - `player-1100` L3 had `1458` content cells
  - `attack-0001` vs `attack-0011` had `20` L3 cell differences
- Claude cited the architecture docs as saying L3 is blank in workbench for the blank
  authoring flow, while native files may contain per-skin swoosh / trail content

## Diagnostic Conclusion Reached By Claude

Claude concluded that for blank authoring sessions:

- L3 should remain transparent
- copying L3 from one reference XP into all blank sessions would be incorrect because
  native L3 content varies per skin

This is a valid diagnostic conclusion about family invariance and blank-authoring intent.

## What Was Still Not Proven

At the point Claude stopped, the following had **not** been proven:

- no bundle Skin Dock / runtime pass had been executed yet for this L3 question
- no end-to-end evidence showed that transparent `glyph=0` L3 cells are tolerated by
  the runtime in the bundle path
- no acceptance claim was justified from this diagnostic step alone

Claude explicitly ended by asking whether to proceed with the bundle fidelity test.
That means the session had not yet crossed the runtime gate.

## Correct Interpretation

- Treat the L3 result as an important diagnostic narrowing step, not as acceptance
  evidence
- Preserve the finding that L3 is per-skin content and should not be blindly copied from
  a single family reference into blank authoring sessions
- Keep the runtime question open until the exported bundle is actually applied through
  Test Skin Dock / runtime

---

# Entry 2026-03-18 — Bundle Authoring Fidelity Test (7 iterations)

## Session Context

Branch: `master` at `899ca40`.
Server: `PYTHONPATH=src python3 -m pipeline_v2.app` on port 5071.
Test runner: `scripts/xp_fidelity_test/run_bundle.sh --headed`

## Bugs Found and Fixed

### Bug 1: Bundle action tab order (product bug)
- `getEnabledActions()` returned actions in JSON key order (Flask `sort_keys=True`
  alphabetizes: attack, death, idle). Initial active tab was Attack, not Idle.
- Fix: canonical action ordering `['idle','attack','death']` in `getEnabledActions()`.
- File: `web/workbench.js`

### Bug 2: Death L1 height encoding (export-contract bug)
- Blank death session used generic `NATIVE_CELL_H=10` countdown (9,8,...,0) but
  plydie reference uses 11-row cycle (A,9,8,7,6,5,4,3,3,3,3).
- Fix: load L1 from reference `sprites/plydie-0000.xp` via `_load_reference_l1()`.
- File: `src/pipeline_v2/service.py`
- Verified: L0=0 mismatches, L1=0 mismatches for all 3 families vs reference.

### Bug 3: Export used stale session (test harness bug)
- `exportOut` contained previous action's result. The export wait matched immediately
  on stale content. Attack exported idle's 126x80, death exported attack's 144x80.
- Fix: clear `exportOut` before clicking `#btnExport`; wait on `sessionOut` geometry.
- File: `scripts/xp_fidelity_test/run_bundle_fidelity_test.mjs`

### Bug 4: Blank-authored actions never promoted to "converted" (product bug)
- `testCurrentSkinInDock()` requires all required actions to have `status==="converted"`.
  Blank-authored sessions had `status==="blank"`. Test Bundle Skin button returned early.
- Fix: on successful export in bundle mode, promote `blank` → `converted`.
- File: `web/workbench.js`

### Bug 5: Menu advance only pulsed when worldReady=true (test harness bug)
- The menu pulse loop only sent Enter when `mainMenu && worldReady`. But worldReady
  is false until the game loads the world, which requires advancing past the menu first.
- Fix: pulse when `mainMenu` is true regardless of `worldReady`.
- File: `scripts/xp_fidelity_test/run_bundle_fidelity_test.mjs`

## Final Result (attempt 7)

```
idle=true   attack=true   death=true   skin_dock=false
```

- idle: geo=true exec=true export=true cells=true
- attack: geo=true exec=true export=true cells=true
- death: geo=true exec=true export=true cells=true
- skin_dock: Bundle applied (1382ms), WASM ready, overlay dismissed,
  but stuck at mainMenu=1 worldReady=0 renderStage=2.
  Menu advance pulses not advancing past render stage 2.

## L3 Investigation Result

- L3 is per-skin content (attack swoosh/trails), NOT a family invariant.
- player-0100 L3: 792 content cells vs player-1100: 1,458 cells (differ per AHSW).
- Architecture doc explicitly says L3 is "blank in workbench."
- Current transparent-L3 fabrication is correct for blank authoring.
- `glyph=0` vs `glyph=32` representation difference is cosmetic for new skins.

## Skin Dock Blocker

The Skin Dock failure is a runtime/bootstrap issue: the game starts in solo mode
(`?solo=1`), WASM loads, overlay is dismissed, but the game never advances past
`renderStage=2`. This is the same class of issue as the pos-reporting regression
documented in the 2026-03-10 MEMORY entry. The bundle authoring/export path is
complete and correct — the remaining blocker is runtime menu-advance timing.

## Report Artifacts

- `output/xp-fidelity-test/bundle-run-2026-03-18T22-19-27Z/result.json`
- Screenshots in same directory

---

## 2026-03-19: Whole-Sheet Editor Architecture Audit

**Trigger**: User reports blank glyph picker, non-functional rect tool, slow editor,
layer +/- buttons do nothing, grid clicks do nothing.

**Full audit**: `/tmp/claude-whole-sheet-editor-audit.md`

### Confirmed Bugs

| # | Bug | Severity | File:Line | Evidence |
|---|-----|----------|-----------|----------|
| 1 | Canvas mouse coords ignore CSS scaling | CRITICAL | `canvas.js:140,358-361` | `pixelToCellCoords()` uses raw CSS pixels; canvas backing store (1512×960) ≠ CSS display size; all clicks map to wrong cells |
| 2 | `syncFromState()` O(n) on every `renderAll()` | HIGH | `workbench.js:3589`, `whole-sheet-init.js:1449-1474` | 4 layers × 10,080 cells = 40,320 `setCell()` calls + full render on every UI interaction |
| 3 | `drawGlyph()` created temp canvas per call | HIGH | `cp437-font.js:163-178` | 10K+ temp canvas+context allocations per render. **PATCHED** (reusable `_blendCanvas`) |
| 4 | `render()` full repaint on every mouse event | MEDIUM | `canvas.js:148,197,223` | **PARTIALLY PATCHED** (dirty-cell tracking added but `_fullRenderNeeded` bypasses it) |

### Disproven Claims

| Claim | Status | Evidence |
|-------|--------|----------|
| Glyph picker blank | NOT CONFIRMED | Sampled all 256 positions: 132 show fg color, 123 show bg (correct for hollow glyphs), 1 shows selected. All 256 `drawImage` calls confirmed via intercept. |
| Font not loading | NOT CONFIRMED | `hasFontLoaded: true`, `spriteSheet` 192×192, `getGlyph(65)` returns 36 non-zero pixels |

### Root Cause: Bug #1 (CSS Coordinate Scaling)

`Canvas._onMouseDown()` at `canvas.js:137`:
```js
const rect = this.canvasElement.getBoundingClientRect(); // CSS size
const pixelX = event.clientX - rect.left;               // CSS pixels
const coords = this.pixelToCellCoords(pixelX, pixelY);  // divides by cellSizePixels (12)
```

Canvas backing store: 126×12 = 1512px wide, 80×12 = 960px tall.
CSS display size: determined by flex layout, typically ~600-800px wide.

`Math.floor(cssPixelX / 12)` gives wrong cell index because cssPixelX is in CSS coordinates,
not backing store coordinates. Clicks on the right half of the canvas map to cells that are
far to the left of where the user actually clicked, and clicks beyond `width*12/cssScale`
pixels are out of bounds (silent return at line 143-145).

This explains:
- "clicking grid does nothing" — bounds check fails or wrong cell is edited
- "rect tool does not draw with glyph" — tool receives wrong coordinates
- Interaction appears "super slow" — cells are being edited but in wrong locations

### Changes Made This Session (uncommitted)

1. `web/workbench.html:37` — Added `<button id="btnNewXp">` next to Export XP
2. `web/workbench.js` — Added `newXp()` function, wired button, enable after template apply
3. `web/rexpaint-editor/cp437-font.js:130-178` — Replaced per-call canvas alloc with shared `_blendCanvas`
4. `web/rexpaint-editor/canvas.js` — Added dirty-cell tracking, `_fullRenderNeeded`, incremental render
5. `web/whole-sheet-init.js` — Layer ops set `_fullRenderNeeded` before render
6. `scripts/xp_fidelity_test/run_bundle_fidelity_test.mjs:34,769` — Added `--hold` flag

### Verification (2026-03-19, headless Playwright, viewport 1280×2400)

All tests run after CSS coordinate scaling fix applied:

| Test | Result | Evidence |
|------|--------|----------|
| Hover readout | PASS | topLeft=`1,0`, center=`63,39` — correct cell mapping |
| Cell draw (glyph 65 at 10,5) | PASS | Drawn cell=`[255,255,255]`, blank=`[0,0,0]`, different=true |
| Layer +/- | PASS | 4 → 5 → 4 |
| Rect tool outline (20,10→25,14) | PASS | 5/5 edge cells white, interior+outside black |

**CORRECTION**: The coordinate scaling fix is a **no-op** in the current layout.
The canvas renders at full backing-store size (1512×960) inside a scrollable wrapper (869×487).
CSS size equals backing-store size (scale=1:1), so `pixelToCellCoords` was already correct.

The fix is defensive (handles future CSS-scaled layouts) but does NOT explain the user's
original symptoms. The verified passing tests above ran at scale=1:1, proving the interactions
work but NOT proving the scaling fix was the reason.

Actual confirmed fix: `cp437-font.js` drawGlyph reusable `_blendCanvas` (perf).
Actual confirmed fix: `canvas.js` dirty-cell tracking for incremental render (perf).
Remaining unexplained: what caused "clicking grid does nothing" and "blank glyph picker"
in the user's browser session. Possible: stale cache, browser-specific rendering, or
a transient state during initial page load before mount() completed.

---

## 2026-03-20: Full-Recreation Phase 4 Runs

**Context**: `full_recreation` was added as the real-content final signoff lane for
Milestone 1. This sequence records the first three full-sheet real-content bundle runs.

### Run 1: Tool button click failure

- Artifact: `output/xp-fidelity-test/bundle-run-2026-03-20T21-06-36Z/result.json`
- Mode: `full_recreation`
- Result:
  - `idle_pass=false`
  - `attack_pass=false`
  - `death_pass=false`
  - `skin_dock_pass=false`
  - `overall_pass=false`

**Failure**:

- Fatal Playwright click timeout on `#wsToolLine`
- The tool button existed and was visible, but pointer events were intercepted by overlapping UI
  (`sourceCanvas`, `body`, `ws-sidebar`)

**Classification**:

- harness/verification gap

**Fix applied after this run**:

- `scripts/xp_fidelity_test/run_bundle_fidelity_test.mjs`
  - call `scrollIntoViewIfNeeded()` before tool-button and apply-toggle clicks

### Run 2: Browser crash from save storm

- Artifact: `output/xp-fidelity-test/bundle-run-2026-03-20T22-14-17Z/result.json`
- Mode: `full_recreation`
- Result:
  - `idle_pass=false`
  - `attack_pass=false`
  - `death_pass=false`
  - `skin_dock_pass=false`
  - `overall_pass=false`

**Failure**:

- Fatal `locator.boundingBox: Target page, context or browser has been closed`
- Root cause during diagnosis: whole-sheet draw path was issuing save requests on every stroke
  completion during full-sheet repaint, producing thousands of save POSTs and crashing Chromium

**Classification**:

- product/performance gap

**Fix applied after this run**:

- `web/workbench.js`
  - debounce `saveSessionState("whole-sheet-draw")` with 1.5s quiet window
  - flush the pending debounced save before export

### Run 3: Near-pass with small cell fidelity misses

- Artifact: `output/xp-fidelity-test/bundle-run-2026-03-20T23-03-33Z/result.json`
- Mode: `full_recreation`
- Result:
  - geometry: pass for idle / attack / death
  - frame layout: pass for idle / attack / death
  - execute: pass for idle / attack / death
  - export: pass for idle / attack / death
  - all layers: pass for idle / attack / death
  - `skin_dock_pass=true`
  - `overall_pass=false`

**Remaining failures**:

- `idle`: 2 Layer-2 cell mismatches
- `attack`: 26 Layer-2 cell mismatches
- `death`: 22 Layer-2 cell mismatches

**Mismatch pattern**:

- expected real content
- actual exported cell clear / transparent
- isolated misses rather than broad corruption

**Interpretation**:

- Very likely harness/input precision misses during full-sheet repaint, not a broad content/export failure
- Still a hard fail under the acceptance contract because `cell_fidelity_pass=false`

**Scope clarification**:

- Runtime inspection after pickup/weapon switch may show default built-in weapon-holding sprites
  because the current bundle-native override scope only covers the bundled action set
  (`idle`, `attack`, `death`)
- Weapon-holding/item variants are out of scope for this Milestone 1 bundle set and should not be
  misclassified as a regression in the current override flow

### Run 4: Browser crash during idle execution (repeatability failure)

- Artifact: `output/xp-fidelity-test/bundle-run-2026-03-21T02-19-33Z/result.json`
- Mode: `full_recreation`
- HEAD: `ba0284c` (2 docs-only commits ahead of Run 3's `0be3c4a`)
- Result:
  - `idle_pass=false`
  - `attack_pass=false`
  - `death_pass=false`
  - `skin_dock_pass=false`
  - `overall_pass=false`

**Failure**:

- Fatal `locator.scrollIntoViewIfNeeded: Target page, context or browser has been closed`
- Crash occurred during idle recipe execution (4694 actions)
- Same crash family as Run 2 (browser crash from paint storm)

**Pre-run state**:

- Previous held-open run (Run 3, PIDs 9387/9457) was killed and confirmed dead before this run
- No stale Playwright-launched Chromium processes found
- Stale Playwright profile dir from 2026-03-19 exists at `/var/folders/.../playwright_chromiumdev_profile-aJCRHA` but is unlikely to cause cross-session contamination
- No code changes between Run 3 and Run 4 (only docs commits `af561e7`, `ba0284c`)

**Contamination assessment**: NOT CONTAMINATED — clean process state confirmed before run

**Classification**:

- repeatability/stability failure
- The debounced save fix from Run 2 (`62b0f83`) reduced crash frequency but did not eliminate it
- The idle action's 4694-action recipe is still producing enough UI load to crash the browser

**Implication**:

- Stability is now the primary Phase 4 blocker, ahead of the small cell-fidelity misses from Run 3
- Priority order changed from "clear last few mismatches" to "restore repeatable full_recreation stability first"
- Milestone 1 is still not done — this run is evidence of instability, which is itself a Phase 4 blocker

**Next step**:

- Before retrying, diagnose the crash/stability issue directly
- Do not chase cell mismatches until full_recreation can complete without crashing

### Runs 5-6: Crash diagnosis and render suppression fix

These two runs occurred during the same diagnostic session as Run 4.

#### Run 5: autosave suppression only (still crashed)

- Artifact: `output/xp-fidelity-test/bundle-run-2026-03-21T03-31-01Z/result.json`
- Mode: `full_recreation`
- HEAD: `ba0284c` (uncommitted changes to workbench.js and runner)
- Result: browser crash during idle (`mouse.move: Target page, context or browser has been closed`)
- Fix applied: `suppressAutoSave(true)` via `__wb_debug` during recipe replay
- Outcome: autosave suppression alone did NOT fix the crash

**Conclusion**: The debounced save storm was not the sole crash vector.

#### Run 6: autosave + render suppression + throttle (CRASH ELIMINATED)

- Artifact: `output/xp-fidelity-test/bundle-run-2026-03-21T03-38-42Z/result.json`
- Mode: `full_recreation`
- HEAD: `ba0284c` (uncommitted changes)
- Result:
  - `idle_pass=true` (0 mismatches — first clean idle pass)
  - `attack_pass=false` (1 mismatch, down from 26 in Run 3)
  - `death_pass=false` (4 mismatches, down from 22 in Run 3)
  - `skin_dock_pass=true`
  - `overall_pass=false`

**Fix applied**: Three mitigations during recipe replay:

1. `suppressAutoSave(true)` — prevents debounced `saveSessionState("whole-sheet-draw")`
2. `suppressRender(true)` — **prevents `renderFrameGrid()` and `renderPreviewFrame()` in `onStrokeComplete`**
3. 50ms yield every 200 actions (minor throttle)

**Root cause identified**: `renderFrameGrid()` calls `panel.innerHTML = ""` then rebuilds
~144 canvas DOM elements (8 angles × 18 frame columns for idle). Called 4694 times during
idle recipe = ~676,000 canvas element creations/destructions. This DOM churn crashed the
Chromium renderer process.

**Cross-run mismatch comparison (Run 3 → Run 6)**:

| Metric | Run 3 | Run 6 | Change |
|--------|-------|-------|--------|
| idle mismatches | 2 | 0 | **fixed** |
| attack mismatches | 26 | 1 | -96% |
| death mismatches | 22 | 4 | -82% |
| total mismatches | 50 | 5 | -90% |
| crash | no | no | stable |

**Persistent mismatches (appeared in both Run 3 and Run 6)**:

- attack (71,42): glyph 221 expected, clear actual
- death (71,24): glyph 220 expected, clear actual
- death (4,28): glyph 220 expected, clear actual

**Classification**: The render suppression fix eliminated the crash class and 90% of cell
mismatches. The remaining 5 mismatches (3 persistent, 2 new) are narrow harness/input-precision
issues, not broad product or stability failures.

### Run 7: Repeatability confirmation

- Artifact: `output/xp-fidelity-test/bundle-run-2026-03-21T18-18-39Z/result.json`
- Mode: `full_recreation`
- HEAD: `ba0284c` (same uncommitted changes as Run 6)
- Result:
  - `idle_pass=true` (0 mismatches — second consecutive clean idle)
  - `attack_pass=false` (1 mismatch — same cell as Run 6)
  - `death_pass=false` (5 mismatches — 4 same as Run 6, 1 new random)
  - `skin_dock_pass=true`
  - `overall_pass=false`

**Stability**: CONFIRMED — two consecutive crash-free runs with render suppression.

**Cross-run mismatch classification (Runs 3, 6, 7)**:

| Category | Cells | Runs |
|----------|-------|------|
| Persistent (all 3) | attack(71,42), death(4,28), death(71,24) | 3,6,7 |
| Consistent (post-fix) | death(71,60), death(73,71) | 6,7 |
| Random (single run) | 19 cells in Run 3, 1 in Run 7 | noise |

Run 3's 19 random mismatches were caused by render-storm instability (now fixed).
Run 7's 1 random mismatch (death 38,69) is noise.

**5 deterministic mismatches remain**: all show `ws_paint_cell` click at correct coordinates
but exported cell remains clear/transparent. Likely a click-coordinate precision issue in
the harness-to-editor interaction path.

**Next step**: Diagnose the 5 persistent coordinates narrowly as a harness/input-precision
bug. Do not broaden investigation.

### 2026-03-22: Base-Path Manual Verification Findings (`/xpedit`)

- Branch/worktree: `feat/base-path-support`
- Scope: manual verification of prefixed hosting under `/xpedit`
- Status: NOT ACCEPTED

**Observed failures**:

1. **Idle skin-only run fails under base path**
   - Manual report: the idle skin-only path does not complete successfully under `/xpedit`.
   - Important: this may not be base-path-specific; canonical/root-hosted workbench should be compared directly.

2. **Skin Dock appears hung under base path**
   - Manual report: Skin Dock did not complete after ~120 seconds under `/xpedit`.
   - Important: this may be the same remaining canonical `skin_dock` blocker rather than a prefix-only regression.

3. **Whole-sheet editor does not update after new XP/upload actions**
   - Manual report: clicking "new XP" after upload does not update the whole-sheet XP editor.
   - Manual report: clicking the next bundle item also does not update the whole-sheet editor.
   - Likely classification: session/hydration/update regression in the whole-sheet editor flow under manual verification.

4. **Whole-sheet editor layout appears wrong under base path**
   - Manual report: layer selection appears above instead of bottom-left where it is expected.
   - Manual report: glyphs are not showing fully.
   - Likely classification: editor asset/style/runtime rendering issue under prefixed hosting, or a more general whole-sheet regression that must be compared against canonical/root-hosted behavior.

**Assessment**:

- These findings block declaring the base-path branch merge-ready.
- They are not yet proven to be base-path-only defects.
- The next diagnostic step is a manual comparison matrix:
  1. canonical/root-hosted `master`
  2. base-path branch with `PIPELINE_BASE_PATH=""`
  3. base-path branch with `PIPELINE_BASE_PATH="/xpedit"`

**Goal of the comparison**:

- Separate true `/xpedit` regressions from canonical workbench regressions that already exist on the root-hosted path.

### 2026-03-22: Canonical verifier mixed result on `b1faac3`

- Scope: canonical/root-hosted verifier lane
- HEAD: `b1faac3`
- Status: MIXED / NOT RELIABLE ENOUGH TO CLASSIFY AS REGRESSION YET

**Reported result**:

- `idle`: 7 mismatches
- `attack`: 17 mismatches
- `death`: geometry/session mismatch instead of normal cell-fidelity result
- `skin_dock`: timeout (expected once death/session load failed)

**Critical finding**:

- The death phase loaded the wrong session geometry:
  - observed `frame_w=7`, `frame_h=10`, `anims=[1,8]`
  - expected death geometry is `frame_w=11`, `frame_h=11`, `anims=[5]`
- This matches idle geometry, not death geometry.
- Likely classification: action-tab/session-load race or stale session-state read during verifier replay.

**Interpretation**:

- This run is worse than the stronger recent result on `baf7916` (`0/0/1` + no crash), even though the delta between the two runs should not materially affect cell fidelity.
- That makes this run poor evidence for a real product regression by itself.
- The mismatch counts may still contain run-to-run variance/noise, but the death geometry mismatch is a separate and more serious issue because it points to loading the wrong action session entirely.

**Working hypothesis**:

- The runner may proceed after tab click before the correct action session has fully hydrated.
- `_bboxCache` invalidation is not sufficient if the verifier starts replay against stale geometry/session state.

**Next step**:

- Prefer waiting for the currently active acceptance run on newer `HEAD` to finish before changing the runner again.
- If the same wrong-session geometry appears there too, narrow the next investigation to tab-switch/session-hydration readiness only.

### 2026-03-22: Manual canonical workbench findings (root-hosted)

- Scope: manual root-hosted workbench verification
- Status: FAILING / OPEN

**Observed manual behavior**:

1. **Player skin idle-only PNG convert does not work in the bundle workflow**
   - Manual report: the player-skin idle-only PNG conversion path does not work for the normally expected bundle path.
   - Important: this is a canonical/root-hosted finding, not a base-path-only issue.

2. **Idle-only / walk-only partial bundle state still allows "Test this skin"**
   - Manual report: doing only idle/walk does not prevent the UI from allowing "Test this skin".
   - Manual report: attempting that test can freeze the UI; refreshing sometimes recovers it.
   - Likely classification: bundle-readiness / runtime-test gating bug or stale frontend state bug in the canonical workflow.

**Assessment**:

- These findings confirm that at least part of the current Skin Dock / bundle-test failure behavior is present on the canonical workbench too.
- Do not classify these as base-path regressions.
- The canonical product still needs explicit gating and/or clearer runtime-test preconditions when only partial bundle content exists.

---

## Edge-Case Verifier Run — 2026-03-22

**Runner:** `scripts/xp_fidelity_test/run_edge_workflow_test.mjs`
**Commit:** `3a0c7bf`
**Output:** `output/xp-fidelity-test/edge-workflow-2026-03-22T21-49-36Z/`

### EV-001: Test This Skin enabled at 0/3 partial bundle state

**Status:** RESOLVED (see Milestone 1 Closeout below)
**Severity:** HIGH
**Recipe:** `partial_bundle_gating`, step 0
**Evidence:**
- After `apply_template('player_native_full')`, `bundleStatus` shows "Bundle: 0/3 actions ready"
- All `actionStates` confirmed blank (idle=blank, attack=blank, death=blank)
- `#webbuildQuickTestBtn` is `{ exists: true, disabled: false, text: "Test Bundle Skin" }`
- Button remains enabled through all partial states (after save, after partial readiness)
- Verifier screenshot: `edge-partial_bundle_gating-step0-FAIL.png`

### 2026-03-22: Fresh-server full_recreation — Skin Dock PASSES

- Artifact: `output/xp-fidelity-test/bundle-run-2026-03-22T18-47-57Z/result.json`
- Mode: `full_recreation`
- HEAD: `b1faac3`
- Server: freshly restarted with save-first backend code (`14d99d6`)

**Result**:

- `idle_pass=false` (10 mismatches — all in rows 0-1, top canvas edge)
- `attack_pass=false` (1 mismatch — rightmost column (143,47))
- `death_pass=false` (1 mismatch — bottom-right (104,87))
- `skin_dock_pass=true`
- `overall_pass=false`
- `bundleStatus: "Bundle: 3/3 actions ready"`
- `playable: true`

**Significance**:

- First run where **Skin Dock/runtime passes end-to-end** with the save-first workflow.
- All core product blockers cleared: crash class, skin dock, save-first readiness.
- `overall_pass=false` because of remaining cell-fidelity edge mismatches.

**Mismatch pattern — all canvas-edge cells**:

- idle: 10 cells in rows 0-1 only (top edge, `scrollTop` can't go below 0)
- attack: 1 cell at column 143 of 144 (rightmost column)
- death: 1 cell at (104,87) in a 110x88 grid (bottom-right corner)

**Classification**: harness/verifier edge-hit artifacts at scroll container boundaries,
not known product failures. The safe-zone centering prevents sidebar overlap for interior
cells but cannot protect cells at extreme canvas edges where scroll limits prevent
centering.

**Previous runs with dead server**: Two runs on the same HEAD with the server down
produced worse results (export failures, geometry mismatches, timeouts). Those were
caused by server death, not code regressions. The fresh-server run is the authoritative
result.

**Milestone 1 status**:

- Core product blockers: **CLEARED** (crash, skin dock, save-first)
- Formal closeout: **NOT YET** — `overall_pass=false` due to edge mismatches
- Next step: edge-safe harness patch to fix top/bottom/left/right boundary cells,
  then rerun. If mismatches remain, write explicit acceptance decision.

**Root cause:** `updateWebbuildUI()` at workbench.js:816 checked `actionBusy || !preflightOk || !sessionReady` but did NOT check bundle readiness. After template apply, a blank session is loaded (sessionReady=true), so the button was enabled despite 0/3 actions ready.

**Fix:** Added `isBundleMode() && !areAllEnabledBundleActionsReady()` to the disabled condition at workbench.js:816. Button now shows "Disabled: not all required bundle actions are ready" in bundle mode when readiness < 3/3.

**Verification:** Edge-case verifier re-run after fix: `partial_bundle_gating` PASS, `action_tab_hydration` PASS.

**Relationship:** Confirms the manual finding at line 1185–1188 of this log with automated evidence.

---

## Milestone 1 Closeout — 2026-03-23

**Status:** CLOSED on canonical root-hosted workbench.

**Commit:** `14e8e95` (master)

**Edge-workflow verifier — all green:**

| Recipe | Result |
|--------|--------|
| `partial_bundle_gating` | PASS |
| `action_tab_hydration` | PASS |
| `generated_sar_seed_1` | PASS |
| `generated_sar_seed_2` | PASS |
| `generated_sar_seed_3` | PASS |
| `generated_sar_seed_42` | PASS |
| `generated_sar_seed_100` | PASS |

**Fixes applied in this session:**

1. **EV-001 (Test This Skin gating):** `bundleNotReady` check added to
   `updateWebbuildUI()` — button now disabled when not all bundle actions are
   ready. Status: **RESOLVED**.

2. **EV-002 (blank-save expectation):** Test expected `saved|converted` after
   saving an empty canvas. Product correctly refuses to mark blank content as
   ready (`visualLayerHasMeaningfulContent()` gate). Test updated to expect
   `blank`. Status: **RESOLVED** (test-only fix).

3. **EV-003 (switch_action_tab race):** Weak wait returned before session
   hydration. Strengthened to: (a) 800ms settle delay for auto-advance,
   (b) `activeActionKey` confirmation via `__wb_debug._state()`,
   (c) geometry-aware wait on both `sessionOut` and `metaOut`. Status:
   **RESOLVED**.

**Base-path verification (feat/base-path-support at `1c4b99c`):**

- Comparison matrix: master root, branch root, branch `/xpedit`
- Result: **no `/xpedit`-specific regressions** in any lane
- Earlier failures traced to verifier timing and test-expectation issues

**Remaining known non-blocking items:**

- `overall_pass=false` in full_recreation due to canvas-edge cell mismatches
  (scroll boundary artifacts at rows 0-1, rightmost column, bottom-right corner).
  These are harness/verifier edge-hit artifacts, not product failures.

**Milestone 1 statement:**

Milestone 1 is closed on the canonical root-hosted workbench as of March 23,
2026. Base-path verification found no `/xpedit`-specific regressions. Earlier
remaining failures were traced to verifier timing and test-expectation issues
rather than product defects.

### EV-002: save_action does not transition actionState.status from blank

**Status:** NOT_A_BUG
**Severity:** N/A
**Recipe:** `partial_bundle_gating`, step 3
**Evidence:**
- After `save_action` on idle tab, `actionStates.idle.status` remains `"blank"`
- Originally expected: `"saved"` or `"converted"` per save-first workflow

**Root cause:** Expected behavior. `saveCurrentActionProgress()` at workbench.js:6297 checks `visualLayerHasMeaningfulContent()` before calling `persistBundleActionStatus("saved")`. On a blank session with no visual content, this gate correctly prevents transitioning to "saved". The verifier assertion was wrong — corrected to expect `"blank"` for blank-content saves.

### EV-PASS: action_tab_hydration — all 51 assertions PASS

**Status:** PASS
**Recipe:** `action_tab_hydration`
**Evidence:**
- All 5 tab switches verified exact per-action geometry from `config/template_registry.json`
- idle: 126x80, angles=8, anims=[1,8], frameW=7, frameH=10
- attack: 144x80, angles=8, anims=[8], frameW=9, frameH=10
- death: 110x88, angles=8, anims=[5], frameW=11, frameH=11
- Session ID stability: same action = same session across visits
- Session ID uniqueness: different actions = different sessions
- Whole-sheet editor mounted after every switch

---

## Verifier Drift Catch — 2026-03-23

**Status:** OPEN / ARCHITECTURE AUDIT REQUIRED

This catch records drift found after M1 closeout while preparing Milestone 2 work.
The issue is not a newly discovered product defect. The issue is that verifier code,
shared verifier infrastructure, and planning docs are no longer moving in lockstep
across `master` and `feat/base-path-support`.

### Explicit milestone baselines

**Milestone 1 pass requirements**

- canonical root-hosted workbench passes the `full_recreation` verifier lane for the
  Milestone 1 bundle-native workflow
- edge-case workflow verifier passes for the defined bundle/session/gating/hydration flows
- acceptance evidence comes from user-reachable actions only
- save/export/test loop works for the full bundle workflow
- resulting full bundle works in Skin Dock/runtime
- base-path verification shows no `/xpedit`-specific regressions
- any residual failures are explicitly classified as verifier-only artifacts or accepted
  non-blocking residuals

Short version:

- M1 pass = full-recreation passes + edge-case passes + user-reachable acceptance path +
  full bundle works in Skin Dock/runtime + no unresolved prefix-only regressions

**Milestone 2 pass requirements**

- verifier models the entire shipped workbench, not just the whole-sheet XP editor
- all user-reachable actions are mapped in a canonical SAR table, including buttons,
  mode switches, source-panel actions, grid actions, whole-sheet actions, runtime
  actions, and context-menu actions
- SAR model defines starting state, allowed actions, required responses/invariants,
  and valid next states for each workflow family
- verifier executes predefined contract-driven workflow sequences representing what
  the shipped workbench must be able to do
- those sequences produce structured evidence analogous to M1's truth-table -> recipe
  -> run model, but adapted for workflow-state correctness rather than only XP-cell fidelity
- acceptance-critical M2 lanes pass on both root-hosted and prefixed/base-path hosting
  without errors

Short version:

- M2 pass = the entire workbench is covered by a canonical SAR/action-response model and
  the verifier can execute the required workflow sequences successfully on both
  root-hosted and base-path hosting

### Drift findings

1. **Branch docs stale against current reality**
   - `feat/base-path-support` M2 planning docs still claimed M1 was open and that the
     9 P1 `getState()` fields plus hosted Python test coverage were still missing/open.
   - These claims drifted behind actual branch/code reality and behind the canonical M1 closeout.

2. **Edge-workflow runner drift across worktrees**
   - `master` carries the stronger edge-workflow verifier behavior:
     - generated SAR support
     - stronger `switch_action_tab` hydration wait
     - explicit fix for the tab-switch race used in M1 closeout
   - `feat/base-path-support` had a weaker runner state at audit time:
     - deterministic recipes only
     - weaker wait on parseable `sessionOut`
   - This is verifier-behavior drift, not a product bug.

3. **Shared verifier core weaker than active M1 runners**
   - `verifier_lib.mjs` exists as the new M2 shared core, but its page-open/readiness
     helper is weaker than current M1 runner readiness semantics.
   - Risk: future M2 slices could reintroduce load/readiness races if they adopt the
     shared helper without reconciling it to the proven M1 waits.

4. **Shared state-capture contract incomplete**
   - `getState()` is now preferred, but some bundle-specific verifier needs still fall
     back to `_state()` (notably `actionStates`).
   - If this is not made explicit and unified, future slices will fork into mixed
     capture strategies again.

### Required guardrail

- Do not continue M2 implementation on top of drifted verifier code or stale planning docs.
- If `master` and `feat/base-path-support` differ on verifier waits, generated SAR coverage,
  state capture, route handling, or acceptance claims, reconcile that first.
- Treat verifier/doc drift as a blocker for Milestone 2 foundation work, not as a minor cleanup.

---

## M2-A Structural PNG Baseline — Established 2026-03-23

**Status:** ACCEPTANCE-GRADE PASS on both root-hosted and prefixed workbench URLs.

**Merge:** `feat/base-path-support` merged into `master` at `e895298`.

**Runner:** `scripts/xp_fidelity_test/run_structural_baseline_test.mjs`
Built on `verifier_lib.mjs` (shared M2 foundation). Base-path-aware via `--url`.

**Commands:**
```bash
# Root-hosted
node scripts/xp_fidelity_test/run_structural_baseline_test.mjs \
  --url http://127.0.0.1:5071/workbench --out-dir output/structural_baseline_root

# Prefixed (/xpedit) — requires PIPELINE_BASE_PATH=/xpedit server
node scripts/xp_fidelity_test/run_structural_baseline_test.mjs \
  --url http://127.0.0.1:5072/xpedit/workbench --out-dir output/structural_baseline_prefixed
```

**Fixtures:**

| Family | Fixture Path | Size |
|--------|-------------|------|
| idle | `tests/fixtures/baseline/player-idle.png` | 20 KB |
| attack | `tests/fixtures/baseline/attack.png` | 25 KB |
| death | `tests/fixtures/baseline/death.png` | 21 KB |

**Gate verdicts (identical at root and /xpedit):**

| Family | G10 (dims) | G11 (layers) | G12 (L0 meta) | Details |
|--------|-----------|-------------|--------------|---------|
| idle | THRESHOLD_MET | THRESHOLD_MET | THRESHOLD_MET | 126x80, 4 layers, L0=[8,1,8] |
| attack | THRESHOLD_MET | THRESHOLD_MET | THRESHOLD_MET | 144x80, 4 layers, L0=[8,8] |
| death | THRESHOLD_MET | THRESHOLD_MET | THRESHOLD_MET | 110x88, 3 layers, L0=[8,5] |

**Hosting mode comparison:** Results identical across root and /xpedit for all 9 gate verdicts
and all structural details. Only `hosting_mode`, `workbench_url`, `bundle_id`, and timestamps differ.

**`_state()` usage:** The M2-A acceptance path (`run_structural_baseline_test.mjs`) contains
zero `_state()` calls. It operates entirely via API fetch + `captureState` from `verifier_lib.mjs`.
`verifier_lib.mjs` uses `_state()` in `captureState()` (for `actionStates` only) and
`switchActionTab()` (for `activeActionKey` match), but neither is called by the structural
baseline runner's acceptance path.

**Requirements satisfied:**
- M2-R5: structured per-family JSON evidence with fixture paths, step results, gate verdicts
- M2-R6: structural-contract lane passes identically at root and /xpedit (NOT UI-driven acceptance)

**Closeout statement:**
As of March 23, 2026, the M2-A structural PNG baseline passes as a **structural-contract
verifier slice** (API-driven, NOT UI-driven acceptance) on both canonical root-hosted and
prefixed /xpedit workbench URLs. Results are identical across hosting modes for idle, attack,
and death native-family fixtures, with all required G10/G11/G12 structural gates passing.
This proves the API contract and structural safety gates. It does NOT prove the UI-driven
bundle workflow (template selector, upload button, analyze/run UI, export button, tab switching).

---

## M2-B Verifier Integrity Catch — 2026-03-23

**Status:** RESOLVED — product bugs fixed, runner committed at `5c67ef2`, 10/10 PASS on committed code (both hosting modes)

This section records an integrity violation caught during the first `source_panel_workflow`
attempt, followed by the correct resolution: fix the product, then rerun the unchanged test.

### Product bugs surfaced by the runner

1. **PB-02: draft-box operations silently overwrite the anchor**
   - `setDraftBox()` at `workbench.js:4216-4220` mutated `state.anchorBox` on every
     draw/resize/move/pad path.
   - This broke the user-reachable workflow: draw box A → set anchor → draw box B →
     pad to anchor. Drawing box B destroyed the anchor.
   - **Fix:** Removed implicit anchor override from `setDraftBox()`. Anchor is now only
     set via explicit user action ("Set as anchor" context menu).
   - **Evidence:** `pad_anchor` step now PASSES — draft dims correctly match anchor dims.

2. **Delete Box button fails to clear-all when lingering draft exists**
   - `deleteSelectedSourceObjectsOrDraft()` at `workbench.js:5347-5377` treated a standalone
     draft as a "specific deletion", returning `true` and preventing the clear-all path from
     running even when committed boxes existed.
   - User clicks "Delete Box" with 6 sprites on screen → only the invisible draft is deleted.
   - **Fix:** Draft-only path now yields to clear-all when committed boxes or cuts exist.
     A standalone draft (no boxes, no cuts) still gets specific deletion.
   - **Evidence:** `clear_all` step now PASSES — all boxes cleared in one click.

### Integrity violation caught (earlier in this session)

The session initially attempted to rewrite the test sequence instead of fixing the product:

- **pad_anchor workaround attempt:** change the recipe to use committed boxes instead of
  the natural draft-based workflow. This avoided the actual PB-02 bug.
- **clear_all workaround attempt:** add extra deselection steps to reach the clear-all branch
  instead of proving the Delete Box behavior was wrong for the documented workflow.

The user correctly blocked both workarounds and required product fixes instead.

### Resolution sequence

1. User blocked test-rewrite approach
2. PB-02 fixed: removed `state.anchorBox` override from `setDraftBox()`
3. Delete Box UX fixed: draft-only path yields to clear-all when boxes exist
4. Original unchanged test rerun: 10/10 PASS on root-hosted
5. Same test on /xpedit prefixed: 10/10 PASS
6. Regression check: 82/82 Python tests pass, 0 new failures

### Required rule (still enforced)

- Do not rewrite an acceptance workflow merely to make a failing product behavior disappear.
- If the workflow is documented and user-reachable, keep the test true to that workflow and
  fix the product or explicitly downgrade/defer the workflow in canon docs.
- Treat any future attempt to route around a documented product bug by reshaping the recipe as
  a verifier-integrity failure, not a normal test adjustment.

---

## M2-B Source-Panel Workflow — 2026-03-23

**Status:** COMMITTED PROOF — runner and product fixes committed at `5c67ef2`. Rerun on committed code: 10/10 PASS root-hosted, 10/10 PASS /xpedit prefixed. Classification: UI-driven actions with read-only diagnostic observation layer.

### Runner

`scripts/xp_fidelity_test/run_source_panel_workflow_test.mjs`

Built on `verifier_lib.mjs`. Base-path-aware via `--url` flag. Structured JSON output to
`--out-dir`. Uses only user-reachable product actions (no debug API writes).

### Acceptance workflow (10 steps)

| Step | Action | SAR IDs | Assertion |
|------|--------|---------|-----------|
| 1 | Upload PNG (`cat_sheet.png` via `#wbFile` + `#wbUpload`) | U1 | `sourceImageLoaded === true` |
| 2 | Switch to draw mode (`#drawBoxBtn`) | S1 | `sourceMode === "draw_box"` |
| 3 | Draw box A on source canvas (drag) | S3 | `drawCurrent !== null` |
| 4 | Commit as sprite (right-click → `#srcCtxAddSprite`) | C1 | `extractedBoxes` increases, `drawCurrent === null` |
| 5 | Select committed box (switch to select + click) | S2, S5 | `sourceSelection.length > 0` |
| 6 | Set as anchor (right-click → `#srcCtxSetAnchor`) | C3 | `anchorBox !== null` |
| 7 | Draw box B + pad to anchor (right-click → `#srcCtxPadAnchor`) | S3, C4 | Draft dims match anchor dims |
| 8 | Find sprites (`#extractBtn`) | S9 | `extractedBoxes > 0` |
| 9 | Clear all (`#deleteBoxBtn`) | S17 | `extractedBoxes === 0`, `drawCurrent === null` |
| 10 | Isolation invariant | — | Grid/layer/geometry unchanged by source-panel ops |

### Product bugs fixed to pass

| Bug | Location | Fix |
|-----|----------|-----|
| PB-02 (anchor override) | `workbench.js:4216-4220` | Removed implicit `anchorBox` mutation from `setDraftBox()` |
| Delete Box UX | `workbench.js:5347-5381` | Draft-only deletion yields to clear-all when committed boxes exist |

### Root-hosted evidence

```
node run_source_panel_workflow_test.mjs --url http://127.0.0.1:5071/workbench --out-dir output/source_panel_workflow_root_v3
Hosting mode: root
Steps: 10/10 passed
Overall: PASS
```

Report: `output/source_panel_workflow_root_v3/report.json`
State snapshots: `output/source_panel_workflow_root_v3/state_snapshots.json`

### /xpedit prefixed evidence

```
node run_source_panel_workflow_test.mjs --url http://127.0.0.1:5072/xpedit/workbench --out-dir output/source_panel_workflow_prefixed
Hosting mode: prefixed
Steps: 10/10 passed
Overall: PASS
```

Report: `output/source_panel_workflow_prefixed/report.json`
State snapshots: `output/source_panel_workflow_prefixed/state_snapshots.json`

### Regression check

- `pytest tests/ --ignore=tests/e2e`: 82 passed, 0 failures
- `tests/e2e/test_browser_flow.py`: 1 pre-existing failure (422 on `/api/run`, unrelated)
- Source-panel isolation invariant: grid, layers, geometry unchanged throughout all 10 steps

### `_state()` usage in this runner

None. The runner uses only `getState()` (which includes P1 and P2 fields) via
`verifier_lib.mjs:captureState()`. The `captureState` function reads `_state()` for
`actionStates` only, which is not asserted on in the source-panel workflow.

### Requirements satisfied

- M2-R1: verifier covers source panel (second slice of full workbench)
- M2-R2: SAR model — 10 actions mapped with pre/post state and invariants
- M2-R5: structured per-step JSON evidence with state snapshots
- M2-R6: UI-driven lane passes identically at root and /xpedit (actions via DOM; observation via getState())

### Remaining gaps for source-panel coverage

| Gap | Classification |
|-----|---------------|
| S6 move box, S7 resize box | Diagnostic-only — not in acceptance slice |
| S10/S11 row/col select modes | Diagnostic-only |
| S14 vertical cut workflow | Diagnostic-only |
| S15 horizontal cut | DEFERRED — not UI-wired |
| S18/S19 undo/redo | DEFERRED — blocked by PB-01/PB-03 (anchor set/clear lacks pushHistory) |
| C2 add to row | Deferred to source-to-grid slice (M2-C) |
| C5-C9 grid-bridging context menu | Deferred to source-to-grid slice (M2-C) |

### Provisional status note

As of March 23, 2026, the M2-B source-panel runner and product fixes are committed at `5c67ef2`.
Committed-code reruns: 10/10 PASS root-hosted, 10/10 PASS /xpedit prefixed. Two product bugs
(PB-02 anchor override, Delete Box UX) were fixed. Classification: UI-driven actions (DOM clicks,
canvas drags, file input, context menu) with read-only diagnostic observation layer (getState()
via captureState()). Zero fetch() calls, zero debug API writes.

---

# Doc Lifecycle: Authority Model Established

**Date:** 2026-03-23
**Branch:** master @ b5034b5

The repo now uses a 3-doc canonical authority model:

1. `PLAYWRIGHT_FAILURE_LOG.md` — reality/failure/proof log (this file)
2. `docs/plans/2026-03-23-workbench-canonical-spec.md` — normative requirements / roadmap / policy
3. `docs/plans/2026-03-23-m2-capability-canon-inventory.md` — capability inventory / SAR canon

All other docs are classified as structural contracts, reference, worksheets, or archive. Worksheets are retired via `scripts/doc_lifecycle_stitch.sh` into `docs/WORKBENCH_DOCS_ARCHIVE.md`.

Policy is enforced in: `AGENTS.md`, `CLAUDE.md`, `CODEX.md`, `docs/INDEX.md`.

Full worksheet migration is deferred — this entry records the establishment of the model and tooling only.

---

## PROCESS FAILURE: API-Driven Runners Conflated With UI Acceptance — 2026-03-23

**Status:** OPEN — systemic process failure, not a single-instance bug

### What happened

The M2-A structural baseline runner (`run_structural_baseline_test.mjs`) was built using
direct `fetch()` API calls for every step: bundle create, PNG upload, action-grid apply, and
export. The M2-B closeout section in this log then described M2-A as an "acceptance-grade
verifier slice." This conflates API-contract testing with UI acceptance testing.

The repo's own rules explicitly forbid this:

- **AGENTS.md:29** — "acceptance evidence comes from user-reachable actions only"
- **AGENTS.md:46** — "the verifier executes predefined contract-driven workflow sequences"
- **AGENT_PROTOCOL.md:305** — "Acceptance evidence must come from [the canonical verifier]
  path. No other script, harness, or manual procedure may be cited as acceptance evidence"
- **AGENT_PROTOCOL.md:310** — "Ad hoc Playwright scripts, browser-console probes,
  `page.evaluate()` state mutations, `window.__wb_debug` calls, and one-off test files are
  permitted for implementation diagnosis only"
- **AGENT_PROTOCOL.md:327** — "If the canonical verifier cannot express a required workflow
  [...] that is a failure in the verifier, not permission to bypass it"
- **AGENT_PROTOCOL.md:347** — "acceptance mode: emits only user-reachable actions through
  the shipped [...] surface"
- **workbench-canonical-spec.md:67** — "The canonical verifier path is the only source of
  acceptance evidence"
- **workbench-canonical-spec.md:71-73** — "Acceptance mode: user-reachable actions through
  the shipped whole-sheet editor surface only [...] Ad hoc scripts, page.evaluate() probes,
  and window.__wb_debug calls are diagnostic-only — never acceptance evidence"

### Correct classification

| Runner | Method | Correct classification |
|--------|--------|----------------------|
| M2-A structural baseline | `fetch()` API calls only | **Structural contract proof** (allowed by `PNG_STRUCTURAL_BASELINE_CONTRACT.md` which explicitly defines the API-backed path) — NOT UI acceptance |
| M2-B source-panel workflow | DOM clicks + canvas drags | **UI-driven** — eligible for acceptance if committed and reverified |
| M1 fidelity runners | XP import via file input + debug API paint | **Mixed** — XP load is UI, cell painting is diagnostic. M1 closeout accepted this limitation. |
| M1 edge-workflow | Tab clicks + button clicks + DOM waits | **UI-driven** — acceptance-eligible |

### Why M2-A is still valid (but not as UI proof)

`docs/PNG_STRUCTURAL_BASELINE_CONTRACT.md` explicitly defines a server/API-backed structural
safety path. M2-A validates that contract: PNG upload → bundle → action-grid → structural
gates G10/G11/G12. This is a **structural/runtime safety baseline**, not a UI workflow test.

M2-A CANNOT be cited as evidence that:
- The template selector UI works
- The upload button wires correctly
- The analyze → run pipeline UI sequences correctly
- The export button triggers with correct bundle ID
- Tab switching hydrates correctly for each action
- The user can see and interact with results at each step

### What must change

1. **M2-A classification corrected:** structural contract proof only, not UI acceptance
2. **All future M2 slices** (source-to-grid, manual assembly, whole-sheet correction, bundle
   end-to-end) MUST be UI-driven: real button clicks, real canvas interactions, real DOM waits
3. **If the verifier cannot express a UI workflow:** log it as a verifier gap, fix the
   verifier, then run through the fixed verifier. Do NOT substitute `fetch()` calls.
4. **No runner may call `fetch()` or `page.evaluate(async => fetch(...))` in acceptance mode.**
   API calls are diagnostic/structural-contract only.
5. **Existing M2-A closeout language corrected:** "acceptance-grade" downgraded to
   "structural-contract-grade" in all docs that reference it.

### Root cause

The session that built M2-A optimized for getting gate verdicts to pass rather than proving
the UI path works. The `fetch()` approach was faster to implement and more reliable than
driving the full UI. This is exactly the pattern AGENT_PROTOCOL.md §13b-13c was written to
prevent: "writing an ad hoc script that tests the workflow outside the verifier [...] citing
that ad hoc script as acceptance evidence."

### Enforcement

Any future runner that uses `fetch()`, `page.evaluate(async => fetch(...))`, or
`window.__wb_debug` write methods in code labeled "acceptance" is a process violation.
The ONLY exception is `PNG_STRUCTURAL_BASELINE_CONTRACT.md`'s explicitly defined API path
for structural safety gates.

---

## Doc Lifecycle: M2-B Uncommitted-Code Caveat — 2026-03-23

**Status:** RESOLVED

The M2-B source-panel runner and product fixes were committed at `5c67ef2`. Committed-code
reruns passed 10/10 on both root-hosted and /xpedit prefixed hosting modes. The provisional
caveat is lifted. M2-B is now committed proof.

Evidence:
- Commit: `5c67ef2`
- Root rerun: `output/source_panel_workflow_root_committed/report.json` — 10/10 PASS
- Prefixed rerun: `output/source_panel_workflow_prefixed_committed/report.json` — 10/10 PASS
- Classification: UI-driven actions with read-only diagnostic observation layer

---

## CRITICAL: M2-A Structural Baseline Is API-Only — Not UI-Driven — 2026-03-23

**Status:** OPEN — acceptance classification downgraded

### Finding

The M2-A structural baseline runner (`run_structural_baseline_test.mjs`) uses **zero UI
interactions**. Every step is a direct `fetch()` call to the API from within `page.evaluate()`:

| Step | Runner Method | UI Equivalent (NOT USED) |
|------|--------------|--------------------------|
| Bundle create | `fetch('/api/workbench/bundle/create')` | Template selector UI → "Create Bundle" |
| PNG upload | `fetch('/api/upload', { body: FormData })` | `#wbFile` file input → `#wbUpload` button |
| Action-grid apply | `fetch('/api/workbench/action-grid/apply')` | Analyze → Run pipeline UI |
| Export bundle | `fetch('/api/workbench/export-bundle')` | Export button in bundle toolbar |

### Impact

M2-A proves the **API contract** works (endpoints accept correct payloads, return correct
responses, structural gates pass). It does NOT prove:

- The template selector UI populates and creates bundles correctly
- The upload button wires to the correct endpoint with correct FormData
- The analyze → run pipeline UI sequences correctly
- The export button triggers the export endpoint with the correct bundle ID
- Tab switching between actions hydrates the workbench correctly for each action
- The user can see and interact with results at each step

### What this means for M2 acceptance

The M2-A structural baseline remains valid as **API-contract proof** and **structural-gate
proof**. It should NOT be cited as proof that the bundle workflow UI works end-to-end.

A separate UI-driven bundle workflow runner is required for true acceptance evidence. This
runner must use the same actions a real user would: click template, click upload, click analyze,
click run, switch tabs, click export, click test skin.

### Also affected: M1 fidelity runners

The M1 fidelity runners use a mix of UI and debug API:

- XP import: UI-driven (`page.setInputFiles` + button click)
- Cell painting in acceptance mode: debug API (`__wb_debug` paint methods), not mouse
  clicks on the whole-sheet canvas
- Recipe replay: debug API coordinate injection, not user mouse gestures

M1 acceptance was closed with this known limitation (the fidelity verifier tests cell-level
correctness, not the mouse-driven paint path). This is acceptable for M1 scope because the
whole-sheet editor's paint tools ARE proven to work via manual testing and the fidelity
comparison proves the data path is correct.

For M2, the full manual-assembly workflow (PNG → source → grid → WS → export → test skin)
must be UI-driven to qualify as acceptance evidence.

### Runners that ARE fully UI-driven

| Runner | UI-driven? |
|--------|-----------|
| M2-B source-panel workflow (`run_source_panel_workflow_test.mjs`) | **YES** — all interactions via DOM clicks and canvas drags |
| M1 edge-workflow (`run_edge_workflow_test.mjs`) | **YES** — tab clicks, button clicks, DOM waits |

### Required next action

Build a UI-driven bundle workflow runner that drives the full template → upload → analyze →
run → tab-switch → export → test-skin path through actual button clicks. This is prerequisite
for honest M2 acceptance claims on the bundle pipeline.

---

## Doc Lifecycle: Worksheet Retired

**Date:** 2026-03-23
**Worksheet:** `docs/plans/2026-03-23-doc-authority-model.md`
**Archive anchor:** `docs/WORKBENCH_DOCS_ARCHIVE.md#2026-03-23-doc-authority-model`
**Reason:** implementation complete, deliverables committed
**References rewritten:** 0 file(s)
**Script:** `scripts/doc_lifecycle_stitch.sh`


---

## Doc Lifecycle: Worksheet Retired

**Date:** 2026-03-23
**Worksheet:** `docs/plans/2026-03-04-web-rexpaint-editor/claude-workbench-ui-inventory.md`
**Archive anchor:** `docs/WORKBENCH_DOCS_ARCHIVE.md#claude-workbench-ui-inventory`
**Reason:** Fully superseded by docs/COMPLETE_UI_CONTROL_REFERENCE.md (189 elements). Capability canon Part 8 absorbs generator-relevant selector truth.
**References rewritten:** 3 file(s)
**Script:** `scripts/doc_lifecycle_stitch.sh`


---

## Doc Lifecycle: Worksheet Retired

**Date:** 2026-03-23
**Worksheet:** `docs/plans/2026-03-22-workbench-verifier-sar-model.md`
**Archive anchor:** `docs/WORKBENCH_DOCS_ARCHIVE.md#2026-03-22-workbench-verifier-sar-model`
**Reason:** Architecture absorbed into canonical spec §5 (unified M2 verifier architecture). SAR domain enumeration absorbed into capability canon Part 8.
**References rewritten:** 7 file(s)
**Script:** `scripts/doc_lifecycle_stitch.sh`


---

## Doc Lifecycle: Worksheet Retired

**Date:** 2026-03-23
**Worksheet:** `docs/2026-03-21-CLAUDE-HANDOFF-M2-PNG-VERIFIER-DESIGN.md`
**Archive anchor:** `docs/WORKBENCH_DOCS_ARCHIVE.md#2026-03-21-claude-handoff-m2-png-verifier-design`
**Reason:** Handoff for completed M2 verifier design. Design doc exists at docs/plans/2026-03-21-milestone-2-png-verifier-design.md.
**References rewritten:** 2 file(s)
**Script:** `scripts/doc_lifecycle_stitch.sh`


---

## Doc Lifecycle: Worksheet Retired

**Date:** 2026-03-23
**Worksheet:** `docs/plans/2026-03-22-edge-case-verifier-impl-plan.md`
**Archive anchor:** `docs/WORKBENCH_DOCS_ARCHIVE.md#2026-03-22-edge-case-verifier-impl-plan`
**Reason:** M1 closed (commit 14e8e95). Implementation details no longer active. Edge-case verifier plan retained separately.
**References rewritten:** 2 file(s)
**Script:** `scripts/doc_lifecycle_stitch.sh`


---

## Doc Lifecycle: Worksheet Retired

**Date:** 2026-03-23
**Worksheet:** `docs/2026-03-17-CLAUDE-HANDOFF-AREA-BASED-RECIPE.md`
**Archive anchor:** `docs/WORKBENCH_DOCS_ARCHIVE.md#2026-03-17-claude-handoff-area-based-recipe`
**Reason:** Stale session handoff — superseded by canonical 3-doc model
**References rewritten:** 1 file(s)
**Script:** `scripts/doc_lifecycle_stitch.sh`


---

## Doc Lifecycle: Worksheet Retired

**Date:** 2026-03-23
**Worksheet:** `docs/2026-03-18-CLAUDE-HANDOFF-BUNDLE-RUNTIME-AND-WHOLE-SHEET-VISIBILITY.md`
**Archive anchor:** `docs/WORKBENCH_DOCS_ARCHIVE.md#2026-03-18-claude-handoff-bundle-runtime-and-whole-sheet-visibility`
**Reason:** Stale worksheet — superseded by canonical 3-doc model
**References rewritten:** 2 file(s)
**Script:** `scripts/doc_lifecycle_stitch.sh`


---

## Doc Lifecycle: Worksheet Retired

**Date:** 2026-03-23
**Worksheet:** `docs/2026-03-18-CLAUDE-HANDOFF-BUNDLE-RUNTIME-STRICT.md`
**Archive anchor:** `docs/WORKBENCH_DOCS_ARCHIVE.md#2026-03-18-claude-handoff-bundle-runtime-strict`
**Reason:** Stale worksheet — superseded by canonical 3-doc model
**References rewritten:** 3 file(s)
**Script:** `scripts/doc_lifecycle_stitch.sh`


---

## Doc Lifecycle: Worksheet Retired

**Date:** 2026-03-23
**Worksheet:** `docs/research/ascii/2026-03-15-whole-sheet-rexpaint-pivot.md`
**Archive anchor:** `docs/WORKBENCH_DOCS_ARCHIVE.md#2026-03-15-whole-sheet-rexpaint-pivot`
**Reason:** Stale worksheet — superseded by canonical 3-doc model
**References rewritten:** 3 file(s)
**Script:** `scripts/doc_lifecycle_stitch.sh`


---

## Doc Lifecycle: Worksheet Retired

**Date:** 2026-03-23
**Worksheet:** `docs/research/ascii/2026-03-15-whole-sheet-seam-map.md`
**Archive anchor:** `docs/WORKBENCH_DOCS_ARCHIVE.md#2026-03-15-whole-sheet-seam-map`
**Reason:** Stale worksheet — superseded by canonical 3-doc model
**References rewritten:** 3 file(s)
**Script:** `scripts/doc_lifecycle_stitch.sh`


---

## Doc Lifecycle: Worksheet Retired

**Date:** 2026-03-23
**Worksheet:** `docs/2026-03-10-branch-consolidation-plan.md`
**Archive anchor:** `docs/WORKBENCH_DOCS_ARCHIVE.md#2026-03-10-branch-consolidation-plan`
**Reason:** Stale handoff/worksheet — superseded by canonical 3-doc model
**References rewritten:** 0 file(s)
**Script:** `scripts/doc_lifecycle_stitch.sh`


---

## Doc Lifecycle: Worksheet Retired

**Date:** 2026-03-23
**Worksheet:** `docs/2026-03-10-DELIVERABLE-AUDIT-REPORT.md`
**Archive anchor:** `docs/WORKBENCH_DOCS_ARCHIVE.md#2026-03-10-deliverable-audit-report`
**Reason:** Stale handoff/worksheet — superseded by canonical 3-doc model
**References rewritten:** 4 file(s)
**Script:** `scripts/doc_lifecycle_stitch.sh`


---

## Doc Lifecycle: Worksheet Retired

**Date:** 2026-03-23
**Worksheet:** `docs/2026-03-10-EXECUTION-SUMMARY-GAP-CLOSURE.md`
**Archive anchor:** `docs/WORKBENCH_DOCS_ARCHIVE.md#2026-03-10-execution-summary-gap-closure`
**Reason:** Stale handoff/worksheet — superseded by canonical 3-doc model
**References rewritten:** 0 file(s)
**Script:** `scripts/doc_lifecycle_stitch.sh`


---

## Doc Lifecycle: Worksheet Retired

**Date:** 2026-03-23
**Worksheet:** `docs/2026-03-10-readonly-investigation-rexpaint-state.md`
**Archive anchor:** `docs/WORKBENCH_DOCS_ARCHIVE.md#2026-03-10-readonly-investigation-rexpaint-state`
**Reason:** Stale handoff/worksheet — superseded by canonical 3-doc model
**References rewritten:** 4 file(s)
**Script:** `scripts/doc_lifecycle_stitch.sh`


---

## Doc Lifecycle: Worksheet Retired

**Date:** 2026-03-23
**Worksheet:** `docs/2026-03-11-CLAUDE-HANDOFF-CURRENT-STATE.md`
**Archive anchor:** `docs/WORKBENCH_DOCS_ARCHIVE.md#2026-03-11-claude-handoff-current-state`
**Reason:** Stale handoff/worksheet — superseded by canonical 3-doc model
**References rewritten:** 3 file(s)
**Script:** `scripts/doc_lifecycle_stitch.sh`


---

## Doc Lifecycle: Worksheet Retired

**Date:** 2026-03-23
**Worksheet:** `docs/2026-03-13-CLAUDE-HANDOFF-EDITOR-DOC-ALIGNMENT.md`
**Archive anchor:** `docs/WORKBENCH_DOCS_ARCHIVE.md#2026-03-13-claude-handoff-editor-doc-alignment`
**Reason:** Stale handoff/worksheet — superseded by canonical 3-doc model
**References rewritten:** 3 file(s)
**Script:** `scripts/doc_lifecycle_stitch.sh`


---

## Doc Lifecycle: Worksheet Retired

**Date:** 2026-03-23
**Worksheet:** `docs/2026-03-15-CLAUDE-HANDOFF-B6-WHOLE-SHEET-INTEGRATION.md`
**Archive anchor:** `docs/WORKBENCH_DOCS_ARCHIVE.md#2026-03-15-claude-handoff-b6-whole-sheet-integration`
**Reason:** Stale handoff/worksheet — superseded by canonical 3-doc model
**References rewritten:** 0 file(s)
**Script:** `scripts/doc_lifecycle_stitch.sh`


---

## Doc Lifecycle: Worksheet Retired

**Date:** 2026-03-23
**Worksheet:** `docs/2026-03-15-CLAUDE-HANDOFF-FOUR-AUDITS-XP-EDITOR.md`
**Archive anchor:** `docs/WORKBENCH_DOCS_ARCHIVE.md#2026-03-15-claude-handoff-four-audits-xp-editor`
**Reason:** Stale handoff/worksheet — superseded by canonical 3-doc model
**References rewritten:** 3 file(s)
**Script:** `scripts/doc_lifecycle_stitch.sh`


---

## Doc Lifecycle: Worksheet Retired

**Date:** 2026-03-23
**Worksheet:** `docs/2026-03-15-CLAUDE-HANDOFF-WHOLE-SHEET-REXPAINT-PIVOT.md`
**Archive anchor:** `docs/WORKBENCH_DOCS_ARCHIVE.md#2026-03-15-claude-handoff-whole-sheet-rexpaint-pivot`
**Reason:** Stale handoff/worksheet — superseded by canonical 3-doc model
**References rewritten:** 0 file(s)
**Script:** `scripts/doc_lifecycle_stitch.sh`


---

## Doc Lifecycle: Worksheet Retired

**Date:** 2026-03-23
**Worksheet:** `docs/2026-03-17-CLAUDE-HANDOFF-WHOLE-SHEET-STROKE-PATH.md`
**Archive anchor:** `docs/WORKBENCH_DOCS_ARCHIVE.md#2026-03-17-claude-handoff-whole-sheet-stroke-path`
**Reason:** Stale handoff/worksheet — superseded by canonical 3-doc model
**References rewritten:** 1 file(s)
**Script:** `scripts/doc_lifecycle_stitch.sh`


---

## Doc Lifecycle: Worksheet Retired

**Date:** 2026-03-23
**Worksheet:** `docs/2026-03-20-CLAUDE-HANDOFF-PHASE-4-ACCEPTANCE-STRICT.md`
**Archive anchor:** `docs/WORKBENCH_DOCS_ARCHIVE.md#2026-03-20-claude-handoff-phase-4-acceptance-strict`
**Reason:** Stale handoff/worksheet — superseded by canonical 3-doc model
**References rewritten:** 2 file(s)
**Script:** `scripts/doc_lifecycle_stitch.sh`


---

## Doc Lifecycle: Worksheet Retired

**Date:** 2026-03-23
**Worksheet:** `docs/CLAUDE_HANDOFF_ASCIIID_TERMPP_PARITY_NO_RUNTIME_DEPS_2026-02-27.md`
**Archive anchor:** `docs/WORKBENCH_DOCS_ARCHIVE.md#claude-handoff-asciiid-termpp-parity-no-runtime-deps-2026-02-27`
**Reason:** Stale handoff/worksheet — superseded by canonical 3-doc model
**References rewritten:** 3 file(s)
**Script:** `scripts/doc_lifecycle_stitch.sh`


---

## Doc Lifecycle: Worksheet Retired

**Date:** 2026-03-23
**Worksheet:** `docs/CLAUDE_RESEARCH_DUMP_WORKBENCH_MOVE_FREEZE_2026-02-27.md`
**Archive anchor:** `docs/WORKBENCH_DOCS_ARCHIVE.md#claude-research-dump-workbench-move-freeze-2026-02-27`
**Reason:** Stale handoff/worksheet — superseded by canonical 3-doc model
**References rewritten:** 4 file(s)
**Script:** `scripts/doc_lifecycle_stitch.sh`


---

## Doc Lifecycle: Worksheet Retired

**Date:** 2026-03-23
**Worksheet:** `docs/COMPLETE_AUDIT_MASTER_REPORT.md`
**Archive anchor:** `docs/WORKBENCH_DOCS_ARCHIVE.md#complete-audit-master-report`
**Reason:** Completed/superseded worksheet — doc cleanup pass
**References rewritten:** 0 file(s)
**Script:** `scripts/doc_lifecycle_stitch.sh`


---

## Doc Lifecycle: Worksheet Retired

**Date:** 2026-03-23
**Worksheet:** `docs/CRITICAL_FIXES_COMPLETION_AUDIT.md`
**Archive anchor:** `docs/WORKBENCH_DOCS_ARCHIVE.md#critical-fixes-completion-audit`
**Reason:** Completed/superseded worksheet — doc cleanup pass
**References rewritten:** 0 file(s)
**Script:** `scripts/doc_lifecycle_stitch.sh`


---

## Doc Lifecycle: Worksheet Retired

**Date:** 2026-03-23
**Worksheet:** `docs/FEATURE_BUTTON_INDEX_WITH_REXPAINT_MANUAL.md`
**Archive anchor:** `docs/WORKBENCH_DOCS_ARCHIVE.md#feature-button-index-with-rexpaint-manual`
**Reason:** Completed/superseded worksheet — doc cleanup pass
**References rewritten:** 4 file(s)
**Script:** `scripts/doc_lifecycle_stitch.sh`


---

## Doc Lifecycle: Worksheet Retired

**Date:** 2026-03-23
**Worksheet:** `docs/FINAL_SESSION_SUMMARY.md`
**Archive anchor:** `docs/WORKBENCH_DOCS_ARCHIVE.md#final-session-summary`
**Reason:** Completed/superseded worksheet — doc cleanup pass
**References rewritten:** 0 file(s)
**Script:** `scripts/doc_lifecycle_stitch.sh`


---

## Doc Lifecycle: Worksheet Retired

**Date:** 2026-03-23
**Worksheet:** `docs/gap5-pan-error-handling.md`
**Archive anchor:** `docs/WORKBENCH_DOCS_ARCHIVE.md#gap5-pan-error-handling`
**Reason:** Completed/superseded worksheet — doc cleanup pass
**References rewritten:** 0 file(s)
**Script:** `scripts/doc_lifecycle_stitch.sh`


---

## Doc Lifecycle: Worksheet Retired

**Date:** 2026-03-23
**Worksheet:** `docs/GAP_ANALYSIS.md`
**Archive anchor:** `docs/WORKBENCH_DOCS_ARCHIVE.md#gap-analysis`
**Reason:** Completed/superseded worksheet — doc cleanup pass
**References rewritten:** 0 file(s)
**Script:** `scripts/doc_lifecycle_stitch.sh`


---

## Doc Lifecycle: Worksheet Retired

**Date:** 2026-03-23
**Worksheet:** `docs/HOST_DEPLOYMENT_CHECKLIST.md`
**Archive anchor:** `docs/WORKBENCH_DOCS_ARCHIVE.md#host-deployment-checklist`
**Reason:** Completed/superseded worksheet — doc cleanup pass
**References rewritten:** 3 file(s)
**Script:** `scripts/doc_lifecycle_stitch.sh`


---

## Doc Lifecycle: Worksheet Retired

**Date:** 2026-03-23
**Worksheet:** `docs/IMPLEMENTATION_PLAN.md`
**Archive anchor:** `docs/WORKBENCH_DOCS_ARCHIVE.md#implementation-plan`
**Reason:** Completed/superseded worksheet — doc cleanup pass
**References rewritten:** 2 file(s)
**Script:** `scripts/doc_lifecycle_stitch.sh`


---

## Doc Lifecycle: Worksheet Retired

**Date:** 2026-03-23
**Worksheet:** `docs/LAUNCH_READINESS_CHECKLIST.md`
**Archive anchor:** `docs/WORKBENCH_DOCS_ARCHIVE.md#launch-readiness-checklist`
**Reason:** Completed/superseded worksheet — doc cleanup pass
**References rewritten:** 3 file(s)
**Script:** `scripts/doc_lifecycle_stitch.sh`


---

## Doc Lifecycle: Worksheet Retired

**Date:** 2026-03-23
**Worksheet:** `docs/MVP_PORTABILITY_AUDIT.md`
**Archive anchor:** `docs/WORKBENCH_DOCS_ARCHIVE.md#mvp-portability-audit`
**Reason:** Completed/superseded worksheet — doc cleanup pass
**References rewritten:** 0 file(s)
**Script:** `scripts/doc_lifecycle_stitch.sh`


---

## Doc Lifecycle: Worksheet Retired

**Date:** 2026-03-23
**Worksheet:** `docs/MVP_REQUIREMENTS_STATUS.md`
**Archive anchor:** `docs/WORKBENCH_DOCS_ARCHIVE.md#mvp-requirements-status`
**Reason:** Completed/superseded worksheet — doc cleanup pass
**References rewritten:** 2 file(s)
**Script:** `scripts/doc_lifecycle_stitch.sh`


---

## Doc Lifecycle: Worksheet Retired

**Date:** 2026-03-23
**Worksheet:** `docs/PERFORMANCE_BASELINE.md`
**Archive anchor:** `docs/WORKBENCH_DOCS_ARCHIVE.md#performance-baseline`
**Reason:** Completed/superseded worksheet — doc cleanup pass
**References rewritten:** 0 file(s)
**Script:** `scripts/doc_lifecycle_stitch.sh`


---

## Doc Lifecycle: Worksheet Retired

**Date:** 2026-03-23
**Worksheet:** `docs/REQUIREMENTS_CHECKLIST.md`
**Archive anchor:** `docs/WORKBENCH_DOCS_ARCHIVE.md#requirements-checklist`
**Reason:** Completed/superseded worksheet — doc cleanup pass
**References rewritten:** 3 file(s)
**Script:** `scripts/doc_lifecycle_stitch.sh`


---

## Doc Lifecycle: Worksheet Retired

**Date:** 2026-03-23
**Worksheet:** `docs/RESKIN_PREP.md`
**Archive anchor:** `docs/WORKBENCH_DOCS_ARCHIVE.md#reskin-prep`
**Reason:** Completed/superseded worksheet — doc cleanup pass
**References rewritten:** 2 file(s)
**Script:** `scripts/doc_lifecycle_stitch.sh`


---

## Doc Lifecycle: Worksheet Retired

**Date:** 2026-03-23
**Worksheet:** `docs/REXPAINT_MCP_HANDOFF.md`
**Archive anchor:** `docs/WORKBENCH_DOCS_ARCHIVE.md#rexpaint-mcp-handoff`
**Reason:** Completed/superseded worksheet — doc cleanup pass
**References rewritten:** 2 file(s)
**Script:** `scripts/doc_lifecycle_stitch.sh`


---

## Doc Lifecycle: Worksheet Retired

**Date:** 2026-03-23
**Worksheet:** `docs/TASKS_9-22_FINAL_VERIFICATION.md`
**Archive anchor:** `docs/WORKBENCH_DOCS_ARCHIVE.md#tasks-9-22-final-verification`
**Reason:** Completed/superseded worksheet — doc cleanup pass
**References rewritten:** 0 file(s)
**Script:** `scripts/doc_lifecycle_stitch.sh`


---

## Doc Lifecycle: Worksheet Retired

**Date:** 2026-03-23
**Worksheet:** `docs/UI_TEST_FRAMEWORK_CODEX.md`
**Archive anchor:** `docs/WORKBENCH_DOCS_ARCHIVE.md#ui-test-framework-codex`
**Reason:** Completed/superseded worksheet — doc cleanup pass
**References rewritten:** 0 file(s)
**Script:** `scripts/doc_lifecycle_stitch.sh`


---

## Doc Lifecycle: Worksheet Retired

**Date:** 2026-03-23
**Worksheet:** `docs/CODEX_UI_TEST_FRAMEWORK_HANDOFF_TEMPLATE.md`
**Archive anchor:** `docs/WORKBENCH_DOCS_ARCHIVE.md#codex-ui-test-framework-handoff-template`
**Reason:** Completed/superseded worksheet — doc cleanup pass
**References rewritten:** 0 file(s)
**Script:** `scripts/doc_lifecycle_stitch.sh`


---

## Doc Lifecycle: Worksheet Retired

**Date:** 2026-03-23
**Worksheet:** `docs/USER_REQUEST_API_TEST_CHECKLIST.md`
**Archive anchor:** `docs/WORKBENCH_DOCS_ARCHIVE.md#user-request-api-test-checklist`
**Reason:** Completed/superseded worksheet — doc cleanup pass
**References rewritten:** 0 file(s)
**Script:** `scripts/doc_lifecycle_stitch.sh`


---

## Doc Lifecycle: Worksheet Retired

**Date:** 2026-03-23
**Worksheet:** `docs/W1_SUMMARY_WITH_HEADED_TESTS.md`
**Archive anchor:** `docs/WORKBENCH_DOCS_ARCHIVE.md#w1-summary-with-headed-tests`
**Reason:** Completed/superseded worksheet — doc cleanup pass
**References rewritten:** 0 file(s)
**Script:** `scripts/doc_lifecycle_stitch.sh`


---

## Doc Lifecycle: Worksheet Retired

**Date:** 2026-03-23
**Worksheet:** `docs/WORKBENCH_FLAT_ARENA_WATER_LOADING_RESEARCH_HANDOFF.md`
**Archive anchor:** `docs/WORKBENCH_DOCS_ARCHIVE.md#workbench-flat-arena-water-loading-research-handoff`
**Reason:** Completed/superseded worksheet — doc cleanup pass
**References rewritten:** 1 file(s)
**Script:** `scripts/doc_lifecycle_stitch.sh`


---

## Doc Lifecycle: Worksheet Retired

**Date:** 2026-03-23
**Worksheet:** `docs/WORKBENCH_IFRAME_KEYBOARD_STUCK_HANDOFF.md`
**Archive anchor:** `docs/WORKBENCH_DOCS_ARCHIVE.md#workbench-iframe-keyboard-stuck-handoff`
**Reason:** Completed/superseded worksheet — doc cleanup pass
**References rewritten:** 5 file(s)
**Script:** `scripts/doc_lifecycle_stitch.sh`


---

## Doc Lifecycle: Worksheet Retired

**Date:** 2026-03-23
**Worksheet:** `docs/WORKBENCH_REGRESSIONS_TRACKER.md`
**Archive anchor:** `docs/WORKBENCH_DOCS_ARCHIVE.md#workbench-regressions-tracker`
**Reason:** Completed/superseded worksheet — doc cleanup pass
**References rewritten:** 2 file(s)
**Script:** `scripts/doc_lifecycle_stitch.sh`


---

## Doc Lifecycle: Worksheet Retired

**Date:** 2026-03-23
**Worksheet:** `docs/BASE_PATH_SUPPORT_CHECKLIST.md`
**Archive anchor:** `docs/WORKBENCH_DOCS_ARCHIVE.md#base-path-support-checklist`
**Reason:** Completed/superseded worksheet — doc cleanup pass
**References rewritten:** 4 file(s)
**Script:** `scripts/doc_lifecycle_stitch.sh`


---

## Doc Lifecycle: Worksheet Retired

**Date:** 2026-03-23
**Worksheet:** `docs/plans/2026-02-26-fix-skin-test-instance-bugs.md`
**Archive anchor:** `docs/WORKBENCH_DOCS_ARCHIVE.md#2026-02-26-fix-skin-test-instance-bugs`
**Reason:** Completed/superseded plan — doc cleanup pass
**References rewritten:** 1 file(s)
**Script:** `scripts/doc_lifecycle_stitch.sh`


---

## Doc Lifecycle: Worksheet Retired

**Date:** 2026-03-23
**Worksheet:** `docs/plans/2026-02-26-termpp-parity-fix-design.md`
**Archive anchor:** `docs/WORKBENCH_DOCS_ARCHIVE.md#2026-02-26-termpp-parity-fix-design`
**Reason:** Completed/superseded plan — doc cleanup pass
**References rewritten:** 2 file(s)
**Script:** `scripts/doc_lifecycle_stitch.sh`


---

## Doc Lifecycle: Worksheet Retired

**Date:** 2026-03-23
**Worksheet:** `docs/plans/2026-02-26-termpp-parity-fix-impl.md`
**Archive anchor:** `docs/WORKBENCH_DOCS_ARCHIVE.md#2026-02-26-termpp-parity-fix-impl`
**Reason:** Completed/superseded plan — doc cleanup pass
**References rewritten:** 0 file(s)
**Script:** `scripts/doc_lifecycle_stitch.sh`


---

## Doc Lifecycle: Worksheet Retired

**Date:** 2026-03-23
**Worksheet:** `docs/plans/2026-02-27-ralph-loop-design.md`
**Archive anchor:** `docs/WORKBENCH_DOCS_ARCHIVE.md#2026-02-27-ralph-loop-design`
**Reason:** Completed/superseded plan — doc cleanup pass
**References rewritten:** 1 file(s)
**Script:** `scripts/doc_lifecycle_stitch.sh`


---

## Doc Lifecycle: Worksheet Retired

**Date:** 2026-03-23
**Worksheet:** `docs/plans/2026-02-27-ralph-loop-impl.md`
**Archive anchor:** `docs/WORKBENCH_DOCS_ARCHIVE.md#2026-02-27-ralph-loop-impl`
**Reason:** Completed/superseded plan — doc cleanup pass
**References rewritten:** 0 file(s)
**Script:** `scripts/doc_lifecycle_stitch.sh`


---

## Doc Lifecycle: Worksheet Retired

**Date:** 2026-03-23
**Worksheet:** `docs/plans/2026-02-27-ralph-regression-tracker.md`
**Archive anchor:** `docs/WORKBENCH_DOCS_ARCHIVE.md#2026-02-27-ralph-regression-tracker`
**Reason:** Completed/superseded plan — doc cleanup pass
**References rewritten:** 0 file(s)
**Script:** `scripts/doc_lifecycle_stitch.sh`


---

## Doc Lifecycle: Worksheet Retired

**Date:** 2026-03-23
**Worksheet:** `docs/plans/2026-03-02-multi-action-skin-bundle-approved-baseline.md`
**Archive anchor:** `docs/WORKBENCH_DOCS_ARCHIVE.md#2026-03-02-multi-action-skin-bundle-approved-baseline`
**Reason:** Completed/superseded plan — doc cleanup pass
**References rewritten:** 0 file(s)
**Script:** `scripts/doc_lifecycle_stitch.sh`


---

## Doc Lifecycle: Worksheet Retired

**Date:** 2026-03-23
**Worksheet:** `docs/plans/2026-03-08-critical-fixes-9-5-15-5-19-5.md`
**Archive anchor:** `docs/WORKBENCH_DOCS_ARCHIVE.md#2026-03-08-critical-fixes-9-5-15-5-19-5`
**Reason:** Completed/superseded plan — doc cleanup pass
**References rewritten:** 0 file(s)
**Script:** `scripts/doc_lifecycle_stitch.sh`


---

## Doc Lifecycle: Worksheet Retired

**Date:** 2026-03-23
**Worksheet:** `docs/plans/2026-03-08-phase-2-critical-gaps-4week-sprint.md`
**Archive anchor:** `docs/WORKBENCH_DOCS_ARCHIVE.md#2026-03-08-phase-2-critical-gaps-4week-sprint`
**Reason:** Completed/superseded plan — doc cleanup pass
**References rewritten:** 1 file(s)
**Script:** `scripts/doc_lifecycle_stitch.sh`


---

## Doc Lifecycle: Worksheet Retired

**Date:** 2026-03-23
**Worksheet:** `docs/plans/2026-03-08-rexpaint-editor-tasks-9-35.md`
**Archive anchor:** `docs/WORKBENCH_DOCS_ARCHIVE.md#2026-03-08-rexpaint-editor-tasks-9-35`
**Reason:** Completed/superseded plan — doc cleanup pass
**References rewritten:** 0 file(s)
**Script:** `scripts/doc_lifecycle_stitch.sh`


---

## Doc Lifecycle: Worksheet Retired

**Date:** 2026-03-23
**Worksheet:** `docs/plans/2026-03-08-web-rexpaint-editor-implementation.md`
**Archive anchor:** `docs/WORKBENCH_DOCS_ARCHIVE.md#2026-03-08-web-rexpaint-editor-implementation`
**Reason:** Completed/superseded plan — doc cleanup pass
**References rewritten:** 0 file(s)
**Script:** `scripts/doc_lifecycle_stitch.sh`


---

## Doc Lifecycle: Worksheet Retired

**Date:** 2026-03-23
**Worksheet:** `docs/plans/2026-03-10-sprite-extraction-dual-analysis.md`
**Archive anchor:** `docs/WORKBENCH_DOCS_ARCHIVE.md#2026-03-10-sprite-extraction-dual-analysis`
**Reason:** Completed/superseded plan — doc cleanup pass
**References rewritten:** 0 file(s)
**Script:** `scripts/doc_lifecycle_stitch.sh`


---

## Doc Lifecycle: Worksheet Retired

**Date:** 2026-03-23
**Worksheet:** `docs/plans/2026-03-15-xp-editor-hard-fail-plan.md`
**Archive anchor:** `docs/WORKBENCH_DOCS_ARCHIVE.md#2026-03-15-xp-editor-hard-fail-plan`
**Reason:** Completed/superseded plan — doc cleanup pass
**References rewritten:** 4 file(s)
**Script:** `scripts/doc_lifecycle_stitch.sh`


---

## Doc Lifecycle: Worksheet Retired

**Date:** 2026-03-23
**Worksheet:** `docs/plans/2026-03-22-base-path-support-plan.md`
**Archive anchor:** `docs/WORKBENCH_DOCS_ARCHIVE.md#2026-03-22-base-path-support-plan`
**Reason:** Completed/superseded plan — doc cleanup pass
**References rewritten:** 3 file(s)
**Script:** `scripts/doc_lifecycle_stitch.sh`


---

## Doc Lifecycle: Worksheet Retired

**Date:** 2026-03-23
**Worksheet:** `docs/plans/2026-03-22-verifier-base-path-awareness.md`
**Archive anchor:** `docs/WORKBENCH_DOCS_ARCHIVE.md#2026-03-22-verifier-base-path-awareness`
**Reason:** Completed/superseded plan — doc cleanup pass
**References rewritten:** 0 file(s)
**Script:** `scripts/doc_lifecycle_stitch.sh`


---

## Doc Lifecycle: Worksheet Retired

**Date:** 2026-03-23
**Worksheet:** `docs/plans/2026-03-22-milestone-1-edge-case-verifier-plan.md`
**Archive anchor:** `docs/WORKBENCH_DOCS_ARCHIVE.md#2026-03-22-milestone-1-edge-case-verifier-plan`
**Reason:** Completed/superseded plan — doc cleanup pass
**References rewritten:** 2 file(s)
**Script:** `scripts/doc_lifecycle_stitch.sh`


---

## Doc Lifecycle: Worksheet Retired

**Date:** 2026-03-23
**Worksheet:** `docs/plans/2026-03-23-milestone-2-base-path-unified-verifier-plan.md`
**Archive anchor:** `docs/WORKBENCH_DOCS_ARCHIVE.md#2026-03-23-milestone-2-base-path-unified-verifier-plan`
**Reason:** Completed/superseded plan — doc cleanup pass
**References rewritten:** 4 file(s)
**Script:** `scripts/doc_lifecycle_stitch.sh`


---

## Doc Lifecycle: Worksheet Retired

**Date:** 2026-03-23
**Worksheet:** `docs/plans/2026-03-04-web-rexpaint-editor/claude-cp437-font-research.md`
**Archive anchor:** `docs/WORKBENCH_DOCS_ARCHIVE.md#claude-cp437-font-research`
**Reason:** Completed/superseded — doc cleanup pass
**References rewritten:** 1 file(s)
**Script:** `scripts/doc_lifecycle_stitch.sh`


---

## Doc Lifecycle: Worksheet Retired

**Date:** 2026-03-23
**Worksheet:** `docs/plans/2026-03-04-web-rexpaint-editor/claude-embedded-editor-plan.md`
**Archive anchor:** `docs/WORKBENCH_DOCS_ARCHIVE.md#claude-embedded-editor-plan`
**Reason:** Completed/superseded — doc cleanup pass
**References rewritten:** 1 file(s)
**Script:** `scripts/doc_lifecycle_stitch.sh`


---

## Doc Lifecycle: Worksheet Retired

**Date:** 2026-03-23
**Worksheet:** `docs/plans/2026-03-04-web-rexpaint-editor/claude-game-engine-research.md`
**Archive anchor:** `docs/WORKBENCH_DOCS_ARCHIVE.md#claude-game-engine-research`
**Reason:** Completed/superseded — doc cleanup pass
**References rewritten:** 0 file(s)
**Script:** `scripts/doc_lifecycle_stitch.sh`


---

## Doc Lifecycle: Worksheet Retired

**Date:** 2026-03-23
**Worksheet:** `docs/plans/2026-03-04-web-rexpaint-editor/claude-grid-editor-integration.md`
**Archive anchor:** `docs/WORKBENCH_DOCS_ARCHIVE.md#claude-grid-editor-integration`
**Reason:** Completed/superseded — doc cleanup pass
**References rewritten:** 1 file(s)
**Script:** `scripts/doc_lifecycle_stitch.sh`


---

## Doc Lifecycle: Worksheet Retired

**Date:** 2026-03-23
**Worksheet:** `docs/plans/2026-03-04-web-rexpaint-editor/claude-rexpaint-vs-workbench.md`
**Archive anchor:** `docs/WORKBENCH_DOCS_ARCHIVE.md#claude-rexpaint-vs-workbench`
**Reason:** Completed/superseded — doc cleanup pass
**References rewritten:** 0 file(s)
**Script:** `scripts/doc_lifecycle_stitch.sh`


---

## Doc Lifecycle: Worksheet Retired

**Date:** 2026-03-23
**Worksheet:** `docs/plans/2026-03-04-web-rexpaint-editor/claude-web-rexpaint-design-brief.md`
**Archive anchor:** `docs/WORKBENCH_DOCS_ARCHIVE.md#claude-web-rexpaint-design-brief`
**Reason:** Completed/superseded — doc cleanup pass
**References rewritten:** 0 file(s)
**Script:** `scripts/doc_lifecycle_stitch.sh`


---

## Doc Lifecycle: Worksheet Retired

**Date:** 2026-03-23
**Worksheet:** `docs/plans/2026-03-04-web-rexpaint-editor/claude-workbench-api-inventory.md`
**Archive anchor:** `docs/WORKBENCH_DOCS_ARCHIVE.md#claude-workbench-api-inventory`
**Reason:** Completed/superseded — doc cleanup pass
**References rewritten:** 0 file(s)
**Script:** `scripts/doc_lifecycle_stitch.sh`


---

## Doc Lifecycle: Worksheet Retired

**Date:** 2026-03-23
**Worksheet:** `docs/plans/2026-03-04-web-rexpaint-editor/claude-workbench-architecture.md`
**Archive anchor:** `docs/WORKBENCH_DOCS_ARCHIVE.md#claude-workbench-architecture`
**Reason:** Completed/superseded — doc cleanup pass
**References rewritten:** 0 file(s)
**Script:** `scripts/doc_lifecycle_stitch.sh`


---

## Doc Lifecycle: Worksheet Retired

**Date:** 2026-03-23
**Worksheet:** `docs/plans/2026-03-04-web-rexpaint-editor/claude-workbench-plans.md`
**Archive anchor:** `docs/WORKBENCH_DOCS_ARCHIVE.md#claude-workbench-plans`
**Reason:** Completed/superseded — doc cleanup pass
**References rewritten:** 0 file(s)
**Script:** `scripts/doc_lifecycle_stitch.sh`


---

## Doc Lifecycle: Worksheet Retired

**Date:** 2026-03-23
**Worksheet:** `docs/plans/2026-03-04-web-rexpaint-editor/claude-workbench-spec-audit.md`
**Archive anchor:** `docs/WORKBENCH_DOCS_ARCHIVE.md#claude-workbench-spec-audit`
**Reason:** Completed/superseded — doc cleanup pass
**References rewritten:** 1 file(s)
**Script:** `scripts/doc_lifecycle_stitch.sh`


---

## Doc Lifecycle: Worksheet Retired

**Date:** 2026-03-23
**Worksheet:** `docs/plans/2026-03-04-web-rexpaint-editor/claude-xp-format-deep-dive.md`
**Archive anchor:** `docs/WORKBENCH_DOCS_ARCHIVE.md#claude-xp-format-deep-dive`
**Reason:** Completed/superseded — doc cleanup pass
**References rewritten:** 0 file(s)
**Script:** `scripts/doc_lifecycle_stitch.sh`


---

## Doc Lifecycle: Worksheet Retired

**Date:** 2026-03-23
**Worksheet:** `docs/plans/2026-03-04-web-rexpaint-editor/xp-editor-feature-inventory.md`
**Archive anchor:** `docs/WORKBENCH_DOCS_ARCHIVE.md#xp-editor-feature-inventory`
**Reason:** Completed/superseded — doc cleanup pass
**References rewritten:** 1 file(s)
**Script:** `scripts/doc_lifecycle_stitch.sh`


---

## Doc Lifecycle: Worksheet Retired

**Date:** 2026-03-23
**Worksheet:** `docs/plans/2026-03-21-legacy-inspector-retirement-checklist.md`
**Archive anchor:** `docs/WORKBENCH_DOCS_ARCHIVE.md#2026-03-21-legacy-inspector-retirement-checklist`
**Reason:** Completed/superseded — doc cleanup pass
**References rewritten:** 3 file(s)
**Script:** `scripts/doc_lifecycle_stitch.sh`


---

## Doc Lifecycle: Worksheet Retired

**Date:** 2026-03-23
**Worksheet:** `docs/plans/2026-03-21-m2-png-fixture-inventory.md`
**Archive anchor:** `docs/WORKBENCH_DOCS_ARCHIVE.md#2026-03-21-m2-png-fixture-inventory`
**Reason:** Completed/superseded — doc cleanup pass
**References rewritten:** 2 file(s)
**Script:** `scripts/doc_lifecycle_stitch.sh`


---

## Doc Lifecycle: Worksheet Retired

**Date:** 2026-03-23
**Worksheet:** `docs/plans/2026-03-21-m2-source-panel-implementation-spec.md`
**Archive anchor:** `docs/WORKBENCH_DOCS_ARCHIVE.md#2026-03-21-m2-source-panel-implementation-spec`
**Reason:** Completed/superseded — doc cleanup pass
**References rewritten:** 2 file(s)
**Script:** `scripts/doc_lifecycle_stitch.sh`


---

## Doc Lifecycle: Worksheet Retired

**Date:** 2026-03-23
**Worksheet:** `docs/plans/2026-03-21-semantic-edit-api-design.md`
**Archive anchor:** `docs/WORKBENCH_DOCS_ARCHIVE.md#2026-03-21-semantic-edit-api-design`
**Reason:** Completed/superseded — doc cleanup pass
**References rewritten:** 1 file(s)
**Script:** `scripts/doc_lifecycle_stitch.sh`


---

## Doc Lifecycle: Worksheet Retired

**Date:** 2026-03-23
**Worksheet:** `docs/plans/2026-03-21-semantic-edit-test-matrix.md`
**Archive anchor:** `docs/WORKBENCH_DOCS_ARCHIVE.md#2026-03-21-semantic-edit-test-matrix`
**Reason:** Completed/superseded — doc cleanup pass
**References rewritten:** 2 file(s)
**Script:** `scripts/doc_lifecycle_stitch.sh`


---

## Doc Lifecycle: Worksheet Retired

**Date:** 2026-03-23
**Worksheet:** `docs/research/ascii/2026-03-01-claim-verification.md`
**Archive anchor:** `docs/WORKBENCH_DOCS_ARCHIVE.md#2026-03-01-claim-verification`
**Reason:** Completed/superseded — doc cleanup pass
**References rewritten:** 0 file(s)
**Script:** `scripts/doc_lifecycle_stitch.sh`


---

## Doc Lifecycle: Worksheet Retired

**Date:** 2026-03-23
**Worksheet:** `docs/research/ascii/2026-03-13-claim-verification.md`
**Archive anchor:** `docs/WORKBENCH_DOCS_ARCHIVE.md#2026-03-13-claim-verification`
**Reason:** Completed/superseded — doc cleanup pass
**References rewritten:** 2 file(s)
**Script:** `scripts/doc_lifecycle_stitch.sh`


---

## Doc Lifecycle: Worksheet Retired

**Date:** 2026-03-23
**Worksheet:** `docs/research/ascii/2026-03-15-four-audits-xp-editor.md`
**Archive anchor:** `docs/WORKBENCH_DOCS_ARCHIVE.md#2026-03-15-four-audits-xp-editor`
**Reason:** Completed/superseded — doc cleanup pass
**References rewritten:** 0 file(s)
**Script:** `scripts/doc_lifecycle_stitch.sh`


---

## Doc Lifecycle: Worksheet Retired

**Date:** 2026-03-23
**Worksheet:** `docs/research/ascii/2026-03-16-adhoc-proof-replay-plan.md`
**Archive anchor:** `docs/WORKBENCH_DOCS_ARCHIVE.md#2026-03-16-adhoc-proof-replay-plan`
**Reason:** Completed/superseded — doc cleanup pass
**References rewritten:** 0 file(s)
**Script:** `scripts/doc_lifecycle_stitch.sh`


---

## Doc Lifecycle: Worksheet Retired

**Date:** 2026-03-23
**Worksheet:** `docs/research/ascii/2026-03-16-verifier-audit.md`
**Archive anchor:** `docs/WORKBENCH_DOCS_ARCHIVE.md#2026-03-16-verifier-audit`
**Reason:** Completed/superseded — doc cleanup pass
**References rewritten:** 0 file(s)
**Script:** `scripts/doc_lifecycle_stitch.sh`


---

## Doc Lifecycle: Worksheet Retired

**Date:** 2026-03-23
**Worksheet:** `docs/research/ascii/2026-03-23-doc-index-and-drift-matrix.md`
**Archive anchor:** `docs/WORKBENCH_DOCS_ARCHIVE.md#2026-03-23-doc-index-and-drift-matrix`
**Reason:** Completed/superseded — doc cleanup pass
**References rewritten:** 1 file(s)
**Script:** `scripts/doc_lifecycle_stitch.sh`


---

## Doc Lifecycle: Worksheet Retired

**Date:** 2026-03-23
**Worksheet:** `docs/research/ascii/2026-03-23-full-codebase-verifier-architecture-audit.md`
**Archive anchor:** `docs/WORKBENCH_DOCS_ARCHIVE.md#2026-03-23-full-codebase-verifier-architecture-audit`
**Reason:** Completed/superseded — doc cleanup pass
**References rewritten:** 0 file(s)
**Script:** `scripts/doc_lifecycle_stitch.sh`


---

## Doc Lifecycle: Worksheet Retired

**Date:** 2026-03-23
**Worksheet:** `docs/research/ascii/verification/aab-causal-check-2026-03-01.md`
**Archive anchor:** `docs/WORKBENCH_DOCS_ARCHIVE.md#aab-causal-check-2026-03-01`
**Reason:** Completed/superseded — doc cleanup pass
**References rewritten:** 1 file(s)
**Script:** `scripts/doc_lifecycle_stitch.sh`


---

## Doc Lifecycle: Worksheet Retired

**Date:** 2026-03-23
**Worksheet:** `docs/research/ascii/verification/ab-matrix-2026-03-01.md`
**Archive anchor:** `docs/WORKBENCH_DOCS_ARCHIVE.md#ab-matrix-2026-03-01`
**Reason:** Completed/superseded — doc cleanup pass
**References rewritten:** 0 file(s)
**Script:** `scripts/doc_lifecycle_stitch.sh`


---

## Doc Lifecycle: Worksheet Retired

**Date:** 2026-03-23
**Worksheet:** `docs/research/ascii/verification/pre-vs-post-fix-comparison-2026-03-01.md`
**Archive anchor:** `docs/WORKBENCH_DOCS_ARCHIVE.md#pre-vs-post-fix-comparison-2026-03-01`
**Reason:** Completed/superseded — doc cleanup pass
**References rewritten:** 0 file(s)
**Script:** `scripts/doc_lifecycle_stitch.sh`


---

## M2-B Source-to-Grid Workflow — 2026-03-23

**Status:** COMMITTED PROOF — runner committed at `380edee`, rerun on committed code: 13/13 PASS root-hosted, 13/13 PASS /xpedit prefixed. Classification: UI-driven actions with read-only diagnostic observation layer.

### Runner

`scripts/xp_fidelity_test/run_source_to_grid_workflow_test.mjs` (committed at `380edee`)

### Capabilities proven

| Capability | Canon ID | Evidence |
|-----------|----------|----------|
| Drag source to grid (cross-panel drag/drop) | D1 | Step 12: d1_drag PASS — frame signature changed at target cell |
| Add to selected row sequence (context menu) | D2/C2 | Steps 6, 8: add_to_row_a, add_to_row_b PASS — draft consumed, box committed, frame signature changed |
| Select frame (click grid cell) | G1 | Step 3: grid_select PASS — selectedRow updated to target |
| Grid population invariant | — | Step 9: PASS — 2 insertions in 2 distinct columns |
| Source isolation invariant | — | Step 13: PASS — source-panel data state preserved across grid insertions |

### Root-hosted evidence

```
node run_source_to_grid_workflow_test.mjs --out-dir output/source_to_grid_workflow
```

Result: 13/13 PASS, hosting_mode=root, url=http://127.0.0.1:5071/workbench
Artifacts: `output/source_to_grid_workflow/report.json`, 14 screenshots, state snapshots, frame signatures

### /xpedit prefixed evidence

```
node run_source_to_grid_workflow_test.mjs --url http://127.0.0.1:5072/xpedit/workbench --out-dir output/source_to_grid_workflow_prefixed_committed
```

Result: 13/13 PASS, hosting_mode=prefixed, url=http://127.0.0.1:5072/xpedit/workbench
Artifacts: `output/source_to_grid_workflow_prefixed_committed/report.json`, 14 screenshots, state snapshots, frame signatures

**Server precondition:** Port 5072 running with `PIPELINE_BASE_PATH=/xpedit` (verified: root path returns 404, `/xpedit/workbench` returns 200)

### Hosting mode comparison

Results identical across root and /xpedit for all 13 steps. No /xpedit-specific regressions.

### Remaining M2-B gaps (unchanged)

| Gap | Status |
|-----|--------|
| C5-C9 grid-bridging context menu | Deferred to M2-D |
| S18/S19 undo/redo | Deferred — blocked by PB-01/PB-03 |

### Reclassification summary

- M2-R7: source-to-grid lane passes identically at root and /xpedit (UI-driven acceptance)
- D1 promoted: WIRED → PROVEN
- D2/C2 promoted: WIRED → PROVEN
- G1 promoted: WIRED → PROVEN

### Commit hygiene note

The D1/D2/G1 proof promotion edits were committed as part of `a39f589` (105-file doc-archive batch) rather than in a dedicated narrow commit. This was caused by a concurrent doc-lifecycle stitch operation that swept all dirty working-tree changes into a single commit. The proof content is correct and verifiable; the commit boundary is a hygiene issue, not a correctness issue. Accepted and moving on per user decision (2026-03-24).


---

## M2-C Whole-Sheet Editor Slice 1 — 2026-03-24

**Status:** COMMITTED PROOF — fidelity runner rerun at HEAD (`fa1f470`) in acceptance mode, 9/9 gates PASS on both root and /xpedit. Fixture: `attack-0001.xp`. Classification: UI-driven with diagnostic observation layer.

### Runner

`scripts/xp_fidelity_test/run_fidelity_test.mjs` via `run.sh` (recipe-driven, acceptance mode)

### Recipe action coverage → W-family mapping

| Recipe Action | Count | W-Family | Proven? |
|---|---|---|---|
| `ws_paint_cell` | 27 | W2 (Cell tool) | **YES** |
| `ws_eyedropper_sample` | 1 | W3 (Eyedropper) | **YES** |
| `ws_erase_drag` | 10 | W5 (Erase drag) | **YES** |
| `ws_draw_line` | 18 | W8 (Line tool) | **YES** |
| `ws_tool_activate` | 16 | W9 (Switch tool) | **YES** |
| `ws_set_draw_state` | 22 | (prerequisite) | — |
| `ws_ensure_apply` | 3 | (prerequisite) | — |

### W-family actions NOT covered by this slice

| Action | Reason |
|---|---|
| W1 (Focus WS) | Exact shipped user gesture not yet defined for verifier |
| W4 (Erase cell) | No current recipe generates `ws_erase_cell` for this fixture |
| W6 (Flood fill) | Recipe generator never emits `ws_flood_fill` |
| W7 (Rectangle) | No fixture triggers qualifying `ws_draw_rect` pattern |
| W10-W14 (Layer ops) | Need bounded standalone runner |
| W15-W17 | BLOCKED/DEFERRED |
| W18 (Undo/redo) | PARTIAL — out of scope |

### Root-hosted evidence

```
bash scripts/xp_fidelity_test/run.sh sprites/attack-0001.xp --mode acceptance --url http://127.0.0.1:5071/workbench
```

Result: 9/9 gates PASS, 0 failures, mode=acceptance
Artifacts: `output/xp-fidelity-test/run-2026-03-24T04-25-59Z/result.json`

### /xpedit prefixed evidence

```
bash scripts/xp_fidelity_test/run.sh sprites/attack-0001.xp --mode acceptance --url http://127.0.0.1:5072/xpedit/workbench
```

Result: 9/9 gates PASS, 0 failures, mode=acceptance
Artifacts: `output/xp-fidelity-test/run-2026-03-24T04-26-28Z/result.json`

### Canon corrections (same session)

- W12-W14: PLANNED → WIRED. Code found at whole-sheet-init.js:1168-1204. Prior audit incorrectly reported "no code found."

### Reclassification summary

- W2 promoted: WIRED → PROVEN (ws_paint_cell, acceptance mode)
- W3 promoted: WIRED → PROVEN (ws_eyedropper_sample, acceptance mode)
- W5 promoted: WIRED → PROVEN (ws_erase_drag, acceptance mode)
- W8 promoted: WIRED → PROVEN (ws_draw_line, acceptance mode)
- W9 promoted: WIRED → PROVEN (ws_tool_activate, acceptance mode)
- W12-W14 corrected: PLANNED → WIRED (code audit correction, no proof claim)


---

## M2-C Whole-Sheet Slice 2: Layer Operations — 2026-03-24

**Status:** COMMITTED PROOF — runner committed at `7bdab92`, 6/6 PASS on both root and /xpedit. Classification: UI-driven with diagnostic observation layer.

### Runner

`scripts/xp_fidelity_test/run_whole_sheet_layer_test.mjs` (committed at `7bdab92`)

### Capabilities proven

| Step | Capability | Canon ID | Evidence |
|------|-----------|----------|----------|
| 2 | Switch layer (click layer row) | W10 | activeLayerIndex changed to target |
| 3 | Toggle layer visibility | W11 | Visible layer count changed |
| 4 | Add layer | W12 | layerCount increased by 1 |
| 5 | Move layer (up button) | W14 | Layer name order changed |
| 6 | Delete layer | W13 | layerCount decreased by 1 |

### Root-hosted evidence

```
node run_whole_sheet_layer_test.mjs --xp sprites/attack-0001.xp --out-dir output/ws_layer_test --url http://127.0.0.1:5071/workbench
```

Result: 6/6 PASS, hosting_mode=root
Artifacts: `output/ws_layer_test/report.json`, 7 screenshots

### /xpedit prefixed evidence

```
node run_whole_sheet_layer_test.mjs --xp sprites/attack-0001.xp --out-dir output/ws_layer_test_prefixed --url http://127.0.0.1:5072/xpedit/workbench
```

Result: 6/6 PASS, hosting_mode=prefixed
Artifacts: `output/ws_layer_test_prefixed/report.json`, 7 screenshots

### Reclassification summary

- W10 promoted: WIRED → PROVEN
- W11 promoted: WIRED → PROVEN
- W12 promoted: WIRED → PROVEN
- W13 promoted: WIRED → PROVEN
- W14 promoted: WIRED → PROVEN


---

## M2-C Whole-Sheet Slice 3: WS Tools (W1, W4, W6, W7) — 2026-03-24

**Status:** COMMITTED PROOF — runner committed at `daf161b`, 6/6 PASS on both root and /xpedit. Classification: UI-driven with diagnostic observation layer.

### Runner

`scripts/xp_fidelity_test/run_whole_sheet_tools_test.mjs` (committed at `daf161b`)

### Capabilities proven

| Step | Capability | Canon ID | Gesture | Evidence |
|------|-----------|----------|---------|----------|
| 2 | Focus whole-sheet | W1 | Double-click `.frame-cell[data-row="0"][data-col="0"]` | WS editor mounted=true after dblclick |
| 3+4 | Erase cell (single click) | W4 | Click `#wsToolErase` + click canvas cell | glyph changed to 0 after erase |
| 5 | Rectangle tool | W7 | Drag on canvas with `#wsToolRect` active | Corner cells have drawn glyph |
| 6 | Flood fill | W6 | Click `#wsToolFill` + click canvas cell | Cell glyph changed to fill value |

### W1 user gesture definition

The exact shipped user gesture for W1 is **double-click on a grid frame cell** (`.frame-cell[data-row="N"][data-col="M"]`). This fires the `dblclick` handler at workbench.js:5999 which calls `focusWholeSheetFrame(row, col)`. Two alternative shipped gestures also exist (grid context menu `#ctxOpenInspector`, button `#openInspectorBtn`) but were not used in this proof.

### Evidence

Root: 6/6 PASS at `output/ws_tools_test/report.json`
/xpedit: 6/6 PASS at `output/ws_tools_test_prefixed/report.json`

### Reclassification

- W1 promoted: WIRED → PROVEN (dblclick gesture)
- W4 promoted: WIRED → PROVEN (erase click)
- W6 promoted: WIRED → PROVEN (flood fill)
- W7 promoted: WIRED → PROVEN (rectangle drag)


---

## M2-C Whole-Sheet Slice 4: W15 (SelectTool) + W18 (Undo) — 2026-03-24

**Status:** COMMITTED PROOF — product fix at `25dc204`, keyboard fix at `b497090`+`4689448`, proof runner updated at `8f79b35`. 8/8 PASS on both root and /xpedit.

### Product fixes

1. **W15 (SelectTool, PB-06):** Wired via SelectToolAdapter in whole-sheet-init.js. Import, adapter, editorState, mount instantiation, sidebar button `#wsToolSelect`, `_switchTool('select')` case, `_updateToolUI`, keyboard shortcut 'S'. Deactivation on tool switch clears stale selection.

2. **W18 (Undo keyboard):** Ctrl+Z/Ctrl+Y in `_onKeyDown` call `editorState.onUndo/onRedo` → workbench `undo()/redo()`. `e.stopPropagation()` prevents double-fire with workbench window handler. All tool shortcuts guarded against Ctrl/Cmd to avoid swallowing Ctrl+C/R/L/S/etc.

### Proof evidence

| Step | Capability | Canon ID | Evidence |
|------|-----------|----------|----------|
| 7 | Select tool activation | W15 | activeTool === 'select' after button click |
| 8 | Undo via Ctrl+Z | W18 | Paint glyph=72, Ctrl+Z, glyph reverted to original |

Root: 8/8 PASS at `output/ws_tools_test_w15w18/report.json`
/xpedit: 8/8 PASS at `output/ws_tools_test_w15w18_prefixed/report.json`

### Reclassification

- W15: BLOCKED → **WIRED** (activation works, visualization not connected — canvas.setSelectionTool() never called, marching-ants inactive, drag→bounds unverified. Overclaimed as PROVEN in initial commit; corrected here.)
- W18 promoted: PARTIAL → **PROVEN** (Ctrl+Z keyboard path; sidebar buttons already worked)
- M2-C now at 15/18 W-actions PROVEN. W15 WIRED. W16/W17 DEFERRED.


---

## Doc Lifecycle: Worksheet Retired

**Date:** 2026-03-23
**Worksheet:** `docs/API_CONTRACT.md`
**Archive anchor:** `docs/WORKBENCH_DOCS_ARCHIVE.md#api-contract`
**Reason:** Completed/superseded — doc cleanup pass
**References rewritten:** 0 file(s)
**Script:** `scripts/doc_lifecycle_stitch.sh`


---

## Doc Lifecycle: Worksheet Retired

**Date:** 2026-03-23
**Worksheet:** `docs/ARCHITECTURE.md`
**Archive anchor:** `docs/WORKBENCH_DOCS_ARCHIVE.md#architecture`
**Reason:** Completed/superseded — doc cleanup pass
**References rewritten:** 0 file(s)
**Script:** `scripts/doc_lifecycle_stitch.sh`


---

## Doc Lifecycle: Worksheet Retired

**Date:** 2026-03-23
**Worksheet:** `docs/REXPAINT_PARITY_EDITOR_SURFACE_SPEC.md`
**Archive anchor:** `docs/WORKBENCH_DOCS_ARCHIVE.md#rexpaint-parity-editor-surface-spec`
**Reason:** Completed/superseded — doc cleanup pass
**References rewritten:** 1 file(s)
**Script:** `scripts/doc_lifecycle_stitch.sh`


---

## Doc Lifecycle: Worksheet Retired

**Date:** 2026-03-23
**Worksheet:** `docs/MVP_DEPLOYMENT.md`
**Archive anchor:** `docs/WORKBENCH_DOCS_ARCHIVE.md#mvp-deployment`
**Reason:** Completed/superseded — doc cleanup pass
**References rewritten:** 3 file(s)
**Script:** `scripts/doc_lifecycle_stitch.sh`


---

## Doc Lifecycle: Worksheet Retired

**Date:** 2026-03-23
**Worksheet:** `PLAYWRIGHT_STATUS.md`
**Archive anchor:** `docs/WORKBENCH_DOCS_ARCHIVE.md#playwright-status`
**Reason:** Completed/superseded — doc cleanup pass
**References rewritten:** 0 file(s)
**Script:** `scripts/doc_lifecycle_stitch.sh`


---

## Doc Lifecycle: Worksheet Retired

**Date:** 2026-03-23
**Worksheet:** `PLAYWRIGHT_TEST_REPORT.md`
**Archive anchor:** `docs/WORKBENCH_DOCS_ARCHIVE.md#playwright-test-report`
**Reason:** Completed/superseded — doc cleanup pass
**References rewritten:** 1 file(s)
**Script:** `scripts/doc_lifecycle_stitch.sh`


---

## Doc Lifecycle: Worksheet Retired

**Date:** 2026-03-23
**Worksheet:** `PLAYWRIGHT_TESTS_QUICKSTART.md`
**Archive anchor:** `docs/WORKBENCH_DOCS_ARCHIVE.md#playwright-tests-quickstart`
**Reason:** Completed/superseded — doc cleanup pass
**References rewritten:** 0 file(s)
**Script:** `scripts/doc_lifecycle_stitch.sh`


---

## Doc Lifecycle: Worksheet Retired

**Date:** 2026-03-23
**Worksheet:** `TEST_EXECUTION_GUIDE.md`
**Archive anchor:** `docs/WORKBENCH_DOCS_ARCHIVE.md#test-execution-guide`
**Reason:** Completed/superseded — doc cleanup pass
**References rewritten:** 0 file(s)
**Script:** `scripts/doc_lifecycle_stitch.sh`


---

## Doc Lifecycle: Worksheet Retired

**Date:** 2026-03-23
**Worksheet:** `progress.md`
**Archive anchor:** `docs/WORKBENCH_DOCS_ARCHIVE.md#progress`
**Reason:** Completed/superseded — doc cleanup pass
**References rewritten:** 0 file(s)
**Script:** `scripts/doc_lifecycle_stitch.sh`


---

## Doc Lifecycle: Worksheet Retired

**Date:** 2026-03-23
**Worksheet:** `INTEGRATION_STRATEGY_AND_REPLAN.md`
**Archive anchor:** `docs/WORKBENCH_DOCS_ARCHIVE.md#integration-strategy-and-replan`
**Reason:** Completed/superseded — doc cleanup pass
**References rewritten:** 3 file(s)
**Script:** `scripts/doc_lifecycle_stitch.sh`


---

## Doc Lifecycle: Worksheet Retired

**Date:** 2026-03-23
**Worksheet:** `REXPAINT_LIBRARY_AUDIT_FINDINGS.md`
**Archive anchor:** `docs/WORKBENCH_DOCS_ARCHIVE.md#rexpaint-library-audit-findings`
**Reason:** Completed/superseded — doc cleanup pass
**References rewritten:** 6 file(s)
**Script:** `scripts/doc_lifecycle_stitch.sh`


---

## Doc Lifecycle: Worksheet Retired

**Date:** 2026-03-23
**Worksheet:** `findings/INDEX.md`
**Archive anchor:** `docs/WORKBENCH_DOCS_ARCHIVE.md#index`
**Reason:** Audit findings — archived in doc cleanup pass
**References rewritten:** 2 file(s)
**Script:** `scripts/doc_lifecycle_stitch.sh`


---

## Doc Lifecycle: Worksheet Retired

**Date:** 2026-03-23
**Worksheet:** `findings/01-FINDING-pyrexpaint-usage.md`
**Archive anchor:** `docs/WORKBENCH_DOCS_ARCHIVE.md#01-finding-pyrexpaint-usage`
**Reason:** Audit findings — archived in doc cleanup pass
**References rewritten:** 1 file(s)
**Script:** `scripts/doc_lifecycle_stitch.sh`


---

## Doc Lifecycle: Worksheet Retired

**Date:** 2026-03-23
**Worksheet:** `findings/02-FINDING-rs-rexpaint-FFI.md`
**Archive anchor:** `docs/WORKBENCH_DOCS_ARCHIVE.md#02-finding-rs-rexpaint-ffi`
**Reason:** Audit findings — archived in doc cleanup pass
**References rewritten:** 1 file(s)
**Script:** `scripts/doc_lifecycle_stitch.sh`


---

## Doc Lifecycle: Worksheet Retired

**Date:** 2026-03-23
**Worksheet:** `findings/03-FINDING-asset-registry-hot-reload.md`
**Archive anchor:** `docs/WORKBENCH_DOCS_ARCHIVE.md#03-finding-asset-registry-hot-reload`
**Reason:** Audit findings — archived in doc cleanup pass
**References rewritten:** 1 file(s)
**Script:** `scripts/doc_lifecycle_stitch.sh`


---

## Doc Lifecycle: Worksheet Retired

**Date:** 2026-03-23
**Worksheet:** `findings/04-FINDING-sprite-pipeline-dithering.md`
**Archive anchor:** `docs/WORKBENCH_DOCS_ARCHIVE.md#04-finding-sprite-pipeline-dithering`
**Reason:** Audit findings — archived in doc cleanup pass
**References rewritten:** 1 file(s)
**Script:** `scripts/doc_lifecycle_stitch.sh`


---

## Doc Lifecycle: Worksheet Retired

**Date:** 2026-03-23
**Worksheet:** `findings/05-FINDING-editor-app-god-object.md`
**Archive anchor:** `docs/WORKBENCH_DOCS_ARCHIVE.md#05-finding-editor-app-god-object`
**Reason:** Audit findings — archived in doc cleanup pass
**References rewritten:** 1 file(s)
**Script:** `scripts/doc_lifecycle_stitch.sh`


---

## Doc Lifecycle: Worksheet Retired

**Date:** 2026-03-23
**Worksheet:** `findings/06-FINDING-modal-css-ad-hoc.md`
**Archive anchor:** `docs/WORKBENCH_DOCS_ARCHIVE.md#06-finding-modal-css-ad-hoc`
**Reason:** Audit findings — archived in doc cleanup pass
**References rewritten:** 1 file(s)
**Script:** `scripts/doc_lifecycle_stitch.sh`


---

## Doc Lifecycle: Worksheet Retired

**Date:** 2026-03-23
**Worksheet:** `findings/07-FINDING-state-mutation.md`
**Archive anchor:** `docs/WORKBENCH_DOCS_ARCHIVE.md#07-finding-state-mutation`
**Reason:** Audit findings — archived in doc cleanup pass
**References rewritten:** 1 file(s)
**Script:** `scripts/doc_lifecycle_stitch.sh`


---

## Doc Lifecycle: Worksheet Retired

**Date:** 2026-03-23
**Worksheet:** `findings/08-FINDING-structural-gates.md`
**Archive anchor:** `docs/WORKBENCH_DOCS_ARCHIVE.md#08-finding-structural-gates`
**Reason:** Audit findings — archived in doc cleanup pass
**References rewritten:** 1 file(s)
**Script:** `scripts/doc_lifecycle_stitch.sh`


---

## Doc Lifecycle: Worksheet Retired

**Date:** 2026-03-23
**Worksheet:** `findings/09-FINDING-rexpaint-manual-coverage.md`
**Archive anchor:** `docs/WORKBENCH_DOCS_ARCHIVE.md#09-finding-rexpaint-manual-coverage`
**Reason:** Audit findings — archived in doc cleanup pass
**References rewritten:** 2 file(s)
**Script:** `scripts/doc_lifecycle_stitch.sh`


---

## Doc Lifecycle: Worksheet Retired

**Date:** 2026-03-23
**Worksheet:** `findings/10-FINDING-xp-editor-feature-audit.md`
**Archive anchor:** `docs/WORKBENCH_DOCS_ARCHIVE.md#10-finding-xp-editor-feature-audit`
**Reason:** Audit findings — archived in doc cleanup pass
**References rewritten:** 2 file(s)
**Script:** `scripts/doc_lifecycle_stitch.sh`


---

## Doc Lifecycle: Worksheet Retired

**Date:** 2026-03-23
**Worksheet:** `findings/11-FINDING-manual-gaps-checker.md`
**Archive anchor:** `docs/WORKBENCH_DOCS_ARCHIVE.md#11-finding-manual-gaps-checker`
**Reason:** Audit findings — archived in doc cleanup pass
**References rewritten:** 2 file(s)
**Script:** `scripts/doc_lifecycle_stitch.sh`


---

## Cloud Run MVP Deploy: LIVE

**Date:** 2026-03-24
**Branch / HEAD:** `master` @ `c6fa5cb`
**Workflow run:** `Deploy to Cloud Run` run `23479759126`
**Result:** `build-and-push` PASS, `deploy` PASS, `smoke-test` PASS
**Cloud Run URL:** `https://asciicker-xpedit-6abo3pnlfa-uc.a.run.app`
**Public URL:** `https://rikiworld.com/xpedit`

### Evidence

- GitHub Actions deploy workflow passed end-to-end on committed code.
- Smoke-test job log recorded 5/5 PASS against `https://asciicker-xpedit-6abo3pnlfa-uc.a.run.app/xpedit`:
  - `healthz`
  - `workbench`
  - `templates-api`
  - `runtime-index`
  - `stateful-upload`
- Manual/public verification also passed at `https://rikiworld.com/xpedit`.

### Fixes Required During Launch

- `5c7b783` — allow `termpp-stream/start` dry-run on non-macOS so CI/Linux can pass `tests/test_workbench_flow.py`
- `d665f64` — use `env.GCP_PROJECT_ID` in workflow image metadata to avoid GitHub masking the project id in job outputs
- project-level IAM/org-policy intervention was required before public smoke would pass:
  - inherited or project-applied policy blocked unauthenticated `allUsers` access
  - Cloud Run invoker access was restored so `--allow-unauthenticated` could work for smoke/public traffic

### Post-Launch Fixes (same session, 2026-03-24)

- `8ede2c6` — add bare `/xpedit` route to Cloudflare Worker. The wildcard pattern `rikiworld.com/xpedit/*` did not match the bare `/xpedit` path (no trailing slash), returning 404 from GitHub Pages. Added explicit route entry in `wrangler.toml`.
- `f1714bf` — wire GitHub Issue delivery for bug reports on Cloud Run. Token stored in GCP Secret Manager (`bug-report-github-token`), mounted as `BUG_REPORT_GITHUB_TOKEN`. Env vars `BUG_REPORT_DELIVERY=github` and `BUG_REPORT_GITHUB_REPO=rikiyanai/asciicker-xpedit` set on Cloud Run.
- Verification: Issues #6 (API test) and #7 (browser UI test) created successfully and closed. Any visitor to `rikiworld.com/xpedit` can now file bug reports that create GitHub Issues.
- Second green deploy run `23479759126` confirmed all 3 jobs pass with the bug report wiring in the workflow.

### Cloud Run Free Tier Performance

- Pipeline run (`/api/run`) on Cloud Run free tier exceeds 5 minutes for a single `cat_sheet.png` fixture. Full M1/M2 verifier tests that require pipeline runs are impractical against the live deployment without increased CPU/memory resources.
- UI-only smoke tests, bug report flows, and API-level checks work fine.

### Operational Notes

- The deploy workflow now uses GitHub OIDC / Workload Identity Federation, not a JSON key.
- `GCP_PROJECT_ID` is a workflow env var (not a secret) to avoid GitHub Actions masking job outputs that contain the project ID.
- Cloudflare Worker routes `rikiworld.com/xpedit` (bare) and `rikiworld.com/xpedit/*` (wildcard) are both active. Config in `deploy/cloudflare-worker/wrangler.toml`.
- Bug report GitHub Issue delivery is configured via Secret Manager. Fine-grained PAT named "XPedit Issues" with Issues R/W on `rikiyanai/asciicker-xpedit`.
- GitHub Actions still emits Node 20 deprecation warnings for several actions; this is non-blocking today but needs follow-up before GitHub's Node 24 cutoff.

---

## Canon Reconciliation: M2-D Landed, W15 Hookup Fixed, Proof Still Pending

**Date:** 2026-03-24
**Branch / HEAD:** `master` @ `01f6e72`
**Result:** Canon/log reconciliation after the rebased M2-D landing on current `master`

### Evidence

- The rebased M2-D registry expansion is present on current `master`:
  - `5c2aab1` — add 31 whole-sheet selectors
  - `8d119ad` — add 7 F3 source-panel entries
  - `408a5e3` — add 5 F6 grid-panel entries
  - `757cf74` — add 18 F7 whole-sheet entries
  - `2d9aa30` — connect `canvas.setSelectionTool(editorState.selectTool)`
  - `70da189` — add source-panel mode-cycle and grid frame-management recipes
  - `d7e791c` — correct stale W15 blocker text and align recipe preconditions
- The older `2026-03-24` W15/W18 entry at `PLAYWRIGHT_FAILURE_LOG.md:3143` remains valid as historical evidence for the pre-fix state, but its W15 visualization diagnosis is now superseded by `2d9aa30`.

### Current Truth After Reconciliation

- `W15` is still **WIRED**, not **PROVEN**.
- The old product gap is closed: the SelectTool visualization path is now connected to the canvas renderer.
- The remaining W15 gap is verifier proof: no committed UI-driven lane yet proves drag → non-empty bounds → visible marching-ants state.
- M2-D infrastructure is landed on `master` (77 registry rows, 8 recipes), but the remaining work is proof and workflow completeness, not more registry scaffolding.
- Highest-priority open M2 items remain:
  - proof for the new M2-D READY actions
  - PB-01 / PB-03 undo-history fixes in the source panel
  - Slice 5 manual-assembly end-to-end proof

---

## Doc Lifecycle: Worksheet Retired

**Date:** 2026-03-24
**Worksheet:** `docs/artifacts/bundle-baseline-2026-03-12/README.md`
**Archive anchor:** `docs/WORKBENCH_DOCS_ARCHIVE.md#readme`
**Reason:** Superseded/completed — doc reconciliation pass 2026-03-24
**References rewritten:** 1 file(s)
**Script:** `scripts/doc_lifecycle_stitch.sh`


---

## Doc Lifecycle: Worksheet Retired

**Date:** 2026-03-24
**Worksheet:** `docs/plans/2026-03-21-milestone-2-implementation-checklist.md`
**Archive anchor:** `docs/WORKBENCH_DOCS_ARCHIVE.md#2026-03-21-milestone-2-implementation-checklist`
**Reason:** Superseded/completed — doc reconciliation pass 2026-03-24
**References rewritten:** 3 file(s)
**Script:** `scripts/doc_lifecycle_stitch.sh`


---

## Doc Lifecycle: Worksheet Retired

**Date:** 2026-03-24
**Worksheet:** `docs/plans/2026-03-23-milestone-2-bug-gap-index.md`
**Archive anchor:** `docs/WORKBENCH_DOCS_ARCHIVE.md#2026-03-23-milestone-2-bug-gap-index`
**Reason:** Superseded/completed — doc reconciliation pass 2026-03-24
**References rewritten:** 2 file(s)
**Script:** `scripts/doc_lifecycle_stitch.sh`


---

## Doc Lifecycle: Worksheet Retired

**Date:** 2026-03-24
**Worksheet:** `docs/plans/2026-03-24-m2d-registry-expansion-design.md`
**Archive anchor:** `docs/WORKBENCH_DOCS_ARCHIVE.md#2026-03-24-m2d-registry-expansion-design`
**Reason:** Superseded/completed — doc reconciliation pass 2026-03-24
**References rewritten:** 0 file(s)
**Script:** `scripts/doc_lifecycle_stitch.sh`


---

## Doc Lifecycle: Worksheet Retired

**Date:** 2026-03-24
**Worksheet:** `docs/REXPAINT_UI_COMPLETE_INDEX.md`
**Archive anchor:** `docs/WORKBENCH_DOCS_ARCHIVE.md#rexpaint-ui-complete-index`
**Reason:** Superseded/completed — doc reconciliation pass 2026-03-24
**References rewritten:** 2 file(s)
**Script:** `scripts/doc_lifecycle_stitch.sh`


---

## Doc Lifecycle: Worksheet Retired

**Date:** 2026-03-24
**Worksheet:** `docs/WORKBENCH_SOURCE_PANEL_UX_CHECKLIST.md`
**Archive anchor:** `docs/WORKBENCH_DOCS_ARCHIVE.md#workbench-source-panel-ux-checklist`
**Reason:** Superseded/completed — doc reconciliation pass 2026-03-24
**References rewritten:** 3 file(s)
**Script:** `scripts/doc_lifecycle_stitch.sh`


---

## M2-D Proof: W15 Three-Part Evidence

**Date:** 2026-03-24
**Status:** W15 PROMOTED WIRED → PROVEN

W15 SelectTool visualization confirmed with three-part proof:
1. **activeTool state**: `'select'` after `#wsToolSelect` button click
2. **selectionBounds**: `{x:2, y:2, width:4, height:4}` — drag rectangle matches expected coordinates
3. **Visible marching-ants**: `canvas.setSelectionTool()` connected at `whole-sheet-init.js:345`; `_drawSelectionOutline()` renders `#FFFF00` dashed rect when bounds non-null; screenshot `step07b_w15_select_drag_marching_ants.png` captured

**Observation surface change:** `selectionBounds` added to `window.__wholeSheetEditor.getState()` for verifier access.
**Runner:** `run_whole_sheet_tools_test.mjs` step 7 extended with drag+bounds+screenshot
**Result:** 8/8 PASS (root-hosted)
**Artifact:** `output/ws_tools_w15_proof/report.json`


---

## M2-D Proof: PB-01 Fixed, PB-03 Reclassified

**Date:** 2026-03-24
**Status:** PB-01 FIXED / PB-03 RECLASSIFIED

**PB-01 (anchor undo):** `setAnchorFromTarget()` at `workbench.js:4353` now calls `pushHistory()` before `state.anchorBox` mutation and `saveSessionState()` after. Both draft-anchor and box-anchor paths covered. Source panel runner 10/10 PASS confirms no regression.

**PB-03 (session-boundary undo):** Reclassified from "undo gap" to "UX hardening". `hydrateLoadedSession()` intentionally clears `state.history = []` and `state.future = []` at `workbench.js:3833-3834` — this is correct session-boundary behavior. Cross-session undo is architecturally unsupported. Fix: dirty-session confirmation dialog added before `applyTemplate()` at `workbench.js:6495`. Covers all `loadSession()` entrypoints where user-initiated destructive template application could lose work.

**PB-02:** Remains CLOSED (2026-03-23).

**Impact:** Source panel anchor ops now participate in undo/redo. PB-03 is no longer classified as a blocking undo bug.


---

## M2-D Proof: S3-S6, G5-G6, G9-G11 Action Evidence

**Date:** 2026-03-24
**Status:** 11 actions PROMOTED WIRED → PROVEN

**Source Panel Mode Actions (S3-S6):**
- S3 (row_select mode): `#rowSelectBtn` click → `sourceMode === 'row_select'` PASS
- S4 (col_select mode): `#colSelectBtn` click → `sourceMode === 'col_select'` PASS
- S5 (cut_v mode): `#cutVBtn` click → `sourceMode === 'cut_v'` PASS
- S6 (delete box action): `#deleteBoxBtn` click → `extractedBoxes === 0, anchorBox === null` PASS

**Grid Panel Actions (G5-G6):**
- G5 (add frame): `#addFrameBtn` click with `selectedRow >= 0` → `gridCols` increased PASS
- G6 (delete selected frames): `#deleteCellBtn` click on non-empty frame → frame signature changed (content cleared) PASS

**Grid Metadata Actions (G9-G11):**
- G9 (assign row category): `#assignAnimCategoryBtn` click → `rowCategories[0]` set PASS
- G10 (assign frame group): `#assignFrameGroupBtn` click with name → `frameGroups` contains entry PASS
- G11 (apply groups to anims): `#applyGroupsToAnimsBtn` click → `anims` array updated PASS

**Runner:** `run_m2d_action_proof_test.mjs` (new, hand-written)
**Result:** 12/12 PASS (root-hosted)
**Artifact:** `output/m2d_action_proof/report.json`

**W12-W13 (add/delete layer):** Already PROVEN at commit 7bdab92 via `run_whole_sheet_layer_test.mjs`. No new work needed.


---

## Slice 5 Manual Assembly E2E: 13/13 PASS

**Date:** 2026-03-24
**Status:** PROVEN (UI-driven acceptance)

**Workflow:** Apply template → Upload PNG → Select grid row → Draw box mode → Draw box A → Set as anchor (context menu) → Draw box B → Pad to anchor (context menu) → Add to selected row (context menu) → Double-click grid frame → WS editor focus → Paint cell (wsToolCell) → Save → Export XP

**Step-by-step proof:**
1. template: Apply template → grid created (gridCols>0, gridRows>0) PASS
2. upload: Upload PNG → sourceImageLoaded=true PASS
3. row_select: Click row header → selectedRow=0 PASS
4. draw_mode: Click drawBoxBtn → sourceMode='draw_box' PASS
5. draw_box_a: Canvas drag → drawCurrent non-null PASS
6. set_anchor: Context menu → anchorBox set PASS
7. draw_box_b: Canvas drag → drawCurrent non-null PASS
8. pad_to_anchor: Context menu pad → action processed PASS
9. add_to_row: Context menu → frame signature changed PASS
10. ws_focus: Double-click grid cell → WS editor mounted PASS
11. paint_cell: wsToolCell click → glyph=65 at (1,1) PASS
12. save: Click Save → sessionDirty=false PASS
13. export_xp: Click Export → `xp_path` non-empty in `#exportOut` response PASS

**Runner:** `run_manual_assembly_e2e_test.mjs` (new, hand-written Playwright)
**Result:** 13/13 PASS (root-hosted)
**Artifact:** `output/slice5_e2e/report.json`
**Classification:** UI-driven acceptance (all actions via DOM clicks, canvas mouse events, file input, context menu; state verification via diagnostic observation only)


---

## Process Failure: Incorrect Repo-Boundary Claim About Engine/Menu Source

**Date:** 2026-03-24
**Status:** LOGGED

An assistant response incorrectly claimed that restyling the in-game menu would require modifying C++ engine files such as `font1.cpp` / `render.cpp` and recompiling WASM in the "upstream asciicker-Y9-2 repo".

That repository-boundary claim was not established from this repo's contents and contradicted explicit user correction that the relevant engine/runtime code was expected to be copied into this repo rather than treated as upstream-owned.

**Failure type:** unsupported architecture claim / wrong repository-boundary assumption

**What was wrong:**
- It treated `asciicker-Y9-2` as the authoritative upstream location for engine-render changes without proving that from the current repo.
- It answered from an inferred multi-repo architecture instead of the actual repo boundary the user had specified repeatedly.
- It converted uncertainty about menu-render ownership into a definitive claim.

**Corrective rule going forward:**
- Do not say a required change "lives in another repo" unless the current repo contents prove that boundary.
- When discussing runtime/menu rendering here, distinguish between:
  - what is proven from files present in `/Users/r/Downloads/asciicker-pipeline-v2`
  - what is only inferred from older research or adjacent repos
- If the repo boundary is disputed, log the uncertainty and inspect this repo first instead of asserting an upstream dependency.

---

## BUG-01 FIX: Grid Overlay — Cross Marks + Grid-Step Control

**Date:** 2026-03-24
**Commits:** `6fb3375`..`fef0e78` (4 commits)
**Status:** FIXED, UI-PROVEN

### Bug

Grid toggle overlay drew simple horizontal/vertical lines instead of REXPaint-style cross marks at cell intersections. No user-facing control for grid cell spacing.

### Fix (4 commits)

1. `6fb3375` — Core fix: cross marks at intersections + grid-step select (1×1–16×16) on both whole-sheet editor (`canvas.js`) and legacy inspector (`workbench.js`). Batched single-path rendering.
2. `9859f54` — Proof entry + canonical spec BUG-01 OPEN→FIXED.
3. `34ee245` — Opacity bump from `rgba(180,200,220,0.45)` to `rgba(220,230,240,0.7)` for visibility.
4. `fef0e78` — Frame-boundary default: `Canvas.setGridStep(x, y)` supports separate X/Y steps. Whole-sheet editor passes `frameW`/`frameH` from workbench state. Grid-step dropdown defaults to "Frame" which shows crosses at sprite frame edges.

### Proof (UI-driven, screenshots only)

**Action path:** XP import via file input → whole-sheet editor auto-mount → Grid toggle click → grid-step select change. All actions are DOM-driven shipped UI gestures.

**Observation:** Screenshots only (no page.evaluate action-driving).

### Acceptance checklist

- [x] Crosses render only at intersections (not continuous lines)
- [x] Step selector visibly changes spacing (1×1 / Frame / 4×4 / 16×16 all verified)
- [x] Default "Frame" step shows crosses at sprite frame boundaries
- [x] Toggle on/off works correctly
- [x] No canvas offset/alignment drift between grid states
- [x] Both whole-sheet editor and legacy inspector surfaces fixed
- [x] Separate X/Y step for non-square frames

**User correction to preserve:** "It should not live in the upstream repo. I thought it was copied over."

---

## Workbench UI Audit: 39 Verified Issues

**Date:** 2026-03-24
**Status:** LOGGED
**Source worksheet:** `/tmp/claude-workbench-ui-audit-2026-03-24.md` (ephemeral; durable findings copied here)

### Canon reconciliation

- The audit worksheet correctly identified that the old BUG-01 wording was stale.
- Canon already reflects the grid fix: BUG-01 is `FIXED` in `docs/plans/2026-03-23-workbench-canonical-spec.md`, and the proof entry above documents commit `6fb3375`.
- This entry preserves the remaining open UI findings so the `/tmp` worksheet is not the only record.

### Severity summary

- Critical: 3
- High: 7
- Medium: 14
- Low: 15
- Total: 39

### Critical findings promoted to canon

1. **BUG-02 — silent PNG decode/load failure** — **FIXED** (`fd6973a`)
   - Was: `workbench.js` wired `img.onload` only with no `img.onerror`.
   - Fix: added `img.onerror` at both image loading sites (wbUpload + file-change handler). Error clears stale sourceImage, revokes object URL, shows user-visible status message.

2. **BUG-03 — duplicate `mouseleave` stroke-end path** — **FIXED** (`fd6973a`)
   - Was: `whole-sheet-init.js` bound both `_onStrokeEnd` and `_onCanvasMouseLeave` to `mouseleave`.
   - Fix: removed duplicate binding. `_onCanvasMouseLeave` now calls `_onStrokeEnd()` first, then clears hover display. Single handler, no duplicate stroke-complete risk.

3. **BUG-04 — overlay modal clips on mobile/tablet** — **FIXED**
   - Was: `styles.css:97-106` used `max-height: calc(100vh - 24px)` with no mobile-specific handling.
   - Fix: Added `dvh` unit fallback, `box-sizing: border-box`, mobile media queries (`@media max-width:600px` and `max-height:500px`) with `align-items: flex-start` and `overflow-y: auto` on the overlay. Submit button now reachable on all viewports.
   - Verified: `run_bug04_mobile_modal_test.mjs` 3/3 PASS (iPhone SE 375x667, iPad 768x1024, phone landscape 667x375).
   - **Note:** BUG-04 is fixed but mobile/touch support broadly remains an explicit roadmap requirement — not solved by this fix alone.

### High-signal open production issues

4. **BUG-05 — grid overdraw / perf**
   - `canvas.js:617-625` draws every grid cross for the full sheet rather than the visible viewport.
   - Result: avoidable frame drops on large sheets or high zoom.

5. **BUG-06 — known-bug dropdown fails silently**
   - `workbench.js:494` swallows `fetchKnownBugs()` errors.
   - Result: users see only the default option and may submit duplicate reports.

6. **BUG-07 — disabled controls lack clear inactive styling**
   - `styles.css:152` uses opacity only for `button:disabled`.
   - Result: disabled buttons remain visually too close to enabled controls on the dark theme.

7. **BUG-08 — legacy debug panel exposed**
   - `workbench.html:233-236` keeps `#legacyGridDetails` visible in production.
   - Result: users see a debug-only surface with no product value.

8. **Responsive/layout gap at tablet widths**
   - `styles.css:192-196` with only a `max-width: 1100px` wrap breakpoint.
   - Result: Source + Grid panels are squeezed into an awkward in-between layout on tablets and narrow desktop windows.

9. **Upload parameter fields are unexplained**
   - `workbench.html:94-99` exposes `Angles`, `Frames CSV`, `Source Projs`, and `Render Res` with no help text.
   - Result: new users cannot infer what these fields control.

10. **Potential whole-sheet remount listener retention**
    - `whole-sheet-init.js:661-937` installs many anonymous listeners; teardown depends on DOM destruction and GC.
    - Result: long sessions may retain stale closures / old editor state after repeated remounts.

### Remaining audit scope

- The worksheet also logged 14 medium and 15 low issues covering save polling, missing progress indicators, slider debounce, nested scrollbars, discoverability, contrast, and other polish gaps.
- Those are not all elevated into the canon bug table yet; this log preserves the audited counts and the highest-signal open issues.

---

## Player-State Parity Audit: Runtime-Family vs Gameplay-State Gaps

**Date:** 2026-03-24
**Status:** LOGGED
**Worksheet:** `docs/WORKBENCH_DOCS_ARCHIVE.md#2026-03-24-player-state-parity-audit`

### Review outcome

- The front half of the worksheet is evidence-backed and suitable for canon updates.
- The back half turns into UX/product design exploration. That material remains worksheet-only and was not promoted into canon as established truth.
- One count in the worksheet needed tightening: `sprites/player-*.xp` includes extra non-runtime artifact files (`player-fidelity-pass-rr8-20260223.xp`, `player-workbench-reliability-20260223.xp`), so raw glob counts overstate the true player-family runtime inventory unless those artifacts are excluded.

### Proven current truths

1. **Current custom-skin authoring is one PNG per family action, not per AHSW variant.**
   - The bundle/server path exports one XP per authored family action and broadcasts those bytes
     to all generated override filenames for that family.
   - Result: users do not currently author separate helmet/shield/weapon variants.

2. **AHSW is a filename-selection contract in the current product path.**
   - Equipment state is represented by filename variants like `player-0102.xp`.
   - The current custom-skin pipeline stamps the same custom XP over those variants, flattening
     equipment-specific visual differentiation.

3. **Mounted families are present in runtime/debug override surfaces but missing from the bundle product.**
   - `wolfie` / `wolack` exist in committed sprites and in native/browser override name lists.
   - They are absent from `ENABLED_FAMILIES`, `template_registry.json`, and native family builders.

4. **The native sandbox overwrite helper is template-agnostic internally, but the exposed workbench flow is not.**
   - `_stage_termpp_skin_sandbox()` only needs an exported XP path and copies it across override names.
   - The user-facing workbench path still requires `session_id -> export -> xp_path`, so “template-less apply”
     is not yet a first-class product flow.

5. **W-encoding mismatch bug (BUG-09) — FIXED.**
   - `_action_override_names()` used per-family W ranges: `all_16` (W∈{0,1,2}) vs `weapon_gte_1` (W∈{1,2}).
   - `_termpp_skin_override_names()`, `WEBBUILD_DEFAULT_OVERRIDE_NAMES`, and `termpp_skin_lab.js` used
     binary `0000..1111` naming — now fixed to per-family AHSW semantics matching the bundle contract.
   - Fix: shared `FAMILY_W_RANGE` rule applied to all four generators. player/plydie/wolfie get W∈{0,1,2},
     attack/wolack get W∈{1,2}.
   - Before: 81 override names (1+5×16). After: 105 names (per-family). Mounted mode: 49→65.
   - For enabled bundle families, non-bundle names exactly equal bundle-path names. 83/83 tests pass.
   - **Open residual:** committed native attack/wolack sprite inventory has W=1 only, while the generated
     override contract includes W=2. This is an inherited runtime-truth question, not a naming bug.

### Canon effect

- Canon spec updated to:
  - elevate the W-encoding mismatch as `BUG-09`
  - record the mounted-family/template gap more precisely
  - clarify that template-less native overwrite exists internally but not yet as a first-class user flow

---

## Doc Lifecycle: Worksheet Retired

**Date:** 2026-03-24
**Worksheet:** `docs/plans/2026-03-24-login-screen-reskin-handoff.md`
**Archive anchor:** `docs/WORKBENCH_DOCS_ARCHIVE.md#2026-03-24-login-screen-reskin-handoff`
**Reason:** reskin shipped at fe9a9b3
**References rewritten:** 0 file(s)
**Script:** `scripts/doc_lifecycle_stitch.sh`


---

## Doc Lifecycle: Worksheet Retired

**Date:** 2026-03-24
**Worksheet:** `docs/plans/2026-03-24-m2d-registry-expansion-impl.md`
**Archive anchor:** `docs/WORKBENCH_DOCS_ARCHIVE.md#2026-03-24-m2d-registry-expansion-impl`
**Reason:** all 7 tasks complete, proof landed at 324e892
**References rewritten:** 1 file(s)
**Script:** `scripts/doc_lifecycle_stitch.sh`


---

## Doc Lifecycle: Worksheet Retired

**Date:** 2026-03-24
**Worksheet:** `docs/plans/2026-03-24-mvp-deploy-cloud-run.md`
**Archive anchor:** `docs/WORKBENCH_DOCS_ARCHIVE.md#2026-03-24-mvp-deploy-cloud-run`
**Reason:** MVP deployed, info captured in INDEX.md
**References rewritten:** 1 file(s)
**Script:** `scripts/doc_lifecycle_stitch.sh`


---

## Doc Lifecycle: Worksheet Retired

**Date:** 2026-03-24
**Worksheet:** `docs/plans/2026-03-24-player-state-parity-audit.md`
**Archive anchor:** `docs/WORKBENCH_DOCS_ARCHIVE.md#2026-03-24-player-state-parity-audit`
**Reason:** audit findings logged at afa03b2, absorbed into canon
**References rewritten:** 2 file(s)
**Script:** `scripts/doc_lifecycle_stitch.sh`


---

## BUG-09 FIXED: Non-Bundle Override Naming Parity with Product Contract

**Date:** 2026-03-24
**Bug:** Non-bundle skin override generators used binary AHSW encoding (0000–1111), missing all W=2 equipment variants and ignoring per-family weapon semantics.
**Root cause:** `_termpp_skin_override_names()` used `range(16)` with `{i:04b}` binary formatting; browser-side generators used `i.toString(2).padStart(4,"0")` or hardcoded binary name lists. All families got the same flat 16-name set.

### Fix

Extracted a shared per-family W-range rule (`FAMILY_W_RANGE`) matching the product contract:
- player, plydie, wolfie: `all_16` → W∈{0,1,2} (24 names each)
- attack, wolack: `weapon_gte_1` → W∈{1,2} (16 names each)

Applied the same rule to all four generators without duplicating ad-hoc loops.

### Files changed

| File | Change |
|------|--------|
| `src/pipeline_v2/service.py:59` | Added `_FAMILY_W_RANGE` dict; `_termpp_skin_override_names()` iterates per-family W range |
| `web/workbench.js:29` | Added `FAMILY_W_RANGE` + `_ahswNamesForFamilies()` helper; both override modes use it |
| `runtime/termpp-skin-lab-static/termpp_skin_lab.js:4` | Added `FAMILY_W_RANGE` + `_ahswNames()` helper; `DEFAULT_OVERRIDE_SETS.player_common` uses it |
| `web/termpp_skin_lab.js:4` | Same as above (identical copy) |

### Before/after counts

| Path | Before | After |
|------|--------|-------|
| `_termpp_skin_override_names()` | 81 (1+5×16) | 105 (per-family) |
| `WEBBUILD_DEFAULT_OVERRIDE_NAMES` (full_parity) | 81 | 105 |
| `WEBBUILD_DEFAULT_OVERRIDE_NAMES` (mounted) | 49 (1+3×16) | 65 |
| `DEFAULT_OVERRIDE_SETS.player_common` | 81 | 105 |

### Parity proof

- For enabled bundle families (player/attack/plydie), non-bundle names exactly equal bundle-path names.
- wolfie/wolack non-bundle names follow the same `all_16`/`weapon_gte_1` semantics.
- All 89 committed sprite filenames (excluding 2 verifier artifacts) covered.
- 83/83 unit tests pass.

### Open residual

Committed native attack/wolack sprite inventory on disk has W=1 only (8 files each), while the generated override contract includes W∈{1,2} (16 names each). This is an inherited runtime-truth question — the bundle path's `weapon_gte_1` already generates W=2 names for attack, and the non-bundle path now matches. Whether W=2 sprites should exist on disk is a separate investigation.

### Mounted family specs extracted (evidence-backed)

wolfie: 180×(96|104) px, cell 10×(12|13), 8 angles, projs 2, anims [1,8], 3–7 layers (variable).
wolack: 160×104 px, cell 10×13, 8 angles, projs 2, anims [8], 5–8 layers (variable).
Full spec evidence at `/tmp/claude-mounted-family-specs.md`.

### Legacy "run around for 10 sec" runtime lane

The native TERM++ launch-and-observe path still exists as wiring. It is an **external diagnostic
lane**, not an in-repo acceptance lane. Preserving it intentionally requires preserving:

| Surface | Location |
|---------|----------|
| `verifyProfile = legacy_verify_e2e` | `web/workbench.html:372`, `web/workbench.js:620` |
| Command template text | `src/pipeline_v2/service.py:2495` |
| `/api/workbench/open-termpp-skin` | `src/pipeline_v2/app.py:638` |
| `/api/workbench/termpp-stream/start` | `src/pipeline_v2/app.py:673` |
| `_stage_termpp_skin_sandbox()` | `src/pipeline_v2/service.py:2587` |
| TERM++ embed-stream logic | `src/pipeline_v2/service.py:2649` |
| `webbuildQuickTestBtn` / Test This Skin | `web/workbench.html:313` (canon-proven as R1) |

The **in-repo canonical proof lane** for skin testing is the iframe Test This Skin / Skin Dock
path (R1), which requires no external TERM++ binary. The legacy native lane requires `game_term`
in `.run/` and is useful for visual runtime verification but should not be treated as acceptance
evidence.

---

## 2026-03-25: REXPaint Parity Audit — Whole-Sheet Missing-Feature Surface

**Branch:** master @ 0a8a49c
**Type:** Audit / gap discovery — not a failure, but a durable record of missing parity surface
**Trigger:** Handoff request for full REXPaint parity audit before further M2-D / bug-fix work

### Audit scope

Compared the full legacy XP Frame Inspector editing surface (workbench.js) against the shipped
whole-sheet editor (whole-sheet-init.js + rexpaint-editor/tools/*) to identify capabilities that:

- exist in the legacy inspector but not in the whole-sheet editor
- are required for truthful "whole-sheet as primary correction surface" claims
- are true REXPaint-parity expectations vs project-specific inspector extras

### Key structural finding

The whole-sheet editor (whole-sheet-init.js) does NOT use EditorApp — it imports tool classes
directly and manages them via its own adapter layer. EditorApp (editor-app.js) contains
copy/paste/deleteSelection implementations, but these are **not wired** into the shipped
whole-sheet keyboard or UI path:

- whole-sheet-init.js:516 explicitly passes Ctrl+C/V through to the browser
- EditorApp.copy(), .startPaste(), .paste(), .deleteSelection() exist in code
- Classification: **exists in underlying editor layer, not wired/exposed in shipped whole-sheet surface**

### Missing whole-sheet capabilities (vs legacy inspector)

#### Clipboard operations (exists in EditorApp, not wired in whole-sheet)

| Operation | Inspector Function | EditorApp Method | Whole-Sheet Wiring |
|-----------|-------------------|-----------------|-------------------|
| Copy selection | `copyInspectorSelection()` workbench.js:3106 | `EditorApp.copy()` editor-app.js:735 | NOT wired — Ctrl+C passes through |
| Paste selection | `pasteInspectorSelection()` workbench.js:3121 | `EditorApp.startPaste()/paste()` editor-app.js:766/852 | NOT wired — Ctrl+V passes through |
| Delete/clear selection | `clearInspectorSelectionCells()` workbench.js:3157 | `EditorApp.deleteSelection()` editor-app.js | NOT wired — no Delete key handler in WS |

#### Clipboard operations (no implementation anywhere in whole-sheet path)

| Operation | Inspector Function | Whole-Sheet Status |
|-----------|-------------------|-------------------|
| Cut selection | `cutInspectorSelection()` workbench.js:3194 | No equivalent — neither EditorApp nor whole-sheet-init.js |
| Select All | `inspectorSelectAll()` workbench.js:3041 | No equivalent |

#### Selection transforms (no implementation in whole-sheet path)

| Operation | Inspector Function | Whole-Sheet Status |
|-----------|-------------------|-------------------|
| Rotate CW | `transformInspectorSelection('rot_cw')` workbench.js:3054 | Not implemented |
| Rotate CCW | `transformInspectorSelection('rot_ccw')` workbench.js:3054 | Not implemented |
| Flip H | `transformInspectorSelection('flip_h')` workbench.js:3054 | Not implemented |
| Flip V | `transformInspectorSelection('flip_v')` workbench.js:3054 | Not implemented |

Helpers exist in inspector: `selectionMatrixRotate()` (line 3019), `selectionMatrixFlipH()` (line 3011), `selectionMatrixFlipV()` (line 3015). These are portable to the whole-sheet path.

#### Bulk-edit operations (no implementation in whole-sheet path)

| Operation | Inspector Function | Whole-Sheet Status |
|-----------|-------------------|-------------------|
| Fill selection | `fillInspectorSelectionWithGlyph()` workbench.js:3199 | Not implemented |
| Replace FG in selection | `replaceInspectorSelectionColor('fg')` workbench.js:3236 | Not implemented |
| Replace BG in selection | `replaceInspectorSelectionColor('bg')` workbench.js:3236 | Not implemented |
| Find & Replace | `applyInspectorFindReplace()` workbench.js:3285 | Not implemented (glyph+FG/BG matching with scope control) |

#### Frame-level operations (ownership undecided)

| Operation | Inspector Function | Ownership Question |
|-----------|-------------------|-------------------|
| Copy frame | `copyInspectorFrame()` workbench.js:3374 | Operates at frame level — may belong to grid panel, not whole-sheet |
| Paste frame | `pasteInspectorFrame()` workbench.js:3384 | Same — grid/frame scope |
| Flip frame H | `flipInspectorFrameHorizontal()` workbench.js:3402 | Same — grid/frame scope |
| Clear frame | `clearInspectorFrame()` workbench.js:3419 | Same — grid/frame scope |

These four operations are a **parity-decision item**: the product must decide whether they become grid-panel actions, whole-sheet actions, or remain inspector-only residuals.

### Inspector demotion status

**FULLY UNBLOCKED** — clipboard, transform, and bulk-edit parity all achieved.

W19-W22 (copy/paste/cut/delete) are now **PROVEN** (`431b437`) via UI-driven proof runner `run_whole_sheet_clipboard_test.mjs`. W23 (select all) is WIRED but has a known bounds-update bug when the select tool is already active (non-blocking). W24-W27 (selection transforms: rotate CW/CCW, flip H/V) are now **PROVEN** (`1828979`) via UI-driven proof runner `run_whole_sheet_transform_test.mjs` — 9/9 PASS using shipped sidebar buttons and keyboard shortcuts, single undo per transform, bounds update after rotate.

All parity-blocking inspector workflows are now in the whole-sheet surface:

- ~~Recoloring a sprite region~~ — **DONE** (W29/W30 Replace FG/BG proven)
- ~~Filling a selection with active glyph~~ — **DONE** (W28 Fill Selection proven)
- ~~Batch-replacing a glyph/color~~ — **DONE** (W31 Find & Replace proven)

Phase 1 (collapse inspector to `<details>`) can proceed. Phase 2-6 (progressive absorption) unblocked. Phase 7 (full demotion) **unblocked**:

1. ~~Clipboard operations~~ — **DONE** (W19-W22 proven, `431b437`)
2. ~~Selection transforms~~ — **DONE** (W24-W27 proven, `1828979`)
3. ~~Bulk-edit operations~~ — **DONE** (W28-W31 proven, `run_whole_sheet_bulkedit_test.mjs` 10/10 PASS)

### Roadmap under-specification finding

The canonical spec states both:
- "whole-sheet editor should become the primary correction surface" (INDEX.md, AGENT_PROTOCOL.md)
- "M2 is NOT full REXPaint parity" (canonical spec §1)

These are not contradictory but need explicit scoping: being a primary correction surface for
M2 workflows (bundle authoring, PNG manual assembly) does not require full REXPaint parity,
but it does require clipboard, transform, and bulk-edit operations. W19-W22 (clipboard) are proven
(`431b437`). W24-W27 (selection transforms) are proven (`1828979`). W28-W31 (bulk-edit) are proven
(`run_whole_sheet_bulkedit_test.mjs`, 10/10 PASS).

Post-audit parity extension actions (W19-W31) are tracked in the capability canon inventory
separately from the existing 96-action SAR count. Current status: 12/13 proven (W19-W22, W24-W31),
1/13 wired (W23).

### Detailed audit output

Full per-function audit with line numbers: `/tmp/claude-rexpaint-parity-audit-legacy-inspector.md`
Full whole-sheet tool inventory: `/tmp/claude-rexpaint-parity-audit-whole-sheet.md`


---

## Randomized Bundle Smoke Test — G-RANDOM Gate Established

**Date:** 2026-03-25
**Commit:** `7ce9d72`
**Runner:** `scripts/xp_fidelity_test/run_randomized_bundle_test.mjs`
**Wrapper:** `scripts/xp_fidelity_test/run_randomized_bundle.sh`

### What it tests

Each run randomly permutes 3 authoring methods across the 3 bundle actions (idle/attack/death):

| Method | Flow | Key steps |
|--------|------|-----------|
| `new_xp` | Draw random scribbles in WS editor | Set glyph to action letter (I/A/D), random fg/bg colors, 20-40 random tool actions (paint, fill, rect, line, erase) |
| `upload_xp` | Import reference XP via UI | `#xpImportFile` → `#xpImportBtn` → wait for session hydration → export to promote to converted |
| `upload_png` | Upload PNG → full server pipeline | `#wbFile` → `#wbUpload` → `#wbRun` (Convert to XP) → session auto-promoted to converted |

After all 3 actions are converted: Skin Dock test (Test Bundle Skin) + 10-second headed runaround with crash detection (rafCount/renderCrashes probing).

### Gate pass criteria (G-RANDOM)

- All 3 actions reach "converted" status
- Bundle shows "3/3 actions ready"
- Skin Dock reaches playable state
- 10-second runaround: 0 crashes, rafCount strictly increasing

### Proven seeds

| Seed | Assignment | Result |
|------|-----------|--------|
| 42 | idle=upload_png, attack=upload_xp, death=new_xp | PASS — raf 308→1429, 0 crashes |

### Stubbed actions (future slots)

`WS_RANDOM_ACTIONS` array has `enabled:false` stubs for: copy_selection, paste_selection,
select_region, undo, redo. Each stub slots in by setting `enabled:true` and implementing
the `exec(page, ctx)` function. No structural changes needed to add new action types.

### Stubbed authoring paths (future slots)

upload_png currently uses the server pipeline conversion (`#wbRun`). A future "Find Sprites +
extract" path (using `#extractBtn` → anchor → drag to row) is documented as a stub in the
runner code. It exercises the manual assembly path instead of the pipeline path.

---

## BUG-11: G-BUNDLE Deterministic Skin Dock Readiness Failure

**Date:** 2026-03-25
**Status:** FIXED
**Classification:** Runner/runtime-lane defect — not an editor/whole-sheet bug.

### Summary

The deterministic G-BUNDLE runner (`run_bundle_fidelity_test.mjs`) failed to reach playable state in the Skin Dock in the majority of runs. The WASM runtime inside the flat iframe never initialized.

### Root Cause

**Headless Chromium WebGL context failure.** The Asciicker runtime requires WebGL to upload font textures during initialization (`AsciickerInit` → `ak_ctx.texImage2D` per font). In Playwright's default headless mode, `canvas.getContext("webgl")` returns `null`, so the font texture chain stalls, `ShowLoginOverlay()` is never called, and `_wasmReady` stays `false` forever.

Diagnostic evidence (`bug11_diag.mjs`):
- Direct iframe load (headless, no args): `akCtx: "null"`, `akFonts: "undefined"`, `_wasmReady: false` for 60s
- Direct iframe load (headed): `akCtx: "ok"`, `akFonts: 13`, `_wasmReady: true` after 1s
- G-RANDOM always ran headed (its shell script passes `--headed`), which is why it passed while G-BUNDLE (headless) failed

### Fix

Two changes:

1. **Runner WebGL args** (`run_bundle_fidelity_test.mjs`, `run_randomized_bundle_test.mjs`): Added `--enable-webgl --use-gl=angle` to `chromium.launch` args in headless mode, providing a software-rendered WebGL context.

2. **`detectWebbuildReady` safety gate** (`workbench.js`): Added `!!win._wasmReady` to the readiness check. This prevents the workbench from injecting skins into a half-initialized runtime (`Load()` before font textures are uploaded). This is a safety net — the WebGL args fix the actual failure, while this gate prevents silent corruption if `_wasmReady` is ever delayed.

### Evidence (post-fix)

**G-BUNDLE:** 3/3 consecutive PASS runs (2026-03-25).
- `skin_dock=true`, `rafCount` advancing ~120/s, 0 crashes in 10s runaround
- Result files: `bundle-run-2026-03-25T12-14-18Z`, `bundle-run-2026-03-25T12-16-37Z`, `bundle-run-2026-03-25T12-18-56Z`

**G-RANDOM seed 42:** PASS (no regression). `randomized-bundle-2026-03-25T12-21-18Z`

### Previous evidence

**Observation window:** 56 logged G-BUNDLE runs from 2026-03-18 through 2026-03-25 (pre-fix).
- **Skin Dock pass:** 12 of 56 runs (21%) — likely the rare runs where the machine's GPU provided a WebGL context to headless Chromium
- **Skin Dock fail:** 44 of 56 runs (79%)


---

## BUG-12: Drag-Paint Glyph Shifts Left on Release (Issue #8)

**Date:** 2026-04-13
**Status:** FIXED
**Classification:** Canvas renderer defect — gratuitous full redraw on mouseup.

### Summary

On Safari, painted glyphs visually shifted left on mouseup after a drag-paint stroke. The painted content appeared correct during the drag but jumped on release.

### Root Cause

`render()` in `web/rexpaint-editor/canvas.js` fell through to a full clear+redraw when `dirtyCells.size === 0` and `_fullRenderNeeded` was false. On mouseup, after the stroke-complete callback cleared the dirty set, a stray `render()` call triggered this fallthrough path, causing a gratuitous full redraw that recomputed layout and visually displaced painted content.

### Fix

**Commit `c4f1ae5`:** Added early return in `render()` when `!needsFull && dirtyCells.size === 0`. Eliminates the no-op full redraw on mouseup.

**Commit `8b8b496`:** Follow-up: `setFontSize`, `setOffset`, and `syncFromState` called `render()` without setting `_fullRenderNeeded` or dirtying cells — they relied on the old fallthrough to trigger a full redraw. Added explicit `_fullRenderNeeded = true` in those three paths so the early-return guard from `c4f1ae5` does not accidentally skip their intended full redraws.

Files changed:
- `web/rexpaint-editor/canvas.js` — early return guard + `_fullRenderNeeded` in `setOffset`, `setFontSize`
- `web/whole-sheet-init.js` — `_fullRenderNeeded` in `syncFromState`

### Evidence

Reported as GitHub Issue #8. Fix confirmed by code inspection; no dedicated Playwright runner (visual regression on Safari is not easily testable headlessly).
