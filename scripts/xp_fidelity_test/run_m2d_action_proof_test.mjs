#!/usr/bin/env node

/**
 * run_m2d_action_proof_test.mjs — M2-D Action Proof: S3-S6, G5-G6, G9-G11
 *
 * CLASSIFICATION: UI-driven with diagnostic observation layer
 * ACTION PATH:    All actions via DOM clicks, file input
 * OBSERVATION:    State assertions via getState() / _state() (diagnostic)
 * ELIGIBLE FOR:   UI-driven acceptance evidence
 *
 * Validates:
 *   S3: Drag Row mode activation
 *   S4: Drag Column mode activation
 *   S5: Vertical Cut mode activation
 *   S6: Delete box mode activation
 *   G5: Add frame (requires selectedRow >= 0)
 *   G6: Delete selected frame (requires frame selected)
 *   G9: Assign row category (requires selectedRow)
 *   G10: Assign frame group (requires selectedRow + selectedCols)
 *   G11: Apply groups to anims (requires frame groups)
 *
 * Strategy:
 *   1. Upload PNG → source panel ready (for S3-S6 modes)
 *   2. Import XP → grid session (for G5-G6, G9-G11)
 *   3. S3-S6: click each mode button, verify sourceMode state change
 *   4. Click grid row header to establish selectedRow >= 0
 *   5. G5: add frame, verify gridCols increased
 *   6. G6: delete frame, verify gridCols decreased
 *   7. G9: assign row category, verify state
 *   8. G10: assign frame group, verify frameGroups populated
 *   9. G11: apply groups to anims, verify anims array updated
 *
 * Usage:
 *   node run_m2d_action_proof_test.mjs --out-dir output/m2d_action_proof
 *   node run_m2d_action_proof_test.mjs --xp sprites/attack-0001.xp --out-dir output/m2d_action_proof
 */

import {
  setupVerifier,
  captureState,
  waitForSessionHydration,
  readFrameCell,
  readFrameSignature,
  writeReport,
  writeJsonArtifact,
  screenshot,
} from './verifier_lib.mjs';

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, '..', '..');

const PNG_FIXTURE = 'tests/fixtures/known_good/cat_sheet.png';

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

async function dragSourceBox(page, x1, y1, x2, y2) {
  const canvas = page.locator('#sourceCanvas');
  const box = await canvas.boundingBox();
  if (!box) {
    throw new Error('sourceCanvas not found');
  }
  await page.mouse.move(box.x + x1, box.y + y1);
  await page.mouse.down();
  await page.mouse.move(box.x + x2, box.y + y2, { steps: 4 });
  await page.mouse.up();
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

const { page, browser, outDir, fail, report } = await setupVerifier('m2d_action_proof');

let allPass = true;
const steps = {};

try {
  // ── Setup: Upload PNG for source panel mode tests ──
  console.log('=== Setup: Upload PNG ===');
  const pngPath = path.resolve(REPO_ROOT, PNG_FIXTURE);
  await page.setInputFiles('#wbFile', pngPath);
  await page.click('#wbUpload');
  await page.waitForTimeout(2000);
  const postUpload = await captureState(page, 'post_upload');
  await screenshot(page, outDir, 'setup_upload');

  const uploadOk = !!postUpload.sourceImageLoaded;
  steps.setup_upload = { step: 'upload_png', pass: uploadOk, sourceImageLoaded: postUpload.sourceImageLoaded };
  if (!uploadOk) {
    fail('setup', 'PNG upload failed — sourceImageLoaded not set', { postUpload });
    allPass = false;
  }

  // ── S3: Drag Row mode ──
  console.log('=== Step 1: S3 Drag Row mode ===');
  await page.click('#rowSelectBtn');
  await page.waitForTimeout(200);
  const postS3 = await captureState(page, 'post_s3');
  await screenshot(page, outDir, 'step01_s3_row_select');
  const s3Pass = assert(
    postS3.sourceMode === 'row_select',
    fail, 's3_row_select', `sourceMode should be "row_select", got "${postS3.sourceMode}"`,
    { postS3 }
  );
  steps.s3_row_select = { step: 'row_select_mode', pass: s3Pass, sourceMode: postS3.sourceMode };
  if (!s3Pass) allPass = false;

  // ── S4: Drag Column mode ──
  console.log('=== Step 2: S4 Drag Column mode ===');
  await page.click('#colSelectBtn');
  await page.waitForTimeout(200);
  const postS4 = await captureState(page, 'post_s4');
  await screenshot(page, outDir, 'step02_s4_col_select');
  const s4Pass = assert(
    postS4.sourceMode === 'col_select',
    fail, 's4_col_select', `sourceMode should be "col_select", got "${postS4.sourceMode}"`,
    { postS4 }
  );
  steps.s4_col_select = { step: 'col_select_mode', pass: s4Pass, sourceMode: postS4.sourceMode };
  if (!s4Pass) allPass = false;

  // ── S5: Vertical Cut mode ──
  console.log('=== Step 3: S5 Vertical Cut mode ===');
  await page.click('#cutVBtn');
  await page.waitForTimeout(200);
  const postS5 = await captureState(page, 'post_s5');
  await screenshot(page, outDir, 'step03_s5_cut_v');
  const s5Pass = assert(
    postS5.sourceMode === 'cut_v',
    fail, 's5_cut_v', `sourceMode should be "cut_v", got "${postS5.sourceMode}"`,
    { postS5 }
  );
  steps.s5_cut_v = { step: 'cut_v_mode', pass: s5Pass, sourceMode: postS5.sourceMode };
  if (!s5Pass) allPass = false;

  // ── S6: Delete box (action button, not mode switch) ──
  // First create an actual draft box so the action has something real to clear.
  console.log('=== Step 4: S6 Delete box ===');
  await page.click('#drawBoxBtn');
  await page.waitForTimeout(200);
  await dragSourceBox(page, 24, 24, 72, 72);
  await page.waitForTimeout(300);
  const preS6 = await captureState(page, 'pre_s6');
  const hadOverlayBeforeDelete = !!preS6.drawCurrent || preS6.extractedBoxes > 0 || preS6.anchorBox !== null;
  await page.click('#deleteBoxBtn');
  await page.waitForTimeout(200);
  const postS6 = await captureState(page, 'post_s6');
  await screenshot(page, outDir, 'step04_s6_delete_box');
  // After delete-all: extractedBoxes=0, anchorBox=null, drawCurrent=null
  const s6Pass = assert(
    hadOverlayBeforeDelete &&
      postS6.extractedBoxes === 0 &&
      postS6.anchorBox === null &&
      postS6.drawCurrent === null,
    fail, 's6_delete_box',
    `Delete must clear a real prior overlay. beforeHadOverlay=${hadOverlayBeforeDelete}, extractedBoxes=${postS6.extractedBoxes}, anchorBox=${JSON.stringify(postS6.anchorBox)}, drawCurrent=${JSON.stringify(postS6.drawCurrent)}`,
    { preS6, postS6 }
  );
  steps.s6_delete_box = {
    step: 'delete_box_action',
    pass: s6Pass,
    hadOverlayBeforeDelete,
    extractedBoxes: postS6.extractedBoxes,
    anchorBox: postS6.anchorBox,
    drawCurrent: postS6.drawCurrent,
  };
  if (!s6Pass) allPass = false;

  // ── Setup for grid tests: Import XP to get a session with grid ──
  console.log('=== Setup: Import XP for grid tests ===');
  const xpPath = path.resolve(REPO_ROOT, 'sprites/attack-0001.xp');
  if (!fs.existsSync(xpPath)) {
    fail('setup_xp', `XP fixture not found: ${xpPath}`);
    allPass = false;
  } else {
    await page.setInputFiles('#xpImportFile', xpPath);
    await page.click('#xpImportBtn');
    await waitForSessionHydration(page, { timeout: 30000 });
    await page.waitForTimeout(1000);
    const postImport = await captureState(page, 'post_xp_import');
    await screenshot(page, outDir, 'setup_xp_import');

    const importOk = !!postImport.sessionId && postImport.gridCols > 0;
    steps.setup_xp_import = {
      step: 'xp_import',
      pass: importOk,
      sessionId: postImport.sessionId,
      gridCols: postImport.gridCols,
      gridRows: postImport.gridRows,
    };
    if (!importOk) {
      fail('setup_xp', 'XP import failed', { postImport });
      allPass = false;
    }

    // ── Select grid row 0 by clicking row header ──
    console.log('=== Setup: Select grid row 0 ===');
    const rowHeader = page.locator('.frame-row-header[data-row="0"]').first();
    await rowHeader.click({ timeout: 5000 }).catch(() => {
      fail('setup_row', '.frame-row-header[data-row="0"] not clickable');
    });
    await page.waitForTimeout(300);
    const postRowSelect = await captureState(page, 'post_row_select');
    await screenshot(page, outDir, 'setup_row_select');

    const rowSelected = postRowSelect.selectedRow === 0;
    steps.setup_row_select = { step: 'row_select', pass: rowSelected, selectedRow: postRowSelect.selectedRow };
    if (!rowSelected) {
      fail('setup_row', `selectedRow should be 0, got ${postRowSelect.selectedRow}`, { postRowSelect });
      allPass = false;
    }

    // ── G5: Add frame ──
    console.log('=== Step 5: G5 Add frame ===');
    const preG5 = await captureState(page, 'pre_g5');
    const preG5Cols = preG5.gridCols;
    await page.click('#addFrameBtn');
    await page.waitForTimeout(500);
    const postG5 = await captureState(page, 'post_g5');
    await screenshot(page, outDir, 'step05_g5_add_frame');
    const g5Pass = assert(
      postG5.gridCols > preG5Cols,
      fail, 'g5_add_frame', `gridCols should increase from ${preG5Cols}, got ${postG5.gridCols}`,
      { preG5Cols, postG5Cols: postG5.gridCols }
    );
    steps.g5_add_frame = { step: 'add_frame', pass: g5Pass, before: preG5Cols, after: postG5.gridCols };
    if (!g5Pass) allPass = false;

    // ── G6: Delete selected frames (clears frame cell content, does not remove columns) ──
    // Select frame (0,0) — a pre-existing frame with imported XP content (non-empty).
    // Then delete it and verify the cell content was actually cleared.
    console.log('=== Step 6: G6 Delete selected frames ===');
    // Click on frame cell at row=0, col=0 — this has content from imported XP
    const targetFrameCell = page.locator('.frame-cell[data-row="0"][data-col="0"]').first();
    const targetVisible = await targetFrameCell.isVisible().catch(() => false);
    if (targetVisible) {
      await targetFrameCell.click();
      await page.waitForTimeout(200);
    }
    const preG6 = await captureState(page, 'pre_g6');
    const preG6Sig = await readFrameSignature(page, 0, 0);
    const preG6Cell = await readFrameCell(page, 0, 0, 0, 0);
    await page.click('#deleteCellBtn');
    await page.waitForTimeout(500);
    const postG6 = await captureState(page, 'post_g6');
    const postG6Sig = await readFrameSignature(page, 0, 0);
    const postG6Cell = await readFrameCell(page, 0, 0, 0, 0);
    await screenshot(page, outDir, 'step06_g6_delete_frames');
    // Proof: frame signature changed (content cleared) or cell glyph changed to 0 (empty)
    const sigChanged = postG6Sig !== preG6Sig;
    const glyphChanged = preG6Cell?.cell?.glyph !== postG6Cell?.cell?.glyph;
    const g6Pass = assert(
      sigChanged || glyphChanged,
      fail, 'g6_delete_frames',
      `Frame content should change after delete. Sig: "${preG6Sig}" → "${postG6Sig}", glyph: ${preG6Cell?.cell?.glyph} → ${postG6Cell?.cell?.glyph}`,
      { preG6Sig, postG6Sig, preG6Cell, postG6Cell }
    );
    steps.g6_delete_frames = { step: 'delete_frames', pass: g6Pass, sigChanged, glyphChanged, preGlyph: preG6Cell?.cell?.glyph, postGlyph: postG6Cell?.cell?.glyph };
    if (!g6Pass) allPass = false;

    // ── Re-select row for G9-G11 (row selection may have been cleared) ──
    console.log('=== Setup: Re-select row 0 for metadata tests ===');
    const rowHeaderReselect = page.locator('.frame-row-header[data-row="0"]').first();
    await rowHeaderReselect.click({ timeout: 5000 }).catch(() => {
      fail('setup_reselect', '.frame-row-header[data-row="0"] not clickable for reselect');
    });
    await page.waitForTimeout(300);

    // ── G9: Assign row category ──
    console.log('=== Step 7: G9 Assign row category ===');
    const catSelect = page.locator('#animCategorySelect');
    const catSelectVisible = await catSelect.isVisible().catch(() => false);
    if (catSelectVisible) {
      const preG9 = await captureState(page, 'pre_g9');
      const preRowCategory = preG9.rowCategories?.[0] ?? null;
      const optionCount = await catSelect.locator('option').count();
      let chosenValue = null;
      for (let i = 0; i < optionCount; i += 1) {
        const value = await catSelect.locator('option').nth(i).getAttribute('value');
        if (value !== null && String(value) !== String(preRowCategory)) {
          chosenValue = String(value);
          break;
        }
      }
      if (chosenValue === null && optionCount > 0) {
        chosenValue = String(await catSelect.locator('option').nth(0).getAttribute('value'));
      }
      if (chosenValue !== null) {
        await catSelect.selectOption(chosenValue);
      }
      await page.click('#assignAnimCategoryBtn');
      await page.waitForTimeout(300);
      const postG9 = await captureState(page, 'post_g9');
      await screenshot(page, outDir, 'step07_g9_assign_row_category');
      const rowCats = postG9.rowCategories || {};
      const g9Pass = chosenValue !== null && String(rowCats[0]) === chosenValue && String(preRowCategory) !== chosenValue;
      steps.g9_assign_row_category = {
        step: 'assign_row_category',
        pass: g9Pass,
        before: preRowCategory,
        chosenValue,
        after: rowCats[0],
      };
      if (!g9Pass) {
        fail('g9_assign_row_category', `rowCategories[0] must change to chosen value. before=${preRowCategory} chosen=${chosenValue} after=${rowCats[0]}`, { preG9, postG9 });
        allPass = false;
      }
    } else {
      // Element not visible — classify as WIRED with evidence
      steps.g9_assign_row_category = { step: 'assign_row_category', pass: false, blocked: 'animCategorySelect not visible' };
      fail('g9_assign_row_category', '#animCategorySelect not visible in current layout');
      allPass = false;
    }

    // ── G10: Assign frame group ──
    // Select only frame (0,0) — a single column, NOT the whole row.
    // This ensures G11 (applyGroupsToAnims) produces a VISIBLE change:
    // one group of 1 frame + remaining frames → anims splits from [N] to [1, N-1].
    console.log('=== Step 8: G10 Assign frame group ===');
    const singleFrame = page.locator('.frame-cell[data-row="0"][data-col="0"]').first();
    const singleFrameVis = await singleFrame.isVisible().catch(() => false);
    if (singleFrameVis) {
      await singleFrame.click();
      await page.waitForTimeout(200);
    }
    const groupNameInput = page.locator('#frameGroupName');
    const groupNameVisible = await groupNameInput.isVisible().catch(() => false);
    if (groupNameVisible) {
      await groupNameInput.fill('test_group');
      await page.click('#assignFrameGroupBtn');
      await page.waitForTimeout(300);
      const postG10 = await captureState(page, 'post_g10');
      await screenshot(page, outDir, 'step08_g10_assign_frame_group');
      const fg = postG10.frameGroups || [];
      const g10Pass = fg.length > 0 && fg.some(g => g.name === 'test_group');
      steps.g10_assign_frame_group = { step: 'assign_frame_group', pass: g10Pass, frameGroups: fg };
      if (!g10Pass) {
        fail('g10_assign_frame_group', `frameGroups should contain "test_group", got ${JSON.stringify(fg)}`, { postG10 });
        allPass = false;
      }
    } else {
      steps.g10_assign_frame_group = { step: 'assign_frame_group', pass: false, blocked: 'frameGroupName not visible' };
      fail('g10_assign_frame_group', '#frameGroupName not visible in current layout');
      allPass = false;
    }

    // ── G11: Apply groups to anims ──
    console.log('=== Step 9: G11 Apply groups to anims ===');
    const applyBtn = page.locator('#applyGroupsToAnimsBtn');
    const applyBtnVisible = await applyBtn.isVisible().catch(() => false);
    if (applyBtnVisible) {
      const preG11 = await captureState(page, 'pre_g11');
      const preAnims = JSON.stringify(preG11.anims);
      await applyBtn.click();
      await page.waitForTimeout(300);
      const postG11 = await captureState(page, 'post_g11');
      await screenshot(page, outDir, 'step09_g11_apply_groups');
      const postAnims = JSON.stringify(postG11.anims);
      // Proof: anims array actually changed (not just non-empty).
      // applyGroupsToAnims recalculates the anims distribution from frame groups,
      // so we compare pre vs post serialized arrays.
      const animsChanged = preAnims !== postAnims;
      // Require actual anims change — historyDepth growth alone is not sufficient
      // because pushHistory() fires before the state change, not as proof of it.
      const g11Pass = animsChanged;
      steps.g11_apply_groups = {
        step: 'apply_groups',
        pass: g11Pass,
        animsChanged,
        preAnims: preAnims,
        postAnims: postAnims,
      };
      if (!g11Pass) {
        fail('g11_apply_groups', `anims must actually change. pre=${preAnims} post=${postAnims}`, { preG11, postG11 });
        allPass = false;
      }
    } else {
      steps.g11_apply_groups = { step: 'apply_groups', pass: false, blocked: 'applyGroupsToAnimsBtn not visible' };
      fail('g11_apply_groups', '#applyGroupsToAnimsBtn not visible in current layout');
      allPass = false;
    }
  }

  // ── Write report ──
  report.steps = steps;
  report.overall_pass = allPass;
  writeReport(outDir, 'report.json', report);

  // Summary
  console.log('');
  console.log('=== M2-D Action Proof Summary ===');
  console.log(`Steps: ${Object.values(steps).filter(s => s.pass).length}/${Object.keys(steps).length} passed`);
  for (const [k, v] of Object.entries(steps)) {
    console.log(`  ${v.pass ? 'PASS' : 'FAIL'} ${k}`);
  }
  console.log(`Overall: ${allPass ? 'PASS' : 'FAIL'}`);
  console.log(`Report: ${outDir}/report.json`);

} finally {
  await browser.close();
}

process.exit(allPass ? 0 : 1);
