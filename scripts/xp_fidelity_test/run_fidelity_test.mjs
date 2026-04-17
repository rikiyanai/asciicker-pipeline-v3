/**
 * CLASSIFICATION: UI-driven with diagnostic observation layer
 * ACTION PATH:    XP import via file input; cell painting via canvas mouse events
 *                 (acceptance mode). Inspector actions via page.evaluate()
 *                 (diagnostic mode only — refused in acceptance mode).
 * OBSERVATION:    Cell verification via __wb_debug.readFrameCell() / frameSignature()
 * ELIGIBLE FOR:   UI-driven acceptance (acceptance mode); diagnostic (diagnostic mode)
 * CAVEAT:         Cell-level verification reads use debug API. Actions themselves are
 *                 UI-driven in acceptance mode. The --mode flag enforces the boundary.
 */
import { chromium } from 'playwright';
import fs from 'fs';
import path from 'path';
import { spawnSync } from 'child_process';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, '..', '..');
const args = process.argv.slice(2);
const DEFAULT_WORKBENCH_URL = process.env.WORKBENCH_URL || 'http://127.0.0.1:5071/workbench';

function getArg(name, fallback = null) {
  const idx = args.indexOf(name);
  return idx >= 0 ? args[idx + 1] : fallback;
}

const xpPath = getArg('--xp');
const truthTablePath = getArg('--truth-table');
const recipePath = getArg('--recipe');
const url = getArg('--url', DEFAULT_WORKBENCH_URL);
const headed = args.includes('--headed');
const mode = getArg('--mode', 'diagnostic');

if (!xpPath || !truthTablePath || !recipePath) {
  console.error('Usage: node run_fidelity_test.mjs --xp <xp> --truth-table <json> --recipe <json> [--url <url>] [--headed] [--mode acceptance|diagnostic]');
  process.exit(1);
}

if (!headed) {
  console.error('[REFUSE] run_fidelity_test.mjs must be run headed. Re-run with --headed.');
  process.exit(1);
}

if (mode !== 'acceptance' && mode !== 'diagnostic') {
  console.error(`Unknown --mode: ${mode}. Use 'acceptance' or 'diagnostic'.`);
  process.exit(1);
}

const truthTable = JSON.parse(fs.readFileSync(truthTablePath, 'utf-8'));
const recipe = JSON.parse(fs.readFileSync(recipePath, 'utf-8'));
const outDir = path.dirname(path.resolve(truthTablePath));

// Validate mode consistency between recipe and runner
const recipeMode = recipe.mode || 'diagnostic';
if (mode === 'acceptance' && recipeMode !== 'acceptance') {
  console.error(`[REFUSE] Runner in acceptance mode but recipe was generated in '${recipeMode}' mode. Re-generate recipe with --mode acceptance.`);
  process.exit(1);
}

const failures = [];
const report = {
  source_xp: path.resolve(xpPath),
  mode,
  setup_mode: 'user_ui_import',
  user_reachable_load_pass: false,
  geometry_pass: false,
  frame_layout_pass: false,
  all_layers_pass: false,
  execute_pass: false,
  cell_fidelity_pass: false,
  export_pass: false,
  skin_dock_pass: false,
  overall_pass: false,
  failures,
};

function fail(cls, message, extra = {}) {
  failures.push({ class: cls, message, ...extra });
  console.error(`[FAIL:${cls}] ${message}`);
}

function parseJsonText(text, label) {
  try {
    return JSON.parse(text);
  } catch (err) {
    fail('json_parse', `${label} was not valid JSON`, { text });
    return null;
  }
}

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

function resolveSkinDockPlan(sourceXpFile, exportedXpFile) {
  const sourceAbs = path.resolve(sourceXpFile);
  const exportAbs = path.resolve(exportedXpFile);
  const dir = path.dirname(sourceAbs);
  const base = path.basename(sourceAbs).toLowerCase();

  const matchCode = (prefix) => {
    const m = base.match(new RegExp(`^${prefix}-([01]{3}[012])\\.xp$`));
    return m ? m[1] : '';
  };

  const attackCode = matchCode('attack');
  if (attackCode) {
    const idle = path.join(dir, `player-${attackCode}.xp`);
    return {
      mode: 'bundle_xp',
      baseXp: idle,
      injectFamily: 'attack',
      injectXp: exportAbs,
      sourceFamily: 'attack',
    };
  }

  const deathCode = matchCode('plydie');
  if (deathCode) {
    const idle = path.join(dir, `player-${deathCode}.xp`);
    return {
      mode: 'bundle_xp',
      baseXp: idle,
      injectFamily: 'plydie',
      injectXp: exportAbs,
      sourceFamily: 'plydie',
    };
  }

  const mountAttackCode = matchCode('wolack');
  if (mountAttackCode) {
    const idle = path.join(dir, `wolfie-${mountAttackCode}.xp`);
    return {
      mode: 'bundle_xp',
      baseXp: idle,
      injectFamily: 'wolack',
      injectXp: exportAbs,
      sourceFamily: 'wolack',
    };
  }

  return {
    mode: 'upload_xp',
    baseXp: exportAbs,
    injectFamily: '',
    injectXp: '',
    sourceFamily: base.startsWith('player-') || base === 'player-nude.xp' ? 'player' : 'other',
  };
}

function runSkinDockWatchdog(plan) {
  const args = [
    'scripts/workbench_png_to_skin_test_playwright.mjs',
    '--xp',
    path.resolve(plan.baseXp),
    '--override-mode',
    'preboot',
    '--url',
    url,
  ];
  if (plan.injectFamily && plan.injectXp) {
    args.push('--inject-family', String(plan.injectFamily));
    args.push('--inject-xp', path.resolve(plan.injectXp));
  }
  if (headed) args.push('--headed');

  const result = spawnSync('node', args, {
    cwd: repoRoot,
    encoding: 'utf-8',
    maxBuffer: 20 * 1024 * 1024,
  });
  if (result.status !== 0) {
    throw new Error(`Skin dock watchdog failed: ${result.stderr || result.stdout}`);
  }

  const output = `${result.stdout || ''}\n${result.stderr || ''}`;
  const resultPathMatch = output.match(/RESULT_PATH=(.+)/);
  if (!resultPathMatch) {
    throw new Error('Skin dock watchdog did not print RESULT_PATH');
  }
  const resultPath = String(resultPathMatch[1] || '').trim();
  if (!resultPath || !fs.existsSync(resultPath)) {
    throw new Error(`Skin dock watchdog result missing: ${resultPath}`);
  }

  const parsed = JSON.parse(fs.readFileSync(resultPath, 'utf-8'));
  return { resultPath, parsed };
}

function sameRgb(a, b) {
  return Array.isArray(a) && Array.isArray(b) && a.length === 3 && b.length === 3
    && a[0] === b[0] && a[1] === b[1] && a[2] === b[2];
}

function compareTruth(expected, actual) {
  const mismatches = [];
  // Track which layers have mismatches so we can separate preserved-layer
  // fidelity (all_layers_pass) from editable-layer fidelity (cell_fidelity_pass).
  const layerMismatchCounts = {};  // layer index → count

  const metaKeys = ['angles', 'projs', 'frame_rows', 'frame_cols', 'frame_w', 'frame_h'];
  for (const key of metaKeys) {
    if ((expected.metadata?.[key] ?? null) !== (actual.metadata?.[key] ?? null)) {
      mismatches.push({ type: 'metadata', key, expected: expected.metadata?.[key], actual: actual.metadata?.[key] });
    }
  }
  const expAnims = JSON.stringify(expected.metadata?.anims || []);
  const actAnims = JSON.stringify(actual.metadata?.anims || []);
  if (expAnims !== actAnims) {
    mismatches.push({ type: 'metadata', key: 'anims', expected: expAnims, actual: actAnims });
  }
  for (const key of ['width', 'height', 'layer_count']) {
    if ((expected[key] ?? null) !== (actual[key] ?? null)) {
      mismatches.push({ type: 'file', key, expected: expected[key], actual: actual[key] });
    }
  }
  const layerCount = Math.max(expected.layers?.length || 0, actual.layers?.length || 0);
  for (let i = 0; i < layerCount; i++) {
    layerMismatchCounts[i] = 0;
    const expLayer = expected.layers?.[i];
    const actLayer = actual.layers?.[i];
    if (!expLayer || !actLayer) {
      mismatches.push({ type: 'layer_missing', layer: i, expected: !!expLayer, actual: !!actLayer });
      layerMismatchCounts[i]++;
      continue;
    }
    if (expLayer.width !== actLayer.width || expLayer.height !== actLayer.height) {
      mismatches.push({
        type: 'layer_dims',
        layer: i,
        expected: `${expLayer.width}x${expLayer.height}`,
        actual: `${actLayer.width}x${actLayer.height}`,
      });
      layerMismatchCounts[i]++;
      continue;
    }
    const cells = Math.max(expLayer.cells.length, actLayer.cells.length);
    for (let idx = 0; idx < cells; idx++) {
      const expCell = expLayer.cells[idx];
      const actCell = actLayer.cells[idx];
      if (!expCell || !actCell) {
        mismatches.push({ type: 'cell_missing', layer: i, index: idx });
        layerMismatchCounts[i]++;
        continue;
      }
      if (
        expCell.glyph !== actCell.glyph ||
        !sameRgb(expCell.fg, actCell.fg) ||
        !sameRgb(expCell.bg, actCell.bg)
      ) {
        mismatches.push({
          type: 'cell',
          layer: i,
          x: expCell.x,
          y: expCell.y,
          expected: expCell,
          actual: actCell,
        });
        layerMismatchCounts[i]++;
        if (mismatches.length >= 50) break;
      }
    }
    if (mismatches.length >= 50) break;
  }
  return { ok: mismatches.length === 0, mismatches, layerMismatchCounts };
}

async function readSummary(page) {
  const sessionText = await page.locator('#sessionOut').textContent();
  const metaText = await page.locator('#metaOut').textContent();
  return {
    session: sessionText ? parseJsonText(sessionText, 'sessionOut') : null,
    meta: metaText ? parseJsonText(metaText, 'metaOut') : null,
  };
}

// ── Inspector-mode action helpers ──

async function getZoom(page) {
  const value = await page.locator('#inspectorZoom').inputValue();
  const zoom = Number.parseInt(value || '10', 10);
  return Number.isFinite(zoom) && zoom > 0 ? zoom : 10;
}

// ── Action classification (whitelist for acceptance mode) ──

const ACCEPTANCE_ACTIONS = new Set([
  'wait_visible',
  'ws_tool_activate',
  'ws_ensure_apply',
  'ws_set_draw_state',
  'ws_paint_cell',
  'ws_eyedropper_sample',
  'ws_erase_cell',
  'ws_erase_drag',
  'ws_flood_fill',
  'ws_draw_rect',
  'ws_draw_line',
]);

// ── Scroll helper for whole-sheet canvas ──

async function scrollToCell(page, targetPx, targetPy, cellSize) {
  await page.evaluate(({ tx, ty, cs }) => {
    const scroll = document.getElementById('wholeSheetScroll');
    if (!scroll) return;
    const viewW = scroll.clientWidth;
    const viewH = scroll.clientHeight;
    const cx = tx + cs / 2;
    const cy = ty + cs / 2;
    const needX = cx < scroll.scrollLeft || cx > scroll.scrollLeft + viewW;
    const needY = cy < scroll.scrollTop || cy > scroll.scrollTop + viewH;
    if (needX || needY) {
      scroll.scrollLeft = Math.max(0, tx - viewW / 2);
      scroll.scrollTop = Math.max(0, ty - viewH / 2);
    }
  }, { tx: targetPx, ty: targetPy, cs: cellSize });
}

// ── Drag helper for whole-sheet tools (line, rect) ──

async function dragOnCanvas(page, selector, x1, y1, x2, y2, cellSize) {
  // Scroll to bring the start cell into view, then drag from start to end.
  // Uses page.mouse so both points must be in viewport coords.
  // boundingBox() already accounts for parent scroll offset.
  await scrollToCell(page, x1 * cellSize, y1 * cellSize, cellSize);
  const canvasBox = await page.locator(selector).boundingBox();
  if (!canvasBox) {
    throw new Error(`dragOnCanvas: element not found: ${selector}`);
  }
  const vpX1 = canvasBox.x + x1 * cellSize + cellSize / 2;
  const vpY1 = canvasBox.y + y1 * cellSize + cellSize / 2;
  const vpX2 = canvasBox.x + x2 * cellSize + cellSize / 2;
  const vpY2 = canvasBox.y + y2 * cellSize + cellSize / 2;
  await page.mouse.move(vpX1, vpY1);
  await page.mouse.down();
  await page.mouse.move(vpX2, vpY2);
  await page.mouse.up();
}

// ── Recipe executor ──

async function executeRecipe(page) {
  for (const action of recipe.actions || []) {
    // Acceptance mode: whitelist enforcement — only ACCEPTANCE_ACTIONS allowed.
    // Any action not in the whitelist is refused, whether it is a known
    // diagnostic action or a future unknown action type.
    if (mode === 'acceptance' && !ACCEPTANCE_ACTIONS.has(action.action)) {
      fail('mode_violation', `Acceptance mode only allows whitelisted actions. Refused: ${action.action}`);
      return false;
    }

    switch (action.action) {
      // ── Shared actions ──
      case 'wait_visible':
        await page.waitForSelector(action.selector, { state: 'visible', timeout: action.timeout_ms || 5000 });
        break;

      // ── Diagnostic (inspector) actions — refused in acceptance mode above ──
      case 'open_frame':
        await page.dblclick(action.selector);
        break;
      case 'select_layer':
        await page.selectOption(action.selector, action.value);
        break;
      case 'select_tool':
        await page.click(action.selector);
        break;
      case 'clear_frame':
        await page.click(action.selector);
        break;
      case 'set_glyph_code':
      case 'set_fg_color':
      case 'set_bg_color':
        await page.fill(action.selector, action.value);
        break;
      case 'paint_cell': {
        const zoom = await getZoom(page);
        const x = Math.floor((action.cx * zoom) + (zoom / 2));
        const y = Math.floor((action.cy * zoom * 2) + (zoom / 2));
        await page.click(action.selector, { position: { x, y } });
        break;
      }

      // ── Acceptance (whole-sheet) actions ──
      case 'ws_tool_activate':
        await page.click(action.selector);
        break;

      case 'ws_ensure_apply': {
        // Ensure the apply-mode toggle is in the desired state.
        // The toggle button has class 'ws-toggle-on' when active.
        const btn = page.locator(action.selector);
        const isOn = await btn.evaluate((el) => el.classList.contains('ws-toggle-on'));
        if (isOn !== action.state) {
          await btn.click();
        }
        break;
      }

      case 'ws_set_draw_state':
        // Set glyph code, fg color, bg color through whole-sheet toolbar inputs
        await page.fill(action.glyph_selector, String(action.glyph));
        // Trigger change event for glyph input
        await page.locator(action.glyph_selector).dispatchEvent('change');
        await page.fill(action.fg_selector, action.fg);
        await page.locator(action.fg_selector).dispatchEvent('input');
        await page.fill(action.bg_selector, action.bg);
        await page.locator(action.bg_selector).dispatchEvent('input');
        break;

      case 'ws_paint_cell': {
        // Scroll #wholeSheetScroll so the target cell is in the viewport,
        // then click at the cell's center on the whole-sheet canvas.
        const cs = action.cell_size;
        const targetPx = action.x * cs;
        const targetPy = action.y * cs;
        await scrollToCell(page, targetPx, targetPy, cs);
        const px = Math.floor(action.x * cs + cs / 2);
        const py = Math.floor(action.y * cs + cs / 2);
        await page.click(action.selector, { position: { x: px, y: py } });
        break;
      }

      case 'ws_eyedropper_sample': {
        // Click the eyedropper on a cell, then verify draw state was updated.
        const cs2 = action.cell_size;
        await scrollToCell(page, action.x * cs2, action.y * cs2, cs2);
        const spx = Math.floor(action.x * cs2 + cs2 / 2);
        const spy = Math.floor(action.y * cs2 + cs2 / 2);
        await page.click(action.selector, { position: { x: spx, y: spy } });
        // Verify the eyedropper updated the draw state inputs
        if (action.expected_glyph !== undefined) {
          const actualGlyph = await page.locator('#wsGlyphCode').inputValue();
          if (String(action.expected_glyph) !== actualGlyph) {
            fail('tool_eyedropper', `Eyedropper glyph mismatch: expected ${action.expected_glyph}, got ${actualGlyph}`);
          }
        }
        if (action.expected_fg) {
          const actualFg = await page.locator('#wsFgColor').inputValue();
          if (action.expected_fg.toLowerCase() !== actualFg.toLowerCase()) {
            fail('tool_eyedropper', `Eyedropper FG mismatch: expected ${action.expected_fg}, got ${actualFg}`);
          }
        }
        if (action.expected_bg) {
          const actualBg = await page.locator('#wsBgColor').inputValue();
          if (action.expected_bg.toLowerCase() !== actualBg.toLowerCase()) {
            fail('tool_eyedropper', `Eyedropper BG mismatch: expected ${action.expected_bg}, got ${actualBg}`);
          }
        }
        break;
      }

      case 'ws_erase_cell': {
        // Click the erase tool on a cell. The erase tool should clear the
        // cell to transparent state (glyph=0, fg=white, bg=black).
        const cs3 = action.cell_size;
        await scrollToCell(page, action.x * cs3, action.y * cs3, cs3);
        const epx = Math.floor(action.x * cs3 + cs3 / 2);
        const epy = Math.floor(action.y * cs3 + cs3 / 2);
        await page.click(action.selector, { position: { x: epx, y: epy } });
        break;
      }

      case 'ws_erase_drag': {
        // Drag the erase tool from (x1, y1) to (x2, y2) in cell coordinates.
        // The erase tool must already be activated via ws_tool_activate.
        // Reuses dragOnCanvas — the erase tool's drag handler erases all cells
        // along the Bresenham line between successive mousemove events.
        await dragOnCanvas(
          page,
          action.selector,
          action.x1,
          action.y1,
          action.x2,
          action.y2,
          action.cell_size
        );
        break;
      }

      case 'ws_flood_fill': {
        // Tool must already be activated via ws_tool_activate.
        // Single click at (x, y) triggers the fill tool's flood fill.
        const csff = action.cell_size;
        await scrollToCell(page, action.x * csff, action.y * csff, csff);
        const pxff = Math.floor(action.x * csff + csff / 2);
        const pyff = Math.floor(action.y * csff + csff / 2);
        await page.click(action.selector, { position: { x: pxff, y: pyff } });
        break;
      }

      case 'ws_draw_rect': {
        // Tool must already be activated via ws_tool_activate.
        // Drags from (x, y) to (x + w - 1, y + h - 1) to draw a rectangle.
        const csdr = action.cell_size;
        await dragOnCanvas(
          page,
          action.selector,
          action.x,
          action.y,
          action.x + action.w - 1,
          action.y + action.h - 1,
          csdr
        );
        break;
      }

      case 'ws_draw_line': {
        // Tool must already be activated via ws_tool_activate.
        // Drags from (x1, y1) to (x2, y2) to draw a line.
        const csdl = action.cell_size;
        await dragOnCanvas(
          page,
          action.selector,
          action.x1,
          action.y1,
          action.x2,
          action.y2,
          csdl
        );
        break;
      }

      default:
        fail('unknown_action', `Unknown recipe action: ${action.action}`);
        return false;
    }
  }
  return true;
}

async function main() {
  const browser = await chromium.launch({ headless: !headed });
  const page = await browser.newPage({ acceptDownloads: true });

  try {
    await page.goto(url, { waitUntil: 'networkidle', timeout: 30000 });
    await page.waitForSelector('#xpImportFile', { state: 'attached', timeout: 10000 });
    await page.waitForSelector('#xpImportBtn', { state: 'visible', timeout: 10000 });

    await page.locator('#xpImportFile').setInputFiles(path.resolve(xpPath));
    await page.click('#xpImportBtn');
    await page.waitForFunction(() => {
      const sessionOut = document.getElementById('sessionOut');
      const metaOut = document.getElementById('metaOut');
      if (!sessionOut || !metaOut) return false;
      const sessionText = String(sessionOut.textContent || '').trim();
      const metaText = String(metaOut.textContent || '').trim();
      if (!sessionText || !metaText) return false;
      try {
        const session = JSON.parse(sessionText);
        const meta = JSON.parse(metaText);
        return !!session.session_id && typeof meta.frame_w_chars === 'number' && typeof meta.frame_h_chars === 'number';
      } catch (_err) {
        return false;
      }
    }, { timeout: 30000 });
    report.user_reachable_load_pass = true;
    report.setup = {
      via: 'user_ui_import',
      xp_path: path.resolve(xpPath),
      import_selector: '#xpImportBtn',
    };

    // Mode-specific element waits
    if (mode === 'acceptance') {
      // Wait for whole-sheet canvas to mount
      await page.waitForSelector('#wholeSheetCanvas', { state: 'attached', timeout: 15000 });
    } else {
      await page.waitForSelector('.frame-cell[data-row][data-col]', { state: 'attached', timeout: 10000 });
    }

    // Validate required selectors from the recipe
    for (const [name, selector] of Object.entries(recipe.required_selectors || {})) {
      const count = await page.locator(selector).count();
      if (count <= 0) {
        fail('ui_missing', `Missing selector ${name}: ${selector}`);
      }
    }

    const summary = await readSummary(page);
    report.live_session = summary.session;
    report.live_meta = summary.meta;
    const expected = recipe.geometry;
    const actual = summary.session || {};
    const actualMeta = summary.meta || {};

    if (!summary.session || !summary.meta) {
      throw new Error('session/meta summary missing');
    }

    // Geometry checks (mode-independent)
    if (actual.angles !== expected.angles) fail('geometry', `angles mismatch: expected ${expected.angles}, got ${actual.angles}`);
    if (JSON.stringify(actual.anims || []) !== JSON.stringify(expected.anims || [])) {
      fail('geometry', `anims mismatch: expected ${JSON.stringify(expected.anims)}, got ${JSON.stringify(actual.anims)}`);
    }
    if (actual.projs !== expected.projs) fail('geometry', `projs mismatch: expected ${expected.projs}, got ${actual.projs}`);
    if (actualMeta.frame_w_chars !== expected.frame_w) fail('geometry', `frame_w mismatch: expected ${expected.frame_w}, got ${actualMeta.frame_w_chars}`);
    if (actualMeta.frame_h_chars !== expected.frame_h) fail('geometry', `frame_h mismatch: expected ${expected.frame_h}, got ${actualMeta.frame_h_chars}`);

    report.geometry_pass = !failures.some((f) => f.class === 'geometry');

    // Frame layout is verified independently: check that the session exposes
    // the correct number of frame tiles matching the expected grid shape.
    const expectedFrameCount = expected.frame_rows * expected.frame_cols;
    if (mode === 'diagnostic') {
      const actualFrameCount = await page.locator('.frame-cell[data-row][data-col]').count();
      if (actualFrameCount !== expectedFrameCount) {
        fail('frame_layout', `Frame cell count mismatch: expected ${expectedFrameCount}, got ${actualFrameCount}`);
      }
    } else {
      // In acceptance mode, verify frame layout from session metadata rather
      // than inspecting DOM tiles (the whole-sheet editor does not use .frame-cell).
      const sessionFrameRows = actualMeta.frame_rows ?? actual.frame_rows ?? actual.angles ?? null;
      const sessionFrameCols = actualMeta.frame_cols ?? actual.frame_cols ?? null;
      if (sessionFrameRows !== null && sessionFrameCols !== null) {
        const sessionFrameCount = sessionFrameRows * sessionFrameCols;
        if (sessionFrameCount !== expectedFrameCount) {
          fail('frame_layout', `Session frame count mismatch: expected ${expectedFrameCount}, got ${sessionFrameCount}`);
        }
      } else {
        fail('frame_layout', 'Cannot verify frame layout: session metadata missing frame_rows/frame_cols');
      }
    }
    report.frame_layout_pass = !failures.some((f) => f.class === 'frame_layout');

    // Preliminary layer count check (quick fail before recipe execution)
    const expectedLayerCount = truthTable.layer_count;
    if (summary.session?.layer_count !== undefined && summary.session.layer_count !== expectedLayerCount) {
      fail('layers', `Layer count mismatch: expected ${expectedLayerCount}, got ${summary.session.layer_count}`);
    }
    // NOTE: all_layers_pass is set later from per-layer export comparison,
    // not from this count check alone. The count check is a preliminary gate.

    // Execute recipe if geometry passed
    if (report.geometry_pass) {
      report.execute_pass = await executeRecipe(page);
    }

    // Export and compare
    await page.click('#btnExport');
    await page.waitForFunction(() => {
      const exportOut = document.getElementById('exportOut');
      const text = String(exportOut?.textContent || '').trim();
      if (!text) return false;
      try {
        const parsed = JSON.parse(text);
        return !!parsed.xp_path || !!parsed.stage;
      } catch (_err) {
        return false;
      }
    }, { timeout: 20000 });
    const exportText = await page.locator('#exportOut').textContent();
    const exportJson = exportText ? parseJsonText(exportText, 'exportOut') : null;
    report.export = exportJson;
    if (!exportJson?.xp_path) {
      fail('export', 'Export did not return xp_path');
    } else {
      const exportedTruthPath = path.join(outDir, 'exported-truth-table.json');
      const exportedTruth = runTruthTable(exportJson.xp_path, exportedTruthPath);
      const comparison = compareTruth(truthTable, exportedTruth);
      report.export_compare = {
        ok: comparison.ok,
        mismatch_count: comparison.mismatches.length,
        mismatches: comparison.mismatches.slice(0, 20),
        layer_mismatch_counts: comparison.layerMismatchCounts,
      };

      if (!comparison.ok) {
        fail('export_compare', `Exported XP mismatched source XP (${comparison.mismatches.length} mismatches)`);
      } else {
        report.export_pass = true;
      }

      // all_layers_pass: every layer must have zero mismatches in the export
      // comparison. This verifies per-layer content preservation, not just
      // that the layer count is correct.
      const lmc = comparison.layerMismatchCounts;
      const preservedLayers = recipe.preserved_only_layers || [];
      const preservedOk = preservedLayers.every((idx) => (lmc[idx] || 0) === 0);
      const layerCountOk = !failures.some((f) => f.class === 'layers');
      const allLayersExist = (truthTable.layers || []).every(
        (_, i) => lmc[i] !== undefined
      );
      report.all_layers_pass = layerCountOk && preservedOk && allLayersExist;
      if (!report.all_layers_pass) {
        const badLayers = Object.entries(lmc)
          .filter(([, count]) => count > 0)
          .map(([idx, count]) => `L${idx}:${count}`)
          .join(', ');
        if (badLayers) {
          fail('layer_fidelity', `Per-layer content mismatches: ${badLayers}`);
        }
      }

      // cell_fidelity_pass: L2 (editable layer) must have zero mismatches
      const editableLayer = recipe.editable_layer ?? 2;
      report.cell_fidelity_pass = (lmc[editableLayer] || 0) === 0;
      if (!report.cell_fidelity_pass) {
        fail('cell_fidelity', `Editable layer ${editableLayer} has ${lmc[editableLayer]} cell mismatches`);
      }

      try {
        const dockPlan = resolveSkinDockPlan(xpPath, exportJson.xp_path);
        if (!fs.existsSync(dockPlan.baseXp)) {
          throw new Error(`Skin Dock base XP missing for ${dockPlan.sourceFamily}: ${dockPlan.baseXp}`);
        }
        report.skin_dock_plan = dockPlan;
        const dock = runSkinDockWatchdog(dockPlan);
        const dockResult = dock.parsed || {};
        const classificationPlayable =
          dockResult.classification === 'playable' ||
          dockResult.runValidity?.gateB?.checks?.classification_playable === true;
        report.skin_dock = {
          result_path: dock.resultPath,
          error: dockResult.error ?? null,
          classification: dockResult.classification ?? null,
          runValidity: dockResult.runValidity ?? null,
          final: dockResult.final ?? null,
        };
        report.skin_dock_pass =
          dockResult.runValidity?.status === 'valid' &&
          dockResult.runValidity?.passed === true &&
          dockResult.error == null &&
          classificationPlayable;
        if (!report.skin_dock_pass) {
          fail(
            'skin_dock',
            `Skin Dock failed: status=${dockResult.runValidity?.status || 'missing'} passed=${dockResult.runValidity?.passed === true} classification=${dockResult.classification || 'missing'} classification_playable=${dockResult.runValidity?.gateB?.checks?.classification_playable === true} error=${dockResult.error || 'null'}`
          );
        }
      } catch (dockErr) {
        report.skin_dock_pass = false;
        fail('skin_dock', dockErr instanceof Error ? dockErr.message : String(dockErr));
      }
    }

  } catch (err) {
    fail('fatal', err instanceof Error ? err.message : String(err));
  } finally {
    // overall_pass is the conjunction of ALL required contract gates.
    // It may only be true when every individual gate is true.
    // failures.length === 0 is necessary but not sufficient — a gate that
    // was never evaluated (still false) also blocks overall_pass.
    report.overall_pass =
      report.user_reachable_load_pass &&
      report.geometry_pass &&
      report.frame_layout_pass &&
      report.all_layers_pass &&
      report.execute_pass &&
      report.cell_fidelity_pass &&
      report.export_pass &&
      report.skin_dock_pass;
    const resultPath = path.join(outDir, 'result.json');
    fs.writeFileSync(resultPath, JSON.stringify(report, null, 2));
    console.error(`\n[${mode.toUpperCase()}] Result: ${report.overall_pass ? 'PASS' : 'FAIL'} (${failures.length} failures)`);
    console.error(`Report: ${resultPath}`);
    await browser.close();
  }
  process.exit(report.overall_pass ? 0 : 1);
}

main();
