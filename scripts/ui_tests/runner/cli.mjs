#!/usr/bin/env node
import path from 'node:path';
import { createRunDir, ensureDir, writeJson } from '../core/artifacts.mjs';
import { launchChromium } from '../core/playwright_loader.mjs';
import { ensureFlaskWorkbenchServer, stopServer } from '../core/server_control.mjs';
import { resolveRoute } from '../core/url_helpers.mjs';
import { NavigationAgent } from '../subagents/navigation_agent.mjs';
import {
  WorkbenchSmokeAgent,
  WorkbenchSkinDockE2EAgent,
  WorkbenchDockLoadWatchdogAgent,
  WorkbenchAnalyzeOverrideRecoveryAgent,
  WorkbenchSourceGridDragDropAgent,
  WorkbenchAnalyzeFailureRecoveryAgent,
  WorkbenchGridSelectionRequirementsAgent,
  WorkbenchLayoutLegacyAuditAgent,
  WorkbenchXpEditorSemanticAgent,
  WorkbenchSourceAddToRowSequenceAgent,
} from '../subagents/workbench_agents.mjs';
import { WorkbenchUICoverageAgent } from '../subagents/workbench_coverage_agent.mjs';

function defaultBaseUrl() {
  const raw = String(process.env.WORKBENCH_URL || 'http://127.0.0.1:5071/workbench');
  try {
    const u = new URL(raw);
    if (!u.pathname || u.pathname === '/') u.pathname = '/workbench';
    u.search = '';
    return u.toString();
  } catch {
    return 'http://127.0.0.1:5071/workbench';
  }
}

function parseArgs(argv) {
  const out = {
    command: argv[0] || 'test:smoke',
    baseUrl: defaultBaseUrl(),
    headed: false,
    timeoutSec: 240,
    feature: '',
    pngPath: '',
    moveSec: 4,
    noServerStart: false,
  };
  for (let i = 1; i < argv.length; i++) {
    const a = argv[i];
    if ((a === '--base-url' || a === '--url') && argv[i + 1]) out.baseUrl = argv[++i];
    else if (a === '--headed' || a === '--debug') out.headed = true;
    else if (a === '--timeout-sec' && argv[i + 1]) out.timeoutSec = Math.max(30, Number(argv[++i]) || 240);
    else if (a === '--feature' && argv[i + 1]) out.feature = argv[++i];
    else if ((a === '--png' || a === '--png-path') && argv[i + 1]) out.pngPath = argv[++i];
    else if (a === '--move-sec' && argv[i + 1]) out.moveSec = Math.max(1, Number(argv[++i]) || 4);
    else if (a === '--no-server-start') out.noServerStart = true;
  }
  return out;
}

function printSummary(summary) {
  console.log(JSON.stringify(summary, null, 2));
}

async function runAgentWithBrowser(agentFactory, { baseUrl, headed, runDir, subdir }) {
  if (!headed) {
    throw new Error('ui_tests runner refuses headless execution. Re-run with --headed.');
  }
  const browser = await launchChromium({ headless: !headed });
  const context = await browser.newContext({ viewport: { width: 1440, height: 980 } });
  const page = await context.newPage();
  const artifactDir = path.join(runDir, subdir);
  await ensureDir(artifactDir);
  const agent = agentFactory({ page, baseUrl, artifactDir });
  const result = await agent.execute();
  await writeJson(path.join(artifactDir, 'subagent-result.json'), result);
  await context.close();
  await browser.close();
  return result;
}

async function cmdSmoke(opts, runDir) {
  const routeChecks = [
    { key: 'workbench-home', routePath: '/workbench', expectText: 'Workbench' },
    { key: 'skin-lab', routePath: '/termpp-skin-lab', expectText: 'Skin Lab' },
  ];
  const results = [];
  for (const cfg of routeChecks) {
    const r = await runAgentWithBrowser(
      ({ page, baseUrl, artifactDir }) => new NavigationAgent({ name: `NavigationAgent:${cfg.key}`, page, baseUrl, routePath: cfg.routePath, expectText: cfg.expectText, artifactDir }),
      { baseUrl: opts.baseUrl, headed: opts.headed, runDir, subdir: cfg.key }
    );
    results.push({ feature: cfg.key, ...r });
  }
  const wbSmoke = await runAgentWithBrowser(
    ({ page, baseUrl, artifactDir }) => new WorkbenchSmokeAgent({ page, baseUrl, artifactDir }),
    { baseUrl: opts.baseUrl, headed: opts.headed, runDir, subdir: 'workbench-smoke' }
  );
  results.push({ feature: 'workbench-smoke', ...wbSmoke });
  return { pass: results.every((r) => r.pass), mode: 'smoke', results };
}

async function cmdE2E(opts, runDir) {
  const feature = opts.feature || 'workbench-skin-dock';
  if (![
    'workbench-skin-dock',
    'workbench-dock-load-watchdog',
    'workbench-ui-coverage',
    'workbench-analyze-override-recovery',
    'workbench-source-grid-dragdrop',
    'workbench-regression-starters',
    'workbench-analyze-failure-recovery',
    'workbench-grid-selection-requirements',
    'workbench-layout-legacy-audit',
    'workbench-xp-editor-semantic',
    'workbench-source-add-row-sequence',
    'workbench-requirements-audit',
    'workbench-required-tests',
    'workbench-all-required-tests',
  ].includes(feature)) {
    return { pass: false, mode: 'e2e', error_summary: `Unknown feature: ${feature}` };
  }
  const artifactDir = path.join(runDir, feature);
  await ensureDir(artifactDir);
  let result;
  if (feature === 'workbench-ui-coverage') {
    result = await runAgentWithBrowser(
      ({ page, baseUrl, artifactDir: browserArtifactDir }) => new WorkbenchUICoverageAgent({
        page,
        baseUrl,
        artifactDir: browserArtifactDir,
        pngPath: opts.pngPath,
        headed: opts.headed,
        timeoutSec: opts.timeoutSec,
        moveSec: opts.moveSec,
      }),
      { baseUrl: opts.baseUrl, headed: opts.headed, runDir, subdir: feature }
    );
  } else if (
    feature === 'workbench-analyze-override-recovery' ||
    feature === 'workbench-source-grid-dragdrop' ||
    feature === 'workbench-analyze-failure-recovery' ||
    feature === 'workbench-grid-selection-requirements' ||
    feature === 'workbench-layout-legacy-audit' ||
    feature === 'workbench-xp-editor-semantic' ||
    feature === 'workbench-source-add-row-sequence'
  ) {
    const featureAgentMap = {
      'workbench-analyze-override-recovery': WorkbenchAnalyzeOverrideRecoveryAgent,
      'workbench-source-grid-dragdrop': WorkbenchSourceGridDragDropAgent,
      'workbench-analyze-failure-recovery': WorkbenchAnalyzeFailureRecoveryAgent,
      'workbench-grid-selection-requirements': WorkbenchGridSelectionRequirementsAgent,
      'workbench-layout-legacy-audit': WorkbenchLayoutLegacyAuditAgent,
      'workbench-xp-editor-semantic': WorkbenchXpEditorSemanticAgent,
      'workbench-source-add-row-sequence': WorkbenchSourceAddToRowSequenceAgent,
    };
    const AgentClass = featureAgentMap[feature];
    result = await runAgentWithBrowser(
      ({ page, baseUrl, artifactDir: browserArtifactDir }) => new AgentClass({
        page,
        baseUrl,
        artifactDir: browserArtifactDir,
        pngPath: opts.pngPath,
      }),
      { baseUrl: opts.baseUrl, headed: opts.headed, runDir, subdir: feature }
    );
  } else if (
    feature === 'workbench-regression-starters' ||
    feature === 'workbench-requirements-audit' ||
    feature === 'workbench-required-tests' ||
    feature === 'workbench-all-required-tests'
  ) {
    const jobs = [
      { name: 'workbench-analyze-override-recovery', AgentClass: WorkbenchAnalyzeOverrideRecoveryAgent },
      { name: 'workbench-source-grid-dragdrop', AgentClass: WorkbenchSourceGridDragDropAgent },
    ];
    const includeRequirements =
      feature === 'workbench-requirements-audit' ||
      feature === 'workbench-required-tests' ||
      feature === 'workbench-all-required-tests';
    const includeCoverage =
      feature === 'workbench-required-tests' ||
      feature === 'workbench-all-required-tests';
    const includeExplicitDockWatchdog =
      feature === 'workbench-required-tests' ||
      feature === 'workbench-all-required-tests';

    if (includeRequirements) {
      jobs.push(
        { name: 'workbench-analyze-failure-recovery', AgentClass: WorkbenchAnalyzeFailureRecoveryAgent },
        { name: 'workbench-grid-selection-requirements', AgentClass: WorkbenchGridSelectionRequirementsAgent },
        { name: 'workbench-layout-legacy-audit', AgentClass: WorkbenchLayoutLegacyAuditAgent },
        { name: 'workbench-xp-editor-semantic', AgentClass: WorkbenchXpEditorSemanticAgent },
        { name: 'workbench-source-add-row-sequence', AgentClass: WorkbenchSourceAddToRowSequenceAgent },
      );
    }
    if (includeCoverage) {
      const r = await runAgentWithBrowser(
        ({ page, baseUrl, artifactDir: browserArtifactDir }) => new WorkbenchUICoverageAgent({
          page,
          baseUrl,
          artifactDir: browserArtifactDir,
          pngPath: opts.pngPath,
          headed: opts.headed,
          timeoutSec: opts.timeoutSec,
          moveSec: opts.moveSec,
        }),
        { baseUrl: opts.baseUrl, headed: opts.headed, runDir, subdir: 'workbench-ui-coverage' }
      );
      jobs.unshift({ name: 'workbench-ui-coverage', _precomputed: r });
    }
    const results = [];
    for (const j of jobs) {
      const r = j._precomputed || await runAgentWithBrowser(
        ({ page, baseUrl, artifactDir: browserArtifactDir }) => new j.AgentClass({
          page,
          baseUrl,
          artifactDir: browserArtifactDir,
          pngPath: opts.pngPath,
        }),
        { baseUrl: opts.baseUrl, headed: opts.headed, runDir, subdir: j.name }
      );
      results.push({ feature: j.name, ...r });
    }
    if (includeExplicitDockWatchdog) {
      const dockArtifactDir = path.join(runDir, 'workbench-dock-load-watchdog');
      await ensureDir(dockArtifactDir);
      const dock = new WorkbenchDockLoadWatchdogAgent({
        baseUrl: opts.baseUrl,
        artifactDir: dockArtifactDir,
        pngPath: opts.pngPath,
        headed: opts.headed,
        timeoutSec: opts.timeoutSec,
        moveSec: opts.moveSec,
      });
      const r = await dock.execute();
      await writeJson(path.join(dockArtifactDir, 'subagent-result.json'), r);
      results.push({ feature: 'workbench-dock-load-watchdog', ...r });
    }
    result = {
      pass: results.every((x) => x.pass),
      steps_run: [],
      artifacts: [],
      error_summary: results.filter((x) => !x.pass).map((x) => `${x.feature}: ${x.error_summary || 'failed'}`).join(' | '),
      data: { results },
    };
    await writeJson(path.join(artifactDir, 'subagent-result.json'), result);
  } else {
    const AgentClass = feature === 'workbench-dock-load-watchdog' ? WorkbenchDockLoadWatchdogAgent : WorkbenchSkinDockE2EAgent;
    const agent = new AgentClass({
      baseUrl: opts.baseUrl,
      artifactDir,
      pngPath: opts.pngPath,
      headed: opts.headed,
      timeoutSec: opts.timeoutSec,
      moveSec: opts.moveSec,
    });
    result = await agent.execute();
    await writeJson(path.join(artifactDir, 'subagent-result.json'), result);
  }
  return { pass: result.pass, mode: 'e2e', feature, result };
}

async function cmdParallel(opts, runDir) {
  const jobs = [
    {
      name: 'parallel-nav-workbench',
      fn: () => runAgentWithBrowser(
        ({ page, baseUrl, artifactDir }) => new NavigationAgent({ name: 'ParallelNavWorkbench', page, baseUrl, routePath: '/workbench', expectText: 'Workbench', artifactDir }),
        { baseUrl: opts.baseUrl, headed: opts.headed, runDir, subdir: 'parallel-nav-workbench' }
      ),
    },
    {
      name: 'parallel-nav-skin-lab',
      fn: () => runAgentWithBrowser(
        ({ page, baseUrl, artifactDir }) => new NavigationAgent({ name: 'ParallelNavSkinLab', page, baseUrl, routePath: '/termpp-skin-lab', expectText: 'Skin Lab', artifactDir }),
        { baseUrl: opts.baseUrl, headed: opts.headed, runDir, subdir: 'parallel-nav-skin-lab' }
      ),
    },
  ];
  if (opts.pngPath) {
    jobs.push({
      name: 'parallel-workbench-skin-dock-e2e',
      fn: async () => {
        const artifactDir = path.join(runDir, 'parallel-workbench-skin-dock-e2e');
        await ensureDir(artifactDir);
        const agent = new WorkbenchSkinDockE2EAgent({
          baseUrl: opts.baseUrl,
          artifactDir,
          pngPath: opts.pngPath,
          headed: opts.headed,
          timeoutSec: opts.timeoutSec,
          moveSec: opts.moveSec,
        });
        return agent.execute();
      },
    });
  }
  const settled = await Promise.all(jobs.map(async (j) => {
    try {
      const result = await j.fn();
      return { name: j.name, pass: !!result.pass, result };
    } catch (e) {
      return { name: j.name, pass: false, error_summary: String(e?.stack || e) };
    }
  }));
  return { pass: settled.every((x) => x.pass), mode: 'parallel', jobs: settled };
}

async function main() {
  const opts = parseArgs(process.argv.slice(2));
  const runDir = await createRunDir(opts.command.replace(/[:]/g, '-'));
  let serverHandle = null;
  if (!opts.noServerStart) {
    serverHandle = await ensureFlaskWorkbenchServer({ baseUrl: resolveRoute(opts.baseUrl, '/workbench'), cwd: process.cwd(), timeoutMs: 30000 });
  }
  let summary;
  const startedAt = Date.now();
  try {
    if (opts.command === 'test:smoke') summary = await cmdSmoke(opts, runDir);
    else if (opts.command === 'test:e2e') summary = await cmdE2E(opts, runDir);
    else if (opts.command === 'test:parallel') summary = await cmdParallel(opts, runDir);
    else throw new Error(`Unknown command ${opts.command}`);
    summary.base_url = opts.baseUrl;
    summary.run_dir = runDir;
    summary.duration_ms = Date.now() - startedAt;
    summary.headed = !!opts.headed;
    await writeJson(path.join(runDir, 'summary.json'), summary);
    console.log(`Artifacts: ${runDir}`);
    printSummary(summary);
    process.exitCode = summary.pass ? 0 : 1;
  } finally {
    await stopServer(serverHandle);
  }
}

main().catch((err) => {
  console.error(err?.stack || String(err));
  process.exit(1);
});
