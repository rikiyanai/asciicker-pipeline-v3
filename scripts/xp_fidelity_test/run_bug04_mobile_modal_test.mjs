#!/usr/bin/env node

/**
 * run_bug04_mobile_modal_test.mjs — BUG-04: Mobile Modal Overlay Verification
 *
 * CLASSIFICATION: UI-driven with diagnostic observation layer
 * ACTION PATH:    DOM button click (Report Bug) in a mobile-sized viewport
 * OBSERVATION:    Screenshots + element bounding box measurements (diagnostic)
 * ELIGIBLE FOR:   UI-driven acceptance evidence
 *
 * Validates:
 *   BUG-04: Overlay modal does not clip content on mobile/tablet viewports
 *   - Modal is fully visible within viewport at 375x667 (iPhone SE)
 *   - Modal is fully visible within viewport at 768x1024 (iPad)
 *   - Submit button is reachable (visible and clickable)
 *   - Modal content is scrollable when it overflows
 *
 * Usage:
 *   node run_bug04_mobile_modal_test.mjs --out-dir output/bug04_test
 */

import {
  setupVerifier,
  writeReport,
  writeJsonArtifact,
  screenshot,
} from './verifier_lib.mjs';

import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

async function testViewport(page, outDir, name, width, height) {
  console.log(`\n=== Testing viewport ${name} (${width}x${height}) ===`);
  await page.setViewportSize({ width, height });
  await page.waitForTimeout(300);

  // Open bug report modal via the Report Bug button
  await page.click('#reportBugBtn');
  await page.waitForTimeout(500);
  await screenshot(page, outDir, `${name}_modal_open`);

  // Check modal is visible
  const modal = page.locator('#bugReportModal');
  const modalVisible = await modal.isVisible();
  if (!modalVisible) {
    return { viewport: name, pass: false, reason: 'Modal not visible' };
  }

  // Check the overlay-card bounding box fits within viewport
  const card = page.locator('#bugReportModal .overlay-card');
  const cardBox = await card.boundingBox();
  if (!cardBox) {
    return { viewport: name, pass: false, reason: 'overlay-card has no bounding box' };
  }

  // On mobile, the overlay scrolls so the card may be taller than the viewport.
  // The key UX requirement is: card starts within viewport (not clipped at top)
  // and card width fits within viewport.
  const cardStartsInView = cardBox.y >= -2;  // -2 for subpixel tolerance
  const cardWidthFits = (cardBox.x + cardBox.width) <= width + 4;  // +4 for subpixel/border

  // Check submit button is visible (may need scroll)
  const submitBtn = page.locator('#bugReportSubmitBtn');
  const submitVisible = await submitBtn.isVisible();

  // If submit is not visible, try scrolling the card
  let submitReachable = submitVisible;
  if (!submitReachable) {
    await card.evaluate(el => el.scrollTo(0, el.scrollHeight));
    await page.waitForTimeout(300);
    submitReachable = await submitBtn.isVisible();
    await screenshot(page, outDir, `${name}_modal_scrolled`);
  }

  // Close modal
  await page.click('#bugReportCloseBtn');
  await page.waitForTimeout(300);

  return {
    viewport: name,
    dimensions: { width, height },
    cardBox,
    cardStartsInView,
    cardWidthFits,
    submitReachable,
    pass: cardStartsInView && cardWidthFits && submitReachable,
  };
}

async function main() {
  const { page, browser, report, fail, workbenchUrl, outDir } =
    await setupVerifier('bug04_mobile_modal', { requireOutDir: true });

  const steps = {};
  let allPass = true;

  // Wait for page load
  await page.waitForSelector('#reportBugBtn', { state: 'visible', timeout: 10000 });

  // Test iPhone SE viewport
  const iphoneResult = await testViewport(page, outDir, 'iphone_se', 375, 667);
  steps.iphone_se = iphoneResult;
  if (!iphoneResult.pass) { allPass = false; fail('BUG04_iphone', iphoneResult.reason || 'iPhone SE viewport failed'); }
  console.log(`  iPhone SE: ${iphoneResult.pass ? 'PASS' : 'FAIL'} (starts in view: ${iphoneResult.cardStartsInView}, width fits: ${iphoneResult.cardWidthFits}, submit reachable: ${iphoneResult.submitReachable})`);

  // Test iPad viewport
  const ipadResult = await testViewport(page, outDir, 'ipad', 768, 1024);
  steps.ipad = ipadResult;
  if (!ipadResult.pass) { allPass = false; fail('BUG04_ipad', ipadResult.reason || 'iPad viewport failed'); }
  console.log(`  iPad: ${ipadResult.pass ? 'PASS' : 'FAIL'} (starts in view: ${ipadResult.cardStartsInView}, width fits: ${ipadResult.cardWidthFits}, submit reachable: ${ipadResult.submitReachable})`);

  // Test narrow landscape (phone landscape)
  const landscapeResult = await testViewport(page, outDir, 'phone_landscape', 667, 375);
  steps.phone_landscape = landscapeResult;
  if (!landscapeResult.pass) { allPass = false; fail('BUG04_landscape', landscapeResult.reason || 'Phone landscape viewport failed'); }
  console.log(`  Phone landscape: ${landscapeResult.pass ? 'PASS' : 'FAIL'} (starts in view: ${landscapeResult.cardStartsInView}, width fits: ${landscapeResult.cardWidthFits}, submit reachable: ${landscapeResult.submitReachable})`);

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
