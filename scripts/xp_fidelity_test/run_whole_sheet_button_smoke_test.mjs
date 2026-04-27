#!/usr/bin/env node

/**
 * run_whole_sheet_button_smoke_test.mjs
 *
 * CLASSIFICATION: UI-driven with diagnostic observation layer
 * ACTION PATH:    Shipped whole-sheet buttons, browse buttons, wrapper layer controls
 * OBSERVATION:    State reads via __wholeSheetEditor.getState(), __wholeSheetEditor.getLayerInfo(),
 *                 and __wb_debug.getState()
 * ELIGIBLE FOR:   UI-driven acceptance evidence
 *
 * Validates the button lanes not covered cleanly by the existing whole-sheet
 * proof scripts:
 *   - all whole-sheet tool buttons switch the active tool
 *   - Paint / Browse mode buttons switch modes
 *   - Browse Reload / Duplicate / Rename / Open / Delete work through shipped buttons
 *   - Resize button accepts unrestricted dimensions and resizes the live document
 *   - wrapper layer select / visibility controls still operate on the mounted root editor
 *
 * Usage:
 *   node scripts/xp_fidelity_test/run_whole_sheet_button_smoke_test.mjs \
 *     --xp sprites/attack-0001.xp \
 *     --url http://127.0.0.1:5071/workbench \
 *     --out-dir output/ws_button_smoke_root \
 *     --headed
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

import {
  setupVerifier,
  captureState,
  waitForSessionHydration,
  waitForWholeSheetMount,
  writeJsonArtifact,
  writeReport,
  screenshot,
} from './verifier_lib.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, '..', '..');

function assert(condition, failFn, cls, message, extra = {}) {
  if (!condition) {
    failFn(cls, message, extra);
    return false;
  }
  return true;
}

async function getWsState(page) {
  return page.evaluate(() => {
    const ws = window.__wholeSheetEditor;
    return ws?.getState?.() ?? null;
  });
}

async function getLayerInfo(page) {
  return page.evaluate(() => {
    const ws = window.__wholeSheetEditor;
    return ws?.getLayerInfo?.() ?? [];
  });
}

async function getWorkbenchState(page) {
  return page.evaluate(() => {
    return window.__wb_debug?.getState?.() ?? null;
  });
}

async function browseTitles(page) {
  return page.locator('.ws-browse-item-title').allTextContents();
}

async function browseCount(page) {
  return page.locator('.ws-browse-item').count();
}

async function selectBrowseRowByTitle(page, title) {
  const rows = page.locator('.ws-browse-item');
  const count = await rows.count();
  for (let i = 0; i < count; i++) {
    const text = (await rows.nth(i).locator('.ws-browse-item-title').textContent()) || '';
    if (text.trim() === title) {
      await rows.nth(i).click();
      return true;
    }
  }
  return false;
}

async function selectFirstNonCurrentBrowseRow(page) {
  const rows = page.locator('.ws-browse-item');
  const count = await rows.count();
  for (let i = 0; i < count; i++) {
    const cls = (await rows.nth(i).getAttribute('class')) || '';
    if (!cls.includes('ws-browse-item-current')) {
      await rows.nth(i).click();
      return true;
    }
  }
  return false;
}

async function main() {
  const { page, browser, report, fail, outDir, cliArgs } =
    await setupVerifier('whole_sheet_button_smoke', { requireOutDir: true });

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

  console.log('=== Step 1: Import XP ===');
  await page.waitForSelector('#xpImportFile', { state: 'attached', timeout: 10000 });
  await page.waitForSelector('#xpImportBtn', { state: 'visible', timeout: 10000 });
  await page.locator('#xpImportFile').setInputFiles(absXp);
  await page.click('#xpImportBtn');
  await waitForSessionHydration(page);
  await waitForWholeSheetMount(page);
  await page.waitForTimeout(500);

  const baselineWs = await getWsState(page);
  const baselineWb = await getWorkbenchState(page);
  await screenshot(page, outDir, 'step01_imported');

  const importPass = assert(
    baselineWs && baselineWb?.sessionId,
    fail, 'setup', 'Whole-sheet mount/session did not initialize after XP import',
    { baselineWs, baselineWb }
  );
  steps.setup = { step: 'import_xp', pass: importPass, sessionId: baselineWb?.sessionId || '' };
  if (!importPass) allPass = false;

  console.log('=== Step 2: Tool button smoke ===');
  const toolButtons = [
    ['#wsToolCell', 'cell'],
    ['#wsToolEyedropper', 'eyedropper'],
    ['#wsToolErase', 'erase'],
    ['#wsToolLine', 'line'],
    ['#wsToolRect', 'rect'],
    ['#wsToolOval', 'oval'],
    ['#wsToolFill', 'fill'],
    ['#wsToolText', 'text'],
    ['#wsToolSelect', 'select'],
  ];
  const toolResults = [];
  for (const [selector, expected] of toolButtons) {
    await page.click(selector);
    await page.waitForTimeout(150);
    const state = await getWsState(page);
    const pass = assert(
      state?.activeTool === expected,
      fail, 'tool_button', `${selector} should activate ${expected}, got ${state?.activeTool}`,
      { selector, expected, actual: state?.activeTool }
    );
    toolResults.push({ selector, expected, actual: state?.activeTool || null, pass });
    if (!pass) allPass = false;
  }
  await screenshot(page, outDir, 'step02_tools');
  steps.tool_buttons = {
    step: 'tool_buttons',
    pass: toolResults.every((item) => item.pass),
    results: toolResults,
  };

  console.log('=== Step 3: Mode + browse buttons smoke ===');
  await page.click('#wsModeBrowse');
  await page.waitForTimeout(300);
  const browseModeState = await getWsState(page);
  const browseModePass = assert(
    browseModeState?.mode === 'browse',
    fail, 'mode_switch', `Browse mode should be active, got ${browseModeState?.mode}`,
    { browseModeState }
  );
  if (!browseModePass) allPass = false;

  await page.click('#wsBrowseReload');
  await page.waitForTimeout(500);
  const beforeDuplicateCount = await browseCount(page);
  const beforeTitles = await browseTitles(page);

  const currentRow = page.locator('.ws-browse-item-current').first();
  const currentExists = await currentRow.count();
  const currentTitle = currentExists
    ? ((await currentRow.locator('.ws-browse-item-title').textContent()) || '').trim()
    : '';
  const browsePrePass = assert(
    currentExists > 0 && beforeDuplicateCount >= 1,
    fail, 'browse_setup', 'Browse list did not populate with the current session',
    { beforeDuplicateCount, beforeTitles }
  );
  if (!browsePrePass) allPass = false;

  await currentRow.click();
  await page.click('#wsBrowseDuplicate');
  await page.waitForFunction((count) => {
    return document.querySelectorAll('.ws-browse-item').length > count;
  }, beforeDuplicateCount);
  const afterDuplicateCount = await browseCount(page);
  const afterDuplicateTitles = await browseTitles(page);
  const duplicatePass = assert(
    afterDuplicateCount === beforeDuplicateCount + 1,
    fail, 'browse_duplicate', `Duplicate should add one browse row: before=${beforeDuplicateCount}, after=${afterDuplicateCount}`,
    { beforeDuplicateCount, afterDuplicateCount, afterDuplicateTitles }
  );
  if (!duplicatePass) allPass = false;

  const duplicateSelectPass = assert(
    await selectFirstNonCurrentBrowseRow(page),
    fail, 'browse_duplicate_select', 'Could not select duplicated browse row',
    { beforeTitles, afterDuplicateTitles }
  );
  if (!duplicateSelectPass) allPass = false;

  const renamedTitle = `${currentTitle || 'Session'} Renamed`;
  page.once('dialog', async (dialog) => {
    await dialog.accept(renamedTitle);
  });
  await page.click('#wsBrowseRename');
  await page.waitForFunction((title) => {
    return [...document.querySelectorAll('.ws-browse-item-title')].some((el) => el.textContent?.trim() === title);
  }, renamedTitle);
  const renamePass = assert(
    await selectBrowseRowByTitle(page, renamedTitle),
    fail, 'browse_rename', 'Renamed browse row not found after rename',
    { renamedTitle, titles: await browseTitles(page) }
  );
  if (!renamePass) allPass = false;

  const beforeDeleteCount = await browseCount(page);
  page.once('dialog', async (dialog) => {
    await dialog.accept();
  });
  await page.click('#wsBrowseDelete');
  await page.waitForFunction((count) => {
    return document.querySelectorAll('.ws-browse-item').length < count;
  }, beforeDeleteCount);
  const afterDeleteCount = await browseCount(page);
  const deletePass = assert(
    afterDeleteCount === Math.max(0, beforeDeleteCount - 1),
      fail, 'browse_delete', `Delete should remove one browse row: before=${beforeDeleteCount}, after=${afterDeleteCount}`,
      { beforeDeleteCount, afterDeleteCount, titles: await browseTitles(page) }
  );
  if (!deletePass) allPass = false;

  await currentRow.click();
  await page.click('#wsBrowseDuplicate');
  await page.waitForFunction((count) => {
    return document.querySelectorAll('.ws-browse-item').length > count;
  }, afterDeleteCount);
  const selectOpenTargetPass = assert(
    await selectFirstNonCurrentBrowseRow(page),
    fail, 'browse_open_select', 'Could not select a non-current duplicated session to open'
  );
  if (!selectOpenTargetPass) allPass = false;

  const sessionBeforeOpen = baselineWb?.sessionId || '';
  await page.click('#wsBrowseOpen');
  await waitForSessionHydration(page);
  await waitForWholeSheetMount(page);
  await page.waitForTimeout(500);
  const afterOpenWb = await getWorkbenchState(page);
  const openPass = assert(
    afterOpenWb?.sessionId && afterOpenWb.sessionId !== sessionBeforeOpen,
    fail, 'browse_open', 'Open should switch to a duplicated session',
    { sessionBeforeOpen, sessionAfterOpen: afterOpenWb?.sessionId || '' }
  );
  if (!openPass) allPass = false;

  await page.click('#wsModePaint');
  await page.waitForTimeout(300);
  const paintModeState = await getWsState(page);
  const paintModePass = assert(
    paintModeState?.mode === 'paint',
    fail, 'mode_switch', `Paint mode should be restored, got ${paintModeState?.mode}`,
    { paintModeState }
  );
  if (!paintModePass) allPass = false;
  await screenshot(page, outDir, 'step03_browse');
  steps.mode_browse = {
    step: 'mode_and_browse_buttons',
    pass: browseModePass && duplicatePass && renamePass && openPass && deletePass && paintModePass,
    browseMode: browseModePass,
    duplicate: duplicatePass,
    rename: renamePass,
    open: openPass,
    delete: deletePass,
    paintMode: paintModePass,
  };

  console.log('=== Step 4: Resize button smoke ===');
  const beforeResize = await getWsState(page);
  const nextCols = Math.max(1, Number(beforeResize?.gridCols || 1) + 1);
  const nextRows = Math.max(1, Number(beforeResize?.gridRows || 1) + 1);
  page.once('dialog', async (dialog) => {
    await dialog.accept(`${nextCols}x${nextRows}`);
  });
  await page.click('#wsResizeBtn');
  await page.waitForFunction(({ cols, rows }) => {
    const ws = window.__wholeSheetEditor;
    const st = ws?.getState?.();
    return !!st && st.gridCols === cols && st.gridRows === rows;
  }, { cols: nextCols, rows: nextRows });
  const afterResize = await getWsState(page);
  const resizePass = assert(
    afterResize?.gridCols === nextCols && afterResize?.gridRows === nextRows,
    fail, 'resize_button', `Resize should apply unrestricted dimensions ${nextCols}x${nextRows}`,
    { beforeResize, afterResize }
  );
  if (!resizePass) allPass = false;
  await screenshot(page, outDir, 'step04_resize');
  steps.resize_button = {
    step: 'resize_button',
    pass: resizePass,
    before: { cols: beforeResize?.gridCols, rows: beforeResize?.gridRows },
    after: { cols: afterResize?.gridCols, rows: afterResize?.gridRows },
  };

  console.log('=== Step 5: Wrapper layer control smoke ===');
  const beforeLayerState = await getWsState(page);
  const beforeLayerInfo = await getLayerInfo(page);
  const targetLayer = beforeLayerState?.layerCount > 1
    ? ((beforeLayerState.activeLayerIndex || 0) === 0 ? 1 : 0)
    : 0;
  await page.selectOption('#layerSelect', String(targetLayer));
  await page.waitForFunction((expected) => {
    const ws = window.__wholeSheetEditor;
    const st = ws?.getState?.();
    return !!st && st.activeLayerIndex === expected;
  }, targetLayer);
  const afterLayerSelect = await getWsState(page);
  const selectLayerPass = assert(
    afterLayerSelect?.activeLayerIndex === targetLayer,
    fail, 'wrapper_layer_select', `Wrapper layerSelect should drive whole-sheet active layer ${targetLayer}`,
    { beforeLayerState, afterLayerSelect, targetLayer }
  );
  if (!selectLayerPass) allPass = false;

  let visibilityPass = true;
  const visSelector = `#layerVisibility input[data-layer="${targetLayer}"]`;
  const visCheckbox = page.locator(visSelector);
  if (await visCheckbox.count()) {
    const beforeVisible = (await getLayerInfo(page)).find((info) => Number(info.index) === targetLayer)?.visible;
    await visCheckbox.click();
    await page.waitForTimeout(300);
    const afterToggle = (await getLayerInfo(page)).find((info) => Number(info.index) === targetLayer)?.visible;
    await visCheckbox.click();
    await page.waitForTimeout(300);
    const afterRestore = (await getLayerInfo(page)).find((info) => Number(info.index) === targetLayer)?.visible;
    visibilityPass = assert(
      beforeVisible !== afterToggle && afterRestore === beforeVisible,
      fail, 'wrapper_layer_visibility', 'Wrapper visibility checkbox should toggle root layer visibility',
      { targetLayer, beforeVisible, afterToggle, afterRestore, beforeLayerInfo }
    );
    if (!visibilityPass) allPass = false;
  }
  await screenshot(page, outDir, 'step05_wrapper_layers');
  steps.wrapper_layer_controls = {
    step: 'wrapper_layer_controls',
    pass: selectLayerPass && visibilityPass,
    selectLayerPass,
    visibilityPass,
    targetLayer,
  };

  const finalState = await captureState(page, 'final');
  await screenshot(page, outDir, 'step_final');

  report.steps = steps;
  report.overall_pass = allPass;
  report.xp_fixture = xpPath;
  report.steps_total = Object.keys(steps).length;
  report.steps_passed = Object.values(steps).filter((s) => s.pass).length;
  report.steps_failed = Object.values(steps).filter((s) => !s.pass).length;

  writeJsonArtifact(outDir, 'state_snapshots.json', {
    baselineWs,
    baselineWb,
    finalState,
  });
  const reportPath = writeReport(outDir, 'report.json', report);

  console.log('\n=== Whole-Sheet Button Smoke Summary ===');
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

main().catch((err) => {
  console.error('Fatal error:', err);
  process.exit(2);
});
