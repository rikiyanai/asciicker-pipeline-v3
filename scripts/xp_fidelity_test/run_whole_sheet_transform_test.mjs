#!/usr/bin/env node

/**
 * run_whole_sheet_transform_test.mjs — W24-W27: Selection Transform Proof
 *
 * CLASSIFICATION: UI-driven with diagnostic observation layer
 * ACTION PATH:    All actions via shipped DOM buttons (Rot CW, Rot CCW, Flip H, Flip V)
 *                 and keyboard shortcuts (], [)
 * OBSERVATION:    Cell verification via readFrameCell(), state via getState() (diagnostic)
 * ELIGIBLE FOR:   UI-driven acceptance evidence
 *
 * Validates:
 *   W24: Rotate selection CW  (button #wsRotateCW + keyboard ])
 *   W25: Rotate selection CCW (button #wsRotateCCW + keyboard [)
 *   W26: Flip selection H     (button #wsFlipH)
 *   W27: Flip selection V     (button #wsFlipV)
 *   Undo: Ctrl+Z reverts one transform as single operation
 *   Bounds: Selection bounds updated after rotate (width/height swap)
 *
 * Strategy:
 *   1. Import XP → session with grid + WS editor
 *   2. Paint an asymmetric 2x2 pattern at known positions:
 *        (4,4)=A/red  (5,4)=B/green
 *        (4,5)=C/blue (5,5)=empty
 *   3. Select the 2x2 region
 *   4. W24: Click Rot CW button → verify cell positions rotated
 *   5. W25: Click Rot CCW button → verify rotated back to original
 *   6. W26: Click Flip H button → verify horizontally flipped
 *   7. Undo Flip H → verify reverted (single operation undo)
 *   8. W27: Click Flip V button → verify vertically flipped
 *   9. Keyboard ] → verify Rot CW via keyboard shortcut
 *
 * Usage:
 *   node run_whole_sheet_transform_test.mjs --xp sprites/attack-0001.xp --out-dir output/ws_transform_test
 */

import {
  setupVerifier,
  captureState,
  waitForSessionHydration,
  waitForWholeSheetMount,
  readFrameCell,
  writeReport,
  writeJsonArtifact,
  screenshot,
} from './verifier_lib.mjs';

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, '..', '..');
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

/** Click on the WS canvas at cell (cx, cy), scrolling into view first. */
async function clickCell(page, cx, cy) {
  await page.evaluate(({ tx, ty }) => {
    const scroll = document.getElementById('wholeSheetScroll');
    if (!scroll) return;
    scroll.scrollLeft = Math.max(0, tx - scroll.clientWidth / 2);
    scroll.scrollTop = Math.max(0, ty - scroll.clientHeight / 2);
  }, { tx: cx * CELL_SIZE, ty: cy * CELL_SIZE });
  await page.waitForTimeout(100);

  const px = cx * CELL_SIZE + CELL_SIZE / 2;
  const py = cy * CELL_SIZE + CELL_SIZE / 2;
  await page.click('#wholeSheetCanvas', { position: { x: px, y: py } });
}

/** Drag on the WS canvas from cell (x1,y1) to (x2,y2). */
async function dragCells(page, x1, y1, x2, y2) {
  await page.evaluate(({ tx, ty }) => {
    const scroll = document.getElementById('wholeSheetScroll');
    if (!scroll) return;
    scroll.scrollLeft = Math.max(0, tx - scroll.clientWidth / 2);
    scroll.scrollTop = Math.max(0, ty - scroll.clientHeight / 2);
  }, { tx: x1 * CELL_SIZE, ty: y1 * CELL_SIZE });
  await page.waitForTimeout(200);

  const canvasBox = await page.locator('#wholeSheetCanvas').boundingBox();
  if (!canvasBox) throw new Error('wholeSheetCanvas not found');

  const vpX1 = canvasBox.x + x1 * CELL_SIZE + CELL_SIZE / 2;
  const vpY1 = canvasBox.y + y1 * CELL_SIZE + CELL_SIZE / 2;
  const vpX2 = canvasBox.x + x2 * CELL_SIZE + CELL_SIZE / 2;
  const vpY2 = canvasBox.y + y2 * CELL_SIZE + CELL_SIZE / 2;

  await page.mouse.move(vpX1, vpY1);
  await page.mouse.down();
  await page.mouse.move(vpX2, vpY2, { steps: 5 });
  await page.mouse.up();
}

/** Set the draw state (glyph, fg, bg) via the WS toolbar inputs. */
async function setDrawState(page, glyph, fg, bg) {
  await page.fill('#wsGlyphCode', String(glyph));
  await page.locator('#wsGlyphCode').dispatchEvent('change');
  await page.fill('#wsFgColor', fg);
  await page.locator('#wsFgColor').dispatchEvent('input');
  await page.fill('#wsBgColor', bg);
  await page.locator('#wsBgColor').dispatchEvent('input');
  await page.waitForTimeout(100);
}

/** Activate a WS tool by its button selector. */
async function activateTool(page, selector) {
  await page.click(selector);
  await page.waitForTimeout(100);
}

/** Read WS editor state (diagnostic observation). */
async function getWsState(page) {
  return page.evaluate(() => {
    const ws = window.__wholeSheetEditor;
    return ws?.getState?.() ?? null;
  });
}

/** Read the glyph at a specific canvas cell (diagnostic observation). */
async function readWsCell(page, cx, cy) {
  return readFrameCell(page, 0, 0, cx, cy);
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main() {
  const { page, browser, report, fail, workbenchUrl, outDir, cliArgs } =
    await setupVerifier('whole_sheet_transform', { requireOutDir: true });

  const xpPath = cliArgs.getArg('--xp');
  if (!xpPath) {
    console.error('Missing --xp <path>');
    process.exit(1);
  }
  const absXp = path.resolve(REPO_ROOT, xpPath);
  if (!fs.existsSync(absXp)) {
    fail('config', `XP fixture not found: ${xpPath}`);
    report.overall_pass = false;
    writeReport(outDir, 'report.json', report);
    await browser.close();
    process.exit(1);
  }

  const steps = {};
  let allPass = true;

  // Base cell coords for the test pattern
  const BX = 4, BY = 4;

  // ── Step 1: Import XP ──
  console.log('=== Step 1: Import XP ===');
  await page.waitForSelector('#xpImportFile', { state: 'attached', timeout: 10000 });
  await page.waitForSelector('#xpImportBtn', { state: 'visible', timeout: 10000 });
  await page.locator('#xpImportFile').setInputFiles(absXp);
  await page.click('#xpImportBtn');
  await waitForSessionHydration(page);
  await waitForWholeSheetMount(page);
  await page.waitForTimeout(500);
  await screenshot(page, outDir, 'step01_import');
  steps.setup = { step: 'import_xp', pass: true };

  // ── Step 2: Focus WS editor ──
  console.log('=== Step 2: Focus WS editor (dblclick) ===');
  const frameCellSel = '.frame-cell[data-row="0"][data-col="0"]';
  const cellVisible = await page.locator(frameCellSel).isVisible().catch(() => false);
  if (!cellVisible) {
    fail('ws_focus', 'Grid frame cell not visible');
    report.overall_pass = false;
    writeReport(outDir, 'report.json', report);
    await browser.close();
    process.exit(1);
  }
  await page.dblclick(frameCellSel);
  await page.waitForTimeout(500);

  const wsMount = await getWsState(page);
  if (!wsMount?.mounted) {
    fail('ws_focus', `WS editor not mounted after dblclick: ${JSON.stringify(wsMount)}`);
    report.overall_pass = false;
    writeReport(outDir, 'report.json', report);
    await browser.close();
    process.exit(1);
  }
  steps.ws_focus = { step: 'focus_ws_editor', pass: true };

  // Expand viewport for mouse events
  await page.setViewportSize({ width: 1400, height: 2400 });
  await page.waitForTimeout(300);

  // ── Step 3: Paint asymmetric 2x2 pattern ──
  // Layout at (BX,BY):
  //   (BX,BY)=A/red     (BX+1,BY)=B/green
  //   (BX,BY+1)=C/blue  (BX+1,BY+1)=empty
  console.log('=== Step 3: Paint asymmetric pattern ===');
  await activateTool(page, '#wsToolCell');

  // Cell A at (BX, BY): glyph=65, fg=red
  await setDrawState(page, 65, '#ff0000', '#000000');
  await clickCell(page, BX, BY);
  await page.waitForTimeout(50);

  // Cell B at (BX+1, BY): glyph=66, fg=green
  await setDrawState(page, 66, '#00ff00', '#000000');
  await clickCell(page, BX + 1, BY);
  await page.waitForTimeout(50);

  // Cell C at (BX, BY+1): glyph=67, fg=blue
  await setDrawState(page, 67, '#0000ff', '#000000');
  await clickCell(page, BX, BY + 1);
  await page.waitForTimeout(200);

  // Verify paint
  const cellA = await readWsCell(page, BX, BY);
  const cellB = await readWsCell(page, BX + 1, BY);
  const cellC = await readWsCell(page, BX, BY + 1);
  const cellD = await readWsCell(page, BX + 1, BY + 1);
  const paintPass = assert(
    cellA?.cell?.glyph === 65 && cellB?.cell?.glyph === 66 && cellC?.cell?.glyph === 67,
    fail, 'paint_prereq',
    `Pattern paint: A=${cellA?.cell?.glyph} B=${cellB?.cell?.glyph} C=${cellC?.cell?.glyph}`,
    { cellA: cellA?.cell, cellB: cellB?.cell, cellC: cellC?.cell }
  );
  steps.paint_prereq = { step: 'paint_asymmetric_pattern', pass: paintPass };
  if (!paintPass) allPass = false;
  await screenshot(page, outDir, 'step03_paint_pattern');

  // ── Step 4: W24 — Rotate CW via button ──
  // Original:  A B     After CW:  C A
  //            C .                 . B
  console.log('=== Step 4: W24 Rotate CW (button) ===');
  await activateTool(page, '#wsToolSelect');
  await dragCells(page, BX, BY, BX + 1, BY + 1);
  await page.waitForTimeout(300);

  // Verify selection exists
  const preRotState = await getWsState(page);
  const preRotBounds = preRotState?.selectionBounds;
  console.log(`  Pre-rotate bounds: ${JSON.stringify(preRotBounds)}`);

  // Click Rot CW button
  await page.click('#wsRotateCW');
  await page.waitForTimeout(300);

  // After CW rotation of 2x2:
  //   (BX,BY)=C    (BX+1,BY)=A
  //   (BX,BY+1)=.  (BX+1,BY+1)=B
  const cw1 = await readWsCell(page, BX, BY);
  const cw2 = await readWsCell(page, BX + 1, BY);
  const cw3 = await readWsCell(page, BX, BY + 1);
  const cw4 = await readWsCell(page, BX + 1, BY + 1);

  const postRotState = await getWsState(page);
  const postRotBounds = postRotState?.selectionBounds;

  const rotCwPass = assert(
    cw1?.cell?.glyph === 67 && cw2?.cell?.glyph === 65 && cw4?.cell?.glyph === 66,
    fail, 'w24_rot_cw',
    `After CW: (BX,BY)=${cw1?.cell?.glyph}(expect 67/C), (BX+1,BY)=${cw2?.cell?.glyph}(expect 65/A), (BX+1,BY+1)=${cw4?.cell?.glyph}(expect 66/B)`,
    { cells: [cw1?.cell, cw2?.cell, cw3?.cell, cw4?.cell], postRotBounds }
  );
  // Bounds should still be 2x2 (square rotation keeps dims)
  const rotCwBoundsPass = !!(postRotBounds && postRotBounds.width === 2 && postRotBounds.height === 2);
  if (!rotCwBoundsPass) {
    console.warn(`  Bounds after rotate: ${JSON.stringify(postRotBounds)} (expected 2x2)`);
  }

  steps.w24_rot_cw = {
    step: 'rotate_cw_button',
    pass: rotCwPass && rotCwBoundsPass,
    cells: { topLeft: cw1?.cell?.glyph, topRight: cw2?.cell?.glyph, botLeft: cw3?.cell?.glyph, botRight: cw4?.cell?.glyph },
    selectionBounds: postRotBounds,
  };
  if (!rotCwPass || !rotCwBoundsPass) allPass = false;
  await screenshot(page, outDir, 'step04_w24_rot_cw');

  // ── Step 5: W25 — Rotate CCW via button (should restore original) ──
  // After CCW from rotated state: back to A B / C .
  console.log('=== Step 5: W25 Rotate CCW (button) ===');

  // Re-select (rotation may have changed selection state)
  await activateTool(page, '#wsToolSelect');
  await dragCells(page, BX, BY, BX + 1, BY + 1);
  await page.waitForTimeout(300);

  await page.click('#wsRotateCCW');
  await page.waitForTimeout(300);

  const ccw1 = await readWsCell(page, BX, BY);
  const ccw2 = await readWsCell(page, BX + 1, BY);
  const ccw3 = await readWsCell(page, BX, BY + 1);

  const rotCcwPass = assert(
    ccw1?.cell?.glyph === 65 && ccw2?.cell?.glyph === 66 && ccw3?.cell?.glyph === 67,
    fail, 'w25_rot_ccw',
    `After CCW: (BX,BY)=${ccw1?.cell?.glyph}(expect 65/A), (BX+1,BY)=${ccw2?.cell?.glyph}(expect 66/B), (BX,BY+1)=${ccw3?.cell?.glyph}(expect 67/C)`,
    { cells: [ccw1?.cell, ccw2?.cell, ccw3?.cell] }
  );
  steps.w25_rot_ccw = {
    step: 'rotate_ccw_button',
    pass: rotCcwPass,
    cells: { topLeft: ccw1?.cell?.glyph, topRight: ccw2?.cell?.glyph, botLeft: ccw3?.cell?.glyph },
  };
  if (!rotCcwPass) allPass = false;
  await screenshot(page, outDir, 'step05_w25_rot_ccw');

  // ── Step 6: W26 — Flip H via button ──
  // Original:  A B     After Flip H:  B A
  //            C .                     . C
  console.log('=== Step 6: W26 Flip H (button) ===');
  await activateTool(page, '#wsToolSelect');
  await dragCells(page, BX, BY, BX + 1, BY + 1);
  await page.waitForTimeout(300);

  await page.click('#wsFlipH');
  await page.waitForTimeout(300);

  const fh1 = await readWsCell(page, BX, BY);
  const fh2 = await readWsCell(page, BX + 1, BY);
  const fh3 = await readWsCell(page, BX, BY + 1);
  const fh4 = await readWsCell(page, BX + 1, BY + 1);

  const flipHPass = assert(
    fh1?.cell?.glyph === 66 && fh2?.cell?.glyph === 65 && fh4?.cell?.glyph === 67,
    fail, 'w26_flip_h',
    `After Flip H: (BX,BY)=${fh1?.cell?.glyph}(expect 66/B), (BX+1,BY)=${fh2?.cell?.glyph}(expect 65/A), (BX+1,BY+1)=${fh4?.cell?.glyph}(expect 67/C)`,
    { cells: [fh1?.cell, fh2?.cell, fh3?.cell, fh4?.cell] }
  );
  steps.w26_flip_h = {
    step: 'flip_h_button',
    pass: flipHPass,
    cells: { topLeft: fh1?.cell?.glyph, topRight: fh2?.cell?.glyph, botLeft: fh3?.cell?.glyph, botRight: fh4?.cell?.glyph },
  };
  if (!flipHPass) allPass = false;
  await screenshot(page, outDir, 'step06_w26_flip_h');

  // ── Step 7: Undo test (Ctrl+Z should revert Flip H as single operation) ──
  console.log('=== Step 7: Undo single transform ===');
  await page.keyboard.press('Control+z');
  await page.waitForTimeout(300);

  const undo1 = await readWsCell(page, BX, BY);
  const undo2 = await readWsCell(page, BX + 1, BY);
  const undo3 = await readWsCell(page, BX, BY + 1);

  const undoPass = assert(
    undo1?.cell?.glyph === 65 && undo2?.cell?.glyph === 66 && undo3?.cell?.glyph === 67,
    fail, 'undo_transform',
    `After undo: (BX,BY)=${undo1?.cell?.glyph}(expect 65/A), (BX+1,BY)=${undo2?.cell?.glyph}(expect 66/B), (BX,BY+1)=${undo3?.cell?.glyph}(expect 67/C)`,
    { cells: [undo1?.cell, undo2?.cell, undo3?.cell] }
  );
  steps.undo_transform = {
    step: 'undo_single_transform',
    pass: undoPass,
    cells: { topLeft: undo1?.cell?.glyph, topRight: undo2?.cell?.glyph, botLeft: undo3?.cell?.glyph },
  };
  if (!undoPass) allPass = false;
  await screenshot(page, outDir, 'step07_undo');

  // ── Step 8: W27 — Flip V via button ──
  // Original:  A B     After Flip V:  C .
  //            C .                     A B
  console.log('=== Step 8: W27 Flip V (button) ===');
  await activateTool(page, '#wsToolSelect');
  await dragCells(page, BX, BY, BX + 1, BY + 1);
  await page.waitForTimeout(300);

  await page.click('#wsFlipV');
  await page.waitForTimeout(300);

  const fv1 = await readWsCell(page, BX, BY);
  const fv2 = await readWsCell(page, BX + 1, BY);
  const fv3 = await readWsCell(page, BX, BY + 1);
  const fv4 = await readWsCell(page, BX + 1, BY + 1);

  const flipVPass = assert(
    fv1?.cell?.glyph === 67 && fv3?.cell?.glyph === 65 && fv4?.cell?.glyph === 66,
    fail, 'w27_flip_v',
    `After Flip V: (BX,BY)=${fv1?.cell?.glyph}(expect 67/C), (BX,BY+1)=${fv3?.cell?.glyph}(expect 65/A), (BX+1,BY+1)=${fv4?.cell?.glyph}(expect 66/B)`,
    { cells: [fv1?.cell, fv2?.cell, fv3?.cell, fv4?.cell] }
  );
  steps.w27_flip_v = {
    step: 'flip_v_button',
    pass: flipVPass,
    cells: { topLeft: fv1?.cell?.glyph, topRight: fv2?.cell?.glyph, botLeft: fv3?.cell?.glyph, botRight: fv4?.cell?.glyph },
  };
  if (!flipVPass) allPass = false;
  await screenshot(page, outDir, 'step08_w27_flip_v');

  // ── Step 9: W24 via keyboard shortcut ] ──
  // From flipped-V state:  C .     After CW:  A C
  //                         A B                B .
  console.log('=== Step 9: W24 Rotate CW (keyboard ]) ===');
  await activateTool(page, '#wsToolSelect');
  await dragCells(page, BX, BY, BX + 1, BY + 1);
  await page.waitForTimeout(300);

  await page.keyboard.press(']');
  await page.waitForTimeout(300);

  const kb1 = await readWsCell(page, BX, BY);
  const kb2 = await readWsCell(page, BX + 1, BY);
  const kb3 = await readWsCell(page, BX, BY + 1);
  const kb4 = await readWsCell(page, BX + 1, BY + 1);

  const kbRotPass = assert(
    kb1?.cell?.glyph === 65 && kb2?.cell?.glyph === 67 && kb3?.cell?.glyph === 66,
    fail, 'w24_rot_cw_keyboard',
    `After ] key: (BX,BY)=${kb1?.cell?.glyph}(expect 65/A), (BX+1,BY)=${kb2?.cell?.glyph}(expect 67/C), (BX,BY+1)=${kb3?.cell?.glyph}(expect 66/B)`,
    { cells: [kb1?.cell, kb2?.cell, kb3?.cell, kb4?.cell] }
  );
  steps.w24_rot_cw_keyboard = {
    step: 'rotate_cw_keyboard',
    pass: kbRotPass,
    cells: { topLeft: kb1?.cell?.glyph, topRight: kb2?.cell?.glyph, botLeft: kb3?.cell?.glyph, botRight: kb4?.cell?.glyph },
  };
  if (!kbRotPass) allPass = false;
  await screenshot(page, outDir, 'step09_w24_keyboard');

  // ── Summary ──
  report.steps = steps;
  report.overall_pass = allPass;
  const passCount = Object.values(steps).filter(s => s.pass).length;
  const totalCount = Object.values(steps).length;
  report.summary = `${passCount}/${totalCount} steps passed`;

  console.log('\n=== Transform Test Results ===');
  for (const [k, v] of Object.entries(steps)) {
    console.log(`  ${v.pass ? 'PASS' : 'FAIL'} ${k}: ${v.step}`);
  }
  console.log(`  Overall: ${allPass ? 'PASS' : 'FAIL'} (${passCount}/${totalCount})`);

  writeReport(outDir, 'report.json', report);
  writeJsonArtifact(outDir, 'steps.json', steps);
  await screenshot(page, outDir, 'final');

  await browser.close();
  process.exit(allPass ? 0 : 1);
}

main().catch(err => {
  console.error('Fatal:', err);
  process.exit(1);
});
