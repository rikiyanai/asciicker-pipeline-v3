# Whole-Sheet Contract And Section 1 Re-Audit

Date: 2026-04-27

## Scope

This note answers four questions:

1. What is a better testing method than the current narrow button smokes and stale canvas scripts?
2. Can we generate a `state -> control -> expected result` table automatically for the whole-sheet editor?
3. Why does ASCIIFlow feel fast while this workbench still feels slow?
4. What is the honest current Section 1 parity state?

## New testing method

Use a generated whole-sheet control contract instead of relying on a small hand-written button smoke.

Implemented generator:

- [generate_whole_sheet_action_contracts.mjs](/Users/r/Downloads/asciicker-pipeline-v3/scripts/xp_fidelity_test/generate_whole_sheet_action_contracts.mjs)
- [whole-sheet-action-contracts.test.mjs](/Users/r/Downloads/asciicker-pipeline-v3/tests/web/whole-sheet-action-contracts.test.mjs)

Generated artifacts:

- `output/whole_sheet_action_contracts.json`
- `output/whole_sheet_action_contracts.md`

Current output summary:

- extracted controls: `53`
- mapped controls: `53`
- unmapped controls: `0`
- generated action variants: `91`

Important design choice:

- this is not a naive global `2^n` state explosion
- the generator uses a local action-state matrix
- each control expands only over the predicates that matter for that control

That is the right shape for this editor. A global `2^n` truth table would be huge, mostly invalid, and less useful than per-action state matrices.

## What the generator actually covers

The generator reads shipped source from:

- [whole-sheet-init.js](/Users/r/Downloads/asciicker-pipeline-v3/web/whole-sheet-init.js)
- [workbench.js](/Users/r/Downloads/asciicker-pipeline-v3/web/workbench.js)

It extracts and maps:

- whole-sheet mode buttons
- browse buttons
- tool buttons
- undo/redo
- grid toggle and grid step
- resize/save/export
- selection clipboard buttons
- transform buttons
- bulk-edit buttons
- find/replace apply
- dynamic layer row controls
- wrapper layer bridge controls
- draw-state controls such as zoom, glyph, palette, fg/bg
- stroke-complete control path

Observable whole-sheet state exported today:

- `mounted`
- `gridCols`
- `gridRows`
- `layerCount`
- `mode`
- `activeLayerIndex`
- `hasFontLoaded`
- `activeTool`
- `selectionBounds`
- `hasClipboard`
- `clipboardCellCount`
- `pasteMode`
- `browseItemCount`
- `browseSelectedId`
- `drawGlyph`
- `drawFg`
- `drawBg`
- `canvasZoom`
- `appliedCanvasZoom`
- `gridVisible`
- `gridStep`
- `canUndo`
- `canRedo`
- `historyDepth`
- `futureDepth`

This gives a much stronger base for majority coverage before headed human testing.

## Online research

### ASCIIFlow

Source-backed facts:

- ASCIIFlow describes itself as a client-side-only web application: `ASCIIFlow is a client-side only web based application for drawing ASCII diagrams.`  
  Source: https://github.com/lewish/asciiflow
- Its client tree is split into `draw`, `store`, `ui`, plus focused files such as `controller.ts`, `view.tsx`, `layer.ts`, and `render_layer.ts`.  
  Source: https://github.com/lewish/asciiflow/tree/main/client

Inference from those sources:

- ASCIIFlow’s interaction path is narrower than this workbench’s path.
- It appears to keep the editor local and document-centric instead of coupling each edit to a wider wrapper/session/grid/runtime assembly surface.
- That alone does not prove micro-performance, but it strongly supports why the product can feel faster: fewer owners, fewer projections, fewer non-local side effects on each interaction.

### Editor architecture references

tldraw’s official docs describe several patterns directly relevant here:

- a reactive store that tracks document, session, and presence separately
- atomic transactions to batch changes and reduce intermediate renders
- computed caches for expensive derived data
- a hierarchical state chart for tools and input handling
- the ability to create a standalone store for headless/testing scenarios

Sources:

- https://tldraw.dev/sdk-features/store
- https://tldraw.dev/sdk-features/editor

TanStack DB’s official repo states a similar general principle for fast local UX:

- normalized client collections
- sub-millisecond live queries
- taking the network off the interaction path

Source:

- https://github.com/TanStack/db

### What that means for this workbench

The consistent architecture lesson is:

1. one authoritative document store
2. separate document state from session/view state
3. batch mutations
4. cache derived projections
5. keep network and persistence off the hot interaction path
6. model tool/input logic as an explicit state machine
7. make the test surface run against the same authoritative store

## Why ours still feels slower

Current local evidence says the editor is better than before, but still not as clean as the architectures above.

Good changes already present:

- root whole-sheet history exists in [whole-sheet-init.js](/Users/r/Downloads/asciicker-pipeline-v3/web/whole-sheet-init.js#L3671)
- ordinary root renders no longer blanket-sync via `renderAll()` in [workbench.js](/Users/r/Downloads/asciicker-pipeline-v3/web/workbench.js#L4178)
- autosave is queued, not directly serialized from edit completion in [workbench.js](/Users/r/Downloads/asciicker-pipeline-v3/web/workbench.js#L4080)
- dirty frame-grid refresh exists in [workbench.js](/Users/r/Downloads/asciicker-pipeline-v3/web/workbench.js#L2765)

But residual coupling remains:

- wrapper history and combined history UI still exist in [workbench.js](/Users/r/Downloads/asciicker-pipeline-v3/web/workbench.js#L2084)
- wrapper snapshot rebuild / deep-clone paths still exist in [workbench.js](/Users/r/Downloads/asciicker-pipeline-v3/web/workbench.js#L6621)
- wrapper-owned document replacement still reprojects legacy surfaces in [workbench.js](/Users/r/Downloads/asciicker-pipeline-v3/web/workbench.js#L6655)
- `renderAll()` is still a broad wrapper redraw fanout in [workbench.js](/Users/r/Downloads/asciicker-pipeline-v3/web/workbench.js#L4178)

So the honest answer is:

- the hot path is much better than the earlier fully-coupled state
- it is still not architecturally as narrow or store-centric as ASCIIFlow/tldraw-style designs

## Section 1 parity re-audit

### Blocker 1: wrapper history/mirror ownership

Verdict: `partial / still open`

What is closed:

- live root undo/redo ownership is in [whole-sheet-init.js](/Users/r/Downloads/asciicker-pipeline-v3/web/whole-sheet-init.js#L3671)

What is still open:

- wrapper compatibility history still exists in [workbench.js](/Users/r/Downloads/asciicker-pipeline-v3/web/workbench.js#L2084)
- wrapper still builds and reapplies whole-sheet snapshots from mirrored state in [workbench.js](/Users/r/Downloads/asciicker-pipeline-v3/web/workbench.js#L6621)

Meaning:

- the old blocker is stale if read as “wrapper still owns live whole-sheet undo/redo”
- it is still valid if read as “wrapper mirror/state compatibility layer still exists”

### Blocker 2: resize constrained by frame-topology law

Verdict: `closed in code-state`

Evidence:

- `_promptResizeDocument()` in [whole-sheet-init.js](/Users/r/Downloads/asciicker-pipeline-v3/web/whole-sheet-init.js#L3196) now accepts any positive `cols x rows`
- the previous topology-preservation alert/path is no longer present

Meaning:

- this should not remain listed as an open product blocker unless a headed rerun disproves the shipped behavior

### Blocker 3: no fresh headed UI-only Section 1 rerun on root and /xpedit

Verdict: `still open, but narrower than before`

Evidence already gathered:

- button smoke exists for root and prefixed:
  - [run_whole_sheet_button_smoke_test.mjs](/Users/r/Downloads/asciicker-pipeline-v3/scripts/xp_fidelity_test/run_whole_sheet_button_smoke_test.mjs)
- layer proof exists for root and prefixed:
  - [run_whole_sheet_layer_test.mjs](/Users/r/Downloads/asciicker-pipeline-v3/scripts/xp_fidelity_test/run_whole_sheet_layer_test.mjs)
- generated whole-sheet contract now covers 53 controls and 91 variants

What is still missing:

- a fresh full headed root-hosted and `/xpedit` UI-only rerun for the entire Section 1 whole-sheet surface
- updated canvas-gesture proofs after fixing rendered-cell-size drift in older scripts

Meaning:

- this is now mostly verifier debt, not evidence that the product surface is missing button wiring

### Blocker 4: residual hot-path wrapper churn

Verdict: `still open`

Evidence:

- wrapper compatibility/state clone paths remain in [workbench.js](/Users/r/Downloads/asciicker-pipeline-v3/web/workbench.js#L6621)
- wrapper broad redraw fanout remains in [workbench.js](/Users/r/Downloads/asciicker-pipeline-v3/web/workbench.js#L4178)
- combined wrapper/root history presentation remains in [workbench.js](/Users/r/Downloads/asciicker-pipeline-v3/web/workbench.js#L2115)

Meaning:

- Section 1 parity on control coverage is much closer than the old canon text suggests
- hot-path architecture parity is not fully closed yet

## Honest current status

Section 1 is not honestly “fully complete,” but the old blocker set needs correction.

Closed in code-state:

- root undo/redo ownership
- unrestricted resize
- whole-sheet button/control inventory now contract-covered by generator

Still open:

- wrapper mirror compatibility layer
- residual wrapper redraw/projection churn
- full headed rerun across all whole-sheet Section 1 gesture lanes after fixing stale verifier click math

Most important reclassification:

- button/control parity is now primarily a verifier-model problem, not a missing-in-product problem
- canvas gesture parity still needs fresh headed proof
