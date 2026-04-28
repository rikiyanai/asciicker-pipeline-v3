#!/usr/bin/env node

/**
 * run_whole_sheet_grid_template_preset_test.mjs
 *
 * CLASSIFICATION: UI-driven with diagnostic observation layer
 * ACTION PATH:    template select/apply via shipped UI, then whole-sheet grid preset select
 * OBSERVATION:    __wholeSheetEditor.getState() + screenshots
 * ELIGIBLE FOR:   UI-driven acceptance evidence
 *
 * Validates that template-derived whole-sheet grid presets are exposed and apply
 * their expected frame dimensions on template-owned sessions.
 */

import {
  setupVerifier,
  waitForWholeSheetMount,
  writeReport,
  screenshot,
} from './verifier_lib.mjs';

async function main() {
  const { page, browser, report, fail, outDir } =
    await setupVerifier('whole_sheet_grid_template_preset', { requireOutDir: true });

  const steps = {};
  let allPass = true;

  console.log('=== Step 1: Apply template-owned session ===');
  await page.selectOption('#templateSelect', 'player_native_full');
  await page.click('#templateApplyBtn');
  await page.waitForFunction(() => {
    const s = window.__wb_debug?.getState?.();
    return s && s.gridCols > 0 && s.gridRows > 0 && s.sessionId;
  }, { timeout: 20000 });
  await waitForWholeSheetMount(page);
  await page.waitForTimeout(500);
  await screenshot(page, outDir, 'step01_template_owned_session');
  steps.template_apply = { step: 'template_apply', pass: true };

  console.log('=== Step 2: Toggle grid on ===');
  await page.click('#wsGridToggle');
  await page.waitForTimeout(250);
  const gridToggleOn = await page.evaluate(() => {
    return document.getElementById('wsGridToggle')?.classList.contains('ws-toggle-on') || false;
  });
  steps.grid_toggle = { step: 'grid_toggle', pass: !!gridToggleOn };
  if (!gridToggleOn) {
    allPass = false;
    fail('grid_toggle', 'Template preset verifier could not enable the whole-sheet grid');
  }

  console.log('=== Step 3: Apply template attack preset ===');
  await page.selectOption('#wsGridStep', 'template:attack');
  await page.waitForTimeout(300);
  await screenshot(page, outDir, 'step03_template_attack_preset');
  const attackState = await page.evaluate(() => window.__wholeSheetEditor?.getState?.() ?? null);
  const attackPass = attackState?.gridStep === 'template:attack'
    && attackState?.resolvedGridW === 9
    && attackState?.resolvedGridH === 10;
  steps.template_attack = { step: 'template_attack', pass: !!attackPass, state: attackState };
  if (!attackPass) {
    allPass = false;
    fail('template_preset', 'Attack preset did not resolve to 9x10', { attackState });
  }

  console.log('=== Step 4: Apply template death preset ===');
  await page.selectOption('#wsGridStep', 'template:death');
  await page.waitForTimeout(300);
  await screenshot(page, outDir, 'step04_template_death_preset');
  const deathState = await page.evaluate(() => window.__wholeSheetEditor?.getState?.() ?? null);
  const deathPass = deathState?.gridStep === 'template:death'
    && deathState?.resolvedGridW === 11
    && deathState?.resolvedGridH === 11;
  steps.template_death = { step: 'template_death', pass: !!deathPass, state: deathState };
  if (!deathPass) {
    allPass = false;
    fail('template_preset', 'Death preset did not resolve to 11x11', { deathState });
  }

  report.steps = steps;
  report.overall_pass = allPass;
  const passCount = Object.values(steps).filter((step) => step.pass).length;
  const totalCount = Object.values(steps).length;
  report.summary = `${passCount}/${totalCount} steps passed`;

  console.log('\n=== Template Grid Preset Results ===');
  for (const [key, step] of Object.entries(steps)) {
    console.log(`  ${step.pass ? 'PASS' : 'FAIL'} ${key}: ${step.step}`);
  }
  console.log(`  Overall: ${allPass ? 'PASS' : 'FAIL'} (${report.summary})`);

  writeReport(outDir, 'report.json', report);
  await browser.close();
  process.exit(allPass ? 0 : 1);
}

main().catch(async (err) => {
  console.error('Fatal:', err);
  process.exit(1);
});
