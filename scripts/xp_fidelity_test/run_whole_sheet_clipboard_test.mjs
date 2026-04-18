#!/usr/bin/env node

/**
 * run_whole_sheet_clipboard_test.mjs — W19-W23: Clipboard Operations Proof
 *
 * CLASSIFICATION: UI-driven with diagnostic observation layer
 * ACTION PATH:    All actions via DOM clicks, shipped whole-sheet buttons, canvas mouse events
 * OBSERVATION:    Layer/cell verification via diagnostic state reads only
 * ELIGIBLE FOR:   UI-driven acceptance evidence
 *
 * Validates:
 *   W19: Copy selection from shipped Copy button after select drag
 *   W20: Paste selection from shipped Paste button + canvas click
 *   W21: Cut selection from shipped Cut button
 *   W22: Delete/clear selection from shipped Clear button
 *   W23: Select all (Ctrl+A — selection bounds match canvas dimensions)
 *   Layer-preserving clipboard semantics across every visible layer
 *
 * Strategy:
 *   1. Import XP → session with grid + WS editor
 *   2. Show three layers and paint distinct content on each visible layer
 *   3. W22: Select region → Clear button → verify every visible layer is cleared
 *   4. W19: Repaint layered block → Copy button → verify layered clipboard payload size
 *   5. W20: Paste button → click target → verify every layer pastes independently
 *   6. W21: Paint fresh layered block → Cut button → verify source cleared on all visible layers
 *   7. W23: Ctrl+A → verify selectionBounds matches canvas dimensions
 *
 * Usage:
 *   node run_whole_sheet_clipboard_test.mjs --xp sprites/attack-0001.xp --out-dir output/ws_clipboard_test
 */

import {
  setupVerifier,
  waitForSessionHydration,
  waitForWholeSheetMount,
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

async function getRenderedCellSize(page) {
  return page.evaluate((baseCellSize) => {
    const ws = window.__wholeSheetEditor;
    const state = ws?.getState?.() ?? null;
    const zoom = Math.max(0.05, Number(state?.appliedCanvasZoom || 1));
    return baseCellSize * zoom;
  }, CELL_SIZE);
}

/** Click on the WS canvas at cell (cx, cy), scrolling into view first. */
async function clickCell(page, cx, cy) {
  const renderedCellSize = await getRenderedCellSize(page);
  await page.evaluate(({ tx, ty }) => {
    const scroll = document.getElementById('wholeSheetScroll');
    if (!scroll) return;
    scroll.scrollLeft = Math.max(0, tx - scroll.clientWidth / 2);
    scroll.scrollTop = Math.max(0, ty - scroll.clientHeight / 2);
  }, { tx: cx * renderedCellSize, ty: cy * renderedCellSize });
  await page.waitForTimeout(100);

  const px = cx * renderedCellSize + renderedCellSize / 2;
  const py = cy * renderedCellSize + renderedCellSize / 2;
  await page.click('#wholeSheetCanvas', { position: { x: px, y: py } });
}

/** Drag on the WS canvas from cell (x1,y1) to (x2,y2). */
async function dragCells(page, x1, y1, x2, y2) {
  const renderedCellSize = await getRenderedCellSize(page);
  await page.evaluate(({ tx, ty }) => {
    const scroll = document.getElementById('wholeSheetScroll');
    if (!scroll) return;
    scroll.scrollLeft = Math.max(0, tx - scroll.clientWidth / 2);
    scroll.scrollTop = Math.max(0, ty - scroll.clientHeight / 2);
  }, { tx: x1 * renderedCellSize, ty: y1 * renderedCellSize });
  await page.waitForTimeout(200);

  const canvasBox = await page.locator('#wholeSheetCanvas').boundingBox();
  if (!canvasBox) throw new Error('wholeSheetCanvas not found');

  const vpX1 = canvasBox.x + x1 * renderedCellSize + renderedCellSize / 2;
  const vpY1 = canvasBox.y + y1 * renderedCellSize + renderedCellSize / 2;
  const vpX2 = canvasBox.x + x2 * renderedCellSize + renderedCellSize / 2;
  const vpY2 = canvasBox.y + y2 * renderedCellSize + renderedCellSize / 2;

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

async function setLayerVisible(page, layerIndex, visible) {
  const row = page.locator('.ws-layer-row').nth(layerIndex);
  const btn = row.locator('.ws-layer-vis-btn');
  const current = (await btn.textContent())?.trim() === 'V';
  if (current !== visible) {
    await btn.click();
    await page.waitForTimeout(100);
  }
}

async function setActiveLayer(page, layerIndex) {
  await page.locator('.ws-layer-row').nth(layerIndex).click();
  await page.waitForTimeout(100);
}

async function readLayerCell(page, layerIndex, x, y) {
  return page.evaluate(([li, cx, cy]) => {
    const state = window.__wb_debug?._state?.();
    const width = Number(state?.gridCols || 0);
    const layer = state?.layers?.[li];
    if (!width || !Array.isArray(layer)) return null;
    const idx = (cy * width) + cx;
    const cell = layer[idx];
    if (!cell) return null;
    return {
      glyph: Number(cell.glyph || 0),
      fg: [...(cell.fg || [0, 0, 0])],
      bg: [...(cell.bg || [0, 0, 0])],
    };
  }, [layerIndex, x, y]);
}

async function paintBlockOnLayer(page, {
  layerIndex,
  glyph,
  fg,
  bg,
  x1,
  y1,
  x2,
  y2,
}) {
  await setActiveLayer(page, layerIndex);
  await activateTool(page, '#wsToolCell');
  await setDrawState(page, glyph, fg, bg);
  for (let y = y1; y <= y2; y++) {
    for (let x = x1; x <= x2; x++) {
      await clickCell(page, x, y);
      await page.waitForTimeout(40);
    }
  }
  await page.waitForTimeout(120);
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main() {
  const { page, browser, report, fail, outDir, cliArgs } =
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

  // ── Step 3: Paint known layered content for clipboard tests ──
  console.log('=== Step 3: Paint layered content block ===');
  await setLayerVisible(page, 0, true);
  await setLayerVisible(page, 1, true);
  await setLayerVisible(page, 2, true);

  await paintBlockOnLayer(page, { layerIndex: 0, glyph: 65, fg: '#ff0000', bg: '#000000', x1: 1, y1: 1, x2: 3, y2: 2 });
  await paintBlockOnLayer(page, { layerIndex: 1, glyph: 66, fg: '#00ff00', bg: '#000000', x1: 1, y1: 1, x2: 3, y2: 2 });
  await paintBlockOnLayer(page, { layerIndex: 2, glyph: 67, fg: '#0000ff', bg: '#000000', x1: 1, y1: 1, x2: 3, y2: 2 });

  const layerPaintChecks = await Promise.all([
    readLayerCell(page, 0, 2, 1),
    readLayerCell(page, 1, 2, 1),
    readLayerCell(page, 2, 2, 1),
  ]);
  const paintPass = assert(
    layerPaintChecks[0]?.glyph === 65 && layerPaintChecks[1]?.glyph === 66 && layerPaintChecks[2]?.glyph === 67,
    fail,
    'paint_prereq',
    `Layer paint prereq failed: expected glyphs 65/66/67 at (2,1), got ${layerPaintChecks.map((cell) => cell?.glyph).join('/')}`,
    { layerPaintChecks }
  );
  steps.paint_prereq = {
    step: 'paint_layered_content_block',
    pass: paintPass,
    layerGlyphs: layerPaintChecks.map((cell) => cell?.glyph),
  };
  if (!paintPass) allPass = false;
  await screenshot(page, outDir, 'step03_paint_block');

  // ── Step 4: W22 — Clear selection via shipped button ──
  console.log('=== Step 4: W22 Clear selection (button) ===');
  await activateTool(page, '#wsToolSelect');
  await dragCells(page, 1, 1, 3, 2);
  await page.waitForTimeout(200);

  // Verify selection exists
  const preDeleteState = await getWsState(page);
  const hasSelection = !!(preDeleteState?.selectionBounds);
  assert(hasSelection, fail, 'w22_select', `Selection should exist before delete, got ${JSON.stringify(preDeleteState?.selectionBounds)}`);

  await page.click('#wsClearSelection');
  await page.waitForTimeout(300);

  const afterDelete1 = await readLayerCell(page, 0, 2, 1);
  const afterDelete2 = await readLayerCell(page, 1, 1, 2);
  const afterDelete3 = await readLayerCell(page, 2, 2, 1);
  const deletePass = assert(
    afterDelete1?.glyph === 0 && afterDelete2?.glyph === 0 && afterDelete3?.glyph === 0,
    fail, 'w22_delete',
    `Layered clear should zero all visible layers, got ${[afterDelete1?.glyph, afterDelete2?.glyph, afterDelete3?.glyph].join('/')}`,
    { afterDelete1, afterDelete2, afterDelete3 }
  );
  steps.w22_delete = { step: 'delete_selection', pass: deletePass };
  if (!deletePass) allPass = false;
  await screenshot(page, outDir, 'step04_w22_delete');

  // ── Step 5: Repaint for copy test ──
  console.log('=== Step 5: Repaint layered block for copy/paste test ===');
  await paintBlockOnLayer(page, { layerIndex: 0, glyph: 68, fg: '#ff8800', bg: '#000000', x1: 1, y1: 1, x2: 3, y2: 2 });
  await paintBlockOnLayer(page, { layerIndex: 1, glyph: 69, fg: '#00ffaa', bg: '#000000', x1: 1, y1: 1, x2: 3, y2: 2 });
  await paintBlockOnLayer(page, { layerIndex: 2, glyph: 70, fg: '#aa00ff', bg: '#000000', x1: 1, y1: 1, x2: 3, y2: 2 });

  // ── Step 6: W19 — Copy selection ──
  console.log('=== Step 6: W19 Copy selection (button) ===');
  await activateTool(page, '#wsToolSelect');
  await dragCells(page, 1, 1, 3, 2);
  await page.waitForTimeout(200);

  // Pre-copy state
  const preCopyState = await getWsState(page);
  const preCopyClip = preCopyState?.hasClipboard ?? false;

  await page.click('#wsCopySelection');
  await page.waitForTimeout(200);

  const postCopyState = await getWsState(page);
  const copyPass = assert(
    postCopyState?.hasClipboard === true && postCopyState?.clipboardCellCount === 18,
    fail, 'w19_copy',
    `After Copy: hasClipboard should be true with 18 layer-cells, got hasClipboard=${postCopyState?.hasClipboard}, count=${postCopyState?.clipboardCellCount}`,
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
  console.log('=== Step 7: W20 Paste selection (button + click) ===');

  await page.click('#wsPasteSelection');
  await page.waitForTimeout(200);

  const pasteModeState = await getWsState(page);
  const pasteModePass = assert(
    pasteModeState?.pasteMode === true,
    fail, 'w20_paste_mode',
    `After Paste button: pasteMode should be true, got ${pasteModeState?.pasteMode}`,
    { pasteModeState }
  );

  const pasteTargetX = 5, pasteTargetY = 5;
  await clickCell(page, pasteTargetX, pasteTargetY);
  await page.waitForTimeout(300);

  const pastedCell1 = await readLayerCell(page, 0, pasteTargetX, pasteTargetY);
  const pastedCell2 = await readLayerCell(page, 1, pasteTargetX + 1, pasteTargetY + 1);
  const pastedCell3 = await readLayerCell(page, 2, pasteTargetX, pasteTargetY);
  const pasteContentPass = assert(
    pastedCell1?.glyph === 68 && pastedCell2?.glyph === 69 && pastedCell3?.glyph === 70,
    fail, 'w20_paste_content',
    `Pasted layer glyphs should be 68/69/70, got ${[pastedCell1?.glyph, pastedCell2?.glyph, pastedCell3?.glyph].join('/')}`,
    { pastedCell1, pastedCell2, pastedCell3 }
  );

  const afterPasteState = await getWsState(page);
  const pasteModeExited = afterPasteState?.pasteMode === false;

  const pastePass = pasteModePass && pasteContentPass && pasteModeExited;
  steps.w20_paste = {
    step: 'paste_selection',
    pass: pastePass,
    pasteModeEntered: pasteModeState?.pasteMode,
    pasteModeExited,
    pastedCells: { layer0: pastedCell1, layer1: pastedCell2, layer2: pastedCell3 },
  };
  if (!pastePass) allPass = false;
  await screenshot(page, outDir, 'step07_w20_paste');

  // ── Step 8: W21 — Cut selection ──
  console.log('=== Step 8: W21 Cut selection (button) ===');
  await paintBlockOnLayer(page, { layerIndex: 0, glyph: 71, fg: '#ffff00', bg: '#000000', x1: 1, y1: 5, x2: 2, y2: 6 });
  await paintBlockOnLayer(page, { layerIndex: 1, glyph: 72, fg: '#00ffff', bg: '#000000', x1: 1, y1: 5, x2: 2, y2: 6 });
  await paintBlockOnLayer(page, { layerIndex: 2, glyph: 73, fg: '#ff00ff', bg: '#000000', x1: 1, y1: 5, x2: 2, y2: 6 });

  await activateTool(page, '#wsToolSelect');
  await dragCells(page, 1, 5, 2, 6);
  await page.waitForTimeout(200);

  await page.click('#wsCutSelection');
  await page.waitForTimeout(300);

  const cutSource1 = await readLayerCell(page, 0, 1, 5);
  const cutSource2 = await readLayerCell(page, 1, 2, 6);
  const cutSource3 = await readLayerCell(page, 2, 1, 5);
  const cutSourceCleared = cutSource1?.glyph === 0 && cutSource2?.glyph === 0 && cutSource3?.glyph === 0;

  const cutState = await getWsState(page);
  const cutClipboard = cutState?.hasClipboard === true && cutState?.clipboardCellCount === 12;

  const cutPass = assert(
    cutSourceCleared && cutClipboard,
    fail, 'w21_cut',
    `After Cut: source should be cleared across layers and clipboard should have 12 layer-cells. Source glyphs=${[cutSource1?.glyph, cutSource2?.glyph, cutSource3?.glyph].join('/')}. Clipboard: has=${cutState?.hasClipboard}, count=${cutState?.clipboardCellCount}`,
    { cutSource1, cutSource2, cutSource3, cutState }
  );
  steps.w21_cut = {
    step: 'cut_selection',
    pass: cutPass,
    sourceClearedGlyphs: [cutSource1?.glyph, cutSource2?.glyph, cutSource3?.glyph],
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
