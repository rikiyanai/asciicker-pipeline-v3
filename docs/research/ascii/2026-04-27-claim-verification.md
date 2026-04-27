## Section 1 Claim Verification — 2026-04-27

Scope: verify the executor claim that all six Section 1 performance/architecture
items added to canon on 2026-04-27 are implemented, checkpointed, and integrated
into the shipped whole-sheet root path.

### Verdict

The six claimed items are verified in the current tree.

They are not isolated dead-end work in `web/rexpaint-editor/*`. The shipped
root editor imports those modules through [web/whole-sheet-init.js](../../web/whole-sheet-init.js),
lines 13-22, so the perf/architecture work is on the Section 1 path.

This does not close full Section 1 parity. The current honest blockers are the
remaining root-owner and proof gaps already called out in canon Section 1.6.1
and 1.6.2.

### Verification Notes

- The cited browser benchmarks are reproducible from this repo.
- The cited editor unit tests are real, but not via plain `node test.js` under
  the current `commonjs` package. They require an ESM-capable runner. I
  verified them through `js_repl` import.

### Claim Matrix

| ID | Claim | Code evidence | Commit evidence | Verification evidence | Verdict |
|---|---|---|---|---|---|
| `S1-PERF-001` | offscreen per-layer compositing replaces full layer redraws | [web/rexpaint-editor/layer-stack.js](../../web/rexpaint-editor/layer-stack.js) lines 43-47, 99-122, 207-213; [web/rexpaint-editor/canvas.js](../../web/rexpaint-editor/canvas.js) lines 759-816 | `f0a83d9` | real-browser benchmark `tests/web/rexpaint-editor-layer-benchmark.html` measured `0.005ms` average toggle render on `200x100` over 20 iterations | `verified` |
| `S1-PERF-002` | color intern map removes hot-path RGB string churn | [web/rexpaint-editor/canvas.js](../../web/rexpaint-editor/canvas.js) lines 5-15, 693-746 | `9e1af0b` | code inspection plus benchmark rerun on the glyph path using the same cached `_rgb()` hot path | `verified` |
| `S1-PERF-003` | glyph atlas / `drawImage()` path replaces per-cell `fillText()` | [web/rexpaint-editor/cp437-font.js](../../web/rexpaint-editor/cp437-font.js) lines 95-204, 276-333; [web/rexpaint-editor/canvas.js](../../web/rexpaint-editor/canvas.js) lines 724-753 | `9e1af0b` | `tests/web/rexpaint-editor-cp437-font.test.js` logic present; real-browser benchmark `tests/web/rexpaint-editor-glyph-benchmark.html` measured `0.005ms` average dirty render on `200x100` over 20 iterations | `verified` |
| `S1-PERF-004` | selection animation redraws only the dirty region | [web/rexpaint-editor/canvas.js](../../web/rexpaint-editor/canvas.js) lines 818-900, 950-990 | `c303db5` | real-browser benchmark `tests/web/rexpaint-editor-selection-benchmark.html` measured `0.09ms` average frame time and `60` draw calls per frame | `verified` |
| `S1-ARCH-001` | undo/redo command wiring is live | [web/rexpaint-editor/canvas.js](../../web/rexpaint-editor/canvas.js) lines 433-502; [web/rexpaint-editor/editor-app.js](../../web/rexpaint-editor/editor-app.js) lines 658-675, 987-1001; [web/rexpaint-editor/undo-stack.js](../../web/rexpaint-editor/undo-stack.js) lines 15-88 | `a765aef` | `tests/web/rexpaint-editor-undo-stack.test.js` passed via `js_repl` import (`6 passed, 0 failed`) | `verified` |
| `S1-ARCH-002` | tool dispatch is registry/map-based | [web/rexpaint-editor/editor-app.js](../../web/rexpaint-editor/editor-app.js) lines 42-45 and registry-based activation/getters in the same module | `c303db5` | `tests/web/rexpaint-editor-keyboard-handler.test.js` passed via `js_repl` import (`13 passed, 0 failed`) | `verified` |

### Root-Path Integration Evidence

- [web/whole-sheet-init.js](../../web/whole-sheet-init.js) imports `Canvas`,
  `LayerStack`, `CP437Font`, `CellTool`, `LineTool`, `OvalTool`, `RectTool`,
  `FillTool`, `SelectTool`, and `TextTool` from `web/rexpaint-editor/*`.
- Current whole-sheet ownership/hot-path tests pass:
  - `node --test tests/web/whole-sheet-history-ownership.test.mjs`
  - `node --test tests/web/whole-sheet-cell-ops.test.mjs`

### What Is Still Left For Section 1 Parity

These are the current parity blockers after this verification pass, not the now-stale
2026-04-15 feature-gap list:

1. `workbench.js` still carries wrapper history/future state and mirror snapshot
   state for non-root surfaces, so the root-owner law is not yet completely clean.
   Evidence: [web/workbench.js](../../web/workbench.js) lines 2068-2156 and 2118-2121.
2. Root resize is implemented, but canon still treats unrestricted resize
   semantics as open because frame-topology/save constraints are still coupled.
3. No fresh headed UI-only Section 1 proof has been rerun yet on both root-hosted
   and `/xpedit` shipped surfaces after these changes.
4. The hot path is improved but not fully closed: wrapper mirrors, save queues,
   and frame-grid projection work still exist on the broader workbench side.

### Commands Used

- `python3 scripts/conductor_tools.py status --auto-setup`
- `python3 scripts/self_containment_audit.py`
- `node --test tests/web/whole-sheet-history-ownership.test.mjs`
- `node --test tests/web/whole-sheet-cell-ops.test.mjs`
- `js_repl` import of:
  - `tests/web/rexpaint-editor-undo-stack.test.js`
  - `tests/web/rexpaint-editor-keyboard-handler.test.js`
- `python3 -m http.server 8123`
- escalated local benchmark run:
  - `node --input-type=module --eval 'import { chromium } from "playwright"; ...'`
