# M2-D Registry Expansion Implementation Plan — COMPLETE

> **Status:** ALL 7 TASKS COMPLETE. Implementation landed on master (5c2aab1–d7e791c). Proof pass completed 2026-03-24: W15 PROVEN (three-part), S3-S6/G5-G6/G9-G11 PROVEN, PB-01 FIXED, Slice 5 E2E 13/13 PASS.

**Goal:** Expand action_registry.json from 47 to 77 entries, add 31 WS selectors, fix W15 SelectTool visualization, and add F3/F6 recipes.

**Architecture:** Pure data expansion — selectors.mjs gets 31 new keys, action_registry.json gets 30 new entries (14 executable + 16 stubs), recipe_generator.mjs gets 2 new fixed recipes, and whole-sheet-init.js gets one line for W15. No schema changes, no runner changes.

**Tech Stack:** ES modules (selectors.mjs, recipe_generator.mjs), JSON (action_registry.json), Playwright (dom_runner.mjs for verification), vanilla JS (whole-sheet-init.js for W15 fix).

**Implementation evidence:** Commits 5c2aab1 (selectors), 8d119ad (F3), 408a5e3 (F6), 757cf74 (F7), 2d9aa30 (W15 fix), 70da189 (recipes), d7e791c (verification).
**Proof evidence:** `run_m2d_action_proof_test.mjs` 12/12 PASS, `run_whole_sheet_tools_test.mjs` 8/8 PASS (W15), `run_manual_assembly_e2e_test.mjs` 13/13 PASS (Slice 5).

---

### Task 1: Add 31 WS selectors to selectors.mjs

**Files:**
- Modify: `scripts/xp_fidelity_test/selectors.mjs:155` (before closing `};` of selectors object)

**Step 1: Add the selector block**

Insert before the closing `};` of the `selectors` object (after the `wholeSheetMount` line):

```js
  // -- F7: Whole-Sheet Editor (dynamic DOM, created by whole-sheet-init.js) --
  wsFrameNav:           '#wsFrameNav',
  wsGlyphPickerCanvas:  '#wsGlyphPickerCanvas',
  wsGlyphCode:          '#wsGlyphCode',
  wsGlyphChar:          '#wsGlyphChar',
  wsPaletteCanvas:      '#wsPaletteCanvas',
  wsFgColor:            '#wsFgColor',
  wsBgColor:            '#wsBgColor',
  wsUndoBtn:            '#wsUndoBtn',
  wsRedoBtn:            '#wsRedoBtn',
  wsSaveBtn:            '#wsSaveBtn',
  wsExportBtn:          '#wsExportBtn',
  wsToolCell:           '#wsToolCell',
  wsToolEyedropper:     '#wsToolEyedropper',
  wsToolErase:          '#wsToolErase',
  wsToolLine:           '#wsToolLine',
  wsToolRect:           '#wsToolRect',
  wsToolFill:           '#wsToolFill',
  wsToolSelect:         '#wsToolSelect',
  wsLayersPanel:        '#wsLayersPanel',
  wsPos:                '#wsPos',
  wsHoverGlyph:         '#wsHoverGlyph',
  wsHoverFg:            '#wsHoverFg',
  wsHoverBg:            '#wsHoverBg',
  wsDrawGlyph:          '#wsDrawGlyph',
  wsDrawFgSwatch:       '#wsDrawFgSwatch',
  wsDrawBgSwatch:       '#wsDrawBgSwatch',
  wsActiveLayerInfo:    '#wsActiveLayerInfo',
  wsActiveTool:         '#wsActiveTool',
  wsDims:               '#wsDims',
  // Class selectors for stable WS header buttons (not per-row dynamic)
  wsLayerAddBtn:        '.ws-layer-add-btn',
  wsLayerDelBtn:        '.ws-layer-del-btn',
```

**Step 2: Verify syntax**

Run: `node --check scripts/xp_fidelity_test/selectors.mjs`
Expected: no output (exit 0)

**Step 3: Verify selector count**

Run:
```bash
node --input-type=module -e "
import { selectors } from './scripts/xp_fidelity_test/selectors.mjs';
console.log('total selectors:', Object.keys(selectors).length);
const ws = Object.keys(selectors).filter(k => k.startsWith('ws'));
console.log('ws selectors:', ws.length);
"
```
Expected: total selectors: ~133+, ws selectors: 31

**Step 4: Commit**

```bash
git add scripts/xp_fidelity_test/selectors.mjs
git commit -m "feat(registry): add 31 whole-sheet selectors to selectors.mjs"
```

---

### Task 2: Add 7 F3 Source Panel entries to action_registry.json

**Files:**
- Modify: `scripts/xp_fidelity_test/action_registry.json`

**Step 1: Update F3 family metadata**

Change F3's `registryActionCount` from `0` to `7`. Update `blockingIssue` text.

**Step 2: Add the 7 F3 action entries**

Add after the last F2 entry (U3) and before the first F4 entry (C1):

```json
"S1": {
  "id": "S1",
  "name": "Set mode: Select",
  "family": "F3",
  "status": "PROVEN",
  "m2Scope": "M2-B",
  "generatorReadiness": "READY",
  "acceptanceEligible": true,
  "selectorKey": "sourceSelectBtn",
  "gestureType": "click",
  "preconditions": { "sourceImageLoaded": true },
  "postconditions": { "sourceMode": "select" },
  "blockers": [],
  "paramBindings": []
},
"S2": {
  "id": "S2",
  "name": "Set mode: Draw Box",
  "family": "F3",
  "status": "PROVEN",
  "m2Scope": "M2-B",
  "generatorReadiness": "READY",
  "acceptanceEligible": true,
  "selectorKey": "drawBoxBtn",
  "gestureType": "click",
  "preconditions": { "sourceImageLoaded": true },
  "postconditions": { "sourceMode": "draw_box" },
  "blockers": [],
  "paramBindings": []
},
"S3": {
  "id": "S3",
  "name": "Set mode: Drag Row",
  "family": "F3",
  "status": "WIRED",
  "m2Scope": "M2-D",
  "generatorReadiness": "READY",
  "acceptanceEligible": true,
  "selectorKey": "rowSelectBtn",
  "gestureType": "click",
  "preconditions": { "sourceImageLoaded": true },
  "postconditions": { "sourceMode": "row_select" },
  "blockers": [],
  "paramBindings": []
},
"S4": {
  "id": "S4",
  "name": "Set mode: Drag Column",
  "family": "F3",
  "status": "WIRED",
  "m2Scope": "M2-D",
  "generatorReadiness": "READY",
  "acceptanceEligible": true,
  "selectorKey": "colSelectBtn",
  "gestureType": "click",
  "preconditions": { "sourceImageLoaded": true },
  "postconditions": { "sourceMode": "col_select" },
  "blockers": [],
  "paramBindings": []
},
"S5": {
  "id": "S5",
  "name": "Set mode: Vertical Cut",
  "family": "F3",
  "status": "WIRED",
  "m2Scope": "M2-D",
  "generatorReadiness": "READY",
  "acceptanceEligible": true,
  "selectorKey": "cutVBtn",
  "gestureType": "click",
  "preconditions": { "sourceImageLoaded": true },
  "postconditions": { "sourceMode": "cut_v" },
  "blockers": [],
  "paramBindings": []
},
"S6": {
  "id": "S6",
  "name": "Delete box / clear overlays",
  "family": "F3",
  "status": "WIRED",
  "m2Scope": "M2-D",
  "generatorReadiness": "READY",
  "acceptanceEligible": true,
  "selectorKey": "deleteBoxBtn",
  "gestureType": "click",
  "preconditions": {},
  "postconditions": {},
  "blockers": ["Canon inventory assigns S6 to deleteBoxBtn (direct action). SAR blueprint (workbench-sar-table-blueprint.md:275) assigns S6 to a canvas draw-box gesture and maps deleteBoxBtn to S11. This entry follows the canon inventory (higher authority). If the SAR blueprint S6 definition is ever needed, it must use a different registry row or the canon must reconcile the discrepancy."],
  "paramBindings": []
},
"S12": {
  "id": "S12",
  "name": "Find Sprites",
  "family": "F3",
  "status": "PROVEN",
  "m2Scope": "M2-B",
  "generatorReadiness": "READY",
  "acceptanceEligible": true,
  "selectorKey": "extractBtn",
  "gestureType": "click",
  "preconditions": { "sourceImageLoaded": true },
  "postconditions": { "extractedBoxes": { "op": "gt", "value": 0 } },
  "blockers": [],
  "paramBindings": []
},
```

**Step 3: Validate JSON**

Run: `python3 -c "import json; d=json.load(open('scripts/xp_fidelity_test/action_registry.json')); print('actions:', len(d['actions']))"`
Expected: `actions: 54`

**Step 4: Cross-validate selectors**

Run:
```bash
node --input-type=module -e "
import { selectors } from './scripts/xp_fidelity_test/selectors.mjs';
import { readFileSync } from 'fs';
const reg = JSON.parse(readFileSync('scripts/xp_fidelity_test/action_registry.json', 'utf8'));
for (const [id, a] of Object.entries(reg.actions)) {
  if (a.selectorKey && !(a.selectorKey in selectors)) console.log('MISSING:', id, a.selectorKey);
}
console.log('cross-validation done');
"
```
Expected: `cross-validation done` (no MISSING lines)

**Step 5: Commit**

```bash
git add scripts/xp_fidelity_test/action_registry.json
git commit -m "feat(registry): add 7 F3 source-panel button-click actions (S1-S6, S12)"
```

---

### Task 3: Add 5 F6 Grid Panel entries to action_registry.json

**Files:**
- Modify: `scripts/xp_fidelity_test/action_registry.json`

**Step 1: Update F6 family metadata**

Change F6's `registryActionCount` from `0` to `5`. Update `blockingIssue` text to note G3/G4 dual-button gap and G7/G8 alias deferral.

**Step 2: Add the 5 F6 action entries**

Add after the last F4 entry (C9) and before the first F5 entry (or F7/F8, wherever the sort order falls):

```json
"G5": {
  "id": "G5",
  "name": "Add frame",
  "family": "F6",
  "status": "WIRED",
  "m2Scope": "M2-D",
  "generatorReadiness": "READY",
  "acceptanceEligible": true,
  "selectorKey": "addFrameBtn",
  "gestureType": "click",
  "preconditions": { "sessionId": { "op": "truthy", "value": null } },
  "postconditions": {},
  "blockers": [],
  "paramBindings": []
},
"G6": {
  "id": "G6",
  "name": "Delete selected",
  "family": "F6",
  "status": "WIRED",
  "m2Scope": "M2-D",
  "generatorReadiness": "READY",
  "acceptanceEligible": true,
  "selectorKey": "deleteCellBtn",
  "gestureType": "click",
  "preconditions": { "selectedRow": { "op": "gte", "value": 0 } },
  "postconditions": {},
  "blockers": [],
  "paramBindings": []
},
"G9": {
  "id": "G9",
  "name": "Assign row category",
  "family": "F6",
  "status": "WIRED",
  "m2Scope": "M2-D",
  "generatorReadiness": "READY",
  "acceptanceEligible": true,
  "selectorKey": "assignAnimCategoryBtn",
  "gestureType": "click",
  "preconditions": { "selectedRow": { "op": "gte", "value": 0 } },
  "postconditions": {},
  "blockers": [],
  "paramBindings": [{ "selectorKey": "animCategorySelect", "gestureType": "selectOption", "paramKey": "category" }]
},
"G10": {
  "id": "G10",
  "name": "Assign frame group",
  "family": "F6",
  "status": "WIRED",
  "m2Scope": "M2-D",
  "generatorReadiness": "READY",
  "acceptanceEligible": true,
  "selectorKey": "assignFrameGroupBtn",
  "gestureType": "click",
  "preconditions": { "selectedRow": { "op": "gte", "value": 0 } },
  "postconditions": {},
  "blockers": [],
  "paramBindings": [{ "selectorKey": "frameGroupName", "gestureType": "fill", "paramKey": "groupName" }]
},
"G11": {
  "id": "G11",
  "name": "Apply groups to metadata",
  "family": "F6",
  "status": "WIRED",
  "m2Scope": "M2-D",
  "generatorReadiness": "READY",
  "acceptanceEligible": true,
  "selectorKey": "applyGroupsToAnimsBtn",
  "gestureType": "click",
  "preconditions": {},
  "postconditions": {},
  "blockers": [],
  "paramBindings": []
},
```

**Step 3: Validate JSON + cross-validate**

Run: `python3 -c "import json; d=json.load(open('scripts/xp_fidelity_test/action_registry.json')); print('actions:', len(d['actions']))"`
Expected: `actions: 59`

**Step 4: Commit**

```bash
git add scripts/xp_fidelity_test/action_registry.json
git commit -m "feat(registry): add 5 F6 grid-panel button-click actions (G5-G6, G9-G11)"
```

---

### Task 4: Add 18 F7 Whole-Sheet entries to action_registry.json (2 executable + 16 stubs)

**Files:**
- Modify: `scripts/xp_fidelity_test/action_registry.json`

**Step 1: Update F7 family metadata**

Change F7's `registryActionCount` from `0` to `18`. Update `generatorReadiness` to `"NEEDS_DESIGN"` (most F7 actions require canvas/keyboard/dynamic-row gestures not in runner; only W12/W13 are READY). Update `blockingIssue`.

**Step 2: Add the 18 F7 action entries**

The 2 executable entries (W12, W13) use class selectors added in Task 1. The 16 stubs have `generatorReadiness: "NEEDS_DESIGN"` or `"DEFERRED"`.

```json
"W1": {
  "id": "W1", "name": "Focus whole-sheet", "family": "F7",
  "status": "PROVEN", "m2Scope": "M2-C", "generatorReadiness": "NEEDS_DESIGN",
  "acceptanceEligible": true, "selectorKey": null, "gestureType": "canvasClick",
  "preconditions": { "selectedRow": { "op": "gte", "value": 0 } },
  "postconditions": { "wholeSheetMounted": true },
  "blockers": ["Requires dblclick on grid frame cell — canvas gesture not in runner"],
  "paramBindings": []
},
"W2": {
  "id": "W2", "name": "Paint cell (Cell tool)", "family": "F7",
  "status": "PROVEN", "m2Scope": "M2-C", "generatorReadiness": "NEEDS_DESIGN",
  "acceptanceEligible": true, "selectorKey": null, "gestureType": "canvasClick",
  "preconditions": { "wholeSheetMounted": true },
  "postconditions": {},
  "blockers": ["Multi-step action: (1) click wsToolCell to activate tool, (2) canvasClick on WS canvas to paint. No single DOM trigger — selectorKey is null per schema contract."],
  "paramBindings": []
},
"W3": {
  "id": "W3", "name": "Eyedropper", "family": "F7",
  "status": "PROVEN", "m2Scope": "M2-C", "generatorReadiness": "NEEDS_DESIGN",
  "acceptanceEligible": true, "selectorKey": null, "gestureType": "canvasClick",
  "preconditions": { "wholeSheetMounted": true },
  "postconditions": {},
  "blockers": ["Multi-step action: (1) click wsToolEyedropper to activate, (2) canvasClick to sample. No single DOM trigger."],
  "paramBindings": []
},
"W4": {
  "id": "W4", "name": "Erase cell", "family": "F7",
  "status": "PROVEN", "m2Scope": "M2-C", "generatorReadiness": "NEEDS_DESIGN",
  "acceptanceEligible": true, "selectorKey": null, "gestureType": "canvasClick",
  "preconditions": { "wholeSheetMounted": true },
  "postconditions": {},
  "blockers": ["Multi-step action: (1) click wsToolErase to activate, (2) canvasClick to erase. No single DOM trigger."],
  "paramBindings": []
},
"W5": {
  "id": "W5", "name": "Erase drag", "family": "F7",
  "status": "PROVEN", "m2Scope": "M2-C", "generatorReadiness": "NEEDS_DESIGN",
  "acceptanceEligible": true, "selectorKey": null, "gestureType": "canvasDrag",
  "preconditions": { "wholeSheetMounted": true },
  "postconditions": {},
  "blockers": ["Multi-step action: (1) click wsToolErase to activate, (2) canvasDrag to erase area. No single DOM trigger."],
  "paramBindings": []
},
"W6": {
  "id": "W6", "name": "Flood fill", "family": "F7",
  "status": "PROVEN", "m2Scope": "M2-C", "generatorReadiness": "NEEDS_DESIGN",
  "acceptanceEligible": true, "selectorKey": null, "gestureType": "canvasClick",
  "preconditions": { "wholeSheetMounted": true },
  "postconditions": {},
  "blockers": ["Multi-step action: (1) click wsToolFill to activate, (2) canvasClick to fill. No single DOM trigger."],
  "paramBindings": []
},
"W7": {
  "id": "W7", "name": "Rectangle tool", "family": "F7",
  "status": "PROVEN", "m2Scope": "M2-C", "generatorReadiness": "NEEDS_DESIGN",
  "acceptanceEligible": true, "selectorKey": null, "gestureType": "canvasDrag",
  "preconditions": { "wholeSheetMounted": true },
  "postconditions": {},
  "blockers": ["Multi-step action: (1) click wsToolRect to activate, (2) canvasDrag to draw rect. No single DOM trigger."],
  "paramBindings": []
},
"W8": {
  "id": "W8", "name": "Line tool", "family": "F7",
  "status": "PROVEN", "m2Scope": "M2-C", "generatorReadiness": "NEEDS_DESIGN",
  "acceptanceEligible": true, "selectorKey": null, "gestureType": "canvasDrag",
  "preconditions": { "wholeSheetMounted": true },
  "postconditions": {},
  "blockers": ["Multi-step action: (1) click wsToolLine to activate, (2) canvasDrag to draw line. No single DOM trigger."],
  "paramBindings": []
},
"W9": {
  "id": "W9", "name": "Switch tool (keyboard)", "family": "F7",
  "status": "PROVEN", "m2Scope": "M2-C", "generatorReadiness": "NEEDS_DESIGN",
  "acceptanceEligible": true, "selectorKey": null, "gestureType": "keypress",
  "preconditions": { "wholeSheetMounted": true },
  "postconditions": {},
  "blockers": ["Keyboard shortcuts C/E/D/L/R/I/S — keypress gesture not in runner"],
  "paramBindings": []
},
"W10": {
  "id": "W10", "name": "Switch layer", "family": "F7",
  "status": "PROVEN", "m2Scope": "M2-C", "generatorReadiness": "NEEDS_DESIGN",
  "acceptanceEligible": true, "selectorKey": null, "gestureType": "click",
  "preconditions": { "wholeSheetMounted": true },
  "postconditions": {},
  "blockers": ["No single DOM trigger — target is a dynamic per-layer-row button inside wsLayersPanel. Needs parameterized selector model for layer index."],
  "paramBindings": []
},
"W11": {
  "id": "W11", "name": "Toggle layer visibility", "family": "F7",
  "status": "PROVEN", "m2Scope": "M2-C", "generatorReadiness": "NEEDS_DESIGN",
  "acceptanceEligible": true, "selectorKey": null, "gestureType": "check",
  "preconditions": { "wholeSheetMounted": true },
  "postconditions": {},
  "blockers": ["No single DOM trigger — target is a dynamic per-layer-row checkbox inside wsLayersPanel. Needs parameterized selector model for layer index."],
  "paramBindings": []
},
"W12": {
  "id": "W12", "name": "Add layer", "family": "F7",
  "status": "PROVEN", "m2Scope": "M2-C", "generatorReadiness": "READY",
  "acceptanceEligible": true, "selectorKey": "wsLayerAddBtn", "gestureType": "click",
  "preconditions": { "wholeSheetMounted": true },
  "postconditions": { "layerCount": { "op": "changed", "value": null } },
  "blockers": [],
  "paramBindings": []
},
"W13": {
  "id": "W13", "name": "Delete layer", "family": "F7",
  "status": "PROVEN", "m2Scope": "M2-C", "generatorReadiness": "READY",
  "acceptanceEligible": true, "selectorKey": "wsLayerDelBtn", "gestureType": "click",
  "preconditions": { "wholeSheetMounted": true, "layerCount": { "op": "gt", "value": 1 } },
  "postconditions": { "layerCount": { "op": "changed", "value": null } },
  "blockers": [],
  "paramBindings": []
},
"W14": {
  "id": "W14", "name": "Move layer", "family": "F7",
  "status": "PROVEN", "m2Scope": "M2-C", "generatorReadiness": "NEEDS_DESIGN",
  "acceptanceEligible": true, "selectorKey": null, "gestureType": "click",
  "preconditions": { "wholeSheetMounted": true },
  "postconditions": {},
  "blockers": ["No single DOM trigger — target is dynamic per-layer-row up/down buttons inside wsLayersPanel. Needs parameterized selector model."],
  "paramBindings": []
},
"W15": {
  "id": "W15", "name": "Select tool", "family": "F7",
  "status": "WIRED", "m2Scope": "M2-C", "generatorReadiness": "NEEDS_DESIGN",
  "acceptanceEligible": true, "selectorKey": null, "gestureType": "canvasDrag",
  "preconditions": { "wholeSheetMounted": true },
  "postconditions": {},
  "blockers": ["Multi-step action: (1) click wsToolSelect to activate, (2) canvasDrag to create selection. No single DOM trigger. Also: canvas.setSelectionTool() not called — visualization gap (Task 5 fix)."],
  "paramBindings": []
},
"W16": {
  "id": "W16", "name": "Oval tool", "family": "F7",
  "status": "DEFERRED", "m2Scope": "M2-C", "generatorReadiness": "DEFERRED",
  "acceptanceEligible": false, "selectorKey": null, "gestureType": "canvasDrag",
  "preconditions": {}, "postconditions": {},
  "blockers": ["OvalTool code exists on disk but not wired (PB-05)"],
  "paramBindings": []
},
"W17": {
  "id": "W17", "name": "Text tool", "family": "F7",
  "status": "DEFERRED", "m2Scope": "M2-C", "generatorReadiness": "DEFERRED",
  "acceptanceEligible": false, "selectorKey": null, "gestureType": "keypress",
  "preconditions": {}, "postconditions": {},
  "blockers": ["TextTool code exists on disk but not wired (PB-07)"],
  "paramBindings": []
},
"W18": {
  "id": "W18", "name": "Per-stroke undo/redo", "family": "F7",
  "status": "PROVEN", "m2Scope": "M2-C", "generatorReadiness": "DEFERRED",
  "acceptanceEligible": true, "selectorKey": null, "gestureType": "click",
  "preconditions": { "wholeSheetMounted": true },
  "postconditions": {},
  "blockers": ["No single DOM trigger — dual-button action (wsUndoBtn + wsRedoBtn). Same schema gap as G3/G4: one canon ID maps to two physical buttons. Code fully wired, proof exists."],
  "paramBindings": []
},
```

**Step 3: Validate**

Run: `python3 -c "import json; d=json.load(open('scripts/xp_fidelity_test/action_registry.json')); print('actions:', len(d['actions']))"`
Expected: `actions: 77`

**Step 4: Full audit**

Run:
```bash
node --input-type=module -e "
import { selectors } from './scripts/xp_fidelity_test/selectors.mjs';
import { readFileSync } from 'fs';
const reg = JSON.parse(readFileSync('scripts/xp_fidelity_test/action_registry.json', 'utf8'));
let issues = 0;
for (const [id, a] of Object.entries(reg.actions)) {
  if (a.selectorKey && !(a.selectorKey in selectors)) { console.log('MISSING selector:', id, a.selectorKey); issues++; }
  for (const b of a.paramBindings || []) {
    if (!(b.selectorKey in selectors)) { console.log('MISSING paramBinding selector:', id, b.selectorKey); issues++; }
  }
}
// Verify family counts
const counts = {};
for (const a of Object.values(reg.actions)) counts[a.family] = (counts[a.family]||0)+1;
for (const [f, m] of Object.entries(reg.families)) {
  if ((counts[f]||0) !== m.registryActionCount) { console.log('COUNT MISMATCH:', f, 'expected', m.registryActionCount, 'got', counts[f]||0); issues++; }
}
console.log('audit done, issues:', issues);
"
```
Expected: `audit done, issues: 0`

**Step 5: Commit**

```bash
git add scripts/xp_fidelity_test/action_registry.json
git commit -m "feat(registry): add 18 F7 whole-sheet entries (W12/W13 executable, 16 stubs)"
```

---

### Task 5: W15 product fix — connect SelectTool to canvas selection renderer

**Files:**
- Modify: `web/whole-sheet-init.js:344`

**Step 1: Add the one-line fix**

After line 344 (`editorState.selectTool = new SelectToolAdapter();`), add:

```js
  canvas.setSelectionTool(editorState.selectTool);
```

This connects the existing marching-ants renderer (`canvas.js:573-600`) to the existing SelectToolAdapter. The adapter exposes `getSelectionBounds()` which the renderer calls during `canvas.render()`.

**Step 2: Verify syntax**

Skip `node --check web/whole-sheet-init.js` — the file uses ES module `import` syntax but the repo's package.json declares `"type": "commonjs"`, so `node --check` will always fail with a SyntaxError regardless of code correctness. Instead, verify visually that the added line is syntactically valid (one method call) and rely on the workbench server loading the file at runtime.

**Step 3: Commit**

```bash
git add web/whole-sheet-init.js
git commit -m "fix(ws): connect SelectTool to canvas selection renderer (W15 visualization)"
```

---

### Task 6: Add F3/F6 recipes to recipe_generator.mjs

**Files:**
- Modify: `scripts/xp_fidelity_test/recipe_generator.mjs`

**Step 1: Add source-panel mode-cycle recipe**

Add before the `generateRecipes()` function:

```js
/**
 * Recipe 7: Source Panel Mode Cycle
 *
 * (Assumes a source image is loaded from a prior recipe.)
 * Cycle through all 5 source modes, then find sprites.
 *
 * Exercises: F3 (S2, S3, S4, S5, S1, S12)
 */
function recipeSourcePanelModeCycle() {
  return {
    id: 'source_panel_mode_cycle',
    name: 'Source Panel Mode Cycle: draw_box → row → col → cut_v → select → find sprites',
    family: 'F3',
    preconditions: {
      sourceImageLoaded: true,
    },
    steps: [
      step('S2'),
      step('S3'),
      step('S4'),
      step('S5'),
      step('S1'),
      step('S12'),
    ],
  };
}
```

**Step 2: Add grid-panel frame-management recipe**

```js
/**
 * Recipe 8: Grid Panel Frame Management
 *
 * (Assumes a session exists with at least one row selected.)
 * Add frame → delete it.
 *
 * Exercises: F6 (G5, G6)
 */
function recipeGridFrameManagement() {
  return {
    id: 'grid_frame_management',
    name: 'Grid Panel: add frame → delete selected',
    family: 'F6',
    preconditions: {
      sessionId: { op: 'truthy', value: null },
    },
    steps: [
      step('G5'),
      step('G6'),
    ],
  };
}
```

**Step 3: Register both in generateRecipes()**

Add to the return array in `generateRecipes()`:

```js
    recipeSourcePanelModeCycle(),
    recipeGridFrameManagement(),
```

**Step 4: Verify**

Run: `node scripts/xp_fidelity_test/recipe_generator.mjs --list`
Expected: 8 recipes listed (6 original + 2 new)

**Step 5: Commit**

```bash
git add scripts/xp_fidelity_test/recipe_generator.mjs
git commit -m "feat(generator): add source-panel mode-cycle and grid frame-management recipes"
```

---

### Task 7: Verification — regression check + precondition gate validation

This task validates two things: (1) existing recipes still pass after the additive registry expansion, (2) the new recipes' precondition gates work correctly. It does NOT prove the new F3/F6 recipes execute end-to-end — that requires a composite sequence establishing prior state (image upload / session creation), which is future work.

**Step 1: Run the original 3 passing recipes to confirm no regression**

```bash
node scripts/xp_fidelity_test/dom_runner.mjs --recipe bundle_template_apply --out-dir output/dom_runner_m2d_bta
node scripts/xp_fidelity_test/dom_runner.mjs --recipe bug_report_dismiss --out-dir output/dom_runner_m2d_brd
node scripts/xp_fidelity_test/dom_runner.mjs --recipe xp_import_roundtrip --out-dir output/dom_runner_m2d_xir
```
Expected: all 3 PASS (confirms additive registry changes don't break existing entries)

**Step 2: Validate precondition gate for source_panel_mode_cycle**

```bash
node scripts/xp_fidelity_test/dom_runner.mjs --recipe source_panel_mode_cycle --out-dir output/dom_runner_m2d_spmc
```
Expected: BLOCKED (precondition: `sourceImageLoaded` is false on fresh workbench). This validates the recipe's precondition is correctly enforced, not that the recipe steps execute.

**Step 3: Validate precondition gate for grid_frame_management**

```bash
node scripts/xp_fidelity_test/dom_runner.mjs --recipe grid_frame_management --out-dir output/dom_runner_m2d_gfm
```
Expected: BLOCKED (precondition: `sessionId` is not truthy on fresh workbench).

**Step 4: Verify task-scoped file state**

```bash
git log --oneline -7
git diff --stat HEAD~6..HEAD
```
Expected: 6 commits from Tasks 1-6. Changed files limited to: selectors.mjs, action_registry.json, recipe_generator.mjs, whole-sheet-init.js. Working tree may have unrelated dirty files (doc edits, untracked artifacts) — that is pre-existing, not a task regression.
