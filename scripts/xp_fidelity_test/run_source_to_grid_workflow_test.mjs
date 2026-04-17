#!/usr/bin/env node

/**
 * run_source_to_grid_workflow_test.mjs — M2-B Source-to-Grid Workflow Verifier
 *
 * CLASSIFICATION: UI-driven with diagnostic observation layer
 * ACTION PATH:    All actions via DOM clicks, canvas mouse events, file input, context menu
 * OBSERVATION:    State assertions via getState() + readFrameSignature() (diagnostic observation layer)
 * ELIGIBLE FOR:   UI-driven acceptance evidence (actions are user-reachable)
 * CAVEAT:         State verification uses page.evaluate() → getState(), which is a
 *                 diagnostic read. Actions themselves are pure UI.
 *
 * Validates both source-to-grid paths:
 *
 * Phase 1 (D2/C2): Context menu "Add to selected row sequence"
 *   Apply template → Upload PNG → Select grid row → Draw box → Right-click draft →
 *   "Add to selected row sequence" → verify frame populated → repeat
 *
 * Phase 2 (D1): Drag source box to grid frame cell
 *   Select committed box in select mode → switch to row_select → drag from source
 *   canvas to grid frame cell → verify frame populated at drop target
 *
 * This covers:
 *   - D1: Drag source to grid (cross-panel drag/drop via dropSelectedSourceBoxesAtClientPoint)
 *   - D2/C2: "Add to selected row sequence" (context menu on draft → grid insertion)
 *   - G1: Select frame (click on grid cell)
 *   - Frame content verification via readFrameSignature()
 *
 * Built on verifier_lib.mjs (shared M2 verifier foundation).
 * Base-path-aware: pass --url to test under /xpedit/workbench.
 *
 * Usage:
 *   node run_source_to_grid_workflow_test.mjs --out-dir output/source_to_grid_workflow
 *   node run_source_to_grid_workflow_test.mjs --url http://127.0.0.1:5071/xpedit/workbench --out-dir output/source_to_grid_workflow_prefixed
 *   node run_source_to_grid_workflow_test.mjs --headed --out-dir output/source_to_grid_workflow
 */

import {
  setupVerifier,
  captureState,
  dragSelectedSourceBoxesToFrame,
  readFrameSignature,
  writeReport,
  writeJsonArtifact,
  screenshot,
} from './verifier_lib.mjs';

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, '..', '..');

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------

const SOURCE_FIXTURES = {
  single_row: 'tests/fixtures/known_good/cat_sheet.png',
  multi_row: 'tests/fixtures/known_good/source_grid_multirow.png',
};

// Box coordinates for cat_sheet.png (192x48).
// Two manually-chosen boxes that cover distinct sprite regions.
const BOX_A = { x1: 10, y1: 5, x2: 55, y2: 43 };   // ~45x38
const BOX_B = { x1: 70, y1: 5, x2: 125, y2: 43 };  // ~55x38

const GROUPED_DRAG_SCENARIOS = [
  {
    id: 'row_auto',
    fixtureKey: 'single_row',
    selectionMode: 'row_select',
    sourceFamily: 'auto_detected',
    expectedSpan: 'cols',
    targetOrigin: { row: 2, col: 0 },
    selectionRect: { x1: 1, y1: 4, x2: 191, y2: 44 },
  },
  {
    id: 'column_auto',
    fixtureKey: 'multi_row',
    selectionMode: 'col_select',
    sourceFamily: 'auto_detected',
    expectedSpan: 'rows',
    targetOrigin: { row: 4, col: 0 },
    selectionRect: { x1: 1, y1: 4, x2: 21, y2: 100 },
  },
];

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Assert a condition, recording a failure if false. */
function assert(condition, failFn, cls, message, extra = {}) {
  if (!condition) {
    failFn(cls, message, extra);
    return false;
  }
  return true;
}

async function ensureSourceCanvasVisible(page) {
  const canvas = page.locator('#sourceCanvas');
  await canvas.scrollIntoViewIfNeeded();
  await page.waitForTimeout(100);
}

/**
 * Drag on the source canvas from (x1,y1) to (x2,y2).
 * Uses Playwright mouse API for precise control.
 */
async function canvasDrag(page, x1, y1, x2, y2) {
  await ensureSourceCanvasVisible(page);
  const box = await page.locator('#sourceCanvas').boundingBox();
  if (!box) throw new Error('sourceCanvas not found or not visible');
  const startX = box.x + x1;
  const startY = box.y + y1;
  const endX = box.x + x2;
  const endY = box.y + y2;
  await page.mouse.move(startX, startY);
  await page.mouse.down();
  await page.mouse.move((startX + endX) / 2, (startY + endY) / 2, { steps: 3 });
  await page.mouse.move(endX, endY, { steps: 3 });
  await page.mouse.up();
}

/**
 * Right-click the source canvas at element-relative (x,y) to open context menu.
 */
async function canvasRightClick(page, x, y) {
  await ensureSourceCanvasVisible(page);
  await page.locator('#sourceCanvas').click({
    position: { x, y },
    button: 'right',
  });
  await page.waitForSelector('#sourceContextMenu:not(.hidden)', { timeout: 3000 })
    .catch(() => {});
}

/**
 * Wait for getState().sourceImageLoaded to be true.
 */
async function waitForSourceImage(page, timeout = 15000) {
  await page.waitForFunction(() => {
    return window.__wb_debug?.getState?.()?.sourceImageLoaded === true;
  }, { timeout });
}

// ---------------------------------------------------------------------------
// Step definitions
// ---------------------------------------------------------------------------

/**
 * Apply the default template to create a blank session with grid geometry.
 * Without this, gridCols/gridRows are 0 and no .frame-cell elements exist.
 */
async function stepApplyTemplate(page, fail, outDir) {
  const pre = await captureState(page, 'pre_template');

  await page.click('#templateApplyBtn');

  // Wait for session hydration — gridCols/gridRows become non-zero
  await page.waitForFunction(() => {
    const s = window.__wb_debug?.getState?.();
    return s && s.gridCols > 0 && s.gridRows > 0;
  }, { timeout: 15000 });
  await page.waitForTimeout(500);

  const post = await captureState(page, 'post_template');
  await screenshot(page, outDir, 'step01_template');

  const hasGrid = post.gridCols > 0 && post.gridRows > 0;
  const pass = assert(
    hasGrid,
    fail, 'template', `gridCols/gridRows should be >0 after template, got ${post.gridCols}x${post.gridRows}`,
    { pre_gridCols: pre.gridCols, post_gridCols: post.gridCols, post_gridRows: post.gridRows }
  );

  return { step: 'apply_template', pass, pre, post };
}

async function stepUploadPng(page, fail, outDir, fixturePath, label = 'upload') {
  const pre = await captureState(page, `pre_${label}`);

  await page.setInputFiles('#wbFile', fixturePath);
  await page.click('#wbUpload');
  await waitForSourceImage(page);
  await page.waitForTimeout(500);

  const post = await captureState(page, `post_${label}`);
  await screenshot(page, outDir, `step_${label}`);

  const pass = assert(
    post.sourceImageLoaded === true,
    fail, 'upload', 'sourceImageLoaded should be true after upload',
    {
      fixturePath,
      pre_sourceImageLoaded: pre.sourceImageLoaded,
      post_sourceImageLoaded: post.sourceImageLoaded,
    }
  );

  return { step: `upload_png_${label}`, pass, pre, post, fixturePath };
}

async function stepSelectGridRow(page, fail, outDir, targetRow) {
  const pre = await captureState(page, 'pre_grid_select');

  // Click on a grid frame cell to select the row
  const selector = `.frame-cell[data-row="${targetRow}"]`;
  const cell = page.locator(selector).first();
  const isVisible = await cell.isVisible().catch(() => false);

  if (!isVisible) {
    fail('grid_select', `No visible grid frame cell at row ${targetRow} — grid may not have frame slots`);
    return { step: 'select_grid_row', pass: false, pre, post: pre };
  }

  await cell.click();
  await page.waitForTimeout(300);

  const post = await captureState(page, 'post_grid_select');
  await screenshot(page, outDir, 'step02_grid_select');

  const pass = assert(
    post.selectedRow === targetRow,
    fail, 'grid_select',
    `selectedRow should be ${targetRow} after clicking grid cell, got ${post.selectedRow}`,
    { pre_selectedRow: pre.selectedRow, post_selectedRow: post.selectedRow }
  );

  return { step: 'select_grid_row', pass, pre, post };
}

async function stepSwitchSourceMode(page, fail, mode, label = mode) {
  const pre = await captureState(page, `pre_mode_${label}`);
  const buttonId = mode === 'col_select' ? '#colSelectBtn'
    : mode === 'row_select' ? '#rowSelectBtn'
    : mode === 'draw_box' ? '#drawBoxBtn'
    : '#sourceSelectBtn';
  await page.click(buttonId);
  await page.waitForTimeout(200);
  const post = await captureState(page, `post_mode_${label}`);
  const pass = assert(
    post.sourceMode === mode,
    fail,
    'mode_switch',
    `sourceMode should be "${mode}", got "${post.sourceMode}"`,
    { label, pre_mode: pre.sourceMode, post_mode: post.sourceMode }
  );
  return { step: `switch_mode_${label}`, pass, pre, post, mode };
}

async function stepSwitchToDrawMode(page, fail, outDir) {
  const pre = await captureState(page, 'pre_draw_mode');

  const modeStep = await stepSwitchSourceMode(page, fail, 'draw_box', 'draw_mode');

  const post = await captureState(page, 'post_draw_mode');

  const pass = assert(
    modeStep.pass && post.sourceMode === 'draw_box',
    fail, 'mode_switch', `sourceMode should be "draw_box", got "${post.sourceMode}"`,
    { pre_mode: pre.sourceMode, post_mode: post.sourceMode }
  );

  return { step: 'switch_draw_mode', pass, pre, post };
}

async function stepDrawBox(page, fail, outDir, box, label) {
  const pre = await captureState(page, `pre_draw_${label}`);

  await canvasDrag(page, box.x1, box.y1, box.x2, box.y2);
  await page.waitForTimeout(300);

  const post = await captureState(page, `post_draw_${label}`);
  await screenshot(page, outDir, `step_draw_${label}`);

  const hasDraft = post.drawCurrent !== null;
  const pass = assert(
    hasDraft,
    fail, 'draw_box', `drawCurrent should be non-null after drawing ${label}`,
    { pre_drawCurrent: pre.drawCurrent, post_drawCurrent: post.drawCurrent }
  );

  return { step: `draw_box_${label}`, pass, pre, post };
}

/**
 * Right-click the draft box and click "Add to selected row sequence".
 * This auto-commits the draft AND inserts it into the selected grid row.
 * Requires: selectedRow !== null, draft box exists.
 */
async function stepAddDraftToRow(page, fail, outDir, box, label) {
  const pre = await captureState(page, `pre_add_to_row_${label}`);

  // Capture frame signature before insertion
  const targetRow = pre.selectedRow;
  // Find the next empty column — we don't know it, but we can read the sig after
  const preSignatures = {};
  if (targetRow !== null) {
    for (let c = 0; c < Math.min(8, pre.gridCols || 8); c++) {
      preSignatures[c] = await readFrameSignature(page, targetRow, c);
    }
  }

  // Right-click on the draft box center to open context menu
  const midX = (box.x1 + box.x2) / 2;
  const midY = (box.y1 + box.y2) / 2;
  await canvasRightClick(page, midX, midY);

  // Click "Add to selected row sequence"
  const addBtn = page.locator('#srcCtxAddToRow');
  const isDisabled = await addBtn.isDisabled().catch(() => true);
  if (isDisabled) {
    fail('add_to_row', `srcCtxAddToRow is disabled — selectedRow=${targetRow}, draft may not be at click location`);
    // Dismiss context menu
    await page.keyboard.press('Escape');
    return { step: `add_draft_to_row_${label}`, pass: false, pre, post: pre };
  }

  await addBtn.click();
  await page.waitForTimeout(500);

  const post = await captureState(page, `post_add_to_row_${label}`);
  await screenshot(page, outDir, `step_add_to_row_${label}`);

  // Verify: draft was consumed (auto-committed + inserted)
  const draftConsumed = post.drawCurrent === null;
  const boxCommitted = post.extractedBoxes > pre.extractedBoxes;

  // Verify: a frame signature changed (grid was populated)
  let signatureChanged = false;
  let changedCol = -1;
  const postSignatures = {};
  if (targetRow !== null) {
    for (let c = 0; c < Math.min(8, post.gridCols || 8); c++) {
      postSignatures[c] = await readFrameSignature(page, targetRow, c);
      if (preSignatures[c] !== undefined && preSignatures[c] !== postSignatures[c]) {
        signatureChanged = true;
        if (changedCol < 0) changedCol = c;
      }
    }
  }

  let pass = true;
  pass = assert(draftConsumed, fail, 'add_to_row',
    'drawCurrent should be null after Add to row (draft consumed)',
    { post_drawCurrent: post.drawCurrent }) && pass;

  pass = assert(boxCommitted, fail, 'add_to_row',
    `extractedBoxes should increase: pre=${pre.extractedBoxes} post=${post.extractedBoxes}`,
    { pre_count: pre.extractedBoxes, post_count: post.extractedBoxes }) && pass;

  pass = assert(signatureChanged, fail, 'add_to_row',
    `Frame signature in row ${targetRow} should change after insertion`,
    { changedCol, preSignatures, postSignatures }) && pass;

  return {
    step: `add_draft_to_row_${label}`,
    pass,
    pre,
    post,
    changedCol,
    preSignatures,
    postSignatures,
  };
}

// ---------------------------------------------------------------------------
// D1 drag-to-grid step definitions
//
// User gesture (code-proven):
//   1. Select mode + click on extracted box → sourceSelection = {id}
//      (workbench.js:4504-4520)
//   2. Switch to row_select via #rowSelectBtn → sourceSelection preserved
//      (workbench.js:4231-4236 — setSourceMode does NOT clear sourceSelection)
//   3. Mousedown on selected box in source canvas → drag_source_selection_to_grid
//      (workbench.js:4449-4464)
//   4. Mousemove >3px while still on canvas → d.moved = true
//      (workbench.js:4569-4572 — sourceCanvas mousemove only fires on canvas)
//   5. Mouseup anywhere → window handler → dropSelectedSourceBoxesAtClientPoint
//      (workbench.js:6719, 4617-4618, 5303-5312)
// ---------------------------------------------------------------------------

/**
 * Select one committed source box in select mode.
 * Uses getState().sourceBoxes to find the box center, then clicks.
 *
 * Code path: onSourceMouseDown (workbench.js:4504-4520)
 *   → sourceBoxAtPoint(pt) finds the box
 *   → state.sourceSelection = new Set([Number(hit.id)])
 */
async function stepSelectSourceBox(page, fail, outDir) {
  const pre = await captureState(page, 'pre_d1_select');

  if (!pre.sourceBoxes || pre.sourceBoxes.length === 0) {
    fail('d1_select', 'No source boxes in extractedBoxes — cannot select for D1 drag');
    return { step: 'd1_select_source_box', pass: false, pre, post: pre };
  }

  // Switch to select mode first
  await page.click('#sourceSelectBtn');
  await page.waitForTimeout(200);
  await ensureSourceCanvasVisible(page);

  // Click on the center of the first source box
  const box = pre.sourceBoxes[0];
  const clickX = box.x + Math.floor(box.w / 2);
  const clickY = box.y + Math.floor(box.h / 2);

  await page.locator('#sourceCanvas').click({
    position: { x: clickX, y: clickY },
  });
  await page.waitForTimeout(300);

  const post = await captureState(page, 'post_d1_select');
  await screenshot(page, outDir, 'step_d1_select');

  const hasSelection = post.sourceSelection && post.sourceSelection.length > 0;
  const selectedBoxId = hasSelection ? post.sourceSelection[0] : null;

  const pass = assert(
    hasSelection,
    fail, 'd1_select',
    `sourceSelection should have entries after clicking box id=${box.id} at (${clickX},${clickY}), got ${JSON.stringify(post.sourceSelection)}`,
    { clickX, clickY, box, pre_selection: pre.sourceSelection, post_selection: post.sourceSelection }
  );

  return { step: 'd1_select_source_box', pass, pre, post, selectedBoxId, clickedBox: box };
}

async function stepClearSourceBoxes(page, fail, outDir, label = 'clear_source_boxes') {
  const pre = await captureState(page, `pre_${label}`);

  await page.click('#sourceSelectBtn');
  await page.waitForTimeout(200);
  let post = pre;
  for (let attempt = 0; attempt < 4; attempt += 1) {
    await page.click('#deleteBoxBtn');
    await page.waitForTimeout(250);
    post = await captureState(page, `post_${label}_attempt_${attempt + 1}`);
    if (post.extractedBoxes === 0) break;
  }
  await screenshot(page, outDir, `step_${label}`);

  const pass = assert(
    post.extractedBoxes === 0,
    fail,
    'clear_source_boxes',
    `Expected all source boxes cleared before Find Sprites phase, got ${post.extractedBoxes}`,
    { pre_boxes: pre.extractedBoxes, post_boxes: post.extractedBoxes, post_selection: post.sourceSelection }
  );

  return { step: label, pass, pre, post };
}

async function stepFindSprites(page, fail, outDir, label = 'find_sprites') {
  const pre = await captureState(page, `pre_${label}`);

  await page.click('#sourceSelectBtn');
  await page.waitForTimeout(200);
  await page.click('#extractBtn');
  await page.waitForTimeout(700);

  const post = await captureState(page, `post_${label}`);
  await screenshot(page, outDir, `step_${label}`);

  const pass = assert(
    post.extractedBoxes > 0,
    fail,
    'find_sprites',
    `Find Sprites should detect source boxes, got ${post.extractedBoxes}`,
    { pre_boxes: pre.extractedBoxes, post_boxes: post.extractedBoxes, post_source_boxes: post.sourceBoxes }
  );

  return { step: label, pass, pre, post };
}

async function stepGroupedSelectDetectedBoxes(page, fail, outDir, scenario) {
  const pre = await captureState(page, `pre_${scenario.id}_group_select`);

  const modeStep = await stepSwitchSourceMode(page, fail, scenario.selectionMode, `${scenario.id}_${scenario.selectionMode}`);
  await canvasDrag(page, scenario.selectionRect.x1, scenario.selectionRect.y1, scenario.selectionRect.x2, scenario.selectionRect.y2);
  await page.waitForTimeout(300);

  const post = await captureState(page, `post_${scenario.id}_group_select`);
  await screenshot(page, outDir, `step_${scenario.id}_group_select`);

  const selectedIds = Array.isArray(post.sourceSelection) ? post.sourceSelection.map((id) => Number(id)) : [];
  const selectedBoxes = Array.isArray(post.sourceBoxes)
    ? post.sourceBoxes.filter((box) => selectedIds.includes(Number(box.id)))
    : [];
  const selectedCount = selectedBoxes.length;
  const pass = assert(
    modeStep.pass && selectedCount > 1,
    fail,
    `${scenario.id}_group_select`,
    `Expected multi-box ${scenario.selectionMode} selection after dragging ${scenario.id}, got ${selectedCount}`,
    {
      scenario,
      pre_selection: pre.sourceSelection,
      post_selection: post.sourceSelection,
      selected_boxes: selectedBoxes,
    }
  );

  return { step: `${scenario.id}_group_select`, pass, pre, post, selectedCount, selectedBoxes };
}

/**
 * Switch to row_select mode. sourceSelection must persist (A2 verified).
 *
 * Code path: setSourceMode("row_select") (workbench.js:4231-4236)
 *   → sets sourceMode, does NOT clear sourceSelection
 */
async function stepSwitchToRowSelect(page, fail, outDir) {
  const pre = await captureState(page, 'pre_row_select');

  const modeStep = await stepSwitchSourceMode(page, fail, 'row_select', 'row_select');

  const post = await captureState(page, 'post_row_select');

  const modeCorrect = modeStep.pass;
  const selectionPreserved = post.sourceSelection && post.sourceSelection.length > 0;

  let pass = true;
  pass = assert(modeCorrect, fail, 'd1_row_select',
    `sourceMode should be "row_select", got "${post.sourceMode}"`) && pass;
  pass = assert(selectionPreserved, fail, 'd1_row_select',
    `sourceSelection should persist after mode switch, got ${JSON.stringify(post.sourceSelection)}`,
    { pre_selection: pre.sourceSelection, post_selection: post.sourceSelection }) && pass;

  return { step: 'd1_switch_row_select', pass, pre, post };
}

/**
 * Drag a selected source box from the source canvas to a grid frame cell (D1).
 *
 * Playwright strategy:
 *   1. mouse.move to box center on source canvas (viewport coords)
 *   2. mouse.down
 *   3. mouse.move 10px right (still on canvas, >3px threshold → d.moved = true)
 *   4. mouse.move to grid frame cell center (viewport coords)
 *   5. mouse.up → window handler → dropSelectedSourceBoxesAtClientPoint
 *
 * Code path:
 *   mousedown → drag_source_selection_to_grid (workbench.js:4449-4464)
 *   mousemove → d.moved = true (workbench.js:4569-4572)
 *   mouseup → dropSelectedSourceBoxesAtClientPoint (workbench.js:4617-4618)
 *   → gridFrameFromClientPoint (workbench.js:5292-5301)
 *   → insertSourceBoxesIntoGridAt (workbench.js:5236-5290)
 */
function expectedChangedCellsForScenario(scenario, selectedCount) {
  const total = Math.max(1, Number(selectedCount || 0));
  if (scenario.expectedSpan === 'rows') {
    return Array.from({ length: total }, (_unused, idx) => ({
      row: Number(scenario.targetOrigin.row) + idx,
      col: Number(scenario.targetOrigin.col),
    }));
  }
  return Array.from({ length: total }, (_unused, idx) => ({
    row: Number(scenario.targetOrigin.row),
    col: Number(scenario.targetOrigin.col) + idx,
  }));
}

async function stepDragToGrid(page, fail, outDir, sourceBox, {
  label = 'd1_drag',
  selectionMode = 'row_select',
  sourceFamily = 'manual',
  expectedSpan = 'single',
  targetRow = null,
  targetCol = 0,
  expectedChangedCells = null,
} = {}) {
  const pre = await captureState(page, `pre_${label}`);
  const resolvedTargetRow = targetRow !== null ? Number(targetRow) : (pre.selectedRow !== null ? Number(pre.selectedRow) : 0);
  const resolvedExpectedCells = Array.isArray(expectedChangedCells) && expectedChangedCells.length
    ? expectedChangedCells
    : [{ row: resolvedTargetRow, col: Number(targetCol) }];

  const drag = await dragSelectedSourceBoxesToFrame(page, {
    sourceBox,
    targetRow: resolvedTargetRow,
    targetCol: Number(targetCol),
    selectionMode,
    sourceFamily,
    expectedSpan,
    expectedChangedCells: resolvedExpectedCells,
  });
  await screenshot(page, outDir, `step_${label}`);

  const changedCells = drag.frame_signature_deltas.filter((entry) => entry.changed);
  const allExpectedChanged = resolvedExpectedCells.length > 0
    && changedCells.length === resolvedExpectedCells.length
    && drag.frame_signature_deltas.every((entry) => entry.changed);

  let pass = true;
  pass = assert(
    drag.drop_hit_before_mouseup?.ok === true
      && Number(drag.drop_hit_before_mouseup.row) === resolvedTargetRow
      && Number(drag.drop_hit_before_mouseup.col) === Number(targetCol),
    fail,
    label,
    `Drop pointer must resolve to target frame-cell (${resolvedTargetRow},${targetCol}) before mouseup`,
    { drop_hit_before_mouseup: drag.drop_hit_before_mouseup, layout: drag.layout }
  ) && pass;
  pass = assert(
    allExpectedChanged,
    fail,
    label,
    `Expected frame signature deltas at ${JSON.stringify(resolvedExpectedCells)}, got ${JSON.stringify(drag.frame_signature_deltas.map(({ row, col, changed }) => ({ row, col, changed })))}`,
    { frame_signature_deltas: drag.frame_signature_deltas, post_status: drag.post_status }
  ) && pass;

  return {
    step: label,
    pass,
    targetRow: resolvedTargetRow,
    targetCol: Number(targetCol),
    expectedChangedCells: resolvedExpectedCells,
    changedCells,
    ...drag,
  };
}

async function runGroupedDragScenario(page, fail, outDir, fixturePath, scenario) {
  const result = {
    scenario,
    upload: null,
    clear: null,
    findSprites: null,
    selection: null,
    gridSelect: null,
    drag: null,
    pass: false,
  };
  result.upload = await stepUploadPng(page, fail, outDir, fixturePath, `${scenario.id}_fixture`);
  result.clear = await stepClearSourceBoxes(page, fail, outDir, `${scenario.id}_clear`);
  result.findSprites = await stepFindSprites(page, fail, outDir, `${scenario.id}_find_sprites`);
  result.selection = await stepGroupedSelectDetectedBoxes(page, fail, outDir, scenario);
  result.gridSelect = await stepSelectGridRow(page, fail, outDir, scenario.targetOrigin.row);
  const draggedBox = result.selection.selectedBoxes?.[0] || null;
  if (!draggedBox) {
    fail(`${scenario.id}_drag`, `No selected source box available for ${scenario.id} grouped drag`);
    result.drag = { pass: false, scenario };
    result.pass = false;
    return result;
  }
  result.drag = await stepDragToGrid(page, fail, outDir, draggedBox, {
    label: `${scenario.id}_drag`,
    selectionMode: scenario.selectionMode,
    sourceFamily: scenario.sourceFamily,
    expectedSpan: scenario.expectedSpan,
    targetRow: scenario.targetOrigin.row,
    targetCol: scenario.targetOrigin.col,
    expectedChangedCells: expectedChangedCellsForScenario(scenario, result.selection.selectedCount),
  });
  result.pass = [
    result.upload?.pass,
    result.clear?.pass,
    result.findSprites?.pass,
    result.selection?.pass,
    result.gridSelect?.pass,
    result.drag?.pass,
  ].every(Boolean);
  return result;
}

/**
 * Grid population invariant: after N insertions, exactly N frame signatures
 * should have changed from empty in the target row.
 */
function checkGridPopulationInvariant(insertResults, fail) {
  const changedCols = insertResults
    .filter(r => r.changedCol >= 0)
    .map(r => r.changedCol);

  // All changed columns should be distinct
  const unique = new Set(changedCols);
  let pass = true;

  pass = assert(unique.size === changedCols.length, fail, 'grid_population',
    `Inserted frames should be in distinct columns: got [${changedCols.join(',')}]`,
    { changedCols }) && pass;

  pass = assert(changedCols.length === insertResults.length, fail, 'grid_population',
    `Expected ${insertResults.length} frame insertions, got ${changedCols.length} signature changes`,
    { expected: insertResults.length, actual: changedCols.length }) && pass;

  return pass;
}

/**
 * Source-panel isolation invariant: grid insertions MUST NOT modify
 * source-panel-specific state (sourceMode, extractedBoxes identity, anchorBox).
 * They SHOULD modify selectedRow/selectedCols (that's the intended behavior).
 */
function checkSourceIsolationInvariant(preInsertState, finalState, fail) {
  // Note: sourceMode is NOT checked because D1 intentionally switches to row_select.
  // The invariant is that grid insertions don't corrupt source-panel *data* state.
  const checks = [
    ['sourceImageLoaded', preInsertState.sourceImageLoaded, finalState.sourceImageLoaded],
    ['anchorBox', JSON.stringify(preInsertState.anchorBox), JSON.stringify(finalState.anchorBox)],
    ['activeLayer', preInsertState.activeLayer, finalState.activeLayer],
    ['angles', preInsertState.angles, finalState.angles],
    ['projs', preInsertState.projs, finalState.projs],
    ['frameWChars', preInsertState.frameWChars, finalState.frameWChars],
    ['frameHChars', preInsertState.frameHChars, finalState.frameHChars],
    ['layerCount', preInsertState.layerCount, finalState.layerCount],
  ];

  let pass = true;
  for (const [field, expected, actual] of checks) {
    if (expected !== actual) {
      fail('source_isolation',
        `Source isolation violated: ${field} changed from ${expected} to ${actual}`);
      pass = false;
    }
  }
  return pass;
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main() {
  const { page, browser, report, fail, workbenchUrl, outDir, cliArgs } =
    await setupVerifier('source_to_grid_workflow', { requireOutDir: true });

  const fixturePaths = Object.fromEntries(
    Object.entries(SOURCE_FIXTURES).map(([key, relPath]) => [key, path.resolve(REPO_ROOT, relPath)])
  );
  for (const [key, fixturePath] of Object.entries(fixturePaths)) {
    if (!fs.existsSync(fixturePath)) {
      fail('config', `Fixture not found for ${key}: ${SOURCE_FIXTURES[key]}`);
      report.overall_pass = false;
      writeReport(outDir, 'report.json', report);
      await browser.close();
      process.exit(1);
    }
  }

  const steps = {};
  const dragContracts = {};
  let allPass = true;

  // Capture baseline state
  const baseline = await captureState(page, 'baseline');
  await screenshot(page, outDir, 'step00_baseline');

  // Step 1: Apply template (creates blank session with grid geometry)
  console.log('=== Step 1: Apply template ===');
  steps.template = await stepApplyTemplate(page, fail, outDir);
  if (!steps.template.pass) allPass = false;

  // Step 2: Upload PNG
  console.log('=== Step 2: Upload PNG ===');
  steps.upload = await stepUploadPng(page, fail, outDir, fixturePaths.single_row, 'single_row_upload');
  if (!steps.upload.pass) allPass = false;

  // Step 3: Select grid row 0 (G1: click grid frame cell)
  console.log('=== Step 3: Select grid row 0 ===');
  steps.grid_select = await stepSelectGridRow(page, fail, outDir, 0);
  if (!steps.grid_select.pass) allPass = false;

  // Step 4: Switch to draw mode
  console.log('=== Step 4: Switch to draw mode ===');
  steps.draw_mode = await stepSwitchToDrawMode(page, fail, outDir);
  if (!steps.draw_mode.pass) allPass = false;

  // Capture state before first insertion (for isolation check)
  const preInsertState = await captureState(page, 'pre_first_insert');

  // Step 5: Draw box A
  console.log('=== Step 5: Draw box A ===');
  steps.draw_box_a = await stepDrawBox(page, fail, outDir, BOX_A, 'box_a');
  if (!steps.draw_box_a.pass) allPass = false;

  // Step 6: Add draft to selected row via context menu (D2/C2)
  console.log('=== Step 6: Add draft A to grid row via context menu ===');
  steps.add_to_row_a = await stepAddDraftToRow(page, fail, outDir, BOX_A, 'a');
  if (!steps.add_to_row_a.pass) allPass = false;

  // Step 7: Draw box B
  console.log('=== Step 7: Draw box B ===');
  steps.draw_box_b = await stepDrawBox(page, fail, outDir, BOX_B, 'box_b');
  if (!steps.draw_box_b.pass) allPass = false;

  // Step 8: Add draft B to selected row via context menu
  console.log('=== Step 8: Add draft B to grid row via context menu ===');
  steps.add_to_row_b = await stepAddDraftToRow(page, fail, outDir, BOX_B, 'b');
  if (!steps.add_to_row_b.pass) allPass = false;

  // Step 9: Grid population invariant
  console.log('=== Step 9: Grid population invariant ===');
  const insertResults = [steps.add_to_row_a, steps.add_to_row_b];
  const gridPass = checkGridPopulationInvariant(insertResults, fail);
  steps.grid_population = { step: 'grid_population_invariant', pass: gridPass };
  if (!gridPass) allPass = false;

  // =========================================================================
  // D1 PHASE: Drag source box to grid (real cross-panel drag/drop path)
  //
  // The cross-panel drag requires both the source canvas and the grid
  // frame cell to be within the viewport simultaneously, because
  // dropSelectedSourceBoxesAtClientPoint → document.elementFromPoint
  // only finds elements in the visible viewport.
  // Expand viewport height so both panels are on-screen. At the default
  // 900px viewport, the source canvas sits at ~Y=628 and the grid frame
  // cells at ~Y=1398 — too far apart for document.elementFromPoint to
  // resolve the drop target. 2400px accommodates the full page height.
  // =========================================================================

  await page.setViewportSize({ width: 1400, height: 2400 });
  await page.waitForTimeout(300);

  // Step 10: Select one committed source box in select mode
  // Code: workbench.js:4504-4520 — click on extracted box → sourceSelection = {id}
  console.log('=== Step 10: Select source box for D1 drag ===');
  steps.d1_select = await stepSelectSourceBox(page, fail, outDir);
  if (!steps.d1_select.pass) allPass = false;

  // Step 11: Switch to row_select mode (sourceSelection must persist)
  // Code: workbench.js:4231-4236 — setSourceMode does NOT clear sourceSelection
  console.log('=== Step 11: Switch to row_select mode ===');
  steps.d1_row_select = await stepSwitchToRowSelect(page, fail, outDir);
  if (!steps.d1_row_select.pass) allPass = false;

  // Step 12: Drag selected source box to grid frame cell (D1)
  // Determine target column: use col 4 to avoid overlap with D2/C2 insertions at cols 0-1
  // Code: workbench.js:4449-4464 → 4569-4572 → 6719 → 4617-4618 → 5303-5312
  console.log('=== Step 12: Drag source box to grid (D1) ===');
  const d1TargetCol = 4;
  const d1SourceBox = steps.d1_select.clickedBox;
  if (d1SourceBox) {
    steps.d1_drag = await stepDragToGrid(page, fail, outDir, d1SourceBox, {
      label: 'd1_drag_manual',
      selectionMode: 'row_select',
      sourceFamily: 'manual',
      expectedSpan: 'single',
      targetRow: 0,
      targetCol: d1TargetCol,
      expectedChangedCells: [{ row: 0, col: d1TargetCol }],
    });
    if (!steps.d1_drag.pass) allPass = false;
    dragContracts.manual_single = steps.d1_drag;
  } else {
    fail('d1_drag', 'No source box available from d1_select step');
    steps.d1_drag = { step: 'd1_drag_to_grid', pass: false };
    allPass = false;
  }

  // Step 13: Clear manual source boxes so the uploaded-PNG Find Sprites phase
  // starts from auto-detected boxes, not the earlier manual draft/commit path.
  console.log('=== Step 13: Clear manual source boxes ===');
  steps.clear_source_boxes = await stepClearSourceBoxes(page, fail, outDir);
  if (!steps.clear_source_boxes.pass) allPass = false;

  // Step 14: Run Find Sprites against the uploaded PNG.
  console.log('=== Step 14: Find Sprites on uploaded PNG ===');
  steps.find_sprites = await stepFindSprites(page, fail, outDir);
  if (!steps.find_sprites.pass) allPass = false;

  // Step 15: Select one auto-detected source box.
  console.log('=== Step 15: Select auto-detected source box ===');
  steps.d1_select_auto = await stepSelectSourceBox(page, fail, outDir);
  if (!steps.d1_select_auto.pass) allPass = false;

  // Step 16: Switch the detected sprite to row-select mode.
  console.log('=== Step 16: Switch auto-detected source box to row_select ===');
  steps.d1_row_select_auto = await stepSwitchToRowSelect(page, fail, outDir);
  if (!steps.d1_row_select_auto.pass) allPass = false;

  // Step 17: Select a fresh target row for the uploaded-PNG drag proof.
  console.log('=== Step 17: Select grid row 1 ===');
  steps.grid_select_row_1 = await stepSelectGridRow(page, fail, outDir, 1);
  if (!steps.grid_select_row_1.pass) allPass = false;

  // Step 18: Drag the auto-detected source sprite into 9A frame navigation.
  console.log('=== Step 18: Drag auto-detected source box to grid ===');
  const autoSourceBox = steps.d1_select_auto.clickedBox;
  if (autoSourceBox) {
    steps.d1_drag_auto = await stepDragToGrid(page, fail, outDir, autoSourceBox, {
      label: 'd1_drag_auto_single',
      selectionMode: 'row_select',
      sourceFamily: 'auto_detected',
      expectedSpan: 'single',
      targetRow: 1,
      targetCol: 0,
      expectedChangedCells: [{ row: 1, col: 0 }],
    });
    if (!steps.d1_drag_auto.pass) allPass = false;
    dragContracts.auto_single = steps.d1_drag_auto;
  } else {
    fail('d1_drag_auto', 'No auto-detected source box available for uploaded-PNG drag proof');
    steps.d1_drag_auto = { step: 'd1_drag_auto_to_grid', pass: false };
    allPass = false;
  }

  // Step 19-20: Parameterized grouped drag lanes.
  for (const scenario of GROUPED_DRAG_SCENARIOS) {
    console.log(`=== Grouped Lane: ${scenario.id} (${scenario.selectionMode}) ===`);
    const lane = await runGroupedDragScenario(page, fail, outDir, fixturePaths[scenario.fixtureKey], scenario);
    steps[`grouped_${scenario.id}`] = {
      step: `grouped_${scenario.id}`,
      pass: lane.pass,
      scenario,
      upload: lane.upload?.step,
      clear: lane.clear?.step,
      find_sprites: lane.findSprites?.step,
      selection_count: lane.selection?.selectedCount ?? 0,
      expected_changed_cells: lane.drag?.expectedChangedCells ?? [],
    };
    dragContracts[scenario.id] = lane.drag;
    if (!lane.pass) allPass = false;
  }

  // Step 21: Source isolation invariant (covers manual, auto single-box, and grouped drag phases)
  console.log('=== Step 21: Source isolation invariant ===');
  const finalState = await captureState(page, 'final');
  const isolationPass = checkSourceIsolationInvariant(preInsertState, finalState, fail);
  steps.source_isolation = { step: 'source_isolation_invariant', pass: isolationPass };
  if (!isolationPass) allPass = false;

  await screenshot(page, outDir, 'step_final');

  // Build report
  report.steps = steps;
  report.overall_pass = allPass;
  report.fixtures = SOURCE_FIXTURES;
  report.drag_contract_keys = Object.keys(dragContracts);
  report.steps_total = Object.keys(steps).length;
  report.steps_passed = Object.values(steps).filter(s => s.pass).length;
  report.steps_failed = Object.values(steps).filter(s => !s.pass).length;

  // Write state snapshots as artifact
  const snapshots = {};
  for (const [name, step] of Object.entries(steps)) {
    if (step.pre) snapshots[`${name}_pre`] = step.pre;
    if (step.post) snapshots[`${name}_post`] = step.post;
  }
  snapshots.baseline = baseline;
  snapshots.preInsertState = preInsertState;
  snapshots.final = finalState;

  // Write signature artifacts
  const signatureData = {};
  for (const step of insertResults) {
    if (step.preSignatures) signatureData[`${step.step}_pre`] = step.preSignatures;
    if (step.postSignatures) signatureData[`${step.step}_post`] = step.postSignatures;
  }

  writeJsonArtifact(outDir, 'state_snapshots.json', snapshots);
  writeJsonArtifact(outDir, 'frame_signatures.json', signatureData);
  writeJsonArtifact(outDir, 'drag_contracts.json', dragContracts);

  const reportPath = writeReport(outDir, 'report.json', report);

  // Summary
  console.log('\n=== Source-to-Grid Workflow Summary ===');
  console.log(`Hosting mode: ${report.hosting_mode}`);
  console.log(`Steps: ${report.steps_passed}/${report.steps_total} passed`);
  for (const [name, step] of Object.entries(steps)) {
    console.log(`  ${step.pass ? 'PASS' : 'FAIL'} ${name}`);
  }
  console.log(`Overall: ${allPass ? 'PASS' : 'FAIL'}`);
  console.log(`Report: ${reportPath}`);

  await browser.close();
  process.exit(allPass ? 0 : 1);
}

main().catch(err => {
  console.error('Fatal error:', err);
  process.exit(2);
});
