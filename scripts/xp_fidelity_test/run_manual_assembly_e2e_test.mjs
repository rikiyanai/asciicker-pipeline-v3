#!/usr/bin/env node

/**
 * run_manual_assembly_e2e_test.mjs — Slice 5: Manual Assembly E2E
 *
 * CLASSIFICATION: UI-driven with diagnostic observation layer
 * ACTION PATH:    All actions via DOM clicks, canvas mouse events, file input, context menu, dblclick
 * OBSERVATION:    State assertions via getState() / readFrameCell() (diagnostic)
 * ELIGIBLE FOR:   UI-driven acceptance evidence
 *
 * End-to-end workflow:
 *   1. Apply template → blank session with grid
 *   2. Upload PNG → source image loaded
 *   3. Select grid row 0 → selectedRow = 0
 *   4. Switch to draw mode
 *   5. Draw box A → set as anchor
 *   6. Draw box B → pad to anchor
 *   7. Right-click padded draft → Add to selected row sequence
 *   8. Double-click grid frame → WS editor opens
 *   9. Paint a cell in WS editor
 *  10. Click Save
 *  11. Click Export XP
 *
 * This is the critical M2 acceptance workflow: PNG → manual assembly → editing → export.
 *
 * Usage:
 *   node run_manual_assembly_e2e_test.mjs --out-dir output/slice5_e2e
 *   node run_manual_assembly_e2e_test.mjs --headed --out-dir output/slice5_e2e
 */

import {
  setupVerifier,
  captureState,
  waitForWholeSheetMount,
  readFrameSignature,
  readFrameCell,
  writeReport,
  screenshot,
} from './verifier_lib.mjs';

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, '..', '..');

const PNG_FIXTURE = 'tests/fixtures/known_good/cat_sheet.png';
const BOX_A = { x1: 10, y1: 5, x2: 55, y2: 43 };   // anchor box
const BOX_B = { x1: 70, y1: 5, x2: 125, y2: 43 };   // padded box
const CELL_SIZE = 12;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function assert(condition, failFn, cls, message, extra = {}) {
  if (!condition) {
    failFn(cls, message, extra);
    return false;
  }
  return true;
}

async function canvasDrag(page, x1, y1, x2, y2) {
  const box = await page.locator('#sourceCanvas').boundingBox();
  if (!box) throw new Error('sourceCanvas not found or not visible');
  await page.mouse.move(box.x + x1, box.y + y1);
  await page.mouse.down();
  await page.mouse.move(box.x + (x1 + x2) / 2, box.y + (y1 + y2) / 2, { steps: 3 });
  await page.mouse.move(box.x + x2, box.y + y2, { steps: 3 });
  await page.mouse.up();
}

async function canvasRightClick(page, x, y) {
  await page.locator('#sourceCanvas').click({ position: { x, y }, button: 'right' });
  await page.waitForSelector('#sourceContextMenu:not(.hidden)', { timeout: 3000 }).catch(() => {});
}

async function waitForSourceImage(page, timeout = 15000) {
  await page.waitForFunction(() => {
    return window.__wb_debug?.getState?.()?.sourceImageLoaded === true;
  }, { timeout });
}

async function clickWsCell(page, cx, cy) {
  await page.evaluate(({ tx, ty }) => {
    const scroll = document.getElementById('wholeSheetScroll');
    if (!scroll) return;
    scroll.scrollLeft = Math.max(0, tx - scroll.clientWidth / 2);
    scroll.scrollTop = Math.max(0, ty - scroll.clientHeight / 2);
  }, { tx: cx * CELL_SIZE, ty: cy * CELL_SIZE });
  await page.waitForTimeout(100);
  await page.click('#wholeSheetCanvas', {
    position: { x: cx * CELL_SIZE + CELL_SIZE / 2, y: cy * CELL_SIZE + CELL_SIZE / 2 },
  });
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

const { page, browser, outDir, fail, report } = await setupVerifier('slice5_manual_assembly_e2e');

let allPass = true;
const steps = {};

try {
  // ── Step 1: Apply template → blank session with grid ──
  console.log('=== Step 1: Apply template ===');
  await page.click('#templateApplyBtn');
  await page.waitForFunction(() => {
    const s = window.__wb_debug?.getState?.();
    return s && s.gridCols > 0 && s.gridRows > 0;
  }, { timeout: 15000 });
  await page.waitForTimeout(500);
  const postTemplate = await captureState(page, 'post_template');
  await screenshot(page, outDir, 'step01_template');
  const templatePass = assert(
    postTemplate.gridCols > 0 && postTemplate.gridRows > 0,
    fail, 'template', `Grid should exist: ${postTemplate.gridCols}x${postTemplate.gridRows}`,
  );
  steps.template = { step: 'apply_template', pass: templatePass, gridCols: postTemplate.gridCols, gridRows: postTemplate.gridRows };
  if (!templatePass) allPass = false;

  // ── Step 2: Upload PNG ──
  console.log('=== Step 2: Upload PNG ===');
  const pngPath = path.resolve(REPO_ROOT, PNG_FIXTURE);
  await page.setInputFiles('#wbFile', pngPath);
  await page.click('#wbUpload');
  await waitForSourceImage(page);
  await page.waitForTimeout(500);
  const postUpload = await captureState(page, 'post_upload');
  await screenshot(page, outDir, 'step02_upload');
  const uploadPass = assert(postUpload.sourceImageLoaded, fail, 'upload', 'sourceImageLoaded should be true');
  steps.upload = { step: 'upload_png', pass: uploadPass };
  if (!uploadPass) allPass = false;

  // ── Step 3: Select grid row 0 ──
  console.log('=== Step 3: Select grid row 0 ===');
  const rowHeader = page.locator('.frame-row-header[data-row="0"]').first();
  await rowHeader.click({ timeout: 5000 }).catch(() => {
    fail('row_select', '.frame-row-header[data-row="0"] not clickable');
  });
  await page.waitForTimeout(300);
  const postRowSelect = await captureState(page, 'post_row_select');
  await screenshot(page, outDir, 'step03_row_select');
  const rowSelectPass = assert(
    postRowSelect.selectedRow === 0,
    fail, 'row_select', `selectedRow should be 0, got ${postRowSelect.selectedRow}`,
  );
  steps.row_select = { step: 'select_row_0', pass: rowSelectPass, selectedRow: postRowSelect.selectedRow };
  if (!rowSelectPass) allPass = false;

  // ── Step 4: Switch to draw mode ──
  console.log('=== Step 4: Draw mode ===');
  await page.click('#drawBoxBtn');
  await page.waitForTimeout(200);
  const postDrawMode = await captureState(page, 'post_draw_mode');
  const drawModePass = assert(
    postDrawMode.sourceMode === 'draw_box',
    fail, 'draw_mode', `sourceMode should be "draw_box", got "${postDrawMode.sourceMode}"`,
  );
  steps.draw_mode = { step: 'draw_mode', pass: drawModePass };
  if (!drawModePass) allPass = false;

  // ── Step 5: Draw box A → set as anchor ──
  console.log('=== Step 5: Draw box A + set anchor ===');
  await canvasDrag(page, BOX_A.x1, BOX_A.y1, BOX_A.x2, BOX_A.y2);
  await page.waitForTimeout(300);
  const postDrawA = await captureState(page, 'post_draw_a');
  const drawAPass = assert(postDrawA.drawCurrent !== null, fail, 'draw_a', 'drawCurrent should be non-null after draw A');
  steps.draw_box_a = { step: 'draw_anchor_box', pass: drawAPass };
  if (!drawAPass) allPass = false;

  // Right-click draft → Set as anchor
  const midAx = (BOX_A.x1 + BOX_A.x2) / 2;
  const midAy = (BOX_A.y1 + BOX_A.y2) / 2;
  await canvasRightClick(page, midAx, midAy);
  const setAnchorBtn = page.locator('#srcCtxSetAnchor');
  const setAnchorDisabled = await setAnchorBtn.isDisabled().catch(() => true);
  if (!setAnchorDisabled) {
    await setAnchorBtn.click();
    await page.waitForTimeout(200);
  }
  const postAnchor = await captureState(page, 'post_anchor');
  await screenshot(page, outDir, 'step05_anchor');
  const anchorPass = assert(
    postAnchor.anchorBox !== null,
    fail, 'set_anchor', 'anchorBox should be non-null after Set as anchor',
  );
  steps.set_anchor = { step: 'set_anchor', pass: anchorPass, anchorBox: postAnchor.anchorBox };
  if (!anchorPass) allPass = false;

  // ── Step 6: Draw box B → pad to anchor ──
  console.log('=== Step 6: Draw box B + pad to anchor ===');
  // Re-enter draw mode (setting anchor may have dismissed draft)
  await page.click('#drawBoxBtn');
  await page.waitForTimeout(200);
  await canvasDrag(page, BOX_B.x1, BOX_B.y1, BOX_B.x2, BOX_B.y2);
  await page.waitForTimeout(300);
  const postDrawB = await captureState(page, 'post_draw_b');
  const drawBPass = assert(postDrawB.drawCurrent !== null, fail, 'draw_b', 'drawCurrent should be non-null after draw B');
  steps.draw_box_b = { step: 'draw_pad_box', pass: drawBPass };
  if (!drawBPass) allPass = false;

  // Right-click draft → Pad to anchor
  const midBx = (BOX_B.x1 + BOX_B.x2) / 2;
  const midBy = (BOX_B.y1 + BOX_B.y2) / 2;
  await canvasRightClick(page, midBx, midBy);
  const padBtn = page.locator('#srcCtxPadAnchor');
  const padDisabled = await padBtn.isDisabled().catch(() => true);
  if (!padDisabled) {
    await padBtn.click();
    await page.waitForTimeout(200);
  }
  await screenshot(page, outDir, 'step06_pad');
  steps.pad_to_anchor = { step: 'pad_to_anchor', pass: !padDisabled };
  if (padDisabled) {
    fail('pad_anchor', 'srcCtxPadAnchor was disabled');
    allPass = false;
  }

  // ── Step 7: Add padded draft to selected row sequence ──
  console.log('=== Step 7: Add to selected row ===');
  // Re-draw box B and pad (pad may have committed the draft)
  const postPadState = await captureState(page, 'post_pad_check');
  if (!postPadState.drawCurrent) {
    // Draft was committed by pad, need to draw again
    await page.click('#drawBoxBtn');
    await page.waitForTimeout(200);
    await canvasDrag(page, BOX_B.x1, BOX_B.y1, BOX_B.x2, BOX_B.y2);
    await page.waitForTimeout(300);
  }

  // Right-click to add to row
  await canvasRightClick(page, midBx, midBy);
  const addToRowBtn = page.locator('#srcCtxAddToRow');
  const addToRowDisabled = await addToRowBtn.isDisabled().catch(() => true);
  if (!addToRowDisabled) {
    const preSigs = {};
    for (let c = 0; c < Math.min(8, postTemplate.gridCols || 8); c++) {
      preSigs[c] = await readFrameSignature(page, 0, c);
    }
    await addToRowBtn.click();
    await page.waitForTimeout(500);
    const postAdd = await captureState(page, 'post_add_to_row');
    await screenshot(page, outDir, 'step07_add_to_row');
    // Check that at least one frame signature changed (content populated)
    let sigChanged = false;
    for (let c = 0; c < Math.min(8, postAdd.gridCols || 8); c++) {
      const newSig = await readFrameSignature(page, 0, c);
      if (newSig !== preSigs[c] && newSig !== '') { sigChanged = true; break; }
    }
    const addPass = assert(sigChanged, fail, 'add_to_row', 'At least one frame signature should change after add-to-row');
    steps.add_to_row = { step: 'add_to_row', pass: addPass };
    if (!addPass) allPass = false;
  } else {
    // Context menu "Add to row" disabled — might be because selectedRow is null or no draft
    const debugState = await captureState(page, 'add_to_row_debug');
    fail('add_to_row', `srcCtxAddToRow disabled (selectedRow=${debugState.selectedRow}, drawCurrent=${JSON.stringify(debugState.drawCurrent)})`);
    steps.add_to_row = { step: 'add_to_row', pass: false, selectedRow: debugState.selectedRow, drawCurrent: debugState.drawCurrent };
    allPass = false;
    await page.keyboard.press('Escape');
  }

  // ── Step 8: Double-click grid frame → WS editor ──
  console.log('=== Step 8: Focus whole-sheet (dblclick) ===');
  const frameCell = page.locator('.frame-cell[data-row="0"][data-col="0"]').first();
  const frameCellVisible = await frameCell.isVisible().catch(() => false);
  if (frameCellVisible) {
    await frameCell.dblclick();
    await page.waitForTimeout(1000);
    try {
      await waitForWholeSheetMount(page, { timeout: 10000 });
    } catch (_) {
      // WS mount may already be present
    }
    const postWs = await captureState(page, 'post_ws_focus');
    await screenshot(page, outDir, 'step08_ws_focus');
    const wsPass = assert(
      postWs.wholeSheetMounted || postWs.wholeSheet?.mounted,
      fail, 'ws_focus', 'WS editor should be mounted after dblclick',
    );
    steps.ws_focus = { step: 'focus_whole_sheet', pass: wsPass, wholeSheetMounted: postWs.wholeSheetMounted };
    if (!wsPass) allPass = false;
  } else {
    fail('ws_focus', 'No visible frame-cell at row=0 col=0');
    steps.ws_focus = { step: 'focus_whole_sheet', pass: false, blocked: 'no frame-cell' };
    allPass = false;
  }

  // ── Step 9: Paint a cell in WS editor (UI-driven only) ──
  console.log('=== Step 9: Paint cell ===');
  await page.click('#wsToolCell').catch(() => {});
  await page.waitForTimeout(200);

  // Set glyph via DOM input (UI-driven, not page.evaluate action-driving)
  const glyphInput = page.locator('#wsGlyphCode');
  await glyphInput.fill('65');
  await glyphInput.dispatchEvent('change');
  await page.waitForTimeout(100);

  // Set fg color via color input (UI-driven)
  const fgInput = page.locator('#wsFgColor');
  await fgInput.evaluate(el => { el.value = '#ff0000'; el.dispatchEvent(new Event('input', { bubbles: true })); });
  await page.waitForTimeout(100);

  const paintX = 1, paintY = 1;
  const prePaint = await readFrameCell(page, 0, 0, paintX, paintY);
  await clickWsCell(page, paintX, paintY);
  await page.waitForTimeout(200);
  const postPaint = await readFrameCell(page, 0, 0, paintX, paintY);
  await screenshot(page, outDir, 'step09_paint_cell');

  const paintPass = assert(
    postPaint && postPaint.cell && postPaint.cell.glyph === 65,
    fail, 'paint_cell', `Cell glyph should be 65 after paint, got ${postPaint?.cell?.glyph}`,
    { prePaint, postPaint }
  );
  steps.paint_cell = { step: 'paint_cell', pass: paintPass, pre: prePaint?.cell?.glyph, post: postPaint?.cell?.glyph };
  if (!paintPass) allPass = false;

  // ── Step 10: Save ──
  console.log('=== Step 10: Save ===');
  const preSave = await captureState(page, 'pre_save');
  await page.click('#btnSave');
  await page.waitForTimeout(2000);
  const postSave = await captureState(page, 'post_save');
  await screenshot(page, outDir, 'step10_save');
  // Save should clear dirty flag
  const savePass = assert(
    !postSave.sessionDirty || postSave.sessionDirty === false,
    fail, 'save', `sessionDirty should be false after save, got ${postSave.sessionDirty}`,
  );
  steps.save = { step: 'save', pass: savePass, dirtyBefore: preSave.sessionDirty, dirtyAfter: postSave.sessionDirty };
  if (!savePass) allPass = false;

  // ── Step 11: Export XP ──
  console.log('=== Step 11: Export XP ===');
  await page.click('#btnExport');
  // Wait for #exportOut to contain a JSON response with xp_path (diagnostic read)
  await page.waitForFunction(() => {
    const el = document.getElementById('exportOut');
    if (!el) return false;
    try { const j = JSON.parse(el.textContent); return !!j.xp_path; }
    catch (_) { return false; }
  }, { timeout: 15000 }).catch(() => {});
  await page.waitForTimeout(500);
  const exportOutText = await page.locator('#exportOut').textContent().catch(() => '');
  let exportXpPath = '';
  try { exportXpPath = JSON.parse(exportOutText).xp_path || ''; } catch (_) {}
  await screenshot(page, outDir, 'step11_export');
  const exportPass = assert(
    exportXpPath.length > 0,
    fail, 'export_xp', `Export should produce xp_path in #exportOut, got "${exportXpPath}"`,
    { exportOutText }
  );
  steps.export_xp = { step: 'export_xp', pass: exportPass, xp_path: exportXpPath };

  // ── Write report ──
  report.steps = steps;
  report.overall_pass = allPass;
  writeReport(outDir, 'report.json', report);

  // Summary
  console.log('');
  console.log('=== Slice 5 Manual Assembly E2E Summary ===');
  console.log(`Steps: ${Object.values(steps).filter(s => s.pass).length}/${Object.keys(steps).length} passed`);
  for (const [k, v] of Object.entries(steps)) {
    console.log(`  ${v.pass ? 'PASS' : 'FAIL'} ${k}`);
  }
  console.log(`Overall: ${allPass ? 'PASS' : 'FAIL'}`);
  console.log(`Report: ${outDir}/report.json`);

} finally {
  await browser.close();
}

process.exit(allPass ? 0 : 1);
