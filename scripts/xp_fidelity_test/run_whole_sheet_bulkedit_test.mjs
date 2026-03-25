#!/usr/bin/env node

/**
 * run_whole_sheet_bulkedit_test.mjs — W28-W31: Bulk-Edit Parity Proof
 *
 * CLASSIFICATION: UI-driven with diagnostic observation layer
 * ACTION PATH:    All actions via shipped DOM buttons (Fill Sel, Repl FG, Repl BG, F&R Apply)
 * OBSERVATION:    Cell verification via readFrameCell(), state via getState() (diagnostic)
 * ELIGIBLE FOR:   UI-driven acceptance evidence
 *
 * Validates:
 *   W28: Fill selection with active glyph/fg/bg (button #wsFillSel)
 *   W29: Replace FG in selection (button #wsReplaceFg)
 *   W30: Replace BG in selection (button #wsReplaceBg)
 *   W31: Find & Replace (sidebar section, button #wsFrApply)
 *        Scope semantics: 'selection' and 'canvas'
 *   Undo: Ctrl+Z reverts each bulk-edit as single operation
 *
 * Match-source contract (W29/W30):
 *   lastSampledCell is set only by the eyedropper tool.
 *   The user eyedroppers a cell to capture match colors,
 *   then changes fg/bg in the picker to set replacement colors,
 *   then clicks Repl FG / Repl BG.
 *
 * Strategy:
 *   1. Import XP → session with grid + WS editor
 *   2. Paint a known pattern at (4,4)-(5,5)
 *   3. W28: Select pattern, fill with new glyph → verify all cells filled
 *   4. Undo fill → verify reverted to original pattern
 *   5. W29: Eyedropper a red cell, change FG to yellow, Replace FG → verify
 *   6. W30: Eyedropper a cell, change BG, Replace BG → verify
 *   7. W31 (selection scope): Set up find/replace criteria, Apply → verify
 *   8. W31 (canvas scope): Replace all matching cells on canvas → verify
 *   9. Undo → verify single-operation revert
 *
 * Usage:
 *   node run_whole_sheet_bulkedit_test.mjs --xp sprites/attack-0001.xp --out-dir output/ws_bulkedit_test
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

async function setDrawState(page, glyph, fg, bg) {
  await page.fill('#wsGlyphCode', String(glyph));
  await page.locator('#wsGlyphCode').dispatchEvent('change');
  await page.fill('#wsFgColor', fg);
  await page.locator('#wsFgColor').dispatchEvent('input');
  await page.fill('#wsBgColor', bg);
  await page.locator('#wsBgColor').dispatchEvent('input');
  await page.waitForTimeout(100);
}

async function activateTool(page, selector) {
  await page.click(selector);
  await page.waitForTimeout(100);
}

async function getWsState(page) {
  return page.evaluate(() => {
    const ws = window.__wholeSheetEditor;
    return ws?.getState?.() ?? null;
  });
}

async function readWsCell(page, cx, cy) {
  return readFrameCell(page, 0, 0, cx, cy);
}

function colorsClose(a, b, tolerance = 2) {
  if (!a || !b) return false;
  return Math.abs(a[0] - b[0]) <= tolerance &&
         Math.abs(a[1] - b[1]) <= tolerance &&
         Math.abs(a[2] - b[2]) <= tolerance;
}

/** Extract the inner cell from readFrameCell result. */
function c(result) { return result?.cell ?? null; }

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main() {
  const { page, browser, report, fail, workbenchUrl, outDir, cliArgs } =
    await setupVerifier('whole_sheet_bulkedit', { requireOutDir: true });

  const xpPath = cliArgs.getArg('--xp');
  if (!xpPath) { console.error('Missing --xp <path>'); process.exit(1); }
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
  console.log('=== Step 2: Focus WS editor ===');
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
  await page.setViewportSize({ width: 1400, height: 2400 });
  await page.waitForTimeout(300);

  // ── Step 3: Paint known pattern ──
  // (BX,BY)=65/red  (BX+1,BY)=66/green
  // (BX,BY+1)=67/blue (BX+1,BY+1)=68/white
  console.log('=== Step 3: Paint known pattern ===');
  await activateTool(page, '#wsToolCell');

  await setDrawState(page, 65, '#ff0000', '#000000');
  await clickCell(page, BX, BY);
  await page.waitForTimeout(50);

  await setDrawState(page, 66, '#00ff00', '#000000');
  await clickCell(page, BX + 1, BY);
  await page.waitForTimeout(50);

  await setDrawState(page, 67, '#0000ff', '#110000');
  await clickCell(page, BX, BY + 1);
  await page.waitForTimeout(50);

  await setDrawState(page, 68, '#ffffff', '#220000');
  await clickCell(page, BX + 1, BY + 1);
  await page.waitForTimeout(100);

  await screenshot(page, outDir, 'step03_pattern');
  steps.paint_pattern = { step: 'paint_known_pattern', pass: true };

  // ── Step 4: W28 — Fill Selection ──
  console.log('=== Step 4: W28 — Fill Selection ===');
  await activateTool(page, '#wsToolSelect');
  await dragCells(page, BX, BY, BX + 1, BY + 1);
  await page.waitForTimeout(200);

  // Set fill glyph/colors
  await setDrawState(page, 88, '#ffff00', '#330000');
  await page.click('#wsFillSel');
  await page.waitForTimeout(200);

  const fillA = await readWsCell(page, BX, BY);
  const fillB = await readWsCell(page, BX + 1, BY);
  const fillC = await readWsCell(page, BX, BY + 1);
  const fillD = await readWsCell(page, BX + 1, BY + 1);

  const w28Pass = (c(fillA)?.glyph === 88) && (c(fillB)?.glyph === 88) &&
                  (c(fillC)?.glyph === 88) && (c(fillD)?.glyph === 88) &&
                  colorsClose(c(fillA)?.fg, [255, 255, 0]) &&
                  colorsClose(c(fillC)?.fg, [255, 255, 0]);

  steps.w28_fill = { step: 'W28_fill_selection', pass: w28Pass,
    cells: { fillA, fillB, fillC, fillD } };
  if (!w28Pass) { allPass = false; fail('W28', 'Fill selection did not write expected cells'); }
  console.log(`  W28 fill: ${w28Pass ? 'PASS' : 'FAIL'}`);
  await screenshot(page, outDir, 'step04_w28_fill');

  // ── Step 4b: Undo fill ──
  console.log('=== Step 4b: Undo fill ===');
  await page.keyboard.press('Control+z');
  await page.waitForTimeout(200);

  const undoA = await readWsCell(page, BX, BY);
  const undoB = await readWsCell(page, BX + 1, BY);
  const undoFillPass = (c(undoA)?.glyph === 65) && (c(undoB)?.glyph === 66);
  steps.w28_undo = { step: 'W28_undo_fill', pass: undoFillPass,
    cells: { undoA, undoB } };
  if (!undoFillPass) { allPass = false; fail('W28_undo', 'Undo did not revert fill'); }
  console.log(`  W28 undo: ${undoFillPass ? 'PASS' : 'FAIL'}`);

  // ── Step 5: W29 — Replace FG in selection ──
  // Eyedropper the red cell (BX,BY), change FG to yellow, Replace FG
  console.log('=== Step 5: W29 — Replace FG ===');
  await activateTool(page, '#wsToolEyedropper');
  await clickCell(page, BX, BY);   // sample glyph=65, fg=red, bg=black
  await page.waitForTimeout(200);

  // Now change the FG color to yellow — this becomes the replacement color
  await page.fill('#wsFgColor', '#ffff00');
  await page.locator('#wsFgColor').dispatchEvent('input');
  await page.waitForTimeout(100);

  // Select the 2x2 region, then Replace FG
  await activateTool(page, '#wsToolSelect');
  await dragCells(page, BX, BY, BX + 1, BY + 1);
  await page.waitForTimeout(200);
  await page.click('#wsReplaceFg');
  await page.waitForTimeout(200);

  const rFgA = await readWsCell(page, BX, BY);      // was red → should be yellow
  const rFgB = await readWsCell(page, BX + 1, BY);  // was green → stays green
  const w29Pass = colorsClose(c(rFgA)?.fg, [255, 255, 0]) &&
                  colorsClose(c(rFgB)?.fg, [0, 255, 0]);   // green unchanged
  steps.w29_replace_fg = { step: 'W29_replace_fg', pass: w29Pass,
    cells: { rFgA, rFgB } };
  if (!w29Pass) { allPass = false; fail('W29', 'Replace FG did not produce expected result'); }
  console.log(`  W29 replace FG: ${w29Pass ? 'PASS' : 'FAIL'}`);
  await screenshot(page, outDir, 'step05_w29_replacefg');

  // Undo W29 for clean state
  await page.keyboard.press('Control+z');
  await page.waitForTimeout(200);

  // ── Step 6: W30 — Replace BG in selection ──
  // Paint cells with distinct BGs first
  console.log('=== Step 6: W30 — Replace BG ===');
  // Eyedropper cell at (BX,BY+1) which has bg=#110000
  await activateTool(page, '#wsToolEyedropper');
  await clickCell(page, BX, BY + 1);
  await page.waitForTimeout(200);

  // Change BG to a new color
  await page.fill('#wsBgColor', '#00ff00');
  await page.locator('#wsBgColor').dispatchEvent('input');
  await page.waitForTimeout(100);

  // Select and replace
  await activateTool(page, '#wsToolSelect');
  await dragCells(page, BX, BY, BX + 1, BY + 1);
  await page.waitForTimeout(200);
  await page.click('#wsReplaceBg');
  await page.waitForTimeout(200);

  const rBgC = await readWsCell(page, BX, BY + 1);     // bg was #110000 → should be #00ff00
  const rBgA = await readWsCell(page, BX, BY);           // bg was #000000 → should stay
  const w30Pass = colorsClose(c(rBgC)?.bg, [0, 255, 0]) &&
                  colorsClose(c(rBgA)?.bg, [0, 0, 0]);
  steps.w30_replace_bg = { step: 'W30_replace_bg', pass: w30Pass,
    cells: { rBgC, rBgA } };
  if (!w30Pass) { allPass = false; fail('W30', 'Replace BG did not produce expected result'); }
  console.log(`  W30 replace BG: ${w30Pass ? 'PASS' : 'FAIL'}`);
  await screenshot(page, outDir, 'step06_w30_replacebg');

  // Undo W30 for clean state
  await page.keyboard.press('Control+z');
  await page.waitForTimeout(200);

  // ── Step 7: W31 — Find & Replace (selection scope) ──
  console.log('=== Step 7: W31 — Find & Replace (selection) ===');
  // Open the F&R details panel
  const frDetails = page.locator('#wholeSheetPanel details:has(#wsFrApply)');
  const frOpen = await frDetails.getAttribute('open').catch(() => null);
  if (frOpen === null) {
    await frDetails.locator('summary').click();
    await page.waitForTimeout(200);
  }

  // Select 2x2 region
  await activateTool(page, '#wsToolSelect');
  await dragCells(page, BX, BY, BX + 1, BY + 1);
  await page.waitForTimeout(200);

  // Match glyph=65 → replace glyph=90
  await page.check('#wsFrMatchGlyph');
  await page.fill('#wsFrFindGlyphVal', '65');
  await page.check('#wsFrReplGlyph');
  await page.fill('#wsFrReplGlyphVal', '90');
  // Uncheck color criteria to isolate glyph test
  await page.uncheck('#wsFrMatchFg');
  await page.uncheck('#wsFrMatchBg');
  await page.uncheck('#wsFrReplFg');
  await page.uncheck('#wsFrReplBg');

  // Scope = selection
  await page.selectOption('#wsFrScope', 'selection');
  await page.click('#wsFrApply');
  await page.waitForTimeout(200);

  const frSelA = await readWsCell(page, BX, BY);       // glyph 65→90
  const frSelB = await readWsCell(page, BX + 1, BY);   // glyph 66→unchanged
  const w31SelPass = (c(frSelA)?.glyph === 90) && (c(frSelB)?.glyph === 66);
  steps.w31_fr_selection = { step: 'W31_find_replace_selection', pass: w31SelPass,
    cells: { frSelA, frSelB } };
  if (!w31SelPass) { allPass = false; fail('W31_sel', 'F&R selection scope failed'); }
  console.log(`  W31 F&R (selection): ${w31SelPass ? 'PASS' : 'FAIL'}`);
  await screenshot(page, outDir, 'step07_w31_fr_selection');

  // ── Step 8: W31 — Find & Replace (canvas scope) ──
  console.log('=== Step 8: W31 — Find & Replace (canvas) ===');
  // Match glyph=90 (just replaced) → replace glyph=91, canvas scope
  await page.fill('#wsFrFindGlyphVal', '90');
  await page.fill('#wsFrReplGlyphVal', '91');
  await page.selectOption('#wsFrScope', 'canvas');
  await page.click('#wsFrApply');
  await page.waitForTimeout(200);

  const frCanvasA = await readWsCell(page, BX, BY);  // glyph 90→91
  const w31CanvasPass = (c(frCanvasA)?.glyph === 91);
  steps.w31_fr_canvas = { step: 'W31_find_replace_canvas', pass: w31CanvasPass,
    cells: { frCanvasA } };
  if (!w31CanvasPass) { allPass = false; fail('W31_canvas', 'F&R canvas scope failed'); }
  console.log(`  W31 F&R (canvas): ${w31CanvasPass ? 'PASS' : 'FAIL'}`);
  await screenshot(page, outDir, 'step08_w31_fr_canvas');

  // ── Step 9: Undo canvas F&R ──
  console.log('=== Step 9: Undo canvas F&R ===');
  await page.keyboard.press('Control+z');
  await page.waitForTimeout(200);
  const undoFrA = await readWsCell(page, BX, BY);
  const undoFrPass = (c(undoFrA)?.glyph === 90);  // reverted from 91 to 90
  steps.w31_undo = { step: 'W31_undo_fr', pass: undoFrPass,
    cells: { undoFrA } };
  if (!undoFrPass) { allPass = false; fail('W31_undo', 'Undo F&R did not revert'); }
  console.log(`  W31 undo: ${undoFrPass ? 'PASS' : 'FAIL'}`);

  // ── Final ──
  report.steps = steps;
  report.overall_pass = allPass;
  const summary = Object.entries(steps).map(([k, v]) => `${k}: ${v.pass ? 'PASS' : 'FAIL'}`).join('\n  ');
  console.log(`\n=== Results ===\n  ${summary}\nOverall: ${allPass ? 'PASS' : 'FAIL'}`);

  writeReport(outDir, 'report.json', report);
  writeJsonArtifact(outDir, 'steps.json', steps);
  await screenshot(page, outDir, 'final');
  await browser.close();
  process.exit(allPass ? 0 : 1);
}

main().catch(err => { console.error(err); process.exit(1); });
