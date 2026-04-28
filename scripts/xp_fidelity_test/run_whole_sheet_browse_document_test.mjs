#!/usr/bin/env node

/**
 * run_whole_sheet_browse_document_test.mjs
 *
 * CLASSIFICATION: UI-driven with diagnostic observation layer
 * ACTION PATH:    shipped controls only (Import XP, Browse mode, Reload, Open)
 * OBSERVATION:    __wb_debug.getState() + browse DOM rows
 * ELIGIBLE FOR:   UI-driven acceptance evidence
 *
 * Validates document-first browse semantics:
 *   - imported XP documents retain their filenames in the browse list
 *   - browse mode lists documents, not anonymous raw-session entries
 *   - browse-open loads a different XP/root-editor document into the same owner
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

import {
  setupVerifier,
  waitForSessionHydration,
  waitForWholeSheetMount,
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

async function getWorkbenchState(page) {
  return page.evaluate(() => window.__wb_debug?.getState?.() ?? null);
}

async function browseTitles(page) {
  return page.locator('.ws-browse-item-title').evaluateAll((nodes) =>
    nodes.map((node) => String(node.textContent || '').trim()).filter(Boolean));
}

async function selectBrowseRowByTitle(page, title) {
  const rows = page.locator('.ws-browse-item');
  const count = await rows.count();
  for (let i = 0; i < count; i++) {
    const text = ((await rows.nth(i).locator('.ws-browse-item-title').textContent()) || '').trim();
    if (text === title) {
      await rows.nth(i).click();
      return true;
    }
  }
  return false;
}

async function importXp(page, absXpPath) {
  await page.locator('#xpImportFile').setInputFiles(absXpPath);
  await page.click('#xpImportBtn');
  await waitForSessionHydration(page);
  await waitForWholeSheetMount(page);
  await page.waitForTimeout(500);
  return getWorkbenchState(page);
}

async function main() {
  const { page, browser, report, fail, outDir, cliArgs } =
    await setupVerifier('whole_sheet_browse_document', { requireOutDir: true });

  const xpA = path.resolve(REPO_ROOT, cliArgs.getArg('--xp-a', 'sprites/item-armor.xp'));
  const xpB = path.resolve(REPO_ROOT, cliArgs.getArg('--xp-b', 'sprites/item-mace.xp'));
  for (const xpPath of [xpA, xpB]) {
    if (!fs.existsSync(xpPath)) {
      console.error(`XP fixture not found: ${xpPath}`);
      process.exit(1);
    }
  }

  const xpNameA = path.basename(xpA);
  const xpNameB = path.basename(xpB);
  const steps = {};
  let allPass = true;

  console.log('=== Step 1: Import document A ===');
  const sessionA = await importXp(page, xpA);
  await screenshot(page, outDir, 'step01_import_document_a');
  const importAPass = assert(
    !!sessionA?.sessionId,
    fail, 'import_a', 'Import A did not produce a session', { sessionA }
  );
  steps.import_a = { step: 'import_a', pass: importAPass, sessionId: sessionA?.sessionId || '', name: xpNameA };
  if (!importAPass) allPass = false;

  console.log('=== Step 2: Import document B ===');
  const sessionB = await importXp(page, xpB);
  await screenshot(page, outDir, 'step02_import_document_b');
  const importBPass = assert(
    !!sessionB?.sessionId && sessionB.sessionId !== sessionA?.sessionId,
    fail, 'import_b', 'Import B did not replace the active document with a new session', { sessionA, sessionB }
  );
  steps.import_b = { step: 'import_b', pass: importBPass, sessionId: sessionB?.sessionId || '', name: xpNameB };
  if (!importBPass) allPass = false;

  console.log('=== Step 3: Browse shows named documents ===');
  await page.click('#wsModeBrowse');
  await page.waitForTimeout(250);
  await page.click('#wsBrowseReload');
  await page.waitForTimeout(500);
  const browseStatus = await page.locator('#wsBrowseStatus').textContent();
  const titles = await browseTitles(page);
  const browseLabelsPass = assert(
    titles.includes(xpNameA) && titles.includes(xpNameB) && String(browseStatus || '').includes('document'),
    fail, 'browse_titles', 'Browse list did not expose imported document names', { browseStatus, titles }
  );
  steps.browse_titles = { step: 'browse_titles', pass: browseLabelsPass, browseStatus, titles };
  if (!browseLabelsPass) allPass = false;

  console.log('=== Step 4: Browse-open document A ===');
  const selectAPass = assert(
    await selectBrowseRowByTitle(page, xpNameA),
    fail, 'browse_select_a', 'Could not select document A in browse list', { titles }
  );
  if (!selectAPass) allPass = false;
  await page.click('#wsBrowseOpen');
  await waitForSessionHydration(page);
  await waitForWholeSheetMount(page);
  await page.waitForTimeout(500);
  const afterOpenA = await getWorkbenchState(page);
  await screenshot(page, outDir, 'step04_browse_open_document_a');
  const openAPass = assert(
    afterOpenA?.sessionId === sessionA?.sessionId,
    fail, 'browse_open_a', 'Browse-open did not load document A into the same owner', { sessionA, afterOpenA }
  );
  steps.browse_open_a = { step: 'browse_open_a', pass: openAPass, expectedSessionId: sessionA?.sessionId || '', actualSessionId: afterOpenA?.sessionId || '' };
  if (!openAPass) allPass = false;

  console.log('=== Step 5: Browse-open document B ===');
  await page.click('#wsModeBrowse');
  await page.waitForTimeout(250);
  const selectBPass = assert(
    await selectBrowseRowByTitle(page, xpNameB),
    fail, 'browse_select_b', 'Could not reselect document B in browse list', { titles: await browseTitles(page) }
  );
  if (!selectBPass) allPass = false;
  await page.click('#wsBrowseOpen');
  await waitForSessionHydration(page);
  await waitForWholeSheetMount(page);
  await page.waitForTimeout(500);
  const afterOpenB = await getWorkbenchState(page);
  await screenshot(page, outDir, 'step05_browse_open_document_b');
  const openBPass = assert(
    afterOpenB?.sessionId === sessionB?.sessionId,
    fail, 'browse_open_b', 'Browse-open did not restore document B into the same owner', { sessionB, afterOpenB }
  );
  steps.browse_open_b = { step: 'browse_open_b', pass: openBPass, expectedSessionId: sessionB?.sessionId || '', actualSessionId: afterOpenB?.sessionId || '' };
  if (!openBPass) allPass = false;

  report.steps = steps;
  report.overall_pass = allPass;
  report.documents = [xpNameA, xpNameB];
  report.steps_total = Object.keys(steps).length;
  report.steps_passed = Object.values(steps).filter((step) => step.pass).length;
  report.steps_failed = Object.values(steps).filter((step) => !step.pass).length;

  writeReport(outDir, 'report.json', report);
  console.log('\n=== Whole-Sheet Browse Document Summary ===');
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
