#!/usr/bin/env node

/**
 * run_whole_sheet_layer0_policy_test.mjs
 *
 * CLASSIFICATION: UI-driven with diagnostic observation layer
 * ACTION PATH:    shipped controls only (New XP, Import XP, Apply Template,
 *                 layer row buttons, glyph input, canvas clicks)
 * OBSERVATION:    __wholeSheetEditor getters + DOM class checks
 * ELIGIBLE FOR:   UI-driven acceptance evidence
 *
 * Validates layer-0 defaults by session kind:
 *   - root_blank: layer 0 visible/editable by default
 *   - raw_xp: layer 0 visible/editable by default
 *   - template_owned: layer 0 hidden+locked by default, but discoverable and
 *     intentionally inspectable by revealing/unlocking/selecting it
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

import {
  openWorkbench,
  setupVerifier,
  waitForSessionHydration,
  waitForWholeSheetMount,
  writeReport,
  screenshot,
} from './verifier_lib.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, '..', '..');

function normalizeList(values) {
  return Array.isArray(values) ? [...values].map((value) => Number(value)).sort((a, b) => a - b) : [];
}

function sameList(a, b) {
  return JSON.stringify(normalizeList(a)) === JSON.stringify(normalizeList(b));
}

async function getWsState(page) {
  return page.evaluate(() => window.__wholeSheetEditor?.getState?.() ?? null);
}

async function getDocSnapshot(page) {
  return page.evaluate(() => window.__wholeSheetEditor?.getDocumentSnapshot?.() ?? null);
}

async function readLayerCell(page, layerIndex, x, y) {
  return page.evaluate(({ layerIndex, x, y }) => {
    const snapshot = window.__wholeSheetEditor?.getDocumentSnapshot?.();
    if (!snapshot) return null;
    const cols = Number(snapshot.gridCols || 0);
    const flat = Array.isArray(snapshot.layers?.[layerIndex]) ? snapshot.layers[layerIndex] : null;
    if (!flat || cols <= 0) return null;
    return flat[(y * cols) + x] || null;
  }, { layerIndex, x, y });
}

async function getLayerRowState(page, rowIndex) {
  const row = page.locator('.ws-layer-row').nth(rowIndex);
  return {
    exists: await row.count().then((count) => count > 0),
    rowClass: await row.getAttribute('class'),
    visClass: await row.locator('.ws-layer-vis-btn').getAttribute('class'),
    lockClass: await row.locator('.ws-layer-lock-btn').getAttribute('class'),
  };
}

async function setGlyphCode(page, glyph) {
  await page.fill('#wsGlyphCode', String(glyph));
  await page.locator('#wsGlyphCode').dispatchEvent('change');
  await page.waitForTimeout(120);
}

async function clickWholeSheetCell(page, x, y) {
  const box = await page.locator('#wholeSheetCanvas').boundingBox();
  const state = await getWsState(page);
  if (!box || !state?.gridCols || !state?.gridRows) throw new Error('whole-sheet canvas not ready for click');
  const cellW = box.width / Number(state.gridCols);
  const cellH = box.height / Number(state.gridRows);
  await page.mouse.click(
    box.x + ((Number(x) + 0.5) * cellW),
    box.y + ((Number(y) + 0.5) * cellH),
  );
  await page.waitForTimeout(160);
}

async function assertLayerPolicy(page, expected) {
  const wsState = await getWsState(page);
  const snapshot = await getDocSnapshot(page);
  const visibleLayers = snapshot?.visibleLayers || [];
  const lockedLayers = snapshot?.lockedLayers || [];
  const pass = !!wsState
    && wsState.sessionKind === expected.sessionKind
    && wsState.metadataStatus === expected.metadataStatus
    && wsState.activeLayerIndex === expected.activeLayer
    && sameList(visibleLayers, expected.visibleLayers)
    && sameList(lockedLayers, expected.lockedLayers);
  return {
    pass,
    wsState,
    snapshot: snapshot ? {
      activeLayer: snapshot.activeLayer,
      visibleLayers,
      lockedLayers,
      layerNames: snapshot.layerNames,
    } : null,
  };
}

async function main() {
  const { page, browser, report, fail, workbenchUrl, outDir, cliArgs } =
    await setupVerifier('whole_sheet_layer0_policy', { requireOutDir: true });

  const xpPath = cliArgs.getArg('--xp', 'sprites/attack-0001.xp');
  const absXp = path.resolve(REPO_ROOT, xpPath);
  if (!fs.existsSync(absXp)) {
    console.error(`XP fixture not found: ${xpPath}`);
    process.exit(1);
  }

  const steps = {};
  let allPass = true;

  console.log('=== Step 1: Root blank policy ===');
  await openWorkbench(page, workbenchUrl);
  await page.click('#btnNewXp');
  await waitForSessionHydration(page);
  await waitForWholeSheetMount(page);
  await page.waitForTimeout(400);
  await screenshot(page, outDir, 'step01_root_blank');
  const rootBlank = await assertLayerPolicy(page, {
    sessionKind: 'root_blank',
    metadataStatus: 'generated',
    activeLayer: 0,
    visibleLayers: [0, 1, 2, 3],
    lockedLayers: [],
  });
  steps.root_blank_defaults = { step: 'root_blank_defaults', ...rootBlank };
  if (!rootBlank.pass) {
    allPass = false;
    fail('root_blank_defaults', 'Root blank session did not expose layer 0 by default', rootBlank);
  }

  console.log('=== Step 2: Raw XP policy ===');
  await openWorkbench(page, workbenchUrl);
  await page.locator('#xpImportFile').setInputFiles(absXp);
  await page.click('#xpImportBtn');
  await waitForSessionHydration(page);
  await waitForWholeSheetMount(page);
  await page.waitForTimeout(500);
  await screenshot(page, outDir, 'step02_raw_xp_defaults');
  const rawBaseline = await getWsState(page);
  const rawSnapshot = await getDocSnapshot(page);
  const rawExpectedVisible = Array.from({ length: Number(rawBaseline?.layerCount || 0) }, (_v, i) => i);
  const rawDefaultsPass = !!rawBaseline
    && rawBaseline.sessionKind === 'raw_xp'
    && rawBaseline.activeLayerIndex === 0
    && rawBaseline.metadataStatus === 'valid'
    && sameList(rawSnapshot?.visibleLayers || [], rawExpectedVisible)
    && sameList(rawSnapshot?.lockedLayers || [], []);
  steps.raw_xp_defaults = {
    step: 'raw_xp_defaults',
    pass: rawDefaultsPass,
    wsState: rawBaseline,
    snapshot: rawSnapshot ? {
      activeLayer: rawSnapshot.activeLayer,
      visibleLayers: rawSnapshot.visibleLayers,
      lockedLayers: rawSnapshot.lockedLayers,
    } : null,
  };
  if (!rawDefaultsPass) {
    allPass = false;
    fail('raw_xp_defaults', 'Raw XP session did not expose layer 0 by default', steps.raw_xp_defaults);
  }

  console.log('=== Step 3: Raw XP layer 0 editability ===');
  const rawBeforeCell = await readLayerCell(page, 0, 1, 1);
  await setGlyphCode(page, 90);
  await clickWholeSheetCell(page, 1, 1);
  const rawAfterCell = await readLayerCell(page, 0, 1, 1);
  await screenshot(page, outDir, 'step03_raw_xp_layer0_edit');
  const rawEditPass = Number(rawAfterCell?.glyph) === 90 && Number(rawBeforeCell?.glyph) !== Number(rawAfterCell?.glyph);
  steps.raw_xp_layer0_edit = {
    step: 'raw_xp_layer0_edit',
    pass: rawEditPass,
    before: rawBeforeCell,
    after: rawAfterCell,
  };
  if (!rawEditPass) {
    allPass = false;
    fail('raw_xp_layer0_edit', 'Raw XP layer 0 was not editable by default', steps.raw_xp_layer0_edit);
  }

  console.log('=== Step 4: Template-owned defaults ===');
  await openWorkbench(page, workbenchUrl);
  await page.selectOption('#templateSelect', 'player_native_idle_only');
  await page.click('#templateApplyBtn');
  await waitForSessionHydration(page);
  await waitForWholeSheetMount(page);
  await page.waitForTimeout(500);
  await screenshot(page, outDir, 'step04_template_owned_defaults');
  const templateDefaults = await assertLayerPolicy(page, {
    sessionKind: 'template_owned',
    metadataStatus: 'generated',
    activeLayer: 2,
    visibleLayers: [2],
    lockedLayers: [0],
  });
  const layer0RowBefore = await getLayerRowState(page, 0);
  const templateDefaultsPass = templateDefaults.pass
    && layer0RowBefore.exists
    && String(layer0RowBefore.visClass || '').includes('ws-layer-vis-btn')
    && !String(layer0RowBefore.visClass || '').includes('ws-layer-visible')
    && String(layer0RowBefore.lockClass || '').includes('ws-layer-locked-btn');
  steps.template_owned_defaults = {
    step: 'template_owned_defaults',
    pass: templateDefaultsPass,
    ...templateDefaults,
    layer0RowBefore,
  };
  if (!templateDefaultsPass) {
    allPass = false;
    fail('template_owned_defaults', 'Template-owned session did not hide+lock layer 0 by default', steps.template_owned_defaults);
  }

  console.log('=== Step 5: Template-owned layer 0 reveal/unlock/edit ===');
  const layer0Row = page.locator('.ws-layer-row').nth(0);
  await layer0Row.locator('.ws-layer-vis-btn').click();
  await page.waitForTimeout(150);
  await layer0Row.locator('.ws-layer-lock-btn').click();
  await page.waitForTimeout(150);
  await layer0Row.click();
  await page.waitForTimeout(150);
  const templateAfterReveal = await getDocSnapshot(page);
  await setGlyphCode(page, 91);
  const templateBeforeCell = await readLayerCell(page, 0, 5, 5);
  await clickWholeSheetCell(page, 5, 5);
  const templateAfterCell = await readLayerCell(page, 0, 5, 5);
  const layer0RowAfter = await getLayerRowState(page, 0);
  await screenshot(page, outDir, 'step05_template_owned_layer0_reveal_unlock_edit');
  const templateEditPass = sameList(templateAfterReveal?.visibleLayers || [], [0, 2])
    && sameList(templateAfterReveal?.lockedLayers || [], [])
    && Number(templateAfterReveal?.activeLayer) === 0
    && Number(templateAfterCell?.glyph) === 91
    && Number(templateBeforeCell?.glyph) !== Number(templateAfterCell?.glyph)
    && String(layer0RowAfter.visClass || '').includes('ws-layer-visible')
    && !String(layer0RowAfter.lockClass || '').includes('ws-layer-locked-btn');
  steps.template_owned_layer0_reveal_unlock_edit = {
    step: 'template_owned_layer0_reveal_unlock_edit',
    pass: templateEditPass,
    snapshot: templateAfterReveal ? {
      activeLayer: templateAfterReveal.activeLayer,
      visibleLayers: templateAfterReveal.visibleLayers,
      lockedLayers: templateAfterReveal.lockedLayers,
    } : null,
    before: templateBeforeCell,
    after: templateAfterCell,
    layer0RowAfter,
  };
  if (!templateEditPass) {
    allPass = false;
    fail(
      'template_owned_layer0_reveal_unlock_edit',
      'Template-owned layer 0 was not intentionally inspectable/editable after reveal+unlock',
      steps.template_owned_layer0_reveal_unlock_edit,
    );
  }

  report.steps = steps;
  report.overall_pass = allPass;
  report.xp_fixture = xpPath;
  report.steps_total = Object.keys(steps).length;
  report.steps_passed = Object.values(steps).filter((step) => step.pass).length;
  report.steps_failed = Object.values(steps).filter((step) => !step.pass).length;

  writeReport(outDir, 'report.json', report);
  console.log('\n=== Whole-Sheet Layer 0 Policy Summary ===');
  for (const [key, step] of Object.entries(steps)) {
    console.log(`  ${step.pass ? 'PASS' : 'FAIL'} ${key}`);
  }
  console.log(`Overall: ${allPass ? 'PASS' : 'FAIL'}`);

  await browser.close();
  process.exit(allPass ? 0 : 1);
}

main().catch(async (err) => {
  console.error('Fatal:', err);
  process.exit(1);
});
