# Workbench Canonical Spec

**Authority:** This is one of the 3 canonical authority docs for this repo. See Section 6 below.

**Last updated:** 2026-03-24
**Branch:** master @ 01f6e72

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
| **M2-D** | Full SAR workflow coverage (all remaining WIRED actions get verifier proof) | M2-B, M2-C | ADVANCING — registry 77/77 entries landed (5c2aab1–d7e791c). 14 executable + 16 stubs. 31 WS selectors. 2 new recipes. W15 PROVEN (three-part). S3-S6/G5-G6/G9-G11 PROVEN. PB-01 FIXED. PB-03 reclassified (UX hardening). Slice 5 E2E 13/13 PASS. 31/96 actions now PROVEN (was 20). |
| **M2-E** | Semantic editing (region-based dictionary-driven edits) | M2-D | NOT STARTED |
| **M2-F** | Analyze/auto-slice (assistive, not authoritative) | M2-D | NOT STARTED |

Execute in dependency order. M2-B and M2-C may run in parallel after M2-A.

---

## 3. Current Priority Stack

**Last reviewed:** 2026-03-24

1. **MVP deployment to `rikiworld.com/xpedit`** — LIVE. GitHub Actions run `23479759126` passed all 3 jobs. Bug report → GitHub Issue delivery wired via Secret Manager (verified: Issues #6, #7). Bare `/xpedit` route fixed (`8ede2c6`). Remaining follow-up: refresh Node-20-based GitHub Actions before GitHub's Node 24 cutoff. Pipeline runs on Cloud Run free tier are too slow (>5 min) for verifier tests — UI-only flows work fine.
2. **Slice 5 manual assembly E2E** — PROVEN 13/13 (2026-03-24). Covers U1→S12→S7→D1→W1→W2→T3→T4. Demonstrates M2-B/C/D functional end-to-end. Runner: `run_manual_assembly_e2e_test.mjs`.
3. **M2-D full SAR workflow coverage** — 31/96 actions PROVEN (was 20). 31 WS selectors, 77 registry entries, 2 recipes. W15 three-part proof committed. S3-S6/G5-G6/G9-G11 proven. Remaining 56 WIRED actions need committed proof in future M2-D/E passes.
4. **Workbench UI audit follow-up** — 2026-03-24 audit found 39 user-facing issues after BUG-01 was fixed: 3 critical, 7 high, 14 medium, 15 low. Immediate open-bug focus is silent PNG decode failure, double mouseleave stroke completion, mobile modal clipping, and grid overdraw/perf.
5. **PB-03 UX hardening** — confirm dialog on session-boundary loads. Cross-session undo remains architecturally out of scope. Low-priority UX refinement.
6. **Bundle-family expansion roadmap is still under-scoped** — product truth still centers on `player`, `attack`, and `plydie`, while research/runtime surfaces already show a larger player-state family model (`player-nude`, `wolfie`, `wolack`, ternary W states, mounted/unmounted parity). This is a roadmap gap, not just a verifier gap.

This stack is execution priority, not timeless truth. Re-evaluate when any sub-phase status changes.

**Note:** PB-01 (anchor undo) FIXED — `pushHistory()` added to `setAnchorFromTarget()`. PB-02 remains CLOSED. PB-06 (W15 visualization) FIXED and PROVEN (three-part evidence committed 2026-03-24).

### Active Bugs

| ID | Summary | Status | Notes |
|----|---------|--------|-------|
| BUG-01 | Grid toggle overlay is incorrect — uses simple lines instead of cross marks at intersections; grid size is not user-customizable | FIXED | Fixed in `6fb3375`. Cross marks at intersections + grid-step select (1×1–16×16) on both whole-sheet editor and legacy inspector. UI-proven via screenshots (see PLAYWRIGHT_FAILURE_LOG.md). |
| BUG-02 | PNG upload silently fails on decode/load error because the source-image path has no `img.onerror` handler | OPEN | `workbench.js:6177-6182` wires `img.onload` only. Corrupted/unsupported images can leave the source canvas blank with no user-visible error even though upload/post succeeded. |
| BUG-03 | Whole-sheet canvas binds `mouseleave` twice, allowing spurious stroke-complete callbacks and empty undo entries | OPEN | `whole-sheet-init.js:375-380` binds both `_onStrokeEnd` and `_onCanvasMouseLeave` to `mouseleave`. This can fire stroke-complete even when no active stroke exists. |
| BUG-04 | Overlay modal clips content on mobile/tablet because `.overlay-card` relies on `100vh` and a weak internal scrollbar | OPEN | `styles.css:97-106`. On iOS Safari and short viewports, the submit button can fall below the visible viewport and the scrollbar is hard to discover. |
| BUG-05 | Whole-sheet/REXPaint grid draws every cross mark for the entire sheet even when most cells are off-screen | OPEN | `canvas.js:617-625` loops full sheet dimensions with no viewport culling. Large sheets at high zoom can incur visible frame drops. |
| BUG-06 | Bug-report known-issue dropdown fails silently when `fetchKnownBugs()` errors | OPEN | `workbench.js:494` swallows the fetch failure. Users only see the default option and may file duplicates without knowing the dropdown failed to load. |
| BUG-07 | Disabled controls are too visually similar to enabled controls on the dark theme | OPEN | `styles.css:152` uses opacity only. Grid-panel controls and similar disabled buttons look merely dimmed, especially on touch devices with no cursor feedback. |
| BUG-08 | Legacy Char Grid debug panel is exposed in production UI | OPEN | `workbench.html:233-236` leaves `<details id="legacyGridDetails" class="legacy-grid-debug">` visible to all users even though it is a debug-only surface. |

**UI audit note:** the 2026-03-24 workbench UI audit found 39 verified issues total (3 critical, 7 high, 14 medium, 15 low). The active-bug table above promotes the critical issues and highest-signal open production issues into canon; the broader severity breakdown is preserved in `PLAYWRIGHT_FAILURE_LOG.md`.

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
   - remove remaining binary-only debug assumptions from browser override lists

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

### Open Design Questions (must be audited before implementation planning)

- If a user adds a new PNG sprite, must they manually recreate every mounted/unmounted
  and equipment-state variant, or can the product derive/reuse some of them?
- Are helmet/armor/shield/weapon states separate sprite families, or are they encoded
  as layer/state differences inside the same player-family contract?
- Which states are mandatory for native-runtime parity, and which can remain deliberate
  fallback-to-native behavior?
- What is the minimal “no-template new XP” / template-less runtime apply contract that
  remains truthful to the original runtime?

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
