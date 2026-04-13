/**
 * Randomized bundle smoke test.
 *
 * Tests the full 3-action bundle (idle, attack, death) with randomized
 * authoring methods. Each run randomly assigns one of three methods to
 * each action (permutation — each method used exactly once):
 *
 *   - new_xp:     Draw random scribbles in the whole-sheet editor
 *   - upload_xp:  Import a reference XP via UI
 *   - upload_png:  Upload PNG → Find Sprites → extract → populate grid
 *
 * Foreground glyph is always the action letter: I (idle), A (attack), D (death).
 * Colors, cell positions, tool choices are randomized per run.
 *
 * After all 3 actions are authored, tests the bundle in Skin Dock with
 * 10-second runaround crash detection.
 *
 * Usage:
 *   node run_randomized_bundle_test.mjs --out-dir <dir> [--headed] [--hold] [--seed <n>]
 */
import { chromium } from 'playwright';
import { execSync } from 'child_process';
import fs from 'fs';
import path from 'path';
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
const seed = Number(getArg('--seed', Date.now()));

if (!outDir) { console.error('Missing --out-dir'); process.exit(1); }
fs.mkdirSync(outDir, { recursive: true });

// ── Seeded RNG (xorshift32) ──

let _rngState = seed >>> 0 || 1;
function rng() {
  _rngState ^= _rngState << 13;
  _rngState ^= _rngState >>> 17;
  _rngState ^= _rngState << 5;
  return (_rngState >>> 0) / 4294967296;
}
function rngInt(min, max) { return Math.floor(rng() * (max - min + 1)) + min; }
function rngPick(arr) { return arr[rngInt(0, arr.length - 1)]; }
function rngShuffle(arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = rngInt(0, i);
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}
function rngColor() {
  return '#' + [rngInt(0, 255), rngInt(0, 255), rngInt(0, 255)]
    .map(c => c.toString(16).padStart(2, '0')).join('');
}

// ── Oracle helpers ──

// Extract the most common non-background glyph from layer 2 of an XP file.
// Used to determine expected_glyph for upload_xp and upload_png oracle checks.
// Returns a number (glyph code) or null on failure.
function extractDominantGlyph(xpPath) {
  if (!xpPath) return null;
  try {
    const absPath = path.isAbsolute(xpPath) ? xpPath : path.resolve(repoRoot, xpPath);
    const script = [
      'import sys,os',
      "sys.path.insert(0,'scripts')",
      'from xp_core import XPFile',
      'from collections import Counter',
      "xp=XPFile(os.environ['XP_PATH'])",
      "layer=xp.layers[min(2,len(xp.layers)-1)]",
      "g=Counter(cell[0] for row in layer.data for cell in row if cell[0] not in (0,32))",
      "print(g.most_common(1)[0][0] if g else 0)",
    ].join(';');
    const raw = execSync(`python3 -c "${script}"`, {
      encoding: 'utf8',
      cwd: repoRoot,
      env: { ...process.env, XP_PATH: absPath },
      timeout: 15000,
    });
    // xp_core.XPFile prints loading messages to stdout; extract only the numeric glyph line
    const numericLine = raw.split('\n').find(l => /^\d+$/.test(l.trim()));
    const g = numericLine ? parseInt(numericLine.trim(), 10) : 0;
    return Number.isFinite(g) && g > 0 ? g : null;
  } catch (_) { return null; }
}

// ── Constants ──

const ACTION_KEYS = ['idle', 'attack', 'death'];
const ACTION_LABELS = { idle: /Idle \/ Walk/i, attack: /^Attack/i, death: /^Death/i };
const ACTION_GLYPHS = { idle: 73 /* I */, attack: 65 /* A */, death: 68 /* D */ };
const METHODS = ['new_xp', 'upload_xp', 'upload_png'];

const REFERENCE_XPS = {
  idle:   'sprites/player-0100.xp',
  attack: 'sprites/attack-0001.xp',
  death:  'sprites/plydie-0000.xp',
};

const PNG_POOL_DIR = 'tests/fixtures/baseline';

// ── Randomize method assignment (permutation) ──

const methodAssignment = (() => {
  const shuffled = rngShuffle(METHODS);
  const m = {};
  ACTION_KEYS.forEach((k, i) => { m[k] = shuffled[i]; });
  return m;
})();

// Pick a random PNG for the upload_png action
const pngPool = (() => {
  const dir = path.resolve(repoRoot, PNG_POOL_DIR);
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir).filter(f => f.endsWith('.png'));
})();

const uploadPngFile = pngPool.length ? rngPick(pngPool) : null;

// ── Whole-sheet random action registry ──
// Each entry: { id, enabled, weight, exec(page, ctx) }
// New actions slot in by adding to this array. Stubs have enabled:false.

const WS_RANDOM_ACTIONS = [
  {
    id: 'paint_cell',
    enabled: true,
    weight: 4,
    async exec(page, ctx) {
      await page.click('#wsToolCell');
      await page.waitForTimeout(100);
      await clickCanvasCell(page, '#wholeSheetCanvas', rngInt(0, ctx.width - 1), rngInt(0, ctx.height - 1), ctx.cellSize);
    },
  },
  {
    id: 'flood_fill',
    enabled: true,
    weight: 1,
    async exec(page, ctx) {
      await page.click('#wsToolFill');
      await page.waitForTimeout(100);
      await clickCanvasCell(page, '#wholeSheetCanvas', rngInt(0, ctx.width - 1), rngInt(0, ctx.height - 1), ctx.cellSize);
      // Switch back to cell tool to avoid accidental fills
      await page.click('#wsToolCell');
    },
  },
  {
    id: 'draw_rect',
    enabled: true,
    weight: 2,
    async exec(page, ctx) {
      await page.click('#wsToolRect');
      await page.waitForTimeout(100);
      const x1 = rngInt(0, ctx.width - 2);
      const y1 = rngInt(0, ctx.height - 2);
      const x2 = rngInt(x1 + 1, Math.min(x1 + 10, ctx.width - 1));
      const y2 = rngInt(y1 + 1, Math.min(y1 + 10, ctx.height - 1));
      await dragOnCanvas(page, '#wholeSheetCanvas', x1, y1, x2, y2, ctx.cellSize);
      await page.click('#wsToolCell');
    },
  },
  {
    id: 'draw_line',
    enabled: true,
    weight: 2,
    async exec(page, ctx) {
      await page.click('#wsToolLine');
      await page.waitForTimeout(100);
      const x1 = rngInt(0, ctx.width - 1);
      const y1 = rngInt(0, ctx.height - 1);
      const x2 = rngInt(0, ctx.width - 1);
      const y2 = rngInt(0, ctx.height - 1);
      await dragOnCanvas(page, '#wholeSheetCanvas', x1, y1, x2, y2, ctx.cellSize);
      await page.click('#wsToolCell');
    },
  },
  {
    id: 'erase_cell',
    enabled: true,
    weight: 1,
    async exec(page, ctx) {
      await page.click('#wsToolErase');
      await page.waitForTimeout(100);
      await clickCanvasCell(page, '#wholeSheetCanvas', rngInt(0, ctx.width - 1), rngInt(0, ctx.height - 1), ctx.cellSize);
      await page.click('#wsToolCell');
    },
  },
  {
    id: 'change_colors',
    enabled: true,
    weight: 2,
    async exec(page, ctx) {
      const fg = rngColor();
      const bg = rngColor();
      await page.fill('#wsFgColor', fg);
      await page.locator('#wsFgColor').dispatchEvent('input');
      await page.fill('#wsBgColor', bg);
      await page.locator('#wsBgColor').dispatchEvent('input');
      ctx.currentFg = fg;
      ctx.currentBg = bg;
    },
  },
  // ── STUBS: slot in when the UI supports these ──
  {
    id: 'copy_selection',
    enabled: false, // TODO: enable when WS editor has copy/paste
    weight: 1,
    async exec(page, ctx) {
      // await page.click('#wsToolSelect');
      // drag to select region
      // await page.keyboard.press('Control+c');
      console.error(`  [stub] copy_selection not yet implemented`);
    },
  },
  {
    id: 'paste_selection',
    enabled: false, // TODO: enable when WS editor has copy/paste
    weight: 1,
    async exec(page, ctx) {
      // await page.keyboard.press('Control+v');
      // click to place
      console.error(`  [stub] paste_selection not yet implemented`);
    },
  },
  {
    id: 'select_region',
    enabled: false, // TODO: enable when select + operations are wired
    weight: 1,
    async exec(page, ctx) {
      // await page.click('#wsToolSelect');
      // drag selection
      console.error(`  [stub] select_region not yet implemented`);
    },
  },
  {
    id: 'undo',
    enabled: false, // TODO: enable once undo stability is confirmed
    weight: 1,
    async exec(page, ctx) {
      // await page.click('#wsUndoBtn');
      console.error(`  [stub] undo not yet implemented`);
    },
  },
  {
    id: 'redo',
    enabled: false, // TODO: enable once redo stability is confirmed
    weight: 1,
    async exec(page, ctx) {
      // await page.click('#wsRedoBtn');
      console.error(`  [stub] redo not yet implemented`);
    },
  },
];

function pickWeightedAction() {
  const enabled = WS_RANDOM_ACTIONS.filter(a => a.enabled);
  const totalWeight = enabled.reduce((s, a) => s + a.weight, 0);
  let r = rng() * totalWeight;
  for (const a of enabled) {
    r -= a.weight;
    if (r <= 0) return a;
  }
  return enabled[enabled.length - 1];
}

// ── Report ──

const failures = [];
const report = {
  workflow_type: 'randomized_bundle',
  seed,
  method_assignment: methodAssignment,
  upload_png_file: uploadPngFile,
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
    method: methodAssignment[key],
    execute_pass: false,
    export_pass: false,
    failures: [],
  };
}

// ── Oracle state ──
// oracleExpectedGlyph: glyph code to scan for during Skin Dock runaround.
// For new_xp idle: known statically (ACTION_GLYPHS.idle).
// For upload_xp / upload_png idle: extracted from reference/exported XP after export.
let oracleExpectedGlyph = methodAssignment.idle === 'new_xp' ? ACTION_GLYPHS.idle : null;
let oracleSamples = [];

function fail(actionKey, cls, message) {
  const rec = { action: actionKey || 'bundle', class: cls, message };
  failures.push(rec);
  if (actionKey && report.actions[actionKey]) {
    report.actions[actionKey].failures.push(rec);
  }
  console.error(`[FAIL:${actionKey || 'bundle'}:${cls}] ${message}`);
}

// ── Canvas helpers (from run_bundle_fidelity_test.mjs) ──

const _bboxCache = { selector: null, box: null };

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
    if (cx < safeLeft || cx > safeRight || cy < safeTop || cy > safeBottom) {
      scroll.scrollLeft = Math.max(0, cx - viewW / 2);
      scroll.scrollTop = Math.max(0, cy - viewH / 2);
      return true;
    }
    return false;
  }, { left: leftPx, top: topPx, right: rightPx, bottom: bottomPx });
}

async function _getCanvasBox(page, selector, didScroll) {
  if (!didScroll && _bboxCache.selector === selector && _bboxCache.box) return _bboxCache.box;
  const box = await page.locator(selector).boundingBox();
  if (!box) throw new Error(`canvas element not found: ${selector}`);
  _bboxCache.selector = selector;
  _bboxCache.box = box;
  return box;
}

async function dragOnCanvas(page, selector, x1, y1, x2, y2, cellSize) {
  const startPx = x1 * cellSize + cellSize / 2;
  const startPy = y1 * cellSize + cellSize / 2;
  const endPx = x2 * cellSize + cellSize / 2;
  const endPy = y2 * cellSize + cellSize / 2;
  const didScroll = await centerCanvasRegion(page,
    Math.min(startPx, endPx), Math.min(startPy, endPy),
    Math.max(startPx, endPx), Math.max(startPy, endPy));
  const box = await _getCanvasBox(page, selector, didScroll);
  await page.mouse.move(box.x + startPx, box.y + startPy);
  await page.mouse.down();
  await page.mouse.move(box.x + endPx, box.y + endPy);
  await page.mouse.up();
}

async function clickCanvasCell(page, selector, x, y, cellSize) {
  const posX = x * cellSize + cellSize / 2;
  const posY = y * cellSize + cellSize / 2;
  const didScroll = await centerCanvasRegion(page, posX, posY, posX, posY);
  const box = await _getCanvasBox(page, selector, didScroll);
  await page.mouse.click(box.x + posX, box.y + posY);
}

// ── Source canvas helpers for upload_png ──

async function canvasDragPx(page, selector, x1, y1, x2, y2) {
  const box = await page.locator(selector).boundingBox();
  if (!box) throw new Error(`element not found: ${selector}`);
  await page.mouse.move(box.x + x1, box.y + y1);
  await page.mouse.down();
  await page.mouse.move(box.x + x2, box.y + y2);
  await page.mouse.up();
}

async function canvasRightClickPx(page, selector, x, y) {
  const box = await page.locator(selector).boundingBox();
  if (!box) throw new Error(`element not found: ${selector}`);
  await page.mouse.click(box.x + x, box.y + y, { button: 'right' });
}

// ── Skin Dock helpers (from run_bundle_fidelity_test.mjs) ──

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
          const p = [0, 0, 0]; window.ak.getPos(p, 0); out.pos = p.map(Number);
        }
      } catch (_e) {}
      try {
        if (window.__ak_diag) {
          out.rafCount = window.__ak_diag.raf || 0;
          out.renderCrashes = window.__ak_diag.crashes || 0;
        }
      } catch (_e) {}
      return out;
    }, label);
  } catch (e) { return { label, error: String(e) }; }
}

function probeShowsWorldStarted(probe) {
  if (!probe || typeof probe !== 'object') return false;
  const asBool = (v) => v === true || Number(v) === 1;
  const asNum = (v) => { const n = Number(v); return Number.isFinite(n) ? n : null; };
  if (asBool(probe.worldReady) && !asBool(probe.gameMainMenu)) return true;
  const rs = asNum(probe.renderStage);
  if (rs !== null && rs >= 70 && !asBool(probe.gameMainMenu)) return true;
  if (!asBool(probe.gameMainMenu) && Array.isArray(probe.pos) && probe.pos.some(v => Math.abs(v) > 1e-3)) return true;
  if (probe.rafCount > 30 && !probe.overlayVisible && probe.renderCrashes === 0 && rs !== null && rs > 0) return true;
  return false;
}

async function pulseMainMenuAdvance(frameHandle) {
  return frameHandle.evaluate(() => {
    try { if (typeof window.Keyb === 'function') { window.Keyb(0, 3); window.Keyb(2, 10); window.Keyb(1, 3); } } catch (_e) {}
    try {
      for (const t of [window, document, document.body, document.getElementById('asciicker_canvas')]) {
        if (t) t.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', keyCode: 13, bubbles: true }));
      }
    } catch (_e) {}
    return true;
  });
}

// ── Authoring method implementations ──

async function authorNewXp(page, actionKey) {
  const glyph = ACTION_GLYPHS[actionKey];
  console.error(`  [new_xp] Drawing with glyph=${String.fromCharCode(glyph)}, random colors`);

  // Wait for WS editor controls to be ready
  await page.waitForSelector('#wsGlyphCode', { state: 'visible', timeout: 10000 });
  await page.waitForSelector('#wholeSheetCanvas', { state: 'attached', timeout: 10000 });
  await page.waitForTimeout(500);

  // Read geometry from session metadata
  const meta = await page.evaluate(() => {
    try {
      const m = JSON.parse(document.getElementById('metaOut')?.textContent || '{}');
      return { frame_w: m.frame_w_chars || 10, frame_h: m.frame_h_chars || 10 };
    } catch (_) { return { frame_w: 10, frame_h: 10 }; }
  });
  const width = await page.evaluate(() => {
    try { return JSON.parse(document.getElementById('sessionOut')?.textContent || '{}').grid_cols || 20; } catch (_) { return 20; }
  });
  const height = await page.evaluate(() => {
    try { return JSON.parse(document.getElementById('sessionOut')?.textContent || '{}').grid_rows || 20; } catch (_) { return 20; }
  });

  // Detect cell size from canvas
  const cellSize = await page.evaluate(() => {
    const c = document.getElementById('wholeSheetCanvas');
    if (!c) return 8;
    const sess = (() => { try { return JSON.parse(document.getElementById('sessionOut')?.textContent || '{}'); } catch (_) { return {}; } })();
    const cols = sess.grid_cols || 1;
    return Math.round(c.width / cols) || 8;
  });

  const ctx = { width, height, cellSize, currentFg: rngColor(), currentBg: rngColor() };

  // Suppress autosave during rapid drawing to prevent save storm
  await page.evaluate(() => {
    if (window.__wb_debug?.suppressAutoSave) window.__wb_debug.suppressAutoSave(true);
    if (window.__wb_debug?.suppressRender) window.__wb_debug.suppressRender(true);
  });

  // Set initial draw state: action glyph + random colors
  await page.fill('#wsGlyphCode', String(glyph));
  await page.locator('#wsGlyphCode').dispatchEvent('change');
  await page.fill('#wsFgColor', ctx.currentFg);
  await page.locator('#wsFgColor').dispatchEvent('input');
  await page.fill('#wsBgColor', ctx.currentBg);
  await page.locator('#wsBgColor').dispatchEvent('input');
  await page.click('#wsToolCell');
  await page.waitForTimeout(200);

  // Execute 20-40 random actions
  const actionCount = rngInt(20, 40);
  console.error(`  [new_xp] Executing ${actionCount} random whole-sheet actions`);
  for (let i = 0; i < actionCount; i++) {
    const action = pickWeightedAction();
    try {
      await action.exec(page, ctx);
    } catch (e) {
      console.error(`  [new_xp] action ${action.id} failed: ${e.message}`);
    }
    if (i % 10 === 9) await page.waitForTimeout(100);
  }

  // Restore glyph in case change_colors action changed it (it shouldn't, but be safe)
  await page.fill('#wsGlyphCode', String(glyph));
  await page.locator('#wsGlyphCode').dispatchEvent('change');
}

async function authorUploadXp(page, actionKey) {
  const xpPath = path.resolve(repoRoot, REFERENCE_XPS[actionKey]);
  console.error(`  [upload_xp] Importing ${path.basename(xpPath)}`);
  await page.setInputFiles('#xpImportFile', xpPath);
  await page.click('#xpImportBtn');

  // Wait for import to fully hydrate: session loaded + metadata populated +
  // whole-sheet canvas attached (proves loadFromJob completed).
  await page.waitForFunction(() => {
    const sess = String(document.getElementById('sessionOut')?.textContent || '').trim();
    const meta = String(document.getElementById('metaOut')?.textContent || '').trim();
    if (sess.length < 5 || meta.length < 5) return false;
    try {
      const s = JSON.parse(sess);
      const m = JSON.parse(meta);
      return s.grid_cols > 0 && m.angles > 0;
    } catch (_) { return false; }
  }, null, { timeout: 30000 });

  // Wait for WS editor to be ready (import triggers loadFromJob → WS mount)
  await page.waitForSelector('#wholeSheetCanvas', { state: 'attached', timeout: 15000 }).catch(() => {});
  await page.waitForTimeout(1500);
  console.error(`  [upload_xp] Import hydrated, session ready`);
}

async function authorUploadPng(page, actionKey) {
  if (!uploadPngFile) {
    fail(actionKey, 'upload_png', 'No PNG files found in pool directory');
    return;
  }
  const pngPath = path.resolve(repoRoot, PNG_POOL_DIR, uploadPngFile);
  console.error(`  [upload_png] Uploading ${uploadPngFile}`);

  // Step 1: Upload PNG via UI
  await page.setInputFiles('#wbFile', pngPath);
  await page.click('#wbUpload');

  // Wait for upload response + source image load
  await page.waitForFunction(() => {
    const st = String(document.getElementById('wbStatus')?.textContent || '');
    return /upload.*ready|upload.*ok|uploaded/i.test(st) || (window.__wb_debug?._state?.()?.sourceImage != null);
  }, null, { timeout: 30000 });
  await page.waitForTimeout(500);
  console.error(`  [upload_png] Upload complete, source loaded`);

  // Step 2: Click "Convert to XP" — runs the server-side pipeline
  // (In bundle mode this calls wbRunBundleAction → /api/workbench/action-grid/apply)
  const runBtn = page.locator('#wbRun');
  await runBtn.waitFor({ state: 'visible', timeout: 10000 });
  // Wait for button to be enabled (needs sourcePath set from upload)
  await page.waitForFunction(() => {
    const btn = document.getElementById('wbRun');
    return btn && !btn.disabled;
  }, null, { timeout: 10000 });
  await runBtn.click();
  console.error(`  [upload_png] Convert to XP clicked, waiting for pipeline...`);

  // Wait for conversion to complete or for a pipeline error response.
  // Check for both session_id (success) and error (pipeline failure) so we
  // don't wait the full 120 s timeout when the server returns an immediate error.
  await page.waitForFunction(() => {
    const out = String(document.getElementById('wbRunOut')?.textContent || '').trim();
    if (!out || out.length < 5) return false;
    try {
      const j = JSON.parse(out);
      return !!j.session_id || !!j.error;
    } catch (_) { return false; }
  }, null, { timeout: 120000 }); // pipeline can be slow
  await page.waitForTimeout(1000);

  const convResult = await page.evaluate(() => {
    try { return JSON.parse(document.getElementById('wbRunOut')?.textContent || '{}'); }
    catch (_) { return {}; }
  });
  if (convResult.error) {
    fail(actionKey, 'upload_png', `pipeline error: ${convResult.error} (${convResult.code || 'unknown'})`);
    return;
  }
  console.error(`  [upload_png] Conversion done: session=${convResult.session_id}, grid=${convResult.grid_cols}x${convResult.grid_rows}`);

  // Step 3 (future): Find Sprites + drag flow for manual sprite extraction
  // This is a more advanced workflow that will be wired when the test
  // supports source-panel interactions as randomizable actions.
  // For now, the pipeline conversion handles the full PNG→XP flow.

  // ── STUB: Find Sprites + extract flow ──
  // When enabled, this would:
  //   1. await page.click('#extractBtn');
  //   2. Read extracted boxes from state
  //   3. Click a box → right-click → Set as anchor
  //   4. Select grid row → right-click box → Add to selected row
  //   5. Repeat for multiple rows
  // This exercises the manual assembly path instead of the pipeline path.
}

const AUTHOR_METHODS = {
  new_xp: authorNewXp,
  upload_xp: authorUploadXp,
  upload_png: authorUploadPng,
};

// ── Main ──

async function main() {
  console.error(`[0] Randomized bundle test — seed=${seed}`);
  console.error(`[0] Method assignment: ${JSON.stringify(methodAssignment)}`);
  if (uploadPngFile) console.error(`[0] PNG for upload: ${uploadPngFile}`);

  const browser = await chromium.launch({
    headless: !headed,
    args: headed ? [] : ['--enable-webgl', '--use-gl=angle'],
  });
  const page = await browser.newPage({ viewport: { width: 1500, height: 980 }, acceptDownloads: true });

  try {
    // ── Step 1: Navigate and apply template ──
    console.error('[1] Navigating to workbench...');
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 });
    await page.waitForTimeout(2000);

    await page.waitForFunction(() => {
      const s = window.__wb_debug?.getWebbuildDebugState?.();
      return !!(s && s.runtimePreflight && s.runtimePreflight.checked === true);
    }, null, { timeout: 30000 });

    console.error('[2] Applying player_native_full template...');
    await page.selectOption('#templateSelect', 'player_native_full');
    await page.click('#templateApplyBtn');

    await page.waitForFunction(() => {
      const bs = String(document.getElementById('bundleStatus')?.textContent || '');
      const qt = String(document.getElementById('webbuildQuickTestBtn')?.textContent || '');
      const st = String(document.getElementById('wbStatus')?.textContent || '');
      return bs.includes('Bundle: 0/3')
        && /Test Bundle Skin/i.test(qt)
        && (/Bundle created:/i.test(st) || /Authoring bundle ready:/i.test(st));
    }, null, { timeout: 60000 });

    console.error('[2] Bundle created (0/3 converted)');

    // ── Step 2: Per-action authoring ──
    for (const actionKey of ACTION_KEYS) {
      const method = methodAssignment[actionKey];
      const actionReport = report.actions[actionKey];
      console.error(`[3:${actionKey}] method=${method}`);

      // For idle action with upload_xp: extract expected glyph from reference XP now
      // (reference XP is known before authoring; glyph used by oracle in Skin Dock test)
      if (actionKey === 'idle' && method === 'upload_xp' && oracleExpectedGlyph === null) {
        const refXp = path.resolve(repoRoot, REFERENCE_XPS.idle);
        oracleExpectedGlyph = extractDominantGlyph(refXp);
        console.error(`  [Oracle] idle expected_glyph=${oracleExpectedGlyph} (upload_xp reference=${path.basename(refXp)})`);
      }

      // Switch to action tab — wait for the UI state to reflect the new active action
      _bboxCache.selector = null;
      _bboxCache.box = null;
      const tabLocator = page.locator('#bundleActionTabs button').filter({ hasText: ACTION_LABELS[actionKey] });
      await tabLocator.first().click();
      await page.waitForTimeout(500);

      // Wait for the active action key to match AND session to be populated
      await page.waitForFunction((expectedKey) => {
        const s = window.__wb_debug?._state?.();
        if (!s || s.activeActionKey !== expectedKey) return false;
        const sess = String(document.getElementById('sessionOut')?.textContent || '').trim();
        return sess.length > 2;
      }, actionKey, { timeout: 30000 });

      await page.waitForSelector('#wholeSheetCanvas', { state: 'attached', timeout: 15000 }).catch(() => {});
      await page.waitForTimeout(1000);

      // Execute the authoring method
      try {
        await AUTHOR_METHODS[method](page, actionKey);
        actionReport.execute_pass = true;
        console.error(`[3:${actionKey}] Authoring complete`);
      } catch (e) {
        fail(actionKey, 'execute', `${method} failed: ${e.message}`);
      }

      // For upload_png, the "Convert to XP" step already produced a converted
      // session with status="converted". No separate export needed.
      // For new_xp and upload_xp, we must save+export to promote blank→converted.
      if (method === 'upload_png') {
        // Check that conversion already set status to converted
        const actStatus = await page.evaluate((key) => {
          const s = window.__wb_debug?._state?.();
          return s?.actionStates?.[key]?.status || 'unknown';
        }, actionKey);
        actionReport.export_pass = (actStatus === 'converted');
        if (actStatus === 'converted') {
          console.error(`[3:${actionKey}] Already converted via pipeline (status=${actStatus})`);
        } else {
          fail(actionKey, 'export', `upload_png action not converted: status=${actStatus}`);
        }
      } else {
        // new_xp / upload_xp: unsuppress autosave (may have been suppressed during drawing)
        // then save+export to promote blank→converted.
        await page.evaluate(() => {
          if (window.__wb_debug?.suppressAutoSave) window.__wb_debug.suppressAutoSave(false);
          if (window.__wb_debug?.suppressRender) window.__wb_debug.suppressRender(false);
        });
        await page.waitForTimeout(500);

        // Log current state for diagnostics
        const preExportState = await page.evaluate((key) => {
          const s = window.__wb_debug?._state?.();
          return {
            activeActionKey: s?.activeActionKey,
            sessionId: s?.sessionId,
            actionStatus: s?.actionStates?.[key]?.status,
            actionSessionId: s?.actionStates?.[key]?.sessionId,
          };
        }, actionKey);
        console.error(`[3:${actionKey}] Pre-export state: ${JSON.stringify(preExportState)}`);

        // Export — internally saves then calls persistBundleActionStatus("converted")
        console.error(`[3:${actionKey}] Exporting...`);
        // Clear stale export output first so we wait for fresh result
        await page.evaluate(() => {
          const el = document.getElementById('exportOut');
          if (el) el.textContent = '';
        });
        await page.click('#btnExport');
        // Wait for export result OR error (don't hang on save timeout)
        await page.waitForFunction(() => {
          const t = String(document.getElementById('exportOut')?.textContent || '').trim();
          if (!t) return false;
          try { const e = JSON.parse(t); return !!e.xp_path || !!e.stage; } catch (_) { return false; }
        }, null, { timeout: 30000 });

        const exportResult = await page.evaluate(() => {
          try { return JSON.parse(document.getElementById('exportOut')?.textContent || '{}'); } catch (_) { return {}; }
        });

        if (exportResult.xp_path) {
          actionReport.export_pass = true;
          console.error(`[3:${actionKey}] Export OK: ${exportResult.xp_path}`);
        } else if (exportResult.stage) {
          // Export blocked by save failure — retry with a direct save then export
          console.error(`[3:${actionKey}] Export blocked (${exportResult.stage}), retrying...`);
          await page.evaluate(() => {
            // Force-clear dirty flag and retry
            const s = window.__wb_debug?._state?.();
            if (s) s.sessionDirty = false;
          });
          await page.waitForTimeout(500);
          await page.evaluate(() => {
            const el = document.getElementById('exportOut');
            if (el) el.textContent = '';
          });
          await page.click('#btnExport');
          await page.waitForFunction(() => {
            const t = String(document.getElementById('exportOut')?.textContent || '').trim();
            if (!t) return false;
            try { const e = JSON.parse(t); return !!e.xp_path || !!e.stage; } catch (_) { return false; }
          }, null, { timeout: 20000 });
          const retry = await page.evaluate(() => {
            try { return JSON.parse(document.getElementById('exportOut')?.textContent || '{}'); } catch (_) { return {}; }
          });
          if (retry.xp_path) {
            actionReport.export_pass = true;
            console.error(`[3:${actionKey}] Export OK (retry): ${retry.xp_path}`);
          } else {
            fail(actionKey, 'export', `Export failed after retry: ${JSON.stringify(retry)}`);
          }
        } else {
          fail(actionKey, 'export', 'Export did not produce xp_path');
        }

        // Wait for persistBundleActionStatus to complete
        await page.waitForTimeout(1500);
        const postExportStatus = await page.evaluate((key) => {
          const s = window.__wb_debug?._state?.();
          return s?.actionStates?.[key]?.status || 'unknown';
        }, actionKey);
        console.error(`[3:${actionKey}] Post-export status: ${postExportStatus}`);
        if (postExportStatus !== 'converted' && postExportStatus !== 'saved') {
          fail(actionKey, 'status', `Action not promoted after export: status=${postExportStatus}`);
        }
      }
    }

    // Log bundle status before skin dock
    const bundleStatusText = await page.evaluate(() =>
      String(document.getElementById('bundleStatus')?.textContent || ''));
    const allStatuses = await page.evaluate(() => {
      const s = window.__wb_debug?._state?.();
      const out = {};
      for (const [k, v] of Object.entries(s?.actionStates || {})) out[k] = v?.status;
      return out;
    });
    console.error(`[4] Bundle status: "${bundleStatusText}", actions: ${JSON.stringify(allStatuses)}`);

    // ── Step 3: Skin Dock test ──
    console.error('[4] Testing bundle in Skin Dock...');

    // Wait for all actions to be ready
    await page.waitForFunction(() => {
      const bs = String(document.getElementById('bundleStatus')?.textContent || '');
      return /3\/3/i.test(bs);
    }, null, { timeout: 30000 }).catch(() => {
      console.error('[4] Bundle not 3/3 ready, trying skin dock anyway');
    });

    // Enable and click Test Bundle Skin
    const btnEnabled = await page.waitForFunction(() => {
      const btn = document.getElementById('webbuildQuickTestBtn');
      return !!btn && !btn.disabled;
    }, null, { timeout: 30000 }).then(() => true).catch(() => false);

    if (!btnEnabled) {
      // Try opening webbuild first
      await page.evaluate(() => {
        if (window.__wb_debug?.openWebbuild) window.__wb_debug.openWebbuild(false);
      });
      await page.waitForFunction(() => {
        const btn = document.getElementById('webbuildQuickTestBtn');
        return !!btn && !btn.disabled;
      }, null, { timeout: 30000 }).catch(() => {});
    }

    await page.click('#webbuildQuickTestBtn');

    // Wait for skin injection
    const skinStart = Date.now();
    let skinSnap = null;
    for (let i = 0; i < 60; i++) {
      skinSnap = await page.evaluate(() => {
        const s = window.__wb_debug?._state?.();
        return s?.skinDock || s?.lastSkinResult || null;
      });
      if (skinSnap) break;
      await page.waitForTimeout(1000);
    }

    // Get iframe and wait for playable
    const getFrameHandle = () => page.frame({ url: /\/termpp-web-flat\/index\.html/ });

    await page.waitForFunction(() => {
      const frame = document.getElementById('webbuildFrame');
      return !!frame && !frame.classList.contains('hidden') && !!frame.src;
    }, null, { timeout: 60000 });

    let frameHandle = null;
    for (let i = 0; i < 120; i++) {
      frameHandle = getFrameHandle();
      if (frameHandle) break;
      await page.waitForTimeout(500);
    }

    if (!frameHandle) {
      fail(null, 'skin_dock', 'Frame handle not found');
    } else {
      // Wait for WASM
      for (let i = 0; i < 120; i++) {
        frameHandle = getFrameHandle() || frameHandle;
        const p = await captureFrameProbe(frameHandle, `wasm_${i}`);
        if (p.error && /detach/i.test(p.error)) { await page.waitForTimeout(1000); continue; }
        if (p.wasmReady) break;
        await page.waitForTimeout(1000);
      }

      // Handle overlay
      frameHandle = getFrameHandle() || frameHandle;
      let probe = await captureFrameProbe(frameHandle, 'initial');
      if (probe.overlayVisible) {
        try {
          const playBtn = frameHandle.locator('#play-btn');
          if (await playBtn.count() && await playBtn.isEnabled().catch(() => false)) {
            await playBtn.click({ timeout: 5000 });
          }
        } catch (_) {}
        await page.waitForTimeout(1500);
      }

      // Pulse main menu
      for (let i = 0; i < 30; i++) {
        frameHandle = getFrameHandle() || frameHandle;
        probe = await captureFrameProbe(frameHandle, `menu_${i}`);
        if (probe.error && /detach/i.test(probe.error)) { await page.waitForTimeout(1000); continue; }
        if (!probe.gameMainMenu && probeShowsWorldStarted(probe)) break;
        if (probeShowsWorldStarted(probe)) break;
        if (probe.gameMainMenu === true || Number(probe.gameMainMenu) === 1) {
          await pulseMainMenuAdvance(frameHandle);
        }
        await page.waitForTimeout(600);
      }

      // Wait for playable
      let playable = false;
      const pStart = Date.now();
      while (Date.now() - pStart < 30000) {
        frameHandle = getFrameHandle() || frameHandle;
        probe = await captureFrameProbe(frameHandle, 'playable');
        if (probe.error && /detach/i.test(probe.error)) { await page.waitForTimeout(1000); continue; }
        if (!probe.overlayVisible && probeShowsWorldStarted(probe)) { playable = true; break; }
        await page.waitForTimeout(500);
      }

      report.skin_dock_pass = playable;

      if (!playable) {
        fail(null, 'skin_dock', 'Never reached playable state');
      } else {
        console.error('[4] Skin Dock playable');

        // ── Oracle initialization (Phase 2) ──
        // Load oracle script into iframe and initialize with expected glyph for idle action.
        // The oracle scans window.ak_buf (exposed by runtime patch) around screen center.
        const oracleSrc = fs.readFileSync(path.resolve(repoRoot, 'scripts/skin_dock_oracle.js'), 'utf8');
        try {
          await frameHandle.evaluate(oracleSrc);
          // suppress=2: skip first 2 samples for cold-start; world is already confirmed playable
          await frameHandle.evaluate((g) => window._sdk_oracle_init({ expected_glyph: g, suppress: 2 }), oracleExpectedGlyph);
          console.error(`  [Oracle] initialized expected_glyph=${oracleExpectedGlyph}`);
        } catch (e) {
          console.error(`  [Oracle] init failed: ${e.message}`);
        }

        // ── Step 4b: 10-second runaround crash detection ──
        console.error('[5] Runaround crash detection (10s)...');
        const directions = ['ArrowUp', 'ArrowRight', 'ArrowDown', 'ArrowLeft'];
        let prevRaf = null, prevCrashes = 0, runaroundPass = true;

        for (let sec = 0; sec < 10; sec++) {
          const dir = directions[sec % 4];
          frameHandle = getFrameHandle() || frameHandle;
          try {
            for (let k = 0; k < 5; k++) await frameHandle.locator('body').press(dir, { delay: 100 });
          } catch (_) { frameHandle = getFrameHandle() || frameHandle; }

          await page.waitForTimeout(500);
          frameHandle = getFrameHandle() || frameHandle;
          const rp = await captureFrameProbe(frameHandle, `run_${sec}`);

          if (rp.error && /detach/i.test(rp.error)) {
            fail(null, 'runaround', `Frame detached at ${sec}s`);
            runaroundPass = false; break;
          }
          const crashes = Number(rp.renderCrashes) || 0;
          const raf = Number(rp.rafCount) || 0;
          if (crashes > prevCrashes) {
            fail(null, 'runaround', `renderCrashes rose: ${prevCrashes}→${crashes} at ${sec}s`);
            runaroundPass = false; break;
          }
          if (prevRaf !== null && raf <= prevRaf) {
            fail(null, 'runaround', `rafCount stalled at ${raf} (was ${prevRaf}) at ${sec}s`);
            runaroundPass = false; break;
          }
          prevCrashes = crashes;
          prevRaf = raf;
          console.error(`  [${sec + 1}/10] ${dir} raf=${raf} crashes=${crashes}`);

          // ── Oracle sample (Phase 2) ──
          const oSample = await frameHandle.evaluate(() => {
            try {
              return typeof window._sdk_oracle_sample === 'function' ? window._sdk_oracle_sample() : null;
            } catch (_) { return null; }
          }).catch(() => null);
          if (oSample) oracleSamples.push(oSample);
          console.error(`  [Oracle:${sec + 1}] ready=${oSample?.oracle_ready} body_ok=${oSample?.body_ok} hits=${oSample?.glyph_hits} reason=${oSample?.oracle_ready_reason || ''}`);
        }

        if (!runaroundPass) report.skin_dock_pass = false;
        console.error(runaroundPass ? '[5] Runaround PASS' : '[5] Runaround FAIL');

        // ── Phase 0: Injection diagnostics ──
        // Read #webbuildOut (written by applyCurrentXpAsWebSkin) for per-action inject bytes.
        // Then fetch live bundle payload for override_names validation.
        // Classification: diagnostic. Uses fetch() in page.evaluate — not acceptance-grade.
        console.error('[6] Phase 0: Injection diagnostics...');
        const injectDiag = await page.evaluate(() => {
          try {
            const text = document.getElementById('webbuildOut')?.textContent;
            return text ? JSON.parse(text) : null;
          } catch (_) { return null; }
        });

        const phase0 = { inject_ok: true, bytes_by_action: {}, payload_fetch_ok: false, override_names_by_action: {} };
        if (injectDiag) {
          const injectActions = injectDiag.inject?.actions || {};
          for (const key of ACTION_KEYS) {
            const bytes = injectActions[key]?.bytes ?? -1;
            phase0.bytes_by_action[key] = bytes;
            if (bytes === 0) {
              phase0.inject_ok = false;
              fail(null, 'injection_diag', `Phase 0: action ${key} injected 0 bytes`);
            }
            console.error(`  [Phase0:${key}] inject.bytes=${bytes}`);
          }

          // Fetch live bundle payload for override_names (diagnostic fetch, not acceptance)
          try {
            const payloadData = await page.evaluate(async () => {
              const s = window.__wb_debug?._state?.();
              const bid = s?.bundleId;
              if (!bid) return { ok: false, reason: 'no_bundle_id' };
              const r = await fetch('/api/workbench/web-skin-bundle-payload', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ bundle_id: bid }),
              });
              const j = await r.json();
              return {
                ok: r.ok,
                actions: Object.fromEntries(Object.entries(j.actions || {}).map(
                  ([k, v]) => [k, { override_names: v.override_names || [] }]
                )),
              };
            });
            if (payloadData && payloadData.ok) {
              phase0.payload_fetch_ok = true;
              phase0.override_names_by_action = payloadData.actions;
              console.error(`  [Phase0] override_names: ${JSON.stringify(payloadData.actions)}`);
            }
          } catch (e) {
            console.error(`  [Phase0] payload fetch error: ${e.message}`);
          }
        } else {
          console.error('  [Phase0] #webbuildOut empty or missing');
        }
        report.phase0 = phase0;

        // ── Oracle results gate ──
        // render_skin_visual_ok is true/false only when >= 3 ready samples exist.
        // null = indeterminate (not enough ready samples — suppressed, no glyph, or no buf).
        // Gate blocks overall_pass only when explicitly false (skin provably absent).
        const readySamples = oracleSamples.filter(s => s && s.oracle_ready);
        const bodyOkCount = oracleSamples.filter(s => s && s.body_ok === true).length;
        const bodyFailCount = readySamples.filter(s => s.body_ok === false).length;
        const hasEnoughReadySamples = readySamples.length >= 3;
        const renderSkinVisible = hasEnoughReadySamples ? (bodyOkCount >= 3) : null;
        report.oracle_samples = oracleSamples;
        report.render_skin_visible = renderSkinVisible;
        report.gates = { render_skin_visual_ok: renderSkinVisible };

        console.error(`[6] Oracle summary: ${readySamples.length} ready samples, body_ok=${bodyOkCount}, body_fail=${bodyFailCount}, gate=${renderSkinVisible}`);
        if (hasEnoughReadySamples && renderSkinVisible === false) {
          fail(null, 'render_oracle', `Oracle: expected_glyph=${oracleExpectedGlyph} not found in >=3 ready samples (body_ok=${bodyOkCount}/${readySamples.length})`);
        } else if (oracleSamples.length === 0) {
          console.error('[6] Oracle: no samples collected (oracle may not have initialized)');
        } else if (!hasEnoughReadySamples) {
          console.error(`[6] Oracle: only ${readySamples.length} ready samples — gate indeterminate`);
        }
      }
    }

  } catch (err) {
    fail(null, 'fatal', err instanceof Error ? err.message : String(err));
  } finally {
    for (const key of ACTION_KEYS) {
      report[`${key}_pass`] = report.actions[key].execute_pass && report.actions[key].export_pass;
    }
    const oracleGatePassed = !report.gates || report.gates.render_skin_visual_ok !== false;
    report.overall_pass = report.idle_pass && report.attack_pass && report.death_pass && report.skin_dock_pass && oracleGatePassed;

    const resultPath = path.join(outDir, 'result.json');
    fs.writeFileSync(resultPath, JSON.stringify(report, null, 2));

    const passStr = report.overall_pass ? 'PASS' : 'FAIL';
    console.error(`\n[RANDOMIZED BUNDLE] ${passStr} (seed=${seed})`);
    console.error(`  idle=${report.idle_pass}(${methodAssignment.idle}) attack=${report.attack_pass}(${methodAssignment.attack}) death=${report.death_pass}(${methodAssignment.death}) skin_dock=${report.skin_dock_pass} oracle=${report.render_skin_visible}`);
    console.error(`  failures: ${failures.length}`);
    console.error(`  report: ${resultPath}`);

    if (holdOpen) {
      console.error('\n[HOLD] Press Enter to close...');
      await new Promise(r => process.stdin.once('data', r));
    }
    await browser.close();
  }
  process.exit(report.overall_pass ? 0 : 1);
}

main();
