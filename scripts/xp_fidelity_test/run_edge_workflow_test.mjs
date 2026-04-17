/**
 * CLASSIFICATION: mixed — UI-driven actions with debug API state observation
 * ACTION PATH:    Tab switching via DOM click, partial_bundle_gating via button clicks,
 *                 generated SAR seed recipes via DOM interactions
 * OBSERVATION:    Core state capture via __wb_debug.getState() + __wb_debug._state()
 *                 (for actionStates). Tab-switch readiness via _state().activeActionKey.
 * ELIGIBLE FOR:   M1 historical evidence (closed under then-accepted model).
 *                 NOT pure UI-driven acceptance going forward.
 * CAVEAT:         Actions are UI-driven but readiness waits and state assertions rely
 *                 on diagnostic debug API. This is the M1 edge-workflow pattern.
 */
import { chromium } from 'playwright';
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
const recipeFilter = getArg('--recipe');
const seedArg = getArg('--seed');
const genCountArg = parseInt(getArg('--gen-count', '3'), 10);
const genLengthArg = parseInt(getArg('--gen-length', '6'), 10);

if (!outDir) {
  console.error('Missing --out-dir');
  process.exit(1);
}

if (!headed) {
  console.error('[REFUSE] run_edge_workflow_test.mjs must be run headed. Re-run with --headed.');
  process.exit(1);
}

// ---------------------------------------------------------------------------
// A. State snapshot
// ---------------------------------------------------------------------------

async function captureState(page, label) {
  return page.evaluate((lbl) => {
    const q = (id) => document.getElementById(id);
    const text = (id) => String(q(id)?.textContent || '').trim();
    const btnState = (id) => {
      const el = q(id);
      if (!el) return { exists: false, disabled: true, text: '' };
      return { exists: true, disabled: !!el.disabled, text: String(el.textContent || '').trim() };
    };

    // Curated state via getState() — includes P1 fields (bundleId, activeActionKey,
    // templateSetKey, gridCols, gridRows, activeLayer, visibleLayers, layerCount,
    // sessionDirty) as of commit f246828. Primary source per state-capture contract.
    const geo = (window.__wb_debug && typeof window.__wb_debug.getState === 'function')
      ? window.__wb_debug.getState() : null;

    // Raw state via _state() — still needed for actionStates (not yet curated)
    const raw = (window.__wb_debug && typeof window.__wb_debug._state === 'function')
      ? window.__wb_debug._state() : null;

    return {
      label: lbl,
      timestamp: Date.now(),
      templateSetKey: geo?.templateSetKey ?? null,
      bundleId: geo?.bundleId ?? null,
      activeActionKey: geo?.activeActionKey ?? null,
      sessionId: geo?.sessionId ?? null,
      actionStates: raw?.actionStates ? Object.fromEntries(
        Object.entries(raw.actionStates).map(([k, v]) => [k, {
          status: v?.status ?? null,
          sessionId: v?.sessionId ?? null,
        }])
      ) : null,
      bundleStatus: text('bundleStatus'),
      wbStatus: text('wbStatus'),
      webbuildState: text('webbuildState'),
      wholeSheetMounted: !!q('wholeSheetCanvas'),
      historyDepth: geo?.historyDepth ?? 0,
      futureDepth: geo?.futureDepth ?? 0,
      activeLayer: geo?.activeLayer ?? 0,
      sessionDirty: geo?.sessionDirty ?? false,
      geometry: {
        gridCols: geo?.gridCols ?? null,
        gridRows: geo?.gridRows ?? null,
        frameWChars: geo?.frameWChars ?? null,
        frameHChars: geo?.frameHChars ?? null,
        angles: geo?.angles ?? null,
        anims: geo?.anims ?? null,
        projs: geo?.projs ?? null,
      },
      buttons: {
        save: btnState('btnSave'),
        exportXp: btnState('btnExport'),
        newXp: btnState('btnNewXp'),
        testThisSkin: btnState('webbuildQuickTestBtn'),
      },
    };
  }, label);
}

// ---------------------------------------------------------------------------
// B. Action DSL
// ---------------------------------------------------------------------------

const ACTIONS = {
  async apply_template(page, params) {
    await page.selectOption('#templateSelect', params.template || 'player_native_full');
    await page.click('#templateApplyBtn');
    await page.waitForFunction(() => {
      const bs = String(document.getElementById('bundleStatus')?.textContent || '');
      return /Bundle: \d+\/\d+/i.test(bs);
    }, null, { timeout: 60000 });
    await page.waitForTimeout(1000);
  },

  async switch_action_tab(page, params) {
    const ACTION_LABELS = { idle: /Idle \/ Walk/i, attack: /^Attack/i, death: /^Death/i };
    const label = ACTION_LABELS[params.action];
    if (!label) throw new Error(`Unknown action: ${params.action}`);
    // Allow any pending auto-advance (600ms setTimeout in saveCurrentActionProgress)
    // to settle before clicking the target tab.
    await page.waitForTimeout(800);
    const tab = page.locator('#bundleActionTabs button').filter({ hasText: label });
    await tab.first().click();
    // Wait for activeActionKey to match the requested action (confirms tab switch took).
    await page.waitForFunction((expected) => {
      const s = window.__wb_debug && typeof window.__wb_debug._state === 'function'
        ? window.__wb_debug._state() : null;
      return s && s.activeActionKey === expected;
    }, params.action, { timeout: 10000 });
    // Wait for session + meta to be fully hydrated with expected geometry.
    const g = EXPECTED_GEOMETRY[params.action];
    if (g) {
      await page.waitForFunction(({ expW, expH }) => {
        const sessionText = String(document.getElementById('sessionOut')?.textContent || '').trim();
        const metaText = String(document.getElementById('metaOut')?.textContent || '').trim();
        if (!sessionText || !metaText) return false;
        try {
          const s = JSON.parse(sessionText);
          const m = JSON.parse(metaText);
          return s.grid_cols === expW && s.grid_rows === expH && m.angles !== undefined;
        } catch (_e) { return false; }
      }, { expW: g.gridCols, expH: g.gridRows }, { timeout: 30000 });
    } else {
      await page.waitForFunction(() => {
        const t = String(document.getElementById('sessionOut')?.textContent || '').trim();
        if (!t) return false;
        try { JSON.parse(t); return true; } catch (_e) { return false; }
      }, null, { timeout: 15000 });
    }
    // Wait for whole-sheet canvas and editor controls
    await page.waitForSelector('#wholeSheetCanvas', { state: 'attached', timeout: 15000 });
    await page.waitForSelector('#wsGlyphCode', { state: 'visible', timeout: 10000 }).catch(() => {});
    await page.waitForTimeout(1000);
  },

  async save_action(page, _params) {
    const btn = page.locator('#btnSave');
    if (await btn.isDisabled()) throw new Error('Save button is disabled');
    await btn.click();
    await page.waitForTimeout(2000);
  },

  async export_action(page, _params) {
    await page.evaluate(() => {
      const el = document.getElementById('exportOut');
      if (el) el.textContent = '';
    });
    const btn = page.locator('#btnExport');
    if (await btn.isDisabled()) throw new Error('Export button is disabled');
    await btn.click();
    await page.waitForFunction(() => {
      const t = String(document.getElementById('exportOut')?.textContent || '').trim();
      if (!t) return false;
      try { return !!JSON.parse(t).xp_path; } catch (_e) { return false; }
    }, null, { timeout: 20000 });
  },

  async new_xp(page, _params) {
    const btn = page.locator('#btnNewXp');
    if (await btn.isDisabled()) throw new Error('New XP button is disabled');
    await btn.click();
    await page.waitForTimeout(2000);
  },

  async test_this_skin(page, _params) {
    const btn = page.locator('#webbuildQuickTestBtn');
    const isDisabled = await btn.isDisabled();
    if (isDisabled) {
      await btn.click({ force: true });
    } else {
      await btn.click();
    }
    await page.waitForTimeout(3000);
  },

  async capture_state(page, _params) {
    // No-op — state is always captured after every action
  },

  async refresh_page(page, _params) {
    await page.reload({ waitUntil: 'domcontentloaded', timeout: 30000 });
    await page.waitForTimeout(3000);
    await page.waitForFunction(() => {
      const s = window.__wb_debug && typeof window.__wb_debug.getWebbuildDebugState === 'function'
        ? window.__wb_debug.getWebbuildDebugState() : null;
      return !!(s && s.runtimePreflight && s.runtimePreflight.checked === true);
    }, null, { timeout: 30000 });
  },

  async undo(page, _params) {
    const btn = page.locator('#undoBtn');
    if (await btn.isDisabled()) throw new Error('Undo button is disabled');
    await btn.click();
    await page.waitForTimeout(500);
  },

  async redo(page, _params) {
    const btn = page.locator('#redoBtn');
    if (await btn.isDisabled()) throw new Error('Redo button is disabled');
    await btn.click();
    await page.waitForTimeout(500);
  },

  async switch_active_layer(page, params) {
    const layerIndex = params.layer ?? 0;
    await page.selectOption('#layerSelect', String(layerIndex));
    await page.waitForTimeout(300);
  },
};

// ---------------------------------------------------------------------------
// C. Invariant checker
// ---------------------------------------------------------------------------

function getNestedValue(obj, dotpath) {
  return dotpath.split('.').reduce((o, k) => (o && typeof o === 'object' ? o[k] : undefined), obj);
}

function checkAssertion(state, assertion) {
  const val = getNestedValue(state, assertion.field);
  let pass = false;

  switch (assertion.op) {
    case 'eq': pass = JSON.stringify(val) === JSON.stringify(assertion.value); break;
    case 'neq': pass = JSON.stringify(val) !== JSON.stringify(assertion.value); break;
    case 'match': pass = new RegExp(assertion.value).test(String(val)); break;
    case 'truthy': pass = !!val; break;
    case 'falsy': pass = !val; break;
    case 'contains': pass = String(val).includes(assertion.value); break;
    case 'disabled': pass = val?.disabled === true; break;
    case 'enabled': pass = val?.disabled === false && val?.exists === true; break;
    default: pass = false;
  }

  return {
    pass,
    field: assertion.field,
    op: assertion.op,
    expected: assertion.value,
    actual: val,
    message: assertion.message || `${assertion.field} ${assertion.op} ${JSON.stringify(assertion.value)}`,
  };
}

// ---------------------------------------------------------------------------
// D. Recipe executor
// ---------------------------------------------------------------------------

async function runRecipe(page, recipe, recipeOutDir) {
  const results = { recipe: recipe.name, steps: [], pass: true };

  for (let i = 0; i < recipe.steps.length; i++) {
    const step = recipe.steps[i];
    const preState = await captureState(page, `step_${i}_pre`);

    let actionError = null;
    try {
      const actionFn = ACTIONS[step.action];
      if (!actionFn) throw new Error(`Unknown action: ${step.action}`);
      await actionFn(page, step.params || {});
    } catch (err) {
      actionError = String(err.message || err);
    }

    const postState = await captureState(page, `step_${i}_post`);

    const assertionResults = [];
    for (const assertion of (step.assertions || [])) {
      const result = checkAssertion(postState, assertion);
      assertionResults.push(result);
      if (!result.pass) results.pass = false;
    }

    if (actionError && !step.expect_error) {
      results.pass = false;
    }

    results.steps.push({
      index: i,
      action: step.action,
      params: step.params || {},
      expect_error: !!step.expect_error,
      actionError,
      preState,
      postState,
      assertions: assertionResults,
    });

    if ((actionError && !step.expect_error) || assertionResults.some(a => !a.pass)) {
      await page.screenshot({
        path: path.join(recipeOutDir, `edge-${recipe.name}-step${i}-FAIL.png`),
        fullPage: true,
      });
    }
  }

  if (recipe.postChecks && typeof recipe.postChecks === 'function') {
    recipe.postChecks(results);
  }

  return results;
}

// ---------------------------------------------------------------------------
// E. Report output
// ---------------------------------------------------------------------------

function writeReport(reportOutDir, allResults) {
  const overall = allResults.every(r => r.pass);
  const report = {
    workflow_type: 'edge_workflow',
    timestamp: new Date().toISOString(),
    overall_pass: overall,
    recipes: allResults,
  };
  fs.writeFileSync(path.join(reportOutDir, 'edge-workflow-result.json'), JSON.stringify(report, null, 2));

  for (const r of allResults) {
    const icon = r.pass ? 'PASS' : 'FAIL';
    console.error(`[${icon}] ${r.recipe}`);
    for (const step of r.steps) {
      const failedAssertions = step.assertions.filter(a => !a.pass);
      if (step.actionError && !step.expect_error) {
        console.error(`  step ${step.index} (${step.action}): ACTION ERROR: ${step.actionError}`);
      }
      for (const fa of failedAssertions) {
        console.error(`  step ${step.index} (${step.action}): ASSERT FAIL: ${fa.message}`);
        console.error(`    expected: ${JSON.stringify(fa.expected)}, actual: ${JSON.stringify(fa.actual)}`);
      }
    }
  }

  return overall;
}

// ---------------------------------------------------------------------------
// F. Recipes
// ---------------------------------------------------------------------------

const RECIPE_PARTIAL_BUNDLE_GATING = {
  name: 'partial_bundle_gating',
  description: 'Verify bundle readiness gating and Test This Skin honesty at partial states (0/3, after 1 save)',
  steps: [
    // Step 0: Apply template — expect 0/3, all controls in initial gated state
    {
      action: 'apply_template',
      params: { template: 'player_native_full' },
      assertions: [
        { field: 'bundleStatus', op: 'contains', value: '0/3', message: 'Bundle must show 0/3 after template apply' },
        { field: 'buttons.testThisSkin', op: 'disabled', message: 'Test This Skin must be disabled at 0/3' },
        { field: 'wholeSheetMounted', op: 'truthy', message: 'Whole-sheet editor must be mounted' },
        { field: 'activeActionKey', op: 'eq', value: 'idle', message: 'First action should be idle' },
      ],
    },
    // Step 1: Verify initial action states are all blank
    {
      action: 'capture_state',
      params: {},
      assertions: [
        { field: 'actionStates.idle.status', op: 'eq', value: 'blank', message: 'idle must start as blank' },
        { field: 'actionStates.attack.status', op: 'eq', value: 'blank', message: 'attack must start as blank' },
        { field: 'actionStates.death.status', op: 'eq', value: 'blank', message: 'death must start as blank' },
        { field: 'sessionId', op: 'truthy', message: 'Session ID must exist' },
        { field: 'bundleId', op: 'truthy', message: 'Bundle ID must exist' },
      ],
    },
    // Step 2: Verify honest blocking — button IS disabled, that's the expected honest state.
    // Then: diagnostic force-click to confirm no silent corruption if the disabled
    // guard is somehow bypassed.
    {
      action: 'test_this_skin',
      params: {},
      expect_error: false,
      assertions: [
        { field: 'bundleStatus', op: 'contains', value: '0/3', message: 'Bundle must still show 0/3 (no false readiness)' },
        { field: 'wholeSheetMounted', op: 'truthy', message: 'Whole-sheet must still be mounted (no silent corruption)' },
        { field: 'activeActionKey', op: 'eq', value: 'idle', message: 'Active action must still be idle (no state corruption)' },
        { field: 'buttons.save', op: 'enabled', message: 'Save must still be enabled (workbench responsive)' },
      ],
    },
    // Step 3: Save idle action — blank content stays blank (visual layer gate)
    // Note: saveCurrentActionProgress() correctly refuses to mark a blank action
    // as "saved" when visualLayerHasMeaningfulContent() returns false.
    {
      action: 'save_action',
      params: {},
      assertions: [
        { field: 'actionStates.idle.status', op: 'eq', value: 'blank', message: 'idle stays blank when visual layer has no content' },
        { field: 'bundleStatus', op: 'contains', value: '0/3', message: 'Bundle status must still show 0/3 (blank save does not advance readiness)' },
        { field: 'buttons.testThisSkin', op: 'disabled', message: 'Test This Skin must still be disabled after blank save' },
      ],
    },
    // Step 4: Verify gating honesty after partial save — attack and death still blank
    {
      action: 'capture_state',
      params: {},
      assertions: [
        { field: 'actionStates.attack.status', op: 'eq', value: 'blank', message: 'attack must still be blank' },
        { field: 'actionStates.death.status', op: 'eq', value: 'blank', message: 'death must still be blank' },
        { field: 'buttons.testThisSkin', op: 'disabled', message: 'Test This Skin must be disabled with blank actions remaining' },
      ],
    },
    // Step 5: Verify gating still honest at partial state — button still disabled.
    // Diagnostic force-click to confirm no corruption at the partially-ready state.
    {
      action: 'test_this_skin',
      params: {},
      expect_error: false,
      assertions: [
        { field: 'wholeSheetMounted', op: 'truthy', message: 'Whole-sheet must still be mounted (no silent corruption)' },
        { field: 'activeActionKey', op: 'truthy', message: 'Active action must still be set (no state corruption)' },
        { field: 'buttons.save', op: 'enabled', message: 'Save must still be enabled (workbench responsive)' },
        { field: 'buttons.testThisSkin', op: 'disabled', message: 'Test This Skin must still be disabled at partial state' },
      ],
    },
  ],
};

// Geometry oracle from config/template_registry.json — player_native_full template set.
// This is the Milestone 1 bundle-native oracle only.  Milestone 2 / existing-XP workflows
// will need their own oracle derivation.
const EXPECTED_GEOMETRY = {
  idle:   { gridCols: 126, gridRows: 80, angles: 8, anims: [1, 8], projs: 2, frameWChars: 7,  frameHChars: 10 },
  attack: { gridCols: 144, gridRows: 80, angles: 8, anims: [8],    projs: 2, frameWChars: 9,  frameHChars: 10 },
  death:  { gridCols: 110, gridRows: 88, angles: 8, anims: [5],    projs: 2, frameWChars: 11, frameHChars: 11 },
};

function geometryAssertions(action) {
  const g = EXPECTED_GEOMETRY[action];
  return [
    { field: 'activeActionKey', op: 'eq', value: action, message: `Active action must be ${action}` },
    { field: 'geometry.gridCols', op: 'eq', value: g.gridCols, message: `${action} gridCols must be ${g.gridCols}` },
    { field: 'geometry.gridRows', op: 'eq', value: g.gridRows, message: `${action} gridRows must be ${g.gridRows}` },
    { field: 'geometry.angles', op: 'eq', value: g.angles, message: `${action} angles must be ${g.angles}` },
    { field: 'geometry.anims', op: 'eq', value: g.anims, message: `${action} anims must be ${JSON.stringify(g.anims)}` },
    { field: 'geometry.projs', op: 'eq', value: g.projs, message: `${action} projs must be ${g.projs}` },
    { field: 'geometry.frameWChars', op: 'eq', value: g.frameWChars, message: `${action} frameWChars must be ${g.frameWChars}` },
    { field: 'geometry.frameHChars', op: 'eq', value: g.frameHChars, message: `${action} frameHChars must be ${g.frameHChars}` },
    { field: 'wholeSheetMounted', op: 'truthy', message: 'Whole-sheet must be mounted' },
    { field: 'sessionId', op: 'truthy', message: `Session ID must exist for ${action}` },
  ];
}

const RECIPE_ACTION_TAB_HYDRATION = {
  name: 'action_tab_hydration',
  description: 'Verify session/geometry correctness after action-tab switches — catches wrong-session bugs',
  steps: [
    // Step 0: Apply template
    {
      action: 'apply_template',
      params: { template: 'player_native_full' },
      assertions: [
        { field: 'bundleStatus', op: 'contains', value: '0/3', message: 'Bundle should be 0/3' },
      ],
    },
    // Step 1: Verify idle geometry (exact values)
    {
      action: 'capture_state',
      params: {},
      assertions: geometryAssertions('idle'),
    },
    // Step 2: idle -> attack (exact geometry check)
    {
      action: 'switch_action_tab',
      params: { action: 'attack' },
      assertions: geometryAssertions('attack'),
    },
    // Step 3: attack -> death (exact geometry check — the critical bug case)
    {
      action: 'switch_action_tab',
      params: { action: 'death' },
      assertions: geometryAssertions('death'),
    },
    // Step 4: death -> idle (return trip — verify geometry restores)
    {
      action: 'switch_action_tab',
      params: { action: 'idle' },
      assertions: geometryAssertions('idle'),
    },
    // Step 5: idle -> death (skip attack — non-sequential jump)
    {
      action: 'switch_action_tab',
      params: { action: 'death' },
      assertions: geometryAssertions('death'),
    },
  ],
  // Post-recipe checks: session ID stability and uniqueness
  postChecks: (results) => {
    const sessionIds = {};
    for (const step of results.steps) {
      const actionKey = step.postState?.activeActionKey;
      const sid = step.postState?.sessionId;
      if (actionKey && sid) {
        if (!sessionIds[actionKey]) sessionIds[actionKey] = [];
        sessionIds[actionKey].push(sid);
      }
    }
    // All visits to same action should get same session ID
    for (const [action, sids] of Object.entries(sessionIds)) {
      const unique = [...new Set(sids)];
      if (unique.length !== 1) {
        results.pass = false;
        results.steps.push({
          index: results.steps.length,
          action: 'post_recipe_check',
          params: { check: 'session_id_stability' },
          expect_error: false,
          actionError: null,
          preState: null,
          postState: null,
          assertions: [{
            pass: false,
            field: `sessionIds.${action}`,
            op: 'eq',
            expected: 'single unique ID',
            actual: unique,
            message: `${action} had inconsistent session IDs across visits: ${unique.join(', ')}`,
          }],
        });
      }
    }
    // Different actions should have different session IDs
    const allUnique = [...new Set(Object.values(sessionIds).map(s => s[0]))];
    if (allUnique.length < Object.keys(sessionIds).length) {
      results.pass = false;
      results.steps.push({
        index: results.steps.length,
        action: 'post_recipe_check',
        params: { check: 'session_id_uniqueness' },
        expect_error: false,
        actionError: null,
        preState: null,
        postState: null,
        assertions: [{
          pass: false,
          field: 'sessionIds',
          op: 'all_unique',
          expected: 'all different',
          actual: sessionIds,
          message: 'Different actions should have different session IDs',
        }],
      });
    }
  },
};

const RECIPES = {
  partial_bundle_gating: RECIPE_PARTIAL_BUNDLE_GATING,
  action_tab_hydration: RECIPE_ACTION_TAB_HYDRATION,
};

// ---------------------------------------------------------------------------
// G. Seedable PRNG (mulberry32)
// ---------------------------------------------------------------------------

function mulberry32(seed) {
  return function() {
    seed |= 0; seed = seed + 0x6D2B79F5 | 0;
    let t = Math.imul(seed ^ seed >>> 15, 1 | seed);
    t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  };
}

function rngChoice(rng, arr) {
  return arr[Math.floor(rng() * arr.length)];
}

// ---------------------------------------------------------------------------
// H. SAR State Model + Vocabulary
// ---------------------------------------------------------------------------

function initialSimState() {
  return {
    templateApplied: false,
    bundleId: null,
    activeActionKey: null,
    actionStatuses: {},
    historyDepth: 0,
    futureDepth: 0,
    sessionDirty: false,
    wholeSheetMounted: false,
    activeLayer: 0,
    sessionId: null,
  };
}

const SAR_VOCABULARY = [
  {
    name: 'apply_template',
    weight: 1,
    precondition: (sim) => !sim.templateApplied,
    params: (_sim, _rng) => ({ template: 'player_native_full' }),
    transition: (sim) => {
      sim.templateApplied = true;
      sim.bundleId = 'truthy';
      sim.activeActionKey = 'idle';
      sim.actionStatuses = { idle: 'blank', attack: 'blank', death: 'blank' };
      sim.wholeSheetMounted = true;
      sim.sessionId = 'truthy';
      sim.historyDepth = 0;
      sim.futureDepth = 0;
      sim.activeLayer = 2;
    },
    assertions: () => [
      { field: 'bundleId', op: 'truthy', message: 'Bundle must exist after template apply' },
      { field: 'activeActionKey', op: 'eq', value: 'idle', message: 'First action must be idle' },
      { field: 'wholeSheetMounted', op: 'truthy', message: 'WS editor must be mounted' },
      { field: 'bundleStatus', op: 'contains', value: '0/3', message: 'Bundle must show 0/3' },
    ],
  },
  {
    name: 'switch_action_tab',
    weight: 3,
    precondition: (sim) => !!sim.bundleId,
    params: (sim, rng) => {
      const others = ['idle', 'attack', 'death'].filter(a => a !== sim.activeActionKey);
      return { action: rngChoice(rng, others) };
    },
    transition: (sim, params) => {
      sim.activeActionKey = params.action;
      sim.wholeSheetMounted = true;
      sim.historyDepth = 0;
      sim.futureDepth = 0;
      sim.activeLayer = 2;
    },
    assertions: (_sim, params) => {
      const g = EXPECTED_GEOMETRY[params.action];
      const result = [
        { field: 'activeActionKey', op: 'eq', value: params.action, message: `Active action must be ${params.action}` },
        { field: 'wholeSheetMounted', op: 'truthy', message: 'WS editor must be mounted' },
        { field: 'sessionId', op: 'truthy', message: 'Session must exist' },
      ];
      if (g) {
        result.push(
          { field: 'geometry.gridCols', op: 'eq', value: g.gridCols, message: `${params.action} gridCols` },
          { field: 'geometry.gridRows', op: 'eq', value: g.gridRows, message: `${params.action} gridRows` },
          { field: 'geometry.angles', op: 'eq', value: g.angles, message: `${params.action} angles` },
        );
      }
      return result;
    },
  },
  {
    name: 'save_action',
    weight: 2,
    precondition: (sim) => !!sim.sessionId,
    params: () => ({}),
    transition: (sim) => { sim.sessionDirty = false; },
    assertions: (sim) => {
      const result = [
        { field: 'wholeSheetMounted', op: 'truthy', message: 'WS must remain mounted after save' },
        { field: 'sessionId', op: 'truthy', message: 'Session must still exist after save' },
      ];
      // Save on blank content must NOT advance action status
      if (sim.activeActionKey && sim.actionStatuses[sim.activeActionKey] === 'blank') {
        result.push({
          field: `actionStates.${sim.activeActionKey}.status`,
          op: 'eq',
          value: 'blank',
          message: `${sim.activeActionKey} must stay blank after save on blank content`,
        });
      }
      return result;
    },
  },
  {
    name: 'export_action',
    weight: 1,
    precondition: (sim) => !!sim.sessionId,
    params: () => ({}),
    transition: (sim) => { sim.sessionDirty = false; },
    assertions: () => [
      { field: 'wholeSheetMounted', op: 'truthy', message: 'WS must remain mounted after export' },
      { field: 'sessionId', op: 'truthy', message: 'Session must still exist after export' },
    ],
  },
  {
    name: 'new_xp',
    weight: 2,
    precondition: (sim) => sim.templateApplied,
    params: () => ({}),
    transition: (sim) => {
      sim.historyDepth = 0;
      sim.futureDepth = 0;
      sim.sessionDirty = false;
      sim.wholeSheetMounted = true;
      sim.activeLayer = 2;
      if (sim.activeActionKey && sim.actionStatuses[sim.activeActionKey]) {
        sim.actionStatuses[sim.activeActionKey] = 'blank';
      }
    },
    assertions: () => [
      { field: 'wholeSheetMounted', op: 'truthy', message: 'WS must be mounted after New XP' },
      { field: 'sessionId', op: 'truthy', message: 'New session must exist' },
      { field: 'historyDepth', op: 'eq', value: 0, message: 'History must be cleared after New XP' },
      { field: 'futureDepth', op: 'eq', value: 0, message: 'Future must be cleared after New XP' },
    ],
  },
  {
    name: 'refresh_page',
    weight: 1,
    precondition: (sim) => sim.templateApplied,
    params: () => ({}),
    transition: (sim) => {
      // Full page reload — bundle/session context not preserved in URL.
      // Conservative: reset sim to initial state.
      sim.templateApplied = false;
      sim.bundleId = null;
      sim.activeActionKey = null;
      sim.actionStatuses = {};
      sim.wholeSheetMounted = false;
      sim.sessionId = null;
      sim.historyDepth = 0;
      sim.futureDepth = 0;
      sim.activeLayer = 0;
    },
    assertions: () => [
      // After refresh, page must be functional but bundle context is lost.
      // Only assert the page loaded successfully (preflight wait already confirms this).
      { field: 'buttons.save.exists', op: 'truthy', message: 'Save button must exist after refresh' },
    ],
  },
  {
    name: 'test_this_skin',
    weight: 1,
    precondition: (sim) => sim.templateApplied,
    params: () => ({}),
    transition: () => { /* no state change — button may be disabled */ },
    assertions: (sim) => {
      const allReady = sim.actionStatuses &&
        Object.values(sim.actionStatuses).every(s => s === 'saved' || s === 'converted');
      if (!allReady) {
        return [
          { field: 'buttons.testThisSkin', op: 'disabled', message: 'Test This Skin must be disabled when bundle incomplete' },
          { field: 'wholeSheetMounted', op: 'truthy', message: 'WS must remain mounted (no corruption)' },
        ];
      }
      return [{ field: 'wholeSheetMounted', op: 'truthy', message: 'WS must remain mounted' }];
    },
  },
  {
    name: 'undo',
    weight: 2,
    precondition: (sim) => sim.historyDepth > 0,
    params: () => ({}),
    transition: (sim) => {
      sim.historyDepth = Math.max(0, sim.historyDepth - 1);
      sim.futureDepth += 1;
    },
    assertions: () => [
      { field: 'wholeSheetMounted', op: 'truthy', message: 'WS must be mounted after undo' },
    ],
  },
  {
    name: 'redo',
    weight: 2,
    precondition: (sim) => sim.futureDepth > 0,
    params: () => ({}),
    transition: (sim) => {
      sim.futureDepth = Math.max(0, sim.futureDepth - 1);
      sim.historyDepth += 1;
    },
    assertions: () => [
      { field: 'wholeSheetMounted', op: 'truthy', message: 'WS must be mounted after redo' },
    ],
  },
  {
    name: 'switch_active_layer',
    weight: 2,
    precondition: (sim) => sim.wholeSheetMounted,
    params: (sim, rng) => {
      const maxLayer = sim.activeActionKey === 'death' ? 2 : 3;
      let target;
      do {
        target = Math.floor(rng() * (maxLayer + 1));
      } while (target === sim.activeLayer && maxLayer > 0);
      return { layer: target };
    },
    transition: (sim, params) => { sim.activeLayer = params.layer; },
    assertions: (_sim, params) => [
      { field: 'activeLayer', op: 'eq', value: params.layer, message: `Active layer must be ${params.layer}` },
      { field: 'wholeSheetMounted', op: 'truthy', message: 'WS must be mounted' },
    ],
  },
];

// ---------------------------------------------------------------------------
// I. Sequence Generator
// ---------------------------------------------------------------------------

function generateSarSequence(seed, length) {
  const rng = mulberry32(seed);
  const sim = initialSimState();
  const steps = [];

  // Step 0: always apply template to bootstrap
  const templateEntry = SAR_VOCABULARY.find(a => a.name === 'apply_template');
  const tParams = templateEntry.params(sim, rng);
  const tAssertions = templateEntry.assertions(sim, tParams);
  templateEntry.transition(sim, tParams);
  steps.push({
    action: 'apply_template',
    params: tParams,
    preconditions_used: ['bootstrap'],
    expected_assertions: tAssertions,
  });

  // Steps 1..length: weighted choice from eligible vocabulary
  for (let i = 1; i <= length; i++) {
    const eligible = SAR_VOCABULARY.filter(a => a.precondition(sim));
    if (eligible.length === 0) break;

    const totalWeight = eligible.reduce((sum, a) => sum + (a.weight || 1), 0);
    let roll = rng() * totalWeight;
    let chosen = eligible[0];
    for (const a of eligible) {
      roll -= (a.weight || 1);
      if (roll <= 0) { chosen = a; break; }
    }

    const params = chosen.params(sim, rng);
    const assertions = chosen.assertions(sim, params);
    const preconditions_used = [];
    // Record which preconditions were checked
    if (chosen.name === 'switch_action_tab') preconditions_used.push('bundleId truthy');
    else if (chosen.name === 'undo') preconditions_used.push(`historyDepth=${sim.historyDepth}`);
    else if (chosen.name === 'redo') preconditions_used.push(`futureDepth=${sim.futureDepth}`);
    else if (chosen.name === 'switch_active_layer') preconditions_used.push('wholeSheetMounted');
    else preconditions_used.push(`${chosen.name} eligible`);

    chosen.transition(sim, params);
    steps.push({
      action: chosen.name,
      params,
      preconditions_used,
      expected_assertions: assertions,
    });
  }

  return { type: 'generated_sar_sequence', seed, length: steps.length, steps };
}

// ---------------------------------------------------------------------------
// J. Generated SAR Recipe Runner
// ---------------------------------------------------------------------------

async function runGeneratedSarRecipes(browser, workbenchUrl, reportOutDir, seeds, seqLength, holdPage) {
  const allResults = [];

  for (const seed of seeds) {
    const generated = generateSarSequence(seed, seqLength);

    // Save generated recipe artifact BEFORE execution
    const artifactPath = path.join(reportOutDir, `generated-sar-seed${seed}-recipe.json`);
    fs.writeFileSync(artifactPath, JSON.stringify(generated, null, 2));
    console.error(`\n=== Generated SAR: seed=${seed}, ${generated.steps.length} steps ===`);
    console.error(`  Recipe artifact: ${artifactPath}`);

    // Convert to runRecipe-compatible format
    const recipe = {
      name: `generated_sar_seed_${seed}`,
      description: `Generated SAR sequence (seed=${seed}, ${generated.steps.length} steps)`,
      steps: generated.steps.map(s => ({
        action: s.action,
        params: s.params,
        assertions: s.expected_assertions,
      })),
    };

    const page = await browser.newPage({ viewport: { width: 1500, height: 980 } });
    try {
      await page.goto(workbenchUrl, { waitUntil: 'domcontentloaded', timeout: 30000 });
      await page.waitForTimeout(2000);
      await page.waitForFunction(() => {
        const s = window.__wb_debug && typeof window.__wb_debug.getWebbuildDebugState === 'function'
          ? window.__wb_debug.getWebbuildDebugState() : null;
        return !!(s && s.runtimePreflight && s.runtimePreflight.checked === true);
      }, null, { timeout: 30000 });

      const result = await runRecipe(page, recipe, reportOutDir);
      allResults.push(result);

      // Save per-seed execution result
      const resultPath = path.join(reportOutDir, `generated-sar-seed${seed}-result.json`);
      fs.writeFileSync(resultPath, JSON.stringify(result, null, 2));
    } finally {
      if (!holdPage) await page.close();
    }
  }

  return allResults;
}

// ---------------------------------------------------------------------------
// K. main
// ---------------------------------------------------------------------------

async function main() {
  const isGenerated = recipeFilter === 'generated_sar_sequences';
  const availableRecipes = Object.keys(RECIPES).concat('generated_sar_sequences');

  if (recipeFilter && !RECIPES[recipeFilter] && !isGenerated) {
    console.error(`Unknown recipe: ${recipeFilter}`);
    console.error(`Available recipes: ${availableRecipes.join(', ')}`);
    process.exit(1);
  }

  fs.mkdirSync(outDir, { recursive: true });

  const browser = await chromium.launch({ headless: !headed });
  const allResults = [];

  try {
    // Run deterministic recipes (unless specifically requesting generated only)
    if (!isGenerated) {
      const recipesToRun = recipeFilter
        ? { [recipeFilter]: RECIPES[recipeFilter] }
        : RECIPES;

      for (const [name, recipe] of Object.entries(recipesToRun)) {
        console.error(`\n=== Recipe: ${name} ===`);
        const page = await browser.newPage({
          viewport: { width: 1500, height: 980 },
        });

        try {
          await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 });
          await page.waitForTimeout(2000);
          await page.waitForFunction(() => {
            const s = window.__wb_debug && typeof window.__wb_debug.getWebbuildDebugState === 'function'
              ? window.__wb_debug.getWebbuildDebugState() : null;
            return !!(s && s.runtimePreflight && s.runtimePreflight.checked === true);
          }, null, { timeout: 30000 });

          const result = await runRecipe(page, recipe, outDir);
          allResults.push(result);
        } finally {
          if (!holdOpen) await page.close();
        }
      }
    }

    // Run generated SAR sequences
    if (isGenerated || !recipeFilter) {
      const seeds = seedArg
        ? [parseInt(seedArg, 10)]
        : Array.from({ length: genCountArg }, (_, i) => i + 1);
      const genResults = await runGeneratedSarRecipes(
        browser, url, outDir, seeds, genLengthArg, holdOpen,
      );
      allResults.push(...genResults);
    }
  } finally {
    if (!holdOpen) await browser.close();
  }

  const overall = writeReport(outDir, allResults);
  console.error(`\n=== Overall: ${overall ? 'PASS' : 'FAIL'} ===`);
  process.exit(overall ? 0 : 1);
}

main().catch((err) => {
  console.error('Fatal error:', err);
  process.exit(2);
});
