#!/usr/bin/env node

/**
 * run_structural_baseline_test.mjs — M2-A Structural PNG Baseline Verifier
 *
 * CLASSIFICATION: structural-contract only (NOT UI-driven acceptance)
 * ACTION PATH:    All actions via fetch() API calls — zero DOM/UI interaction
 * OBSERVATION:    API response JSON only — no debug API reads
 * ELIGIBLE FOR:   Structural-contract evidence per PNG_STRUCTURAL_BASELINE_CONTRACT.md
 * NOT ELIGIBLE:   UI-driven acceptance evidence (does not prove UI workflow works)
 *
 * Validates the PNG_STRUCTURAL_BASELINE_CONTRACT:
 *   PNG upload → bundle create → action-grid apply → export → G10/G11/G12 gates
 *
 * This runner proves the API contract and structural gates are sound.
 * It does NOT prove: template selector UI, upload button, analyze/run UI,
 * export button, tab switching, or any user-visible interaction path.
 *
 * Built on verifier_lib.mjs (shared M2 verifier foundation).
 * Base-path-aware: pass --url to test under /xpedit/workbench.
 *
 * Usage:
 *   node run_structural_baseline_test.mjs --out-dir output/structural_baseline
 *   node run_structural_baseline_test.mjs --url http://127.0.0.1:5071/xpedit/workbench --out-dir output/structural_baseline_prefixed
 *   node run_structural_baseline_test.mjs --family idle --out-dir output/structural_baseline
 */

import {
  setupVerifier,
  captureState,
  waitForSessionHydration,
  resolveRoute,
  writeReport,
  writeJsonArtifact,
  screenshot,
  parseJsonSafe,
} from './verifier_lib.mjs';

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { getTemplateSetContract } from './bundle_contract.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, '..', '..');

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------

// All 3 families live inside `player_native_full` template set as actions
const TEMPLATE_SET = 'player_native_full';
const TEMPLATE_CONTRACT = getTemplateSetContract(TEMPLATE_SET);
const FIXTURE_BY_ACTION = {
  idle: 'tests/fixtures/baseline/player-idle.png',
  attack: 'tests/fixtures/baseline/attack.png',
  death: 'tests/fixtures/baseline/death.png',
};

const FAMILIES = Object.fromEntries(
  Object.entries(FIXTURE_BY_ACTION).map(([actionKey, fixture]) => {
    const spec = TEMPLATE_CONTRACT.actions[actionKey];
    if (!spec) {
      throw new Error(`Template contract missing structural baseline action "${actionKey}"`);
    }
    return [actionKey, {
      fixture,
      actionKey,
      expectedDims: { cols: spec.xp_dims[0], rows: spec.xp_dims[1] },
      expectedLayers: 4,
    }];
  })
);

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main() {
  const { page, browser, report, fail, workbenchUrl, outDir, cliArgs } =
    await setupVerifier('structural_baseline', { requireOutDir: true });

  const familyFilter = cliArgs.getArg('--family', null);
  const families = familyFilter
    ? { [familyFilter]: FAMILIES[familyFilter] }
    : FAMILIES;

  if (familyFilter && !FAMILIES[familyFilter]) {
    fail('config', `Unknown family: ${familyFilter}. Valid: ${Object.keys(FAMILIES).join(', ')}`);
    report.overall_pass = false;
    writeReport(outDir, 'report.json', report);
    await browser.close();
    process.exit(1);
  }

  // Step 1: Create ONE bundle (all families are actions within the same template set)
  let bundleId;
  try {
    const bundleUrl = resolveRoute(workbenchUrl, '/api/workbench/bundle/create');
    const resp = await page.evaluate(async ({ url, templateSetKey }) => {
      const r = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ template_set_key: templateSetKey }),
      });
      return { status: r.status, body: await r.json() };
    }, { url: bundleUrl, templateSetKey: TEMPLATE_SET });

    if (resp.status > 201 || !resp.body?.bundle_id) {
      fail('bundle_create', `Bundle create failed: status=${resp.status}, body=${JSON.stringify(resp.body)}`);
      report.overall_pass = false;
      writeReport(outDir, 'report.json', report);
      await browser.close();
      process.exit(1);
    }
    bundleId = resp.body.bundle_id;
    console.log(`Bundle created: ${bundleId}`);
  } catch (err) {
    fail('bundle_create', `Bundle create error: ${err.message}`);
    report.overall_pass = false;
    writeReport(outDir, 'report.json', report);
    await browser.close();
    process.exit(1);
  }

  // Step 2: Upload PNG + apply action-grid for each family
  const results = {};
  let allPass = true;

  for (const [familyName, familyCfg] of Object.entries(families)) {
    console.log(`\n=== Testing family: ${familyName} ===`);
    const familyResult = await testFamily(page, workbenchUrl, familyName, familyCfg, bundleId, outDir, fail);
    results[familyName] = familyResult;
    if (!familyResult.pass) allPass = false;
  }

  // Step 3: Export full bundle and validate gates
  console.log(`\n=== Exporting bundle ===`);
  try {
    const exportUrl = resolveRoute(workbenchUrl, '/api/workbench/export-bundle');
    const resp = await page.evaluate(async ({ url, bid }) => {
      const r = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ bundle_id: bid }),
      });
      return { status: r.status, body: await r.json() };
    }, { url: exportUrl, bid: bundleId });

    if (resp.status !== 200) {
      fail('export', `Export failed: status=${resp.status}, body=${JSON.stringify(resp.body)}`);
      allPass = false;
    } else {
      // Validate per-action gates
      const gateReports = resp.body?.gate_reports || {};
      for (const [familyName, familyCfg] of Object.entries(families)) {
        const actionGates = gateReports[familyCfg.actionKey] || [];
        const findGate = (name) => actionGates.find(g => g.gate === name);
        const g10 = findGate('G10')?.verdict === 'PASS' || findGate('G10')?.verdict === 'THRESHOLD_MET';
        const g11 = findGate('G11')?.verdict === 'PASS' || findGate('G11')?.verdict === 'THRESHOLD_MET';
        const g12 = findGate('G12')?.verdict === 'PASS' || findGate('G12')?.verdict === 'THRESHOLD_MET';
        const gatesPass = g10 && g11 && g12;
        results[familyName].gates = { G10: g10, G11: g11, G12: g12, all_pass: gatesPass, raw: actionGates };
        if (!gatesPass) {
          fail('structural_gates', `Gates failed for ${familyName}: G10=${g10}, G11=${g11}, G12=${g12}`);
          results[familyName].pass = false;
          allPass = false;
        }
        console.log(`  ${familyName}: G10=${g10 ? 'PASS' : 'FAIL'}, G11=${g11 ? 'PASS' : 'FAIL'}, G12=${g12 ? 'PASS' : 'FAIL'}`);
      }
      writeJsonArtifact(outDir, 'export_response.json', resp.body);
    }
  } catch (err) {
    fail('export', `Export error: ${err.message}`);
    allPass = false;
  }

  report.families = results;
  report.bundle_id = bundleId;
  report.overall_pass = allPass;
  report.families_tested = Object.keys(results).length;
  report.families_passed = Object.values(results).filter(r => r.pass).length;

  const reportPath = writeReport(outDir, 'report.json', report);

  console.log(`\n=== Structural Baseline Summary ===`);
  console.log(`Hosting mode: ${report.hosting_mode}`);
  console.log(`Families tested: ${report.families_tested}`);
  console.log(`Families passed: ${report.families_passed}`);
  console.log(`Overall: ${allPass ? 'PASS' : 'FAIL'}`);
  console.log(`Report: ${reportPath}`);

  await browser.close();
  process.exit(allPass ? 0 : 1);
}

// ---------------------------------------------------------------------------
// Per-family test
// ---------------------------------------------------------------------------

async function testFamily(page, workbenchUrl, familyName, cfg, bundleId, outDir, fail) {
  const result = {
    family: familyName,
    pass: true, // assume pass until a step fails
    steps: {},
  };

  const fixturePath = path.resolve(REPO_ROOT, cfg.fixture);
  if (!fs.existsSync(fixturePath)) {
    fail('fixture', `Missing fixture: ${cfg.fixture}`);
    result.steps.fixture = { pass: false, error: 'fixture file not found' };
    result.pass = false;
    return result;
  }
  result.steps.fixture = { pass: true, path: cfg.fixture };

  // Upload PNG via API
  let uploadResult;
  try {
    const apiBase = resolveRoute(workbenchUrl, '/api/upload');
    const fileBuffer = fs.readFileSync(fixturePath);
    const resp = await page.evaluate(async ({ url, bytes, filename }) => {
      const formData = new FormData();
      formData.append('file', new Blob([new Uint8Array(bytes)]), filename);
      const r = await fetch(url, { method: 'POST', body: formData });
      return { status: r.status, body: await r.json() };
    }, {
      url: apiBase,
      bytes: [...fileBuffer],
      filename: path.basename(fixturePath),
    });

    if (resp.status > 201 || !resp.body?.upload_id) {
      fail('upload', `Upload failed for ${familyName}: status=${resp.status}`);
      result.steps.upload = { pass: false, response: resp };
      result.pass = false;
      return result;
    }
    uploadResult = resp.body;
    result.steps.upload = { pass: true, upload_id: uploadResult.upload_id };
  } catch (err) {
    fail('upload', `Upload error for ${familyName}: ${err.message}`);
    result.steps.upload = { pass: false, error: err.message };
    result.pass = false;
    return result;
  }

  // Apply action-grid
  try {
    const actionGridUrl = resolveRoute(workbenchUrl, '/api/workbench/action-grid/apply');
    const resp = await page.evaluate(async ({ url, bid, actionKey, sourcePath }) => {
      const r = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          bundle_id: bid,
          action_key: actionKey,
          source_path: sourcePath,
        }),
      });
      return { status: r.status, body: await r.json() };
    }, {
      url: actionGridUrl,
      bid: bundleId,
      actionKey: cfg.actionKey,
      sourcePath: uploadResult.source_path,
    });

    if (resp.status !== 200) {
      fail('action_grid', `Action-grid failed for ${familyName}: status=${resp.status}`);
      result.steps.action_grid = { pass: false, response: resp };
      result.pass = false;
      return result;
    }
    result.steps.action_grid = { pass: true, session_id: resp.body?.session_id };
    console.log(`  ${familyName}: upload + action-grid OK`);
  } catch (err) {
    fail('action_grid', `Action-grid error for ${familyName}: ${err.message}`);
    result.steps.action_grid = { pass: false, error: err.message };
    result.pass = false;
    return result;
  }

  return result;
}

main().catch(err => {
  console.error('Fatal error:', err);
  process.exit(2);
});
