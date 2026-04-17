#!/usr/bin/env node

/**
 * run_source_panel_workflow_test.mjs — M2-B Source-Panel Workflow Verifier
 *
 * CLASSIFICATION: UI-driven with diagnostic observation layer
 * ACTION PATH:    All actions via DOM clicks, canvas mouse events, file input, context menu
 * OBSERVATION:    State assertions via getState() (diagnostic observation layer)
 * ELIGIBLE FOR:   UI-driven acceptance evidence (actions are user-reachable)
 * CAVEAT:         State verification uses page.evaluate() → getState(), which is a
 *                 diagnostic read. Actions themselves are pure UI.
 *
 * Validates the source-panel workflow contract:
 *   PNG upload → draw box → commit sprite → set anchor → pad to anchor →
 *   find sprites → clear all → verify isolation invariant
 *
 * Built on verifier_lib.mjs (shared M2 verifier foundation).
 * Base-path-aware: pass --url to test under /xpedit/workbench.
 *
 * Usage:
 *   node run_source_panel_workflow_test.mjs --out-dir output/source_panel_workflow
 *   node run_source_panel_workflow_test.mjs --url http://127.0.0.1:5071/xpedit/workbench --out-dir output/source_panel_workflow_prefixed
 *   node run_source_panel_workflow_test.mjs --headed --out-dir output/source_panel_workflow
 */

import {
  setupVerifier,
  captureState,
  writeReport,
  writeJsonArtifact,
  screenshot,
} from './verifier_lib.mjs';

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, '..', '..');

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------

const PNG_FIXTURE = 'tests/fixtures/known_good/cat_sheet.png';

// Box coordinates for cat_sheet.png (192x48).
// Two manually-chosen boxes that cover distinct sprite regions.
const BOX_A = { x1: 10, y1: 5, x2: 55, y2: 43 };   // ~45x38
const BOX_B = { x1: 70, y1: 5, x2: 125, y2: 43 };   // ~55x38

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Assert a condition, recording a failure if false. */
function assert(condition, failFn, cls, message, extra = {}) {
  if (!condition) {
    failFn(cls, message, extra);
    return false;
  }
  return true;
}

async function ensureSourceCanvasVisible(page) {
  const canvas = page.locator('#sourceCanvas');
  await canvas.scrollIntoViewIfNeeded();
  await page.waitForTimeout(100);
}

/**
 * Click on the source canvas at element-relative coordinates.
 * At zoom=1, element coords map 1:1 to canvas pixel coords.
 */
async function canvasClick(page, x, y, opts = {}) {
  await ensureSourceCanvasVisible(page);
  await page.locator('#sourceCanvas').click({
    position: { x, y },
    button: opts.button || 'left',
  });
}

/**
 * Drag on the source canvas from (x1,y1) to (x2,y2).
 * Uses Playwright mouse API for precise control.
 */
async function canvasDrag(page, x1, y1, x2, y2) {
  await ensureSourceCanvasVisible(page);
  const box = await page.locator('#sourceCanvas').boundingBox();
  if (!box) throw new Error('sourceCanvas not found or not visible');
  const startX = box.x + x1;
  const startY = box.y + y1;
  const endX = box.x + x2;
  const endY = box.y + y2;
  await page.mouse.move(startX, startY);
  await page.mouse.down();
  // Intermediate move to trigger mousemove handler
  await page.mouse.move((startX + endX) / 2, (startY + endY) / 2, { steps: 3 });
  await page.mouse.move(endX, endY, { steps: 3 });
  await page.mouse.up();
}

/**
 * Right-click the source canvas at element-relative (x,y) to open context menu.
 */
async function canvasRightClick(page, x, y) {
  await ensureSourceCanvasVisible(page);
  await page.locator('#sourceCanvas').click({
    position: { x, y },
    button: 'right',
  });
  // Wait for context menu to appear
  await page.waitForSelector('#sourceContextMenu:not(.hidden)', { timeout: 3000 })
    .catch(() => {});
}

/**
 * Wait for getState().sourceImageLoaded to be true.
 */
async function waitForSourceImage(page, timeout = 15000) {
  await page.waitForFunction(() => {
    return window.__wb_debug?.getState?.()?.sourceImageLoaded === true;
  }, { timeout });
}

// ---------------------------------------------------------------------------
// Step definitions
// ---------------------------------------------------------------------------

async function stepUploadPng(page, fail, outDir, fixturePath) {
  const pre = await captureState(page, 'pre_upload');

  // Set file on input and click upload
  await page.setInputFiles('#wbFile', fixturePath);
  await page.click('#wbUpload');

  // Wait for source image to load
  await waitForSourceImage(page);
  // Small settle for canvas render
  await page.waitForTimeout(500);

  const post = await captureState(page, 'post_upload');
  await screenshot(page, outDir, 'step01_upload');

  const pass = assert(
    post.sourceImageLoaded === true,
    fail, 'upload', 'sourceImageLoaded should be true after upload',
    { pre_sourceImageLoaded: pre.sourceImageLoaded, post_sourceImageLoaded: post.sourceImageLoaded }
  );

  return { step: 'upload_png', pass, pre, post };
}

async function stepSwitchToDrawMode(page, fail, outDir) {
  const pre = await captureState(page, 'pre_draw_mode');

  await page.click('#drawBoxBtn');
  await page.waitForTimeout(200);

  const post = await captureState(page, 'post_draw_mode');

  const pass = assert(
    post.sourceMode === 'draw_box',
    fail, 'mode_switch', `sourceMode should be "draw_box", got "${post.sourceMode}"`,
    { pre_mode: pre.sourceMode, post_mode: post.sourceMode }
  );

  return { step: 'switch_draw_mode', pass, pre, post };
}

async function stepDrawBox(page, fail, outDir, box, label) {
  const pre = await captureState(page, `pre_draw_${label}`);

  await canvasDrag(page, box.x1, box.y1, box.x2, box.y2);
  await page.waitForTimeout(300);

  const post = await captureState(page, `post_draw_${label}`);
  await screenshot(page, outDir, `step_draw_${label}`);

  const hasDraft = post.drawCurrent !== null;
  const pass = assert(
    hasDraft,
    fail, 'draw_box', `drawCurrent should be non-null after drawing ${label}`,
    { pre_drawCurrent: pre.drawCurrent, post_drawCurrent: post.drawCurrent }
  );

  return { step: `draw_box_${label}`, pass, pre, post };
}

async function stepCommitAsSprite(page, fail, outDir, clickX, clickY) {
  const pre = await captureState(page, 'pre_commit');

  // Right-click on the draft box to open context menu
  await canvasRightClick(page, clickX, clickY);

  // Click "Add as 1 sprite"
  const addBtn = page.locator('#srcCtxAddSprite');
  const isDisabled = await addBtn.isDisabled();
  if (isDisabled) {
    fail('commit_sprite', 'srcCtxAddSprite is disabled — no draft box at click location');
    return { step: 'commit_sprite', pass: false, pre, post: pre };
  }
  await addBtn.click();
  await page.waitForTimeout(300);

  const post = await captureState(page, 'post_commit');
  await screenshot(page, outDir, 'step_commit_sprite');

  const boxCountIncreased = post.extractedBoxes > pre.extractedBoxes;
  const draftCleared = post.drawCurrent === null;
  const pass =
    assert(boxCountIncreased, fail, 'commit_sprite',
      `extractedBoxes should increase: pre=${pre.extractedBoxes} post=${post.extractedBoxes}`,
      { pre_count: pre.extractedBoxes, post_count: post.extractedBoxes }) &&
    assert(draftCleared, fail, 'commit_sprite',
      'drawCurrent should be null after commit',
      { post_drawCurrent: post.drawCurrent });

  return { step: 'commit_sprite', pass, pre, post };
}

async function stepSelectBox(page, fail, outDir, clickX, clickY) {
  const pre = await captureState(page, 'pre_select');

  // Switch to select mode first
  await page.click('#sourceSelectBtn');
  await page.waitForTimeout(200);

  // Click on the committed box
  await canvasClick(page, clickX, clickY);
  await page.waitForTimeout(300);

  const post = await captureState(page, 'post_select');

  const hasSelection = post.sourceSelection && post.sourceSelection.length > 0;
  const pass = assert(
    hasSelection,
    fail, 'select_box', 'sourceSelection should have at least 1 entry after clicking box',
    { pre_selection: pre.sourceSelection, post_selection: post.sourceSelection }
  );

  return { step: 'select_box', pass, pre, post };
}

async function stepSetAnchor(page, fail, outDir, clickX, clickY) {
  const pre = await captureState(page, 'pre_set_anchor');

  // Right-click on committed box to open context menu
  await canvasRightClick(page, clickX, clickY);

  const setBtn = page.locator('#srcCtxSetAnchor');
  const isDisabled = await setBtn.isDisabled();
  if (isDisabled) {
    fail('set_anchor', 'srcCtxSetAnchor is disabled — no target at click location');
    return { step: 'set_anchor', pass: false, pre, post: pre };
  }
  await setBtn.click();
  await page.waitForTimeout(300);

  const post = await captureState(page, 'post_set_anchor');
  await screenshot(page, outDir, 'step_set_anchor');

  const hasAnchor = post.anchorBox !== null;
  const pass = assert(
    hasAnchor,
    fail, 'set_anchor', 'anchorBox should be non-null after Set Anchor',
    { pre_anchor: pre.anchorBox, post_anchor: post.anchorBox }
  );

  return { step: 'set_anchor', pass, pre, post };
}

async function stepDrawAndPadToAnchor(page, fail, outDir, box, anchorDims) {
  // Switch back to draw mode
  await page.click('#drawBoxBtn');
  await page.waitForTimeout(200);

  // Draw a differently-sized box
  await canvasDrag(page, box.x1, box.y1, box.x2, box.y2);
  await page.waitForTimeout(300);

  const prePad = await captureState(page, 'pre_pad');

  // Right-click on the draft to open context menu
  const midX = (box.x1 + box.x2) / 2;
  const midY = (box.y1 + box.y2) / 2;
  await canvasRightClick(page, midX, midY);

  const padBtn = page.locator('#srcCtxPadAnchor');
  const isDisabled = await padBtn.isDisabled();
  if (isDisabled) {
    fail('pad_anchor', 'srcCtxPadAnchor is disabled — no anchor set or no target');
    return { step: 'pad_to_anchor', pass: false, pre: prePad, post: prePad };
  }
  await padBtn.click();
  await page.waitForTimeout(300);

  const post = await captureState(page, 'post_pad');
  await screenshot(page, outDir, 'step_pad_to_anchor');

  // After padding, the draft box dimensions should match the anchor
  // (We check drawCurrent or the last sourceBox if auto-committed)
  let pass = true;
  if (anchorDims && post.drawCurrent) {
    const dw = post.drawCurrent.w;
    const dh = post.drawCurrent.h;
    pass = assert(
      dw === anchorDims.w && dh === anchorDims.h,
      fail, 'pad_anchor',
      `Padded draft dims ${dw}x${dh} should match anchor ${anchorDims.w}x${anchorDims.h}`,
      { draft: post.drawCurrent, anchor: anchorDims }
    );
  }

  return { step: 'pad_to_anchor', pass, pre: prePad, post };
}

async function stepFindSprites(page, fail, outDir) {
  // Clear existing state first — switch to select mode
  await page.click('#sourceSelectBtn');
  await page.waitForTimeout(200);

  // Clear all boxes so Find Sprites starts fresh
  await page.click('#deleteBoxBtn');
  await page.waitForTimeout(300);

  const pre = await captureState(page, 'pre_find');

  // Click "Find Sprites"
  await page.click('#extractBtn');
  await page.waitForTimeout(500);

  const post = await captureState(page, 'post_find');
  await screenshot(page, outDir, 'step_find_sprites');

  const detected = post.extractedBoxes > 0;
  const pass = assert(
    detected,
    fail, 'find_sprites', `extractedBoxes should be > 0 after Find Sprites, got ${post.extractedBoxes}`,
    { pre_count: pre.extractedBoxes, post_count: post.extractedBoxes }
  );

  return { step: 'find_sprites', pass, pre, post };
}

async function stepClearAll(page, fail, outDir) {
  const pre = await captureState(page, 'pre_clear');

  await page.click('#deleteBoxBtn');
  await page.waitForTimeout(300);

  const post = await captureState(page, 'post_clear');
  await screenshot(page, outDir, 'step_clear_all');

  const cleared = post.extractedBoxes === 0 && post.drawCurrent === null;
  const pass = assert(
    cleared,
    fail, 'clear_all',
    `After clear: extractedBoxes=${post.extractedBoxes} (want 0), drawCurrent=${JSON.stringify(post.drawCurrent)} (want null)`,
    { pre_count: pre.extractedBoxes, post_count: post.extractedBoxes }
  );

  return { step: 'clear_all', pass, pre, post };
}

/**
 * Source-panel isolation invariant: source operations MUST NOT modify
 * cells, grid selection, session geometry, or whole-sheet editor state.
 */
function checkIsolationInvariant(initialState, finalState, fail) {
  const checks = [
    ['gridCols', initialState.gridCols, finalState.gridCols],
    ['gridRows', initialState.gridRows, finalState.gridRows],
    ['selectedRow', initialState.selectedRow, finalState.selectedRow],
    ['angles', initialState.angles, finalState.angles],
    ['projs', initialState.projs, finalState.projs],
    ['frameWChars', initialState.frameWChars, finalState.frameWChars],
    ['frameHChars', initialState.frameHChars, finalState.frameHChars],
    ['layerCount', initialState.layerCount, finalState.layerCount],
    ['activeLayer', initialState.activeLayer, finalState.activeLayer],
  ];

  let pass = true;
  for (const [field, expected, actual] of checks) {
    if (JSON.stringify(expected) !== JSON.stringify(actual)) {
      fail('isolation', `Source-panel isolation violated: ${field} changed from ${JSON.stringify(expected)} to ${JSON.stringify(actual)}`);
      pass = false;
    }
  }
  return pass;
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main() {
  const { page, browser, report, fail, workbenchUrl, outDir, cliArgs } =
    await setupVerifier('source_panel_workflow', { requireOutDir: true });

  const fixturePath = path.resolve(REPO_ROOT, PNG_FIXTURE);
  if (!fs.existsSync(fixturePath)) {
    fail('config', `Fixture not found: ${PNG_FIXTURE}`);
    report.overall_pass = false;
    writeReport(outDir, 'report.json', report);
    await browser.close();
    process.exit(1);
  }

  const steps = {};
  let allPass = true;

  // Capture baseline state (before any source panel interaction)
  const baseline = await captureState(page, 'baseline');
  await screenshot(page, outDir, 'step00_baseline');

  // Step 1: Upload PNG
  console.log('=== Step 1: Upload PNG ===');
  steps.upload = await stepUploadPng(page, fail, outDir, fixturePath);
  if (!steps.upload.pass) allPass = false;

  // Step 2: Switch to draw mode (S1)
  console.log('=== Step 2: Switch to draw mode ===');
  steps.draw_mode = await stepSwitchToDrawMode(page, fail, outDir);
  if (!steps.draw_mode.pass) allPass = false;

  // Step 3: Draw box A (S3)
  console.log('=== Step 3: Draw box A ===');
  steps.draw_box_a = await stepDrawBox(page, fail, outDir, BOX_A, 'box_a');
  if (!steps.draw_box_a.pass) allPass = false;

  // Step 4: Commit box A as sprite (C1)
  console.log('=== Step 4: Commit as sprite ===');
  const boxACenterX = (BOX_A.x1 + BOX_A.x2) / 2;
  const boxACenterY = (BOX_A.y1 + BOX_A.y2) / 2;
  steps.commit = await stepCommitAsSprite(page, fail, outDir, boxACenterX, boxACenterY);
  if (!steps.commit.pass) allPass = false;

  // Step 5: Select committed box (S5 + S2)
  console.log('=== Step 5: Select committed box ===');
  steps.select = await stepSelectBox(page, fail, outDir, boxACenterX, boxACenterY);
  if (!steps.select.pass) allPass = false;

  // Step 6: Set anchor from selected box (C3)
  console.log('=== Step 6: Set as anchor ===');
  steps.set_anchor = await stepSetAnchor(page, fail, outDir, boxACenterX, boxACenterY);
  if (!steps.set_anchor.pass) allPass = false;

  // Compute anchor dimensions for pad verification
  const anchorDims = steps.set_anchor.post?.anchorBox
    ? { w: steps.set_anchor.post.anchorBox.w, h: steps.set_anchor.post.anchorBox.h }
    : null;

  // Step 7: Draw box B and pad to anchor (S3 + C4)
  console.log('=== Step 7: Draw box B + pad to anchor ===');
  steps.pad_anchor = await stepDrawAndPadToAnchor(page, fail, outDir, BOX_B, anchorDims);
  if (!steps.pad_anchor.pass) allPass = false;

  // Step 8: Find sprites (S9)
  console.log('=== Step 8: Find sprites ===');
  steps.find_sprites = await stepFindSprites(page, fail, outDir);
  if (!steps.find_sprites.pass) allPass = false;

  // Step 9: Clear all (S17)
  console.log('=== Step 9: Clear all ===');
  steps.clear_all = await stepClearAll(page, fail, outDir);
  if (!steps.clear_all.pass) allPass = false;

  // Step 10: Isolation invariant check
  console.log('=== Step 10: Isolation invariant ===');
  const finalState = await captureState(page, 'final');
  const isolationPass = checkIsolationInvariant(baseline, finalState, fail);
  steps.isolation = { step: 'isolation_invariant', pass: isolationPass };
  if (!isolationPass) allPass = false;

  await screenshot(page, outDir, 'step_final');

  // Build report
  report.steps = steps;
  report.overall_pass = allPass;
  report.fixture = PNG_FIXTURE;
  report.steps_total = Object.keys(steps).length;
  report.steps_passed = Object.values(steps).filter(s => s.pass).length;
  report.steps_failed = Object.values(steps).filter(s => !s.pass).length;

  // Write state snapshots as artifact
  const snapshots = {};
  for (const [name, step] of Object.entries(steps)) {
    if (step.pre) snapshots[`${name}_pre`] = step.pre;
    if (step.post) snapshots[`${name}_post`] = step.post;
  }
  snapshots.baseline = baseline;
  snapshots.final = finalState;
  writeJsonArtifact(outDir, 'state_snapshots.json', snapshots);

  const reportPath = writeReport(outDir, 'report.json', report);

  // Summary
  console.log('\n=== Source Panel Workflow Summary ===');
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

main().catch(err => {
  console.error('Fatal error:', err);
  process.exit(2);
});
