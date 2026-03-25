#!/usr/bin/env node

/**
 * run_whole_sheet_clipboard_test.mjs — W19-W23: Clipboard Operations Proof
 *
 * CLASSIFICATION: UI-driven with diagnostic observation layer
 * ACTION PATH:    All actions via DOM clicks, canvas mouse events, keyboard shortcuts
 * OBSERVATION:    Cell verification via readFrameCell(), state via getState() (diagnostic)
 * ELIGIBLE FOR:   UI-driven acceptance evidence
 *
 * Validates:
 *   W19: Copy selection (Ctrl+C after select drag)
 *   W20: Paste selection (Ctrl+V enters paste mode, click places content)
 *   W21: Cut selection (Ctrl+X — copies + clears source)
 *   W22: Delete/clear selection (Delete key clears selected cells)
 *   W23: Select all (Ctrl+A — selection bounds match canvas dimensions)
 *
 * Strategy:
 *   1. Import XP → session with grid + WS editor
 *   2. Paint known cells as content for clipboard ops
 *   3. W22: Select region → Delete → verify cells cleared
 *   4. W19: Paint cells, select → Ctrl+C → verify hasClipboard=true
 *   5. W20: Ctrl+V → verify pasteMode=true → click target → verify pasted cells
 *   6. W21: Paint fresh cells, select → Ctrl+X → verify source cleared + clipboard populated
 *   7. W23: Ctrl+A → verify selectionBounds matches canvas dimensions
 *
 * Usage:
 *   node run_whole_sheet_clipboard_test.mjs --xp sprites/attack-0001.xp --out-dir output/ws_clipboard_test
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

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main() {
  const { page, browser, report, fail, workbenchUrl, outDir, cliArgs } =
    await setupVerifier('whole_sheet_clipboard', { requireOutDir: true });

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

  // ── Step 3: Paint known content for clipboard tests ──
  // Paint a 3x2 block at (1,1)-(3,2) with glyph=65 ('A'), fg=#ff0000, bg=#0000ff
  console.log('=== Step 3: Paint content block ===');
  await activateTool(page, '#wsToolCell');
  await setDrawState(page, 65, '#ff0000', '#0000ff');

  for (let y = 1; y <= 2; y++) {
    for (let x = 1; x <= 3; x++) {
      await clickCell(page, x, y);
      await page.waitForTimeout(50);
    }
  }
  await page.waitForTimeout(300);

  // Verify paint landed
  const paintCheck = await readFrameCell(page, 0, 0, 2, 1);
  const paintPass = assert(
    paintCheck?.cell?.glyph === 65,
    fail, 'paint_prereq', `Cell (2,1) should have glyph=65, got ${paintCheck?.cell?.glyph}`,
    { paintCheck }
  );
  steps.paint_prereq = { step: 'paint_content_block', pass: paintPass };
  if (!paintPass) allPass = false;
  await screenshot(page, outDir, 'step03_paint_block');

  // ── Step 4: W22 — Delete/clear selection ──
  // Select the painted block, then Delete to clear it
  console.log('=== Step 4: W22 Delete selection ===');
  await activateTool(page, '#wsToolSelect');
  await dragCells(page, 1, 1, 3, 2);
  await page.waitForTimeout(200);

  // Verify selection exists
  const preDeleteState = await getWsState(page);
  const hasSelection = !!(preDeleteState?.selectionBounds);
  assert(hasSelection, fail, 'w22_select', `Selection should exist before delete, got ${JSON.stringify(preDeleteState?.selectionBounds)}`);

  // Delete via keyboard
  await page.keyboard.press('Delete');
  await page.waitForTimeout(300);

  // Verify cells cleared
  const afterDelete1 = await readFrameCell(page, 0, 0, 2, 1);
  const afterDelete2 = await readFrameCell(page, 0, 0, 1, 2);
  const deletePass = assert(
    afterDelete1?.cell?.glyph === 0 && afterDelete2?.cell?.glyph === 0,
    fail, 'w22_delete',
    `Cells should be cleared (glyph=0) after Delete: (2,1)=${afterDelete1?.cell?.glyph}, (1,2)=${afterDelete2?.cell?.glyph}`,
    { afterDelete1, afterDelete2 }
  );
  steps.w22_delete = { step: 'delete_selection', pass: deletePass };
  if (!deletePass) allPass = false;
  await screenshot(page, outDir, 'step04_w22_delete');

  // ── Step 5: Repaint for copy test ──
  console.log('=== Step 5: Repaint for copy/paste test ===');
  await activateTool(page, '#wsToolCell');
  await setDrawState(page, 66, '#00ff00', '#000000'); // glyph=66 ('B')

  for (let y = 1; y <= 2; y++) {
    for (let x = 1; x <= 3; x++) {
      await clickCell(page, x, y);
      await page.waitForTimeout(50);
    }
  }
  await page.waitForTimeout(300);

  // ── Step 6: W19 — Copy selection ──
  console.log('=== Step 6: W19 Copy selection (Ctrl+C) ===');
  await activateTool(page, '#wsToolSelect');
  await dragCells(page, 1, 1, 3, 2);
  await page.waitForTimeout(200);

  // Pre-copy state
  const preCopyState = await getWsState(page);
  const preCopyClip = preCopyState?.hasClipboard ?? false;

  // Copy via Ctrl+C
  await page.keyboard.press('Control+c');
  await page.waitForTimeout(200);

  const postCopyState = await getWsState(page);
  const copyPass = assert(
    postCopyState?.hasClipboard === true && postCopyState?.clipboardCellCount === 6,
    fail, 'w19_copy',
    `After Ctrl+C: hasClipboard should be true with 6 cells, got hasClipboard=${postCopyState?.hasClipboard}, count=${postCopyState?.clipboardCellCount}`,
    { preCopyClip, postCopyState }
  );
  steps.w19_copy = {
    step: 'copy_selection',
    pass: copyPass,
    hasClipboard: postCopyState?.hasClipboard,
    clipboardCellCount: postCopyState?.clipboardCellCount,
  };
  if (!copyPass) allPass = false;
  await screenshot(page, outDir, 'step06_w19_copy');

  // ── Step 7: W20 — Paste selection ──
  // Ctrl+V enters paste mode, then click at target position to place content
  console.log('=== Step 7: W20 Paste selection (Ctrl+V + click) ===');

  // Enter paste mode
  await page.keyboard.press('Control+v');
  await page.waitForTimeout(200);

  const pasteModeState = await getWsState(page);
  const pasteModePass = assert(
    pasteModeState?.pasteMode === true,
    fail, 'w20_paste_mode',
    `After Ctrl+V: pasteMode should be true, got ${pasteModeState?.pasteMode}`,
    { pasteModeState }
  );

  // Click at target position (5,5) to place pasted content
  const pasteTargetX = 5, pasteTargetY = 5;
  await clickCell(page, pasteTargetX, pasteTargetY);
  await page.waitForTimeout(300);

  // Verify pasted cells: the 3x2 block of glyph=66 should appear at (5,5)-(7,6)
  const pastedCell1 = await readFrameCell(page, 0, 0, pasteTargetX, pasteTargetY);
  const pastedCell2 = await readFrameCell(page, 0, 0, pasteTargetX + 1, pasteTargetY + 1);
  const pasteContentPass = assert(
    pastedCell1?.cell?.glyph === 66 && pastedCell2?.cell?.glyph === 66,
    fail, 'w20_paste_content',
    `Pasted cells should have glyph=66: (${pasteTargetX},${pasteTargetY})=${pastedCell1?.cell?.glyph}, (${pasteTargetX + 1},${pasteTargetY + 1})=${pastedCell2?.cell?.glyph}`,
    { pastedCell1, pastedCell2 }
  );

  // Verify paste mode exited
  const afterPasteState = await getWsState(page);
  const pasteModeExited = afterPasteState?.pasteMode === false;

  const pastePass = pasteModePass && pasteContentPass && pasteModeExited;
  steps.w20_paste = {
    step: 'paste_selection',
    pass: pastePass,
    pasteModeEntered: pasteModeState?.pasteMode,
    pasteModeExited,
    pastedCells: { cell1: pastedCell1?.cell, cell2: pastedCell2?.cell },
  };
  if (!pastePass) allPass = false;
  await screenshot(page, outDir, 'step07_w20_paste');

  // ── Step 8: W21 — Cut selection ──
  // Paint fresh content, select, Ctrl+X → source cleared + clipboard populated
  console.log('=== Step 8: W21 Cut selection (Ctrl+X) ===');
  await activateTool(page, '#wsToolCell');
  await setDrawState(page, 67, '#ffff00', '#000000'); // glyph=67 ('C')

  // Paint a 2x2 block at (1,5)-(2,6)
  for (let y = 5; y <= 6; y++) {
    for (let x = 1; x <= 2; x++) {
      await clickCell(page, x, y);
      await page.waitForTimeout(50);
    }
  }
  await page.waitForTimeout(300);

  // Verify paint landed
  const cutPreCheck = await readFrameCell(page, 0, 0, 1, 5);
  if (cutPreCheck?.cell?.glyph !== 67) {
    fail('w21_cut_prereq', `Cut prerequisite paint failed: expected glyph=67 at (1,5), got ${cutPreCheck?.cell?.glyph}`);
  }

  // Select the block
  await activateTool(page, '#wsToolSelect');
  await dragCells(page, 1, 5, 2, 6);
  await page.waitForTimeout(200);

  // Cut via Ctrl+X
  await page.keyboard.press('Control+x');
  await page.waitForTimeout(300);

  // Verify source cells cleared
  const cutSource1 = await readFrameCell(page, 0, 0, 1, 5);
  const cutSource2 = await readFrameCell(page, 0, 0, 2, 6);
  const cutSourceCleared = cutSource1?.cell?.glyph === 0 && cutSource2?.cell?.glyph === 0;

  // Verify clipboard populated
  const cutState = await getWsState(page);
  const cutClipboard = cutState?.hasClipboard === true && cutState?.clipboardCellCount === 4;

  const cutPass = assert(
    cutSourceCleared && cutClipboard,
    fail, 'w21_cut',
    `After Ctrl+X: source should be cleared (glyph=0) and clipboard should have 4 cells. Source: (1,5)=${cutSource1?.cell?.glyph}, (2,6)=${cutSource2?.cell?.glyph}. Clipboard: has=${cutState?.hasClipboard}, count=${cutState?.clipboardCellCount}`,
    { cutSource1, cutSource2, cutState }
  );
  steps.w21_cut = {
    step: 'cut_selection',
    pass: cutPass,
    sourceClearedGlyphs: [cutSource1?.cell?.glyph, cutSource2?.cell?.glyph],
    hasClipboard: cutState?.hasClipboard,
    clipboardCellCount: cutState?.clipboardCellCount,
  };
  if (!cutPass) allPass = false;
  await screenshot(page, outDir, 'step08_w21_cut');

  // ── Step 9: W23 — Select All (Ctrl+A) [non-blocking] ──
  // W23 is bonus/optional per handoff. W19-W22 are the required minimum.
  console.log('=== Step 9: W23 Select all (Ctrl+A) [non-blocking] ===');
  await page.keyboard.press('Control+a');
  await page.waitForTimeout(200);

  const selectAllState = await getWsState(page);
  const saBounds = selectAllState?.selectionBounds;
  const canvasW = selectAllState?.gridCols;
  const canvasH = selectAllState?.gridRows;

  const selectAllPass = saBounds && saBounds.x === 0 && saBounds.y === 0 &&
    saBounds.width === canvasW && saBounds.height === canvasH;
  if (!selectAllPass) {
    console.warn(`  [W23 FAIL] Select-all bounds mismatch. Got ${JSON.stringify(saBounds)}, expected ${canvasW}x${canvasH}`);
  }
  steps.w23_select_all = {
    step: 'select_all',
    pass: selectAllPass,
    blocking: true,
    selectionBounds: saBounds,
    canvasDimensions: { w: canvasW, h: canvasH },
  };
  if (!selectAllPass) allPass = false;
  await screenshot(page, outDir, 'step09_w23_select_all');

  // ── Summary ──
  report.steps = steps;
  report.overall_pass = allPass;
  const passCount = Object.values(steps).filter(s => s.pass).length;
  const totalCount = Object.values(steps).length;
  report.summary = `${passCount}/${totalCount} steps passed`;

  console.log('\n=== Clipboard Test Results ===');
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
