/**
 * verifier_lib.mjs — Shared infrastructure for all M2 verifier slices.
 *
 * Provides:
 *  - CLI argument parsing (getArg, hasFlag)
 *  - Base-path-aware URL resolution (resolveRoute, resolveWorkbenchUrl)
 *  - Browser launch helpers (launchBrowser, openWorkbench)
 *  - State capture (captureState — reads getState() with P1/P2 fields + actionStates from _state())
 *  - Whole-sheet mount wait (waitForWholeSheetMount)
 *  - Tab switch (switchActionTab — canonical 8-phase sequence from M1)
 *  - Failure tracking (createReport, fail, writeReport)
 *  - Artifact writing (writeArtifact, writeJsonArtifact)
 *  - Frame signature helpers (readFrameSignature, readFrameCell)
 *
 * Usage:
 *   import { parseArgs, launchBrowser, captureState, createReport, fail, writeReport } from './verifier_lib.mjs';
 */

import { chromium } from 'playwright';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

// ---------------------------------------------------------------------------
// A. CLI argument parsing
// ---------------------------------------------------------------------------

const __dirname_lib = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname_lib, '..', '..');

/**
 * Parse CLI args from process.argv.slice(2).
 * Returns { getArg, hasFlag, args, repoRoot }.
 */
export function parseArgs(argv = process.argv.slice(2)) {
  function getArg(name, fallback = null) {
    const idx = argv.indexOf(name);
    return idx >= 0 && idx + 1 < argv.length ? argv[idx + 1] : fallback;
  }
  function hasFlag(name) {
    return argv.includes(name);
  }
  return { getArg, hasFlag, args: argv, repoRoot: REPO_ROOT };
}

// ---------------------------------------------------------------------------
// B. Base-path-aware URL resolution
// ---------------------------------------------------------------------------

const DEFAULT_WORKBENCH_URL = process.env.WORKBENCH_URL || 'http://127.0.0.1:5071/workbench';

/**
 * Resolve a route path relative to a base workbench URL.
 * Strips the last pathname segment from baseUrl and appends routePath.
 *
 *   resolveRoute("http://host/xpedit/workbench", "/wizard") → "http://host/xpedit/wizard"
 *   resolveRoute("http://host/workbench", "/wizard")        → "http://host/wizard"
 */
export function resolveRoute(baseUrl, routePath) {
  const u = new URL(String(baseUrl));
  const prefix = u.pathname.replace(/\/[^/]*$/, '');
  u.pathname = prefix + routePath;
  u.search = '';
  return u.toString();
}

/**
 * Get the workbench URL from CLI args or env, with base-path support.
 * Accepts --url <url> flag. Falls back to WORKBENCH_URL env or default.
 */
export function resolveWorkbenchUrl(cliArgs) {
  const { getArg } = cliArgs;
  return getArg('--url', DEFAULT_WORKBENCH_URL);
}

/**
 * Extract the hosting mode label from a URL for artifact tagging.
 *   "http://host/workbench" → "root"
 *   "http://host/xpedit/workbench" → "prefixed"
 */
export function hostingModeTag(workbenchUrl) {
  try {
    const u = new URL(workbenchUrl);
    const segments = u.pathname.split('/').filter(Boolean);
    return segments.length > 1 ? 'prefixed' : 'root';
  } catch {
    return 'unknown';
  }
}

// ---------------------------------------------------------------------------
// C. Browser launch helpers
// ---------------------------------------------------------------------------

export function requireHeadedRun(label = 'Playwright verifier', headed = false) {
  if (headed) return;
  console.error(`[REFUSE] ${label} must be run headed. Re-run with --headed.`);
  process.exit(1);
}

/**
 * Launch a Playwright Chromium browser.
 * @param {object} opts
 * @param {boolean} opts.headed — visible browser window
 * @param {number} opts.timeout — default navigation timeout (ms)
 * @returns {Promise<{browser, context, page}>}
 */
export async function launchBrowser({ headed = false, timeout = 30000 } = {}) {
  requireHeadedRun('Playwright verifier', headed);
  const browser = await chromium.launch({ headless: !headed });
  const context = await browser.newContext({ viewport: { width: 1400, height: 900 } });
  context.setDefaultTimeout(timeout);
  const page = await context.newPage();
  return { browser, context, page };
}

/**
 * Navigate to the workbench URL and wait for it to be ready.
 *
 * Readiness sequence (matches M1 fidelity runner semantics):
 * 1. page.goto with networkidle (30s timeout)
 * 2. Wait for __wb_debug.getState to be callable (JS initialized)
 * 3. Wait for #xpImportFile attached (workbench DOM ready)
 * 4. Optional: wait for session/meta hydration after XP import
 *
 * @param {import('playwright').Page} page
 * @param {string} workbenchUrl
 * @param {object} opts
 * @param {number} opts.gotoTimeout — page.goto timeout (ms), default 30000
 * @param {number} opts.readyTimeout — readiness check timeout (ms), default 15000
 * @returns {Promise<void>}
 */
export async function openWorkbench(page, workbenchUrl, { gotoTimeout = 30000, readyTimeout = 15000 } = {}) {
  await page.goto(workbenchUrl, { waitUntil: 'networkidle', timeout: gotoTimeout });
  // Wait for workbench JS to initialize — __wb_debug.getState must be callable
  await page.waitForFunction(() => {
    return window.__wb_debug && typeof window.__wb_debug.getState === 'function';
  }, { timeout: readyTimeout });
  // Wait for workbench DOM to be interactive
  await page.waitForSelector('#xpImportFile', { state: 'attached', timeout: readyTimeout }).catch(() => {});
  await page.waitForSelector('#wbUpload', { state: 'attached', timeout: 5000 }).catch(() => {});
}

/**
 * Wait for session + meta hydration after XP import or pipeline run.
 * Matches the M1 fidelity runner's dual-gate pattern (sessionOut + metaOut).
 *
 * @param {import('playwright').Page} page
 * @param {object} opts
 * @param {number} opts.expectedCols — if set, wait for grid_cols to match
 * @param {number} opts.expectedRows — if set, wait for grid_rows to match
 * @param {number} opts.timeout — timeout (ms), default 30000
 * @returns {Promise<void>}
 */
export async function waitForSessionHydration(page, { expectedCols, expectedRows, timeout = 30000 } = {}) {
  await page.waitForFunction(({ expW, expH }) => {
    const sessionOut = document.getElementById('sessionOut');
    const metaOut = document.getElementById('metaOut');
    if (!sessionOut || !metaOut) return false;
    const sessionText = String(sessionOut.textContent || '').trim();
    const metaText = String(metaOut.textContent || '').trim();
    if (!sessionText || !metaText) return false;
    try {
      const session = JSON.parse(sessionText);
      const meta = JSON.parse(metaText);
      if (!session.session_id) return false;
      if (typeof meta.frame_w_chars !== 'number' || typeof meta.frame_h_chars !== 'number') return false;
      if (expW != null && session.grid_cols !== expW) return false;
      if (expH != null && session.grid_rows !== expH) return false;
      return true;
    } catch (_err) {
      return false;
    }
  }, { expW: expectedCols ?? null, expH: expectedRows ?? null }, { timeout });
}

// ---------------------------------------------------------------------------
// D. State capture (reads getState() with P1/P2 fields)
// ---------------------------------------------------------------------------

/**
 * Capture the full verifier-relevant state from the workbench page.
 * Uses __wb_debug.getState() which now includes P1 and P2 fields.
 *
 * @param {import('playwright').Page} page
 * @param {string} label — human-readable label for this snapshot
 * @returns {Promise<object>} state snapshot
 */
export async function captureState(page, label = '') {
  return page.evaluate((lbl) => {
    const gs = (window.__wb_debug && typeof window.__wb_debug.getState === 'function')
      ? window.__wb_debug.getState() : null;
    const raw = (window.__wb_debug && typeof window.__wb_debug._state === 'function')
      ? window.__wb_debug._state() : null;
    const wse = (window.__wholeSheetEditor && typeof window.__wholeSheetEditor.getState === 'function')
      ? window.__wholeSheetEditor.getState() : null;

    // actionStates: curate from _state() since not yet in getState()
    const actionStates = raw?.actionStates ? Object.fromEntries(
      Object.entries(raw.actionStates).map(([k, v]) => [k, {
        status: v?.status ?? null,
        sessionId: v?.sessionId ?? null,
      }])
    ) : null;

    return {
      label: lbl,
      timestamp: Date.now(),
      // From getState() — includes P1 and P2 fields
      ...(gs || {}),
      // actionStates from _state() fallback (per state-capture contract)
      actionStates,
      // Whole-sheet editor state (separate surface)
      wholeSheet: wse || null,
      // DOM-derived
      wholeSheetMounted: !!document.getElementById('wholeSheetCanvas'),
    };
  }, label);
}

/**
 * Read a single frame's signature hash.
 * @param {import('playwright').Page} page
 * @param {number} row
 * @param {number} col
 * @returns {Promise<string>}
 */
export async function readFrameSignature(page, row, col) {
  return page.evaluate(([r, c]) => {
    return window.__wb_debug?.frameSignature?.(r, c) ?? '';
  }, [row, col]);
}

/**
 * Read a single cell from a frame.
 * @param {import('playwright').Page} page
 * @param {number} row
 * @param {number} col
 * @param {number} cx — cell x within frame
 * @param {number} cy — cell y within frame
 * @returns {Promise<object|null>}
 */
export async function readFrameCell(page, row, col, cx, cy) {
  return page.evaluate(([r, c, x, y]) => {
    return window.__wb_debug?.readFrameCell?.(r, c, x, y) ?? null;
  }, [row, col, cx, cy]);
}

/**
 * Read a set of frame signatures keyed by `r{row}c{col}`.
 * @param {import('playwright').Page} page
 * @param {Array<{row:number,col:number}>} coords
 * @returns {Promise<object>}
 */
export async function readFrameSignatures(page, coords) {
  const out = {};
  for (const coord of coords || []) {
    const row = Number(coord?.row ?? 0);
    const col = Number(coord?.col ?? 0);
    out[`r${row}c${col}`] = await readFrameSignature(page, row, col);
  }
  return out;
}

/**
 * Read the visible workbench status banner.
 * @param {import('playwright').Page} page
 * @returns {Promise<{text:string,className:string}>}
 */
export async function readWorkbenchStatus(page) {
  return page.evaluate(() => {
    const el = document.getElementById('wbStatus');
    return {
      text: String(el?.textContent || '').trim(),
      className: String(el?.className || '').trim(),
    };
  });
}

function clusterBoxesByAxis(boxes, axis) {
  const key = axis === 'x' ? 'x' : 'y';
  const extent = axis === 'x' ? 'w' : 'h';
  const edge = axis === 'x'
    ? (box) => Number(box.x || 0) + Math.max(1, Number(box.w || 1)) - 1
    : (box) => Number(box.y || 0) + Math.max(1, Number(box.h || 1)) - 1;
  const sorted = [...(boxes || [])].sort((a, b) => Number(a?.[key] || 0) - Number(b?.[key] || 0));
  const groups = [];
  for (const box of sorted) {
    if (!groups.length) {
      groups.push({
        min: Number(box?.[key] || 0),
        max: edge(box),
      });
      continue;
    }
    const group = groups[groups.length - 1];
    const tol = Math.max(4, Math.round(Math.max(1, Number(box?.[extent] || 1)) * 0.35));
    const start = Number(box?.[key] || 0);
    if (start <= group.max + tol) {
      group.min = Math.min(group.min, start);
      group.max = Math.max(group.max, edge(box));
    } else {
      groups.push({ min: start, max: edge(box) });
    }
  }
  return groups.length;
}

/**
 * Describe the currently selected source boxes for report artifacts.
 * @param {object} state
 * @param {object} opts
 * @returns {object}
 */
export function describeSourceSelection(state, {
  selectionMode = 'select',
  sourceFamily = 'manual',
  expectedSpan = 'single',
} = {}) {
  const ids = Array.isArray(state?.sourceSelection)
    ? state.sourceSelection.map((id) => Number(id))
    : [];
  const selected = Array.isArray(state?.sourceBoxes)
    ? state.sourceBoxes.filter((box) => ids.includes(Number(box.id)))
    : [];
  const rowBands = clusterBoxesByAxis(selected, 'y');
  const colBands = clusterBoxesByAxis(selected, 'x');
  const bounds = selected.length
    ? {
        minX: Math.min(...selected.map((box) => Number(box.x || 0))),
        minY: Math.min(...selected.map((box) => Number(box.y || 0))),
        maxX: Math.max(...selected.map((box) => Number(box.x || 0) + Math.max(1, Number(box.w || 1)) - 1)),
        maxY: Math.max(...selected.map((box) => Number(box.y || 0) + Math.max(1, Number(box.h || 1)) - 1)),
      }
    : null;
  return {
    selection_mode: selectionMode,
    source_family: sourceFamily,
    expected_span: expectedSpan,
    selected_source_ids: ids,
    selected_count: selected.length,
    grouping_shape: {
      row_bands: rowBands,
      col_bands: colBands,
      label: `${rowBands}r x ${colBands}c`,
    },
    selection_bounds: bounds,
  };
}

/**
 * Make both source and target panels visible at the same time for cross-panel drag/drop.
 * @param {import('playwright').Page} page
 * @param {object} opts
 * @returns {Promise<object>}
 */
export async function prepareCrossPanelDrag(page, {
  sourceSelector = '#sourceCanvas',
  targetSelector,
  viewportWidth = 1400,
  minViewportHeight = 1400,
  maxViewportHeight = 2800,
  padding = 120,
} = {}) {
  if (!targetSelector) throw new Error('targetSelector is required');
  const layout = await page.evaluate(({ sourceSel, targetSel }) => {
    const source = document.querySelector(sourceSel);
    const target = document.querySelector(targetSel);
    if (!(source instanceof Element) || !(target instanceof Element)) return null;
    const sourceRect = source.getBoundingClientRect();
    const targetRect = target.getBoundingClientRect();
    return {
      scrollHeight: Math.ceil(Math.max(
        document.documentElement?.scrollHeight || 0,
        document.body?.scrollHeight || 0,
        sourceRect.bottom,
        targetRect.bottom
      )),
    };
  }, { sourceSel: sourceSelector, targetSel: targetSelector });
  if (!layout) throw new Error(`Missing source or target for cross-panel drag (${sourceSelector}, ${targetSelector})`);
  const nextHeight = Math.max(
    minViewportHeight,
    Math.min(maxViewportHeight, Number(layout.scrollHeight || minViewportHeight) + padding)
  );
  await page.setViewportSize({ width: viewportWidth, height: nextHeight });
  await page.locator(sourceSelector).scrollIntoViewIfNeeded();
  await page.locator(targetSelector).scrollIntoViewIfNeeded();
  await page.waitForTimeout(150);
  const visibility = await page.evaluate(({ sourceSel, targetSel }) => {
    const source = document.querySelector(sourceSel);
    const target = document.querySelector(targetSel);
    if (!(source instanceof Element) || !(target instanceof Element)) return null;
    const sourceRect = source.getBoundingClientRect();
    const targetRect = target.getBoundingClientRect();
    const vpH = window.innerHeight || document.documentElement?.clientHeight || 0;
    const vpW = window.innerWidth || document.documentElement?.clientWidth || 0;
    function visible(rect) {
      return rect.width > 0 && rect.height > 0 && rect.top >= 0 && rect.left >= 0 && rect.bottom <= vpH && rect.right <= vpW;
    }
    return {
      viewport: { width: vpW, height: vpH },
      sourceRect,
      targetRect,
      sourceVisible: visible(sourceRect),
      targetVisible: visible(targetRect),
    };
  }, { sourceSel: sourceSelector, targetSel: targetSelector });
  return { viewportHeight: nextHeight, ...(visibility || {}) };
}

/**
 * Drag the currently selected source boxes to a grid frame cell and capture a structured artifact.
 * @param {import('playwright').Page} page
 * @param {object} opts
 * @returns {Promise<object>}
 */
export async function dragSelectedSourceBoxesToFrame(page, {
  sourceBox,
  targetRow,
  targetCol,
  selectionMode = 'select',
  sourceFamily = 'manual',
  expectedSpan = 'single',
  expectedChangedCells = [{ row: targetRow, col: targetCol }],
  settleMs = 500,
} = {}) {
  const targetSelector = `.frame-cell[data-row="${Number(targetRow)}"][data-col="${Number(targetCol)}"]`;
  const preState = await captureState(page, 'drag_pre');
  const preStatus = await readWorkbenchStatus(page);
  const selection = describeSourceSelection(preState, { selectionMode, sourceFamily, expectedSpan });
  const layout = await prepareCrossPanelDrag(page, { targetSelector });
  const preSignatures = await readFrameSignatures(page, expectedChangedCells);
  const canvasBBox = await page.locator('#sourceCanvas').boundingBox();
  const targetBBox = await page.locator(targetSelector).boundingBox();
  if (!canvasBBox || !targetBBox) {
    throw new Error(`Missing drag bounding boxes for ${targetSelector}`);
  }
  const srcX = canvasBBox.x + Number(sourceBox.x || 0) + Math.floor(Math.max(1, Number(sourceBox.w || 1)) / 2);
  const srcY = canvasBBox.y + Number(sourceBox.y || 0) + Math.floor(Math.max(1, Number(sourceBox.h || 1)) / 2);
  const midX = srcX + 10;
  const midY = srcY;
  const tgtX = targetBBox.x + Math.floor(targetBBox.width / 2);
  const tgtY = targetBBox.y + Math.floor(targetBBox.height / 2);

  await page.mouse.move(srcX, srcY);
  await page.mouse.down();
  await page.mouse.move(midX, midY, { steps: 2 });
  await page.mouse.move(tgtX, tgtY, { steps: 5 });
  const dropHit = await page.evaluate(({ x, y }) => {
    const el = document.elementFromPoint(x, y);
    const frame = el instanceof Element ? el.closest('.frame-cell') : null;
    return frame
      ? {
          ok: true,
          row: Number(frame.getAttribute('data-row') || -1),
          col: Number(frame.getAttribute('data-col') || -1),
          tag: frame.tagName,
        }
      : { ok: false, row: null, col: null, tag: el instanceof Element ? el.tagName : null };
  }, { x: tgtX, y: tgtY });
  await page.mouse.up();
  await page.waitForTimeout(settleMs);

  const postState = await captureState(page, 'drag_post');
  const postStatus = await readWorkbenchStatus(page);
  const postSignatures = await readFrameSignatures(page, expectedChangedCells);
  const deltas = (expectedChangedCells || []).map((coord) => {
    const key = `r${Number(coord.row)}c${Number(coord.col)}`;
    return {
      row: Number(coord.row),
      col: Number(coord.col),
      changed: preSignatures[key] !== postSignatures[key],
      before: preSignatures[key],
      after: postSignatures[key],
    };
  });
  return {
    target_origin: { row: Number(targetRow), col: Number(targetCol) },
    selection,
    expected_changed_cells: (expectedChangedCells || []).map((coord) => ({
      row: Number(coord.row),
      col: Number(coord.col),
    })),
    frame_signature_deltas: deltas,
    drag_coords: { srcX, srcY, midX, midY, tgtX, tgtY },
    layout,
    drop_hit_before_mouseup: dropHit,
    pre_status: preStatus,
    post_status: postStatus,
    pre: preState,
    post: postState,
  };
}

// ---------------------------------------------------------------------------
// D2. Whole-sheet mount wait
// ---------------------------------------------------------------------------

/**
 * Wait for the whole-sheet canvas to be mounted in the DOM.
 * M2 slices that touch the editor must call this after session hydration.
 *
 * @param {import('playwright').Page} page
 * @param {object} opts
 * @param {number} opts.timeout — timeout (ms), default 15000
 */
export async function waitForWholeSheetMount(page, { timeout = 15000 } = {}) {
  await page.waitForSelector('#wholeSheetCanvas', { state: 'attached', timeout });
}

// ---------------------------------------------------------------------------
// D3. Tab switch (canonical 8-phase sequence from M1 edge-workflow)
// ---------------------------------------------------------------------------

/**
 * Switch the active action tab and wait for full hydration.
 * Implements the canonical 8-phase wait sequence proven in M1 closeout.
 * Do not weaken these waits — see state-capture-contract.md § switch_action_tab.
 *
 * @param {import('playwright').Page} page
 * @param {string} actionKey — e.g. 'idle', 'attack', 'death'
 * @param {object} opts
 * @param {number} opts.settleMs — pre-settle delay for auto-advance timer (default 800)
 * @param {number} opts.keyTimeout — activeActionKey match timeout (default 10000)
 * @param {number} opts.geoTimeout — geometry hydration timeout (default 30000)
 * @param {number} opts.canvasTimeout — wholeSheetCanvas mount timeout (default 15000)
 * @param {number} opts.finalSettleMs — post-switch settle (default 1000)
 * @returns {Promise<void>}
 */
export async function switchActionTab(page, actionKey, {
  settleMs = 800,
  keyTimeout = 10000,
  geoTimeout = 30000,
  canvasTimeout = 15000,
  finalSettleMs = 1000,
} = {}) {
  // Phase 1: pre-settle delay for auto-advance timer
  await page.waitForTimeout(settleMs);

  // Phase 2: click the tab
  const tabSelector = `[data-action-key="${actionKey}"]`;
  await page.click(tabSelector);

  // Phase 3: wait for _state().activeActionKey match
  await page.waitForFunction((expected) => {
    const raw = window.__wb_debug?._state?.();
    return raw?.activeActionKey === expected;
  }, actionKey, { timeout: keyTimeout });

  // Phase 4: geometry hydration via sessionOut + metaOut
  await page.waitForFunction(() => {
    const sessionOut = document.getElementById('sessionOut');
    const metaOut = document.getElementById('metaOut');
    if (!sessionOut || !metaOut) return false;
    try {
      const session = JSON.parse(sessionOut.textContent || '');
      const meta = JSON.parse(metaOut.textContent || '');
      return !!session.session_id && typeof meta.frame_w_chars === 'number';
    } catch { return false; }
  }, { timeout: geoTimeout });

  // Phase 5: wholeSheetCanvas attached
  await page.waitForSelector('#wholeSheetCanvas', { state: 'attached', timeout: canvasTimeout })
    .catch(() => {});

  // Phase 6: wsGlyphCode visible (swallowed — may not render in headless)
  await page.waitForSelector('#wsGlyphCode', { state: 'visible', timeout: 10000 })
    .catch(() => {});

  // Phase 7: final settle
  await page.waitForTimeout(finalSettleMs);
}

// ---------------------------------------------------------------------------
// E. Failure tracking and reporting
// ---------------------------------------------------------------------------

/**
 * Create a new report object for a verifier run.
 * @param {string} sliceName — e.g. 'structural_baseline', 'source_panel_contract'
 * @param {object} opts — additional report fields
 * @returns {object} report with failures array and helper methods
 */
export function createReport(sliceName, opts = {}) {
  const failures = [];
  const report = {
    slice: sliceName,
    hosting_mode: opts.hostingMode || 'unknown',
    workbench_url: opts.workbenchUrl || '',
    started_at: new Date().toISOString(),
    overall_pass: false,
    failures,
    ...opts,
  };

  return {
    report,
    failures,
    /**
     * Record a failure.
     * @param {string} cls — failure class (e.g. 'geometry', 'cell_fidelity')
     * @param {string} message
     * @param {object} extra — additional structured data
     */
    fail(cls, message, extra = {}) {
      failures.push({ class: cls, message, timestamp: new Date().toISOString(), ...extra });
      console.error(`[FAIL:${cls}] ${message}`);
    },
  };
}

/**
 * Write the final report JSON to disk.
 * @param {string} outDir — output directory
 * @param {string} filename — e.g. 'report.json'
 * @param {object} report
 */
export function writeReport(outDir, filename, report) {
  report.finished_at = new Date().toISOString();
  fs.mkdirSync(outDir, { recursive: true });
  const p = path.join(outDir, filename);
  fs.writeFileSync(p, JSON.stringify(report, null, 2));
  console.log(`[REPORT] ${p}`);
  return p;
}

// ---------------------------------------------------------------------------
// F. Artifact helpers
// ---------------------------------------------------------------------------

/**
 * Write a text artifact to the output directory.
 */
export function writeArtifact(outDir, filename, content) {
  fs.mkdirSync(outDir, { recursive: true });
  const p = path.join(outDir, filename);
  fs.writeFileSync(p, content);
  return p;
}

/**
 * Write a JSON artifact to the output directory.
 */
export function writeJsonArtifact(outDir, filename, data) {
  return writeArtifact(outDir, filename, JSON.stringify(data, null, 2));
}

/**
 * Take a screenshot and save it to the output directory.
 * @param {import('playwright').Page} page
 * @param {string} outDir
 * @param {string} name — filename without extension
 * @returns {Promise<string>} path to screenshot
 */
export async function screenshot(page, outDir, name) {
  fs.mkdirSync(outDir, { recursive: true });
  const p = path.join(outDir, `${name}.png`);
  await page.screenshot({ path: p, fullPage: false });
  return p;
}

// ---------------------------------------------------------------------------
// G. JSON parsing helper
// ---------------------------------------------------------------------------

/**
 * Safely parse JSON text, recording a failure if invalid.
 * @param {string} text
 * @param {string} label — description for error messages
 * @param {function} failFn — fail() from createReport
 * @returns {object|null}
 */
export function parseJsonSafe(text, label, failFn) {
  try {
    return JSON.parse(text);
  } catch (err) {
    if (failFn) failFn('json_parse', `${label} was not valid JSON`);
    return null;
  }
}

// ---------------------------------------------------------------------------
// H. Convenience: standard verifier setup
// ---------------------------------------------------------------------------

/**
 * Standard verifier bootstrap: parse args, resolve URL, launch browser, open workbench.
 *
 * Usage:
 *   const { page, browser, report, fail, workbenchUrl, outDir, cliArgs } = await setupVerifier('my_slice', { requireOutDir: true });
 *   // ... run verifier logic ...
 *   writeReport(outDir, 'report.json', report);
 *   await browser.close();
 *
 * @param {string} sliceName
 * @param {object} opts
 * @param {boolean} opts.requireOutDir — exit if --out-dir not provided
 * @param {boolean} opts.openPage — navigate to workbench URL (default true)
 * @returns {Promise<object>}
 */
export async function setupVerifier(sliceName, { requireOutDir = false, openPage = true } = {}) {
  const cliArgs = parseArgs();
  const workbenchUrl = resolveWorkbenchUrl(cliArgs);
  const headed = cliArgs.hasFlag('--headed');
  const outDir = cliArgs.getArg('--out-dir', `output/${sliceName}`);
  requireHeadedRun(sliceName, headed);

  if (requireOutDir && !cliArgs.getArg('--out-dir')) {
    console.error(`Missing --out-dir for ${sliceName}`);
    process.exit(1);
  }

  const { report, failures, fail: failFn } = createReport(sliceName, {
    hostingMode: hostingModeTag(workbenchUrl),
    workbenchUrl,
  });

  const { browser, context, page } = await launchBrowser({ headed });

  if (openPage) {
    await openWorkbench(page, workbenchUrl);
  }

  return {
    page,
    browser,
    context,
    report,
    failures,
    fail: failFn,
    workbenchUrl,
    outDir,
    cliArgs,
    headed,
    resolveRoute: (routePath) => resolveRoute(workbenchUrl, routePath),
  };
}
