#!/usr/bin/env node

/**
 * run_whole_sheet_session_ownership_test.mjs
 *
 * CLASSIFICATION: UI-driven with diagnostic observation layer
 * ACTION PATH:    shipped controls only (Apply Template, Browse, Rename, Import XP, New XP, Open)
 * OBSERVATION:    __wb_debug.getState() + __wholeSheetEditor.getState() + browse DOM rows
 * ELIGIBLE FOR:   UI-driven acceptance evidence
 *
 * Validates the Section 1 / Section 2 load boundary:
 *   - template-owned sessions restore template ownership on load
 *   - raw XP import clears stale template ownership
 *   - New XP after raw import creates a root-blank session, not a template-owned one
 *   - browse-open can restore the template-owned document afterward
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

async function getWholeSheetState(page) {
  return page.evaluate(() => window.__wholeSheetEditor?.getState?.() ?? null);
}

async function getUiState(page) {
  return page.evaluate(() => ({
    newXpDisabled: !!document.querySelector('#btnNewXp')?.disabled,
    statusText: String(document.querySelector('#wbStatus')?.textContent || '').trim(),
  }));
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
}

async function openBrowse(page) {
  await page.click('#wsModeBrowse');
  await page.waitForTimeout(250);
  await page.click('#wsBrowseReload');
  await page.waitForTimeout(500);
}

async function main() {
  const { page, browser, report, fail, outDir, cliArgs } =
    await setupVerifier('whole_sheet_session_ownership', { requireOutDir: true });

  const xpPath = path.resolve(REPO_ROOT, cliArgs.getArg('--xp', 'sprites/item-armor.xp'));
  if (!fs.existsSync(xpPath)) {
    console.error(`XP fixture not found: ${xpPath}`);
    process.exit(1);
  }

  const uniqueTemplateName = `template-owned-${Date.now()}`;
  const steps = {};
  let allPass = true;

  console.log('=== Step 1: Apply single-action template ===');
  await page.selectOption('#templateSelect', 'player_native_idle_only');
  await page.click('#templateApplyBtn');
  await waitForSessionHydration(page);
  await waitForWholeSheetMount(page);
  await page.waitForTimeout(500);
  const templateState = await getWorkbenchState(page);
  const templateWsState = await getWholeSheetState(page);
  await screenshot(page, outDir, 'step01_template_owned');
  const templatePass = assert(
    templateState?.templateSetKey === 'player_native_idle_only'
      && templateState?.activeActionKey === 'idle'
      && !templateState?.bundleId
      && !!templateState?.sessionId
      && templateWsState?.sessionKind === 'template_owned',
    fail,
    'template_owned_load',
    'Template apply did not establish a template-owned loaded session',
    { templateState, templateWsState },
  );
  steps.template_owned_load = {
    step: 'template_owned_load',
    pass: templatePass,
    sessionId: templateState?.sessionId || '',
    templateSetKey: templateState?.templateSetKey || '',
    activeActionKey: templateState?.activeActionKey || '',
    sessionKind: templateWsState?.sessionKind || '',
  };
  if (!templatePass) allPass = false;

  console.log('=== Step 2: Rename template-owned document ===');
  await openBrowse(page);
  page.once('dialog', async (dialog) => {
    await dialog.accept(uniqueTemplateName);
  });
  await page.click('#wsBrowseRename');
  await page.waitForTimeout(800);
  await page.click('#wsBrowseReload');
  await page.waitForTimeout(500);
  const renamedTitles = await browseTitles(page);
  await screenshot(page, outDir, 'step02_renamed_template_document');
  const renamePass = assert(
    renamedTitles.includes(uniqueTemplateName),
    fail,
    'rename_template_document',
    'Template-owned document rename did not persist in browse list',
    { renamedTitles, uniqueTemplateName },
  );
  steps.rename_template_document = {
    step: 'rename_template_document',
    pass: renamePass,
    title: uniqueTemplateName,
  };
  if (!renamePass) allPass = false;

  console.log('=== Step 3: Import raw XP and clear template ownership ===');
  await importXp(page, xpPath);
  const rawState = await getWorkbenchState(page);
  const rawWsState = await getWholeSheetState(page);
  await screenshot(page, outDir, 'step03_raw_xp_clears_template_owner');
  const rawPass = assert(
    rawState?.templateSetKey === ''
      && rawState?.activeActionKey === 'idle'
      && !rawState?.bundleId
      && rawState?.sessionId
      && rawState.sessionId !== templateState?.sessionId
      && rawWsState?.sessionKind === 'raw_xp',
    fail,
    'raw_xp_clears_template_owner',
    'Raw XP import left stale template ownership in the wrapper',
    { rawState, rawWsState, templateSessionId: templateState?.sessionId || '' },
  );
  steps.raw_xp_clears_template_owner = {
    step: 'raw_xp_clears_template_owner',
    pass: rawPass,
    sessionId: rawState?.sessionId || '',
    templateSetKey: rawState?.templateSetKey || '',
    activeActionKey: rawState?.activeActionKey || '',
    sessionKind: rawWsState?.sessionKind || '',
  };
  if (!rawPass) allPass = false;

  console.log('=== Step 4: New XP after raw load creates root-blank session ===');
  await page.click('#btnNewXp');
  await waitForSessionHydration(page);
  await waitForWholeSheetMount(page);
  await page.waitForTimeout(500);
  const blankState = await getWorkbenchState(page);
  const blankWsState = await getWholeSheetState(page);
  const blankUiState = await getUiState(page);
  await screenshot(page, outDir, 'step04_root_blank_after_raw');
  const blankPass = assert(
    blankState?.templateSetKey === ''
      && blankState?.activeActionKey === 'idle'
      && !blankState?.bundleId
      && blankState?.sessionId
      && blankState.sessionId !== rawState?.sessionId
      && blankWsState?.sessionKind === 'root_blank',
    fail,
    'root_blank_after_raw',
    'New XP after a raw load did not create a pure root-blank Section 1 session',
    { blankState, blankWsState, blankUiState, rawSessionId: rawState?.sessionId || '' },
  );
  steps.root_blank_after_raw = {
    step: 'root_blank_after_raw',
    pass: blankPass,
    sessionId: blankState?.sessionId || '',
    templateSetKey: blankState?.templateSetKey || '',
    activeActionKey: blankState?.activeActionKey || '',
    sessionKind: blankWsState?.sessionKind || '',
    newXpDisabled: !!blankUiState?.newXpDisabled,
    statusText: blankUiState?.statusText || '',
  };
  if (!blankPass) allPass = false;

  console.log('=== Step 5: Browse-open restores template-owned session ===');
  await openBrowse(page);
  const selectPass = assert(
    await selectBrowseRowByTitle(page, uniqueTemplateName),
    fail,
    'browse_select_template_owned',
    'Could not select the renamed template-owned document in browse list',
    { titles: await browseTitles(page), uniqueTemplateName },
  );
  if (!selectPass) allPass = false;
  await page.click('#wsBrowseOpen');
  await waitForSessionHydration(page);
  await waitForWholeSheetMount(page);
  await page.waitForTimeout(500);
  const restoredState = await getWorkbenchState(page);
  const restoredWsState = await getWholeSheetState(page);
  await screenshot(page, outDir, 'step05_restore_template_owned');
  const restorePass = assert(
    restoredState?.sessionId === templateState?.sessionId
      && restoredState?.templateSetKey === 'player_native_idle_only'
      && restoredState?.activeActionKey === 'idle'
      && !restoredState?.bundleId
      && restoredWsState?.sessionKind === 'template_owned',
    fail,
    'restore_template_owned',
    'Browse-open did not restore template-owned wrapper ownership from session payload',
    { restoredState, restoredWsState, templateState },
  );
  steps.restore_template_owned = {
    step: 'restore_template_owned',
    pass: restorePass,
    sessionId: restoredState?.sessionId || '',
    templateSetKey: restoredState?.templateSetKey || '',
    activeActionKey: restoredState?.activeActionKey || '',
    sessionKind: restoredWsState?.sessionKind || '',
  };
  if (!restorePass) allPass = false;

  report.steps = steps;
  report.overall_pass = allPass;
  report.fixture = path.basename(xpPath);
  report.template_document_name = uniqueTemplateName;
  report.steps_total = Object.keys(steps).length;
  report.steps_passed = Object.values(steps).filter((step) => step.pass).length;
  report.steps_failed = Object.values(steps).filter((step) => !step.pass).length;

  writeReport(outDir, 'report.json', report);
  console.log('\n=== Whole-Sheet Session Ownership Summary ===');
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
