/**
 * Bundle authoring runner.
 *
 * CLASSIFICATION: mixed — UI-driven actions with debug API state observation
 * ACTION PATH:    Tab switching via DOM click, whole-sheet painting via canvas mouse events
 * OBSERVATION:    State waits via __wb_debug._state() and __wb_debug.getState()
 * ELIGIBLE FOR:   M1 historical evidence (closed under then-accepted model).
 *                 NOT pure UI-driven acceptance going forward.
 * CAVEAT:         Uses page.evaluate() + _state() for tab-switch readiness waits.
 *                 Actions are UI-driven; observation layer is diagnostic.
 *
 * Part of the canonical XP fidelity verifier family (scripts/xp_fidelity_test/).
 *
 * Orchestrates the full 3-action bundle authoring flow:
 *   1. Apply player_native_full template (creates blank sessions)
 *   2. For each action (idle, attack, death):
 *      - Switch to action tab
 *      - Execute whole-sheet recipe
 *      - Export and verify structure + L2 cell fidelity
 *   3. Test full bundle in Skin Dock
 *   4. Generate bundle-level report
 *
 * Invoked by run_bundle.sh after truth tables and recipes are generated.
 */
import { chromium } from 'playwright';
import fs from 'fs';
import path from 'path';
import { spawnSync } from 'child_process';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, '..', '..');
const argv = process.argv.slice(2);
const DEFAULT_WORKBENCH_URL = process.env.WORKBENCH_URL || 'http://127.0.0.1:5071/workbench';

function getArg(name, fallback = null) {
  const idx = argv.indexOf(name);
  return idx >= 0 ? argv[idx + 1] : fallback;
}

const headed = argv.includes('--headed');
const holdOpen = argv.includes('--hold');
const url = getArg('--url', DEFAULT_WORKBENCH_URL);
const outDir = getArg('--out-dir');

const ACTION_KEYS = ['idle', 'attack', 'death'];
const ACTION_LABELS = { idle: /Idle \/ Walk/i, attack: /^Attack/i, death: /^Death/i };

// --preload idle=/path/to/exported.xp  — skip replay, upload pre-built XP instead.
// The preloaded XP is still verified against the truth table for cell fidelity.
const preloadXps = {};
for (const key of ACTION_KEYS) {
  const val = getArg(`--preload-${key}`);
  if (val) preloadXps[key] = val;
}

const actionInputs = {};
for (const key of ACTION_KEYS) {
  const truth = getArg(`--${key}-truth`);
  const recipe = getArg(`--${key}-recipe`);
  if (!truth || !recipe) {
    console.error(`Missing --${key}-truth or --${key}-recipe`);
    process.exit(1);
  }
  actionInputs[key] = {
    truthTable: JSON.parse(fs.readFileSync(truth, 'utf-8')),
    recipe: JSON.parse(fs.readFileSync(recipe, 'utf-8')),
  };
}

if (!outDir) {
  console.error('Missing --out-dir');
  process.exit(1);
}

// ── Whole-sheet action whitelist ──

const ALLOWED_ACTIONS = new Set([
  'wait_visible', 'ws_tool_activate', 'ws_ensure_apply', 'ws_set_draw_state',
  'ws_paint_cell', 'ws_eyedropper_sample', 'ws_erase_cell', 'ws_erase_drag',
  'ws_flood_fill', 'ws_draw_rect', 'ws_draw_line',
]);

// ── Report structures ──

const failures = [];
const report = {
  workflow_type: 'bundle_authoring',
  mode: 'acceptance',
  template: 'player_native_full',
  idle_pass: false,
  attack_pass: false,
  death_pass: false,
  skin_dock_pass: false,
  overall_pass: false,
  actions: {},
  failures,
};

for (const key of ACTION_KEYS) {
  report.actions[key] = {
    geometry_pass: false,
    frame_layout_pass: false,
    execute_pass: false,
    export_pass: false,
    cell_fidelity_pass: false,
    all_layers_pass: false,
    failures: [],
  };
}

function fail(actionKey, cls, message, extra = {}) {
  const rec = { action: actionKey || 'bundle', class: cls, message, ...extra };
  failures.push(rec);
  if (actionKey && report.actions[actionKey]) {
    report.actions[actionKey].failures.push(rec);
  }
  console.error(`[FAIL:${actionKey || 'bundle'}:${cls}] ${message}`);
}

function parseJsonText(text, label) {
  try {
    return JSON.parse(text);
  } catch (err) {
    fail(null, 'json_parse', `${label} was not valid JSON`);
    return null;
  }
}

// ── Scroll + drag helpers (from run_fidelity_test.mjs) ──

// Returns true if scrolling actually happened.
async function centerCanvasRegion(page, leftPx, topPx, rightPx, bottomPx) {
  return page.evaluate(({ left, top, right, bottom }) => {
    const scroll = document.getElementById('wholeSheetScroll');
    if (!scroll) return false;
    const viewW = scroll.clientWidth;
    const viewH = scroll.clientHeight;
    const cx = (left + right) / 2;
    const cy = (top + bottom) / 2;
    const safeLeft = scroll.scrollLeft + viewW * 0.2;
    const safeRight = scroll.scrollLeft + viewW * 0.8;
    const safeTop = scroll.scrollTop + viewH * 0.2;
    const safeBottom = scroll.scrollTop + viewH * 0.8;
    const needX = cx < safeLeft || cx > safeRight;
    const needY = cy < safeTop || cy > safeBottom;
    if (needX || needY) {
      scroll.scrollLeft = Math.max(0, cx - viewW / 2);
      scroll.scrollTop = Math.max(0, cy - viewH / 2);
      return true;
    }
    return false;
  }, { left: leftPx, top: topPx, right: rightPx, bottom: bottomPx });
}

// Per-selector bounding box cache.  Invalidated whenever a scroll happens.
const _bboxCache = { selector: null, box: null };

async function _getCanvasBox(page, selector, didScroll) {
  if (!didScroll && _bboxCache.selector === selector && _bboxCache.box) {
    return _bboxCache.box;
  }
  const box = await page.locator(selector).boundingBox();
  if (!box) throw new Error(`canvas element not found: ${selector}`);
  _bboxCache.selector = selector;
  _bboxCache.box = box;
  return box;
}

// Get the scroll container's viewport bounds for visibility checks.
async function _getScrollBounds(page) {
  return page.evaluate(() => {
    const scroll = document.getElementById('wholeSheetScroll');
    if (!scroll) return null;
    const rect = scroll.getBoundingClientRect();
    return { x: rect.left, y: rect.top, w: rect.width, h: rect.height };
  });
}

// Verify viewport coordinates are inside the scroll container's visible area.
// If not, force-scroll to center the target and refresh the bounding box.
async function _ensureVisible(page, selector, canvasPx, canvasPy, vpX, vpY) {
  const bounds = await _getScrollBounds(page);
  if (!bounds) return { vpX, vpY, refreshed: false };
  const margin = 4; // px inside the container edge
  if (vpX >= bounds.x + margin && vpX <= bounds.x + bounds.w - margin &&
      vpY >= bounds.y + margin && vpY <= bounds.y + bounds.h - margin) {
    return { vpX, vpY, refreshed: false };
  }
  // Force-center the target and refresh the bounding box.
  await page.evaluate(({ tx, ty }) => {
    const scroll = document.getElementById('wholeSheetScroll');
    if (!scroll) return;
    scroll.scrollLeft = Math.max(0, tx - scroll.clientWidth / 2);
    scroll.scrollTop = Math.max(0, ty - scroll.clientHeight / 2);
  }, { tx: canvasPx, ty: canvasPy });
  const box = await page.locator(selector).boundingBox();
  if (!box) throw new Error(`canvas element not found after re-scroll: ${selector}`);
  _bboxCache.selector = selector;
  _bboxCache.box = box;
  return { vpX: box.x + canvasPx, vpY: box.y + canvasPy, refreshed: true };
}

async function dragOnCanvas(page, selector, x1, y1, x2, y2, cellSize) {
  const startPx = x1 * cellSize + cellSize / 2;
  const startPy = y1 * cellSize + cellSize / 2;
  const endPx = x2 * cellSize + cellSize / 2;
  const endPy = y2 * cellSize + cellSize / 2;
  const didScroll = await centerCanvasRegion(
    page,
    Math.min(startPx, endPx),
    Math.min(startPy, endPy),
    Math.max(startPx, endPx),
    Math.max(startPy, endPy),
  );
  const canvasBox = await _getCanvasBox(page, selector, didScroll);
  const vpX1 = canvasBox.x + startPx;
  const vpY1 = canvasBox.y + startPy;
  const vpX2 = canvasBox.x + endPx;
  const vpY2 = canvasBox.y + endPy;
  await page.mouse.move(vpX1, vpY1);
  await page.mouse.down();
  await page.mouse.move(vpX2, vpY2);
  await page.mouse.up();
}

async function clickCanvasCell(page, selector, x, y, cellSize) {
  const posX = x * cellSize + cellSize / 2;
  const posY = y * cellSize + cellSize / 2;
  const didScroll = await centerCanvasRegion(page, posX, posY, posX, posY);
  const canvasBox = await _getCanvasBox(page, selector, didScroll);
  let vpX = canvasBox.x + posX;
  let vpY = canvasBox.y + posY;
  // For edge cells where the safe-zone centering can't fully protect
  // (top/bottom rows, left/right columns near scroll limits), verify the
  // click lands inside the scroll container and force-recenter if not.
  const vis = await _ensureVisible(page, selector, posX, posY, vpX, vpY);
  vpX = vis.vpX;
  vpY = vis.vpY;
  await page.mouse.click(vpX, vpY);
}

// ── Recipe executor ──

// Throttle interval: yield to browser every N actions to prevent
// Chromium from OOM-crashing under sustained canvas/DOM churn.
const THROTTLE_EVERY = 200;
const THROTTLE_MS = 50;

async function executeRecipe(page, actionKey, recipe) {
  const actions = recipe.actions || [];
  for (let i = 0; i < actions.length; i++) {
    const action = actions[i];
    if (!ALLOWED_ACTIONS.has(action.action)) {
      fail(actionKey, 'mode_violation', `Whole-sheet mode refused action: ${action.action}`);
      return false;
    }

    // Periodic yield — lets the browser flush its event queue and GC.
    if (i > 0 && i % THROTTLE_EVERY === 0) {
      await page.waitForTimeout(THROTTLE_MS);
    }

    switch (action.action) {
      case 'wait_visible':
        await page.waitForSelector(action.selector, { state: 'visible', timeout: action.timeout_ms || 5000 });
        break;

      case 'ws_tool_activate':
        await page.locator(action.selector).scrollIntoViewIfNeeded({ timeout: 10000 });
        await page.click(action.selector);
        break;

      case 'ws_ensure_apply': {
        const btn = page.locator(action.selector);
        await btn.scrollIntoViewIfNeeded({ timeout: 10000 });
        const isOn = await btn.evaluate((el) => el.classList.contains('ws-toggle-on'));
        if (isOn !== action.state) await btn.click();
        break;
      }

      case 'ws_set_draw_state':
        await page.fill(action.glyph_selector, String(action.glyph));
        await page.locator(action.glyph_selector).dispatchEvent('change');
        await page.fill(action.fg_selector, action.fg);
        await page.locator(action.fg_selector).dispatchEvent('input');
        await page.fill(action.bg_selector, action.bg);
        await page.locator(action.bg_selector).dispatchEvent('input');
        break;

      case 'ws_paint_cell': {
        const cs = action.cell_size;
        await clickCanvasCell(page, action.selector, action.x, action.y, cs);
        break;
      }

      case 'ws_eyedropper_sample': {
        const cs2 = action.cell_size;
        await clickCanvasCell(page, action.selector, action.x, action.y, cs2);
        // NOTE: In blank authoring, L2 starts transparent. Pre-paint eyedropper
        // verification will sample transparent cells, not reference content.
        // Eyedropper mismatches before painting are expected and non-fatal.
        // Post-paint content is verified via export cell comparison.
        break;
      }

      case 'ws_erase_cell': {
        const cs3 = action.cell_size;
        await clickCanvasCell(page, action.selector, action.x, action.y, cs3);
        break;
      }

      case 'ws_erase_drag':
        await dragOnCanvas(page, action.selector, action.x1, action.y1, action.x2, action.y2, action.cell_size);
        break;

      case 'ws_flood_fill': {
        const csff = action.cell_size;
        await clickCanvasCell(page, action.selector, action.x, action.y, csff);
        break;
      }

      case 'ws_draw_rect': {
        const csdr = action.cell_size;
        await dragOnCanvas(page, action.selector, action.x, action.y, action.x + action.w - 1, action.y + action.h - 1, csdr);
        break;
      }

      case 'ws_draw_line':
        await dragOnCanvas(page, action.selector, action.x1, action.y1, action.x2, action.y2, action.cell_size);
        break;

      default:
        fail(actionKey, 'unknown_action', `Unknown action: ${action.action}`);
        return false;
    }
  }
  return true;
}

// ── Truth table runner ──

function runTruthTable(xpFile, outputPath) {
  const result = spawnSync(
    'python3',
    ['scripts/xp_fidelity_test/truth_table.py', xpFile, '--output', outputPath],
    { cwd: repoRoot, encoding: 'utf-8' }
  );
  if (result.status !== 0) {
    throw new Error(`truth_table.py failed: ${result.stderr || result.stdout}`);
  }
  return JSON.parse(fs.readFileSync(outputPath, 'utf-8'));
}

// ── Proof region cell comparison ──

function sameRgb(a, b) {
  return Array.isArray(a) && Array.isArray(b) && a.length === 3 && b.length === 3
    && a[0] === b[0] && a[1] === b[1] && a[2] === b[2];
}

const MAGENTA = [255, 0, 255];

/** Returns true if a cell is functionally transparent (no visible content). */
function isCellTransparent(c) {
  if (!c) return true;
  // REXPaint transparent: glyph=0, bg=magenta
  if (c.glyph === 0 && sameRgb(c.bg, MAGENTA)) return true;
  // REXPaint space-transparent: glyph=32 (space), bg=magenta
  if (c.glyph === 32 && sameRgb(c.bg, MAGENTA)) return true;
  // Editor erased state: glyph=0, fg=white, bg=black
  if (c.glyph === 0 && sameRgb(c.fg, [255, 255, 255]) && sameRgb(c.bg, [0, 0, 0])) return true;
  return false;
}

/**
 * Compare L2 cells in the proof region between reference and exported truth tables.
 * For blank authoring, L0/L1/L3 won't match the reference (built from templates,
 * not copied from the reference XP). Cell fidelity is verified only for L2 in the
 * proof region where the recipe painted.
 *
 * Cells that are functionally transparent in BOTH reference and export are treated
 * as matching — the exact transparent representation may differ (glyph=0 vs glyph=32,
 * magenta bg vs black bg) but all represent "empty" in the sprite.
 */
function compareProofRegion(refTruth, exportedTruth, proofRegion) {
  const mismatches = [];
  const refL2 = refTruth.layers?.[2];
  const expL2 = exportedTruth.layers?.[2];
  if (!refL2 || !expL2) {
    return { ok: false, mismatches: [{ type: 'layer_missing', layer: 2 }] };
  }

  const width = refTruth.width;
  const { x: px, y: py, w: pw, h: ph } = proofRegion;

  for (let cy = py; cy < py + ph; cy++) {
    for (let cx = px; cx < px + pw; cx++) {
      const idx = cy * width + cx;
      const refCell = refL2.cells[idx];
      const expCell = expL2.cells?.[idx];
      if (!refCell || !expCell) {
        mismatches.push({ type: 'cell_missing', layer: 2, x: cx, y: cy, idx });
        continue;
      }
      // Both transparent → match regardless of representation
      if (isCellTransparent(refCell) && isCellTransparent(expCell)) continue;
      if (
        refCell.glyph !== expCell.glyph ||
        !sameRgb(refCell.fg, expCell.fg) ||
        !sameRgb(refCell.bg, expCell.bg)
      ) {
        mismatches.push({
          type: 'cell', layer: 2, x: cx, y: cy,
          expected: refCell, actual: expCell,
        });
        if (mismatches.length >= 30) return { ok: false, mismatches };
      }
    }
  }
  return { ok: mismatches.length === 0, mismatches };
}

// ── Session metadata reader ──

async function readSummary(page) {
  const sessionText = await page.locator('#sessionOut').textContent();
  const metaText = await page.locator('#metaOut').textContent();
  return {
    session: sessionText ? parseJsonText(sessionText, 'sessionOut') : null,
    meta: metaText ? parseJsonText(metaText, 'metaOut') : null,
  };
}

// ── Skin Dock helpers ──

async function captureFrameProbe(frameHandle, label) {
  try {
    return await frameHandle.evaluate((label0) => {
      const overlay = document.getElementById('login-overlay');
      const canvas = document.getElementById('asciicker_canvas');
      const overlayVisible = (() => {
        if (!overlay) return false;
        const cs = getComputedStyle(overlay);
        return !overlay.hidden && cs.display !== 'none' && cs.visibility !== 'hidden';
      })();
      const safeCall = (fn) => { try { return typeof fn === 'function' ? fn() : null; } catch (_e) { return null; } };
      const out = {
        label: String(label0 || ''),
        overlayVisible,
        canvasPresent: !!canvas,
        wasmReady: !!window._wasmReady,
        gameMainMenu: safeCall(window.GameMainMenuActive),
        worldReady: safeCall(window.GameWorldReady),
        renderStage: safeCall(window.GetRenderStageCode),
        pos: null,
      };
      try {
        if (window.ak && typeof window.ak.getPos === 'function') {
          const p = [0, 0, 0];
          window.ak.getPos(p, 0);
          out.pos = p.map((v) => Number(v));
        }
      } catch (_e) {}
      // RAF frame count + crash count as evidence of active render loop
      try {
        if (window.__ak_diag) {
          out.rafCount = window.__ak_diag.raf || 0;
          out.renderCrashes = window.__ak_diag.crashes || 0;
        }
      } catch (_e) {}
      return out;
    }, label);
  } catch (e) {
    return { label, error: String(e) };
  }
}

function probeShowsWorldStarted(probe) {
  if (!probe || typeof probe !== 'object') return false;
  const asBool = (v) => v === true || Number(v) === 1;
  const asNum = (v) => { const n = Number(v); return Number.isFinite(n) ? n : null; };
  const mainMenu = asBool(probe.gameMainMenu);
  const worldReady = asBool(probe.worldReady);
  const renderStage = asNum(probe.renderStage);
  const p = Array.isArray(probe.pos) ? probe.pos : [];
  const nonZeroPos = p.some((v) => Number.isFinite(v) && Math.abs(v) > 1e-3);
  // WASM probe paths (original)
  if (worldReady && !mainMenu) return true;
  if (renderStage !== null && renderStage >= 70 && !mainMenu) return true;
  if (!mainMenu && nonZeroPos) return true;
  // Visual evidence path: if RAF is actively rendering (high frame count,
  // no crashes) and overlay is dismissed, the world is likely running
  // even if GameMainMenuActive lies. renderStage > 0 confirms the render
  // loop reached at least initial rendering.
  if (probe.rafCount > 30 && !probe.overlayVisible && probe.renderCrashes === 0) {
    if (renderStage !== null && renderStage > 0) {
      return true;
    }
  }
  return false;
}

async function pulseMainMenuAdvance(frameHandle) {
  return await frameHandle.evaluate(() => {
    const out = { keyb: false, dom: false };
    try {
      if (typeof window.Keyb === 'function') {
        window.Keyb(0, 3); window.Keyb(2, 10); window.Keyb(1, 3);
        out.keyb = true;
      }
    } catch (_e) {}
    try {
      for (const t of [window, document, document.body, document.getElementById('asciicker_canvas')]) {
        if (!t || typeof t.dispatchEvent !== 'function') continue;
        t.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', code: 'Enter', keyCode: 13, which: 13, bubbles: true }));
        t.dispatchEvent(new KeyboardEvent('keyup', { key: 'Enter', code: 'Enter', keyCode: 13, which: 13, bubbles: true }));
        out.dom = true;
      }
    } catch (_e) {}
    return out;
  });
}

// ── Main ──

async function main() {
  const browser = await chromium.launch({ headless: !headed });
  const page = await browser.newPage({
    viewport: { width: 1500, height: 980 },
    acceptDownloads: true,
  });

  try {
    // ── Step 1: Navigate and apply template ──
    console.error('[1] Navigating to workbench...');
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 });
    await page.waitForTimeout(2000);

    // Wait for runtime preflight
    await page.waitForFunction(() => {
      const s = window.__wb_debug && typeof window.__wb_debug.getWebbuildDebugState === 'function'
        ? window.__wb_debug.getWebbuildDebugState() : null;
      return !!(s && s.runtimePreflight && s.runtimePreflight.checked === true);
    }, null, { timeout: 30000 });

    console.error('[2] Applying player_native_full template...');
    await page.selectOption('#templateSelect', 'player_native_full');
    await page.click('#templateApplyBtn');

    // Wait for bundle creation (blank sessions)
    await page.waitForFunction(() => {
      const bundleStatus = String(document.getElementById('bundleStatus')?.textContent || '');
      const quickText = String(document.getElementById('webbuildQuickTestBtn')?.textContent || '');
      const status = String(document.getElementById('wbStatus')?.textContent || '');
      return bundleStatus.includes('Bundle: 0/3')
        && /Test Bundle Skin/i.test(quickText)
        && (/Bundle created:/i.test(status) || /Authoring bundle ready:/i.test(status));
    }, null, { timeout: 60000 });

    console.error('[2] Bundle created with blank sessions (0/3 converted)');
    await page.screenshot({ path: path.join(outDir, 'bundle-01-template-applied.png'), fullPage: true });

    // ── Step 2: Per-action recipe execution + export ──
    for (const actionKey of ACTION_KEYS) {
      const { truthTable, recipe } = actionInputs[actionKey];
      const actionReport = report.actions[actionKey];
      const recipeMode = recipe.mode || 'diagnostic';
      if (recipeMode !== 'acceptance' && recipeMode !== 'full_recreation' && recipeMode !== 'manual_review') {
        fail(actionKey, 'mode_violation', `Recipe for ${actionKey} is not a supported whole-sheet mode (got ${recipeMode})`);
        continue;
      }
      report.mode = recipeMode;

      console.error(`[3:${actionKey}] Switching to action tab...`);

      // Click the action tab — invalidate bbox cache since canvas changes.
      _bboxCache.selector = null;
      _bboxCache.box = null;
      const tabLocator = page.locator('#bundleActionTabs button').filter({ hasText: ACTION_LABELS[actionKey] });
      await tabLocator.first().click();

      // Wait for session load to complete.  Require BOTH sessionOut AND metaOut
      // to be populated with the expected geometry before proceeding.  Previous
      // versions only checked sessionOut, causing a race where metaOut was still
      // empty when readSummary ran.
      const expectedGeom = actionInputs[actionKey].truthTable;
      await page.waitForFunction(({ expW, expH }) => {
        const sessionText = String(document.getElementById('sessionOut')?.textContent || '').trim();
        const metaText = String(document.getElementById('metaOut')?.textContent || '').trim();
        if (!sessionText || !metaText) return false;
        try {
          const s = JSON.parse(sessionText);
          const m = JSON.parse(metaText);
          return s.grid_cols === expW && s.grid_rows === expH && m.angles !== undefined;
        } catch (_e) { return false; }
      }, { expW: expectedGeom.width, expH: expectedGeom.height }, { timeout: 30000 });

      // Wait for whole-sheet canvas to mount and editor controls to be available
      await page.waitForSelector('#wholeSheetCanvas', { state: 'attached', timeout: 15000 });
      await page.waitForSelector('#wsGlyphCode', { state: 'visible', timeout: 10000 });
      await page.waitForTimeout(1000);

      // Read session metadata for geometry checks
      const summary = await readSummary(page);
      actionReport.session = summary.session;
      actionReport.meta = summary.meta;

      if (!summary.session || !summary.meta) {
        fail(actionKey, 'session', 'Session or meta missing after tab switch');
        continue;
      }

      // Geometry verification against recipe expectations
      const expected = recipe.geometry;
      const actual = summary.session || {};
      const actualMeta = summary.meta || {};
      let geoFailed = false;

      if (actual.angles !== expected.angles) { fail(actionKey, 'geometry', `angles: expected ${expected.angles}, got ${actual.angles}`); geoFailed = true; }
      if (JSON.stringify(actual.anims || []) !== JSON.stringify(expected.anims || [])) {
        fail(actionKey, 'geometry', `anims: expected ${JSON.stringify(expected.anims)}, got ${JSON.stringify(actual.anims)}`); geoFailed = true;
      }
      if (actual.projs !== expected.projs) { fail(actionKey, 'geometry', `projs: expected ${expected.projs}, got ${actual.projs}`); geoFailed = true; }
      if (actualMeta.frame_w_chars !== expected.frame_w) { fail(actionKey, 'geometry', `frame_w: expected ${expected.frame_w}, got ${actualMeta.frame_w_chars}`); geoFailed = true; }
      if (actualMeta.frame_h_chars !== expected.frame_h) { fail(actionKey, 'geometry', `frame_h: expected ${expected.frame_h}, got ${actualMeta.frame_h_chars}`); geoFailed = true; }
      actionReport.geometry_pass = !geoFailed;

      // Frame layout from session metadata
      const expectedFrameCount = expected.frame_rows * expected.frame_cols;
      const sessionFrameRows = actualMeta.frame_rows ?? actual.frame_rows ?? actual.angles ?? null;
      const sessionFrameCols = actualMeta.frame_cols ?? actual.frame_cols ?? null;
      if (sessionFrameRows !== null && sessionFrameCols !== null) {
        const sessionFrameCount = sessionFrameRows * sessionFrameCols;
        if (sessionFrameCount !== expectedFrameCount) {
          fail(actionKey, 'frame_layout', `Frame count: expected ${expectedFrameCount}, got ${sessionFrameCount}`);
        }
      } else {
        fail(actionKey, 'frame_layout', 'Session metadata missing frame_rows/frame_cols');
      }
      actionReport.frame_layout_pass = !actionReport.failures.some((f) => f.class === 'frame_layout');

      // Layer count check
      const expectedLayers = truthTable.layer_count;
      if (summary.session?.layer_count !== undefined && summary.session.layer_count !== expectedLayers) {
        fail(actionKey, 'layers', `Layer count: expected ${expectedLayers}, got ${summary.session.layer_count}`);
      }

      // ── Preload or replay ──
      if (preloadXps[actionKey]) {
        // Preload path: import a pre-built XP via the UI import controls,
        // then export via the UI Export XP button.  Fully UI-driven — no
        // API calls, no __wb_debug state mutations.  The export handles
        // save, session sync, and blank→converted promotion through the
        // normal product code path.
        const preloadPath = path.resolve(repoRoot, preloadXps[actionKey]);
        console.error(`[3:${actionKey}] PRELOAD: importing ${path.basename(preloadPath)} via UI (skipping ${(recipe.actions || []).length}-action replay)...`);
        await page.setInputFiles('#xpImportFile', preloadPath);
        await page.click('#xpImportBtn');
        // Wait for import to hydrate the session with correct geometry.
        await page.waitForFunction(({ expW, expH }) => {
          const sessionText = String(document.getElementById('sessionOut')?.textContent || '').trim();
          const metaText = String(document.getElementById('metaOut')?.textContent || '').trim();
          if (!sessionText || !metaText) return false;
          try {
            const s = JSON.parse(sessionText);
            const m = JSON.parse(metaText);
            return s.grid_cols === expW && s.grid_rows === expH && m.angles !== undefined;
          } catch (_e) { return false; }
        }, { expW: expectedGeom.width, expH: expectedGeom.height }, { timeout: 30000 });
        actionReport.execute_pass = true;
        actionReport.preloaded = true;
        console.error(`[3:${actionKey}] PRELOAD: session hydrated`);
        // The export step below (shared with replay path) handles save +
        // promotion via the normal UI Export XP button click.
      } else if (actionReport.geometry_pass) {
        // Full replay path.
        console.error(`[3:${actionKey}] Executing ${recipeMode} recipe (${(recipe.actions || []).length} actions)...`);
        // Suppress autosaves AND legacy frame grid/preview renders during
        // recipe replay.  The save storm and DOM element churn (676K canvas
        // elements for idle) are both proven Chromium crash vectors.
        await page.evaluate(() => {
          window.__wb_debug.suppressAutoSave(true);
          window.__wb_debug.suppressRender(true);
        });
        actionReport.execute_pass = await executeRecipe(page, actionKey, recipe);
        // Resume rendering + autosave, do one final render, then flush save.
        await page.evaluate(() => {
          window.__wb_debug.suppressRender(false);
          window.__wb_debug.suppressAutoSave(false);
        });
        console.error(`[3:${actionKey}] Flushing verifier save checkpoint...`);
        await page.evaluate(() => window.__wb_debug.flushSave());
      } else {
        console.error(`[3:${actionKey}] Skipping recipe execution (geometry failed)`);
      }

      // The explicit flushSave above replaces the old 2s wait for debounced
      // saves to settle. Export internally calls saveSessionState("pre-export",
      // { wait_for_idle: true }) as a safety net.

      // Export this action's session.
      // Clear exportOut first so we don't match stale content from a previous action.
      console.error(`[3:${actionKey}] Exporting...`);
      await page.evaluate(() => {
        const el = document.getElementById('exportOut');
        if (el) el.textContent = '';
      });
      await page.click('#btnExport');
      await page.waitForFunction(() => {
        const exportOut = document.getElementById('exportOut');
        const text = String(exportOut?.textContent || '').trim();
        if (!text) return false;
        try {
          const parsed = JSON.parse(text);
          return !!parsed.xp_path || !!parsed.stage;
        } catch (_e) { return false; }
      }, { timeout: 20000 });
      const exportText = await page.locator('#exportOut').textContent();
      const exportJson = exportText ? parseJsonText(exportText, `${actionKey} exportOut`) : null;
      actionReport.export = exportJson;

      if (!exportJson?.xp_path) {
        fail(actionKey, 'export', 'Export did not return xp_path');
      } else {
        actionReport.export_pass = true;

        // Run truth table on exported XP and compare L2 proof region
        const exportedTruthPath = path.join(outDir, `${actionKey}-exported-truth-table.json`);
        const exportedTruth = runTruthTable(exportJson.xp_path, exportedTruthPath);
        actionReport.exported_truth = {
          width: exportedTruth.width,
          height: exportedTruth.height,
          layer_count: exportedTruth.layer_count,
          metadata: exportedTruth.metadata,
        };

        // Verify exported geometry matches template expectations
        if (exportedTruth.width !== truthTable.width || exportedTruth.height !== truthTable.height) {
          fail(actionKey, 'export_dims', `Exported dims ${exportedTruth.width}x${exportedTruth.height} vs reference ${truthTable.width}x${truthTable.height}`);
          actionReport.export_pass = false;
        }
        if (exportedTruth.layer_count !== truthTable.layer_count) {
          fail(actionKey, 'export_layers', `Exported ${exportedTruth.layer_count} layers vs reference ${truthTable.layer_count}`);
          actionReport.export_pass = false;
        }

        // L2 cell fidelity in proof region (acceptance and full_recreation modes).
        // manual_review intentionally paints a synthetic test brush, so exact
        // source-XP cell fidelity is not meaningful there.
        const proofRegion = recipe.proof_region;
        if (recipeMode === 'acceptance' || recipeMode === 'full_recreation') {
          if (proofRegion && proofRegion.w > 0 && proofRegion.h > 0) {
            const comparison = compareProofRegion(truthTable, exportedTruth, proofRegion);
            actionReport.proof_region_compare = {
              ok: comparison.ok,
              mismatch_count: comparison.mismatches.length,
              mismatches: comparison.mismatches.slice(0, 10),
              proof_region: proofRegion,
            };
            actionReport.cell_fidelity_pass = comparison.ok;
            if (!comparison.ok) {
              fail(actionKey, 'cell_fidelity', `L2 proof region has ${comparison.mismatches.length} cell mismatches`);
            }
          } else {
            fail(actionKey, 'cell_fidelity', 'Recipe has no proof_region — cannot verify cell fidelity');
          }
        } else {
          actionReport.proof_region_compare = {
            ok: true,
            skipped: 'manual_review_mode',
            manual_review: recipe.manual_review || null,
          };
          actionReport.cell_fidelity_pass = true;
        }

        // All layers pass: verify exported has expected layer count and L0/L1/L3 exist
        const expLayers = exportedTruth.layers || [];
        const layerCountOk = expLayers.length === truthTable.layer_count;
        const allLayersExist = expLayers.every((l) => l && l.cells && l.cells.length === exportedTruth.width * exportedTruth.height);
        actionReport.all_layers_pass = layerCountOk && allLayersExist && !actionReport.failures.some((f) => f.class === 'layers');
        if (!actionReport.all_layers_pass) {
          fail(actionKey, 'layer_fidelity', `Layer structure issue: count_ok=${layerCountOk} all_exist=${allLayersExist}`);
        }
      }

      await page.screenshot({ path: path.join(outDir, `bundle-${actionKey}-done.png`), fullPage: true });
      console.error(`[3:${actionKey}] Done: geo=${actionReport.geometry_pass} exec=${actionReport.execute_pass} export=${actionReport.export_pass} cells=${actionReport.cell_fidelity_pass}`);
    }

    // Compute per-action pass
    for (const key of ACTION_KEYS) {
      const ar = report.actions[key];
      report[`${key}_pass`] = ar.geometry_pass && ar.frame_layout_pass && ar.execute_pass
        && ar.export_pass && ar.cell_fidelity_pass && ar.all_layers_pass;
    }

    // ── Step 3: Bundle Skin Dock test ──
    console.error('[4] Testing bundle in Skin Dock...');

    // Wait for all actions to show "ready" (or legacy "converted") in the
    // bundleStatus text.  The save-first workflow uses isBundleActionReadyStatus()
    // which accepts both "saved" and "converted".
    // Log current bundle status before waiting, for diagnostics.
    const preSkinStatus = await page.evaluate(() => {
      const bs = String(document.getElementById('bundleStatus')?.textContent || '');
      const st = window.__wb_debug?._state?.();
      const actions = st?.actionStates || {};
      const statuses = {};
      for (const [k, v] of Object.entries(actions)) statuses[k] = v?.status;
      return { bundleStatusText: bs, actionStatuses: statuses };
    });
    console.error(`[4] Bundle status before skin dock: ${JSON.stringify(preSkinStatus)}`);

    await page.waitForFunction(() => {
      const bs = String(document.getElementById('bundleStatus')?.textContent || '');
      return /3\/3 actions (converted|ready)/i.test(bs);
    }, null, { timeout: 15000 });

    // Ensure Test Bundle Skin button is enabled.
    // Log why the button is disabled if it doesn't become enabled quickly.
    const btnEnabled = await page.waitForFunction(() => {
      const btn = document.getElementById('webbuildQuickTestBtn');
      return !!btn && !btn.disabled;
    }, null, { timeout: 10000 }).then(() => true).catch(() => false);
    if (!btnEnabled) {
      const btnState = await page.evaluate(() => {
        const btn = document.getElementById('webbuildQuickTestBtn');
        const st = window.__wb_debug?._state?.();
        const pf = window.__wb_debug?.getWebbuildDebugState?.()?.runtimePreflight;
        return {
          exists: !!btn, disabled: btn?.disabled, title: btn?.title,
          sessionId: !!st?.sessionId, actionBusy: !!st?.webbuild?.actionInFlight,
          preflightOk: !!pf?.ok, preflightChecked: !!pf?.checked,
        };
      });
      console.error(`[4] Button still disabled: ${JSON.stringify(btnState)}`);
      // Try refreshing runtime preflight and waiting again
      await page.evaluate(() => {
        if (window.__wb_debug?.openWebbuild) window.__wb_debug.openWebbuild(false);
      });
      await page.waitForFunction(() => {
        const btn = document.getElementById('webbuildQuickTestBtn');
        return !!btn && !btn.disabled;
      }, null, { timeout: 30000 });
    }

    await page.screenshot({ path: path.join(outDir, 'bundle-05-before-skin-test.png'), fullPage: true });
    await page.click('#webbuildQuickTestBtn');

    // Wait for bundle skin injection
    const skinStart = Date.now();
    let skinSnap = null;
    while ((Date.now() - skinStart) < 120000) {
      skinSnap = await page.evaluate(() => {
        const q = (id) => document.getElementById(id);
        const base = {
          wbStatus: String(q('wbStatus')?.textContent || ''),
          webbuildState: String(q('webbuildState')?.textContent || ''),
          bundleStatus: String(q('bundleStatus')?.textContent || ''),
        };
        if (window.__wb_debug && typeof window.__wb_debug.getWebbuildDebugState === 'function') {
          return { ...base, debug: window.__wb_debug.getWebbuildDebugState() };
        }
        return base;
      });
      const applied = /Applied bundle skin/i.test(String(skinSnap.wbStatus || ''))
        && /webbuild ready|bundle skin applied/i.test(String(skinSnap.webbuildState || ''));
      if (applied && skinSnap.debug?.iframe?.hasLoad && (skinSnap.debug?.iframe?.wasmReady || !skinSnap.debug?.iframe?.overlayVisible)) {
        break;
      }
      await page.waitForTimeout(1000);
    }

    report.skin_dock = { snapshot: skinSnap };

    // Get the flat iframe and verify playable state.
    // The iframe may reload during skin injection (force_restart), causing frame
    // detachment. Re-acquire the frame handle on each probe attempt.
    const getFrameHandle = () => page.frame({ url: /\/termpp-web-flat\/index\.html/ });

    await page.waitForFunction(() => {
      const frame = document.getElementById('webbuildFrame');
      return !!frame && !frame.classList.contains('hidden') && !!frame.src;
    }, null, { timeout: 60000 });

    // Wait for frame to be available (may take time after iframe restart)
    let frameHandle = null;
    for (let i = 0; i < 120; i++) {
      frameHandle = getFrameHandle();
      if (frameHandle) break;
      await page.waitForTimeout(500);
    }
    if (!frameHandle) {
      fail(null, 'skin_dock', 'Flat iframe frame handle not found');
    } else {
      // Wait for WASM to finish loading (font load + AsciickerInit + ShowLoginOverlay).
      // This can take 30-60s in headless mode with slow font loading.
      for (let i = 0; i < 120; i++) {
        frameHandle = getFrameHandle() || frameHandle;
        const wasmProbe = await captureFrameProbe(frameHandle, `wasm_wait_${i}`);
        if (wasmProbe.error && /detach/i.test(wasmProbe.error)) {
          await page.waitForTimeout(1000);
          continue;
        }
        if (wasmProbe.wasmReady) break;
        await page.waitForTimeout(1000);
      }

      // Handle play button / overlay — re-acquire frame on detachment
      frameHandle = getFrameHandle() || frameHandle;
      let probe = await captureFrameProbe(frameHandle, 'initial');
      if (probe.error && /detach/i.test(probe.error)) {
        await page.waitForTimeout(2000);
        frameHandle = getFrameHandle();
        if (frameHandle) probe = await captureFrameProbe(frameHandle, 'initial_retry');
      }
      if (probe.overlayVisible) {
        try {
          const playBtn = frameHandle.locator('#play-btn');
          if (await playBtn.count()) {
            await playBtn.waitFor({ state: 'visible', timeout: 15000 });
            if (await playBtn.isEnabled().catch(() => false)) {
              await playBtn.click({ timeout: 5000 });
            }
          }
        } catch (_e) {}
        await page.waitForTimeout(1500);
      }

      // Pulse main menu advance
      for (let i = 0; i < 30; i++) {
        frameHandle = getFrameHandle() || frameHandle;
        probe = await captureFrameProbe(frameHandle, `menu_${i + 1}`);
        if (probe.error && /detach/i.test(probe.error)) {
          await page.waitForTimeout(1000);
          continue;
        }
        const mainMenu = probe.gameMainMenu === true || Number(probe.gameMainMenu) === 1;
        if (!mainMenu && probeShowsWorldStarted(probe)) break;
        if (probeShowsWorldStarted(probe)) break; // visual evidence path
        if (mainMenu) {
          await pulseMainMenuAdvance(frameHandle);
        }
        await page.waitForTimeout(600);
      }

      // Wait for playable state
      const playableStart = Date.now();
      let playable = false;
      const playableProbes = [];
      while ((Date.now() - playableStart) < 30000) {
        frameHandle = getFrameHandle() || frameHandle;
        probe = await captureFrameProbe(frameHandle, 'playable');
        if (probe.error && /detach/i.test(probe.error)) {
          await page.waitForTimeout(1000);
          continue;
        }
        playableProbes.push({ t_ms: Date.now() - playableStart, probe });
        if (!probe.overlayVisible && probeShowsWorldStarted(probe)) {
          playable = true;
          break;
        }
        await page.waitForTimeout(500);
      }

      report.skin_dock.playable = playable;
      report.skin_dock.probes = playableProbes.slice(-5);
      report.skin_dock_pass = playable;

      if (!playable) {
        fail(null, 'skin_dock', 'Bundle Skin Dock never reached playable state');
      } else {
        console.error('[4] Skin Dock reached playable state');

        // ── Step 4b: Runaround crash detection (10 seconds) ──
        // Send arrow keys into the game iframe and probe each second for
        // WASM crashes (renderCrashes rising) or render stall (rafCount
        // not advancing). This catches skins that load but crash on
        // equipment-state transitions during movement.
        console.error('[5] Runaround crash detection (10s)...');
        const RUNAROUND_SECS = 10;
        const directions = ['ArrowUp', 'ArrowRight', 'ArrowDown', 'ArrowLeft'];
        let prevRaf = null;
        let prevCrashes = 0;
        let runaroundPass = true;
        const runaroundProbes = [];

        for (let sec = 0; sec < RUNAROUND_SECS; sec++) {
          // Cycle through directions so the player walks in a square
          const dir = directions[sec % directions.length];
          frameHandle = getFrameHandle() || frameHandle;
          try {
            // Press and hold the arrow key for ~900ms, release, then probe
            await frameHandle.locator('body').press(dir, { delay: 100 });
            // Send repeated keydown events to keep movement going
            for (let k = 0; k < 4; k++) {
              await frameHandle.locator('body').press(dir, { delay: 100 });
            }
          } catch (_e) {
            // Frame detachment during key send — try to re-acquire
            frameHandle = getFrameHandle() || frameHandle;
          }

          await page.waitForTimeout(500);

          frameHandle = getFrameHandle() || frameHandle;
          const rProbe = await captureFrameProbe(frameHandle, `runaround_${sec}`);
          runaroundProbes.push({ sec, dir, probe: rProbe });

          if (rProbe.error && /detach/i.test(rProbe.error)) {
            // iframe detached = likely crash/reload
            fail(null, 'runaround', `Frame detached at second ${sec} (likely WASM crash)`);
            runaroundPass = false;
            break;
          }

          const crashes = Number(rProbe.renderCrashes) || 0;
          const raf = Number(rProbe.rafCount) || 0;

          if (crashes > prevCrashes) {
            fail(null, 'runaround', `renderCrashes rose from ${prevCrashes} to ${crashes} at second ${sec}`);
            runaroundPass = false;
            break;
          }
          if (prevRaf !== null && raf <= prevRaf) {
            fail(null, 'runaround', `rafCount stalled at ${raf} (was ${prevRaf}) at second ${sec}`);
            runaroundPass = false;
            break;
          }
          prevCrashes = crashes;
          prevRaf = raf;
          console.error(`  [${sec + 1}/${RUNAROUND_SECS}] ${dir} raf=${raf} crashes=${crashes}`);
        }

        report.skin_dock.runaround = { pass: runaroundPass, probes: runaroundProbes };
        if (runaroundPass) {
          console.error('[5] Runaround PASS — no crashes in 10s');
        } else {
          report.skin_dock_pass = false;
          console.error('[5] Runaround FAIL');
        }
      }
    }

    await page.screenshot({ path: path.join(outDir, 'bundle-06-skin-dock-final.png'), fullPage: true });

  } catch (err) {
    fail(null, 'fatal', err instanceof Error ? err.message : String(err));
  } finally {
    // Compute overall_pass
    report.overall_pass =
      report.idle_pass && report.attack_pass && report.death_pass && report.skin_dock_pass;

    const resultPath = path.join(outDir, 'result.json');
    fs.writeFileSync(resultPath, JSON.stringify(report, null, 2));

    const passStr = report.overall_pass ? 'PASS' : 'FAIL';
    const bannerMap = { manual_review: 'BUNDLE MANUAL REVIEW', full_recreation: 'BUNDLE FULL RECREATION' };
    const banner = bannerMap[report.mode] || 'BUNDLE ACCEPTANCE';
    console.error(`\n[${banner}] ${passStr}`);
    console.error(`  idle=${report.idle_pass} attack=${report.attack_pass} death=${report.death_pass} skin_dock=${report.skin_dock_pass}`);
    console.error(`  failures: ${failures.length}`);
    console.error(`  report: ${resultPath}`);

    if (holdOpen) {
      console.error('\n[HOLD] Browser held open. Press Enter to close...');
      await new Promise(r => process.stdin.once('data', r));
    }
    await browser.close();
  }
  process.exit(report.overall_pass ? 0 : 1);
}

main();
