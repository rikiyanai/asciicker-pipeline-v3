#!/usr/bin/env node

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, '..', '..');
const CONTRACT_JSON = path.join(REPO_ROOT, 'output', 'whole_sheet_action_contracts.json');
const DEFAULT_MD_OUT = path.join(REPO_ROOT, 'output', 'whole_sheet_manual_checklist.md');
const DEFAULT_JSON_OUT = path.join(REPO_ROOT, 'output', 'whole_sheet_manual_checklist.json');

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

function writeText(filePath, text) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, text, 'utf8');
}

function writeJson(filePath, value) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, JSON.stringify(value, null, 2) + '\n', 'utf8');
}

function normalizeText(value) {
  return String(value || '').replace(/\s+/g, ' ').trim();
}

function variantPreconditionsToText(preconditions = []) {
  if (!preconditions.length) return 'None';
  return preconditions.map((condition) => {
    if (condition.surface === 'wsState') return `${condition.field} ${condition.op} ${JSON.stringify(condition.value)}`;
    if (condition.surface === 'dom') return `${condition.selector} ${condition.op} ${JSON.stringify(condition.value)}`;
    if (condition.surface === 'hook') return `${condition.hookName} ${condition.op} ${JSON.stringify(condition.value)}`;
    if (condition.surface === 'note') return condition.note;
    return JSON.stringify(condition);
  }).join('<br>');
}

function variantExpectedToText(expected = []) {
  if (!expected.length) return 'No explicit expectation recorded';
  return expected.map((condition) => {
    if (condition.surface === 'wsState') return `${condition.field} ${condition.op} ${JSON.stringify(condition.value)}`;
    if (condition.surface === 'dom') return `${condition.selector} ${condition.op} ${JSON.stringify(condition.value)}`;
    if (condition.surface === 'hook') return `${condition.hookName} ${condition.op} ${JSON.stringify(condition.value)}`;
    if (condition.surface === 'note') return condition.note;
    return JSON.stringify(condition);
  }).join('<br>');
}

function inferFamily(action) {
  const id = String(action.controlId || '');
  const kind = String(action.contract?.actionKind || '');
  const selector = String(action.selector || '');
  if (id.startsWith('wsTool')) return 'Tools';
  if (id.startsWith('wsMode') || id.startsWith('wsBrowse')) return 'Browse / Modes';
  if (id.startsWith('wsGrid') || kind.startsWith('grid-')) return 'Grid';
  if (id.startsWith('ws-layer') || id === 'layerSelect' || id === 'layerVisibility') return 'Layers';
  if (id.startsWith('wsCanvasZoom') || kind === 'canvas-zoom') return 'Canvas';
  if (id === 'wholeSheetCanvas') return 'Canvas';
  if (kind === 'undo' || kind === 'redo') return 'History';
  if (selector.includes('FindReplace') || kind.includes('find-replace')) return 'Find / Replace';
  return 'Misc';
}

function listProofReports() {
  return [
    { slice: 'whole_sheet_button_smoke', kind: 'headed-ui', hosts: ['root', 'prefixed'] },
    { slice: 'whole_sheet_browse_document', kind: 'headed-ui', hosts: ['root', 'prefixed'] },
    { slice: 'whole_sheet_layer0_policy', kind: 'headed-ui', hosts: ['root', 'prefixed'] },
    { slice: 'whole_sheet_session_ownership', kind: 'headed-ui', hosts: ['root', 'prefixed'] },
    { slice: 'whole_sheet_tools', kind: 'headed-ui', hosts: ['root', 'prefixed'] },
    { slice: 'whole_sheet_transform', kind: 'headed-ui', hosts: ['root', 'prefixed'] },
    { slice: 'whole_sheet_bulkedit', kind: 'headed-ui', hosts: ['root', 'prefixed'] },
    { slice: 'whole_sheet_grid', kind: 'headed-ui', hosts: ['root', 'prefixed'] },
    { slice: 'whole_sheet_grid_template_preset', kind: 'headed-ui', hosts: ['root', 'prefixed'] },
    { slice: 'whole_sheet_layer', kind: 'headed-ui', hosts: ['root', 'prefixed'] },
    { slice: 'whole_sheet_clipboard', kind: 'headed-ui', hosts: ['root', 'prefixed'] },
    { slice: 'whole_sheet_history_ownership_node', kind: 'node-test', hosts: ['repo'] },
  ];
}

function classifyEvidence(action) {
  const id = String(action.controlId || '');
  const kind = String(action.contract?.actionKind || '');
  const evidence = [];

  if (id.startsWith('wsTool') || kind === 'stroke-complete') {
    evidence.push('headed-ui:whole_sheet_tools(root,prefixed)');
  }
  if (id === 'wsModeBrowse' || id === 'wsModePaint' || id.startsWith('wsBrowse')) {
    evidence.push('headed-ui:whole_sheet_button_smoke(root,prefixed)');
    if (id.startsWith('wsBrowse')) evidence.push('headed-ui:whole_sheet_browse_document(root,prefixed)');
  }
  if (id.startsWith('ws-layer') || id === 'layerSelect' || id === 'layerVisibility') {
    evidence.push('headed-ui:whole_sheet_layer(root,prefixed)');
    evidence.push('headed-ui:whole_sheet_layer0_policy(root,prefixed)');
    if (id === 'layerSelect' || id === 'layerVisibility') {
      evidence.push('headed-ui:whole_sheet_button_smoke(root,prefixed)');
    }
  }
  if (kind === 'undo' || kind === 'redo') {
    evidence.push('node-test:whole_sheet_history_ownership_node(repo)');
  }
  if (id.startsWith('wsGrid') || kind.startsWith('grid-')) {
    evidence.push('headed-ui:whole_sheet_grid(root,prefixed)');
    if (id === 'wsGridTemplatePreset') {
      evidence.push('headed-ui:whole_sheet_grid_template_preset(root,prefixed)');
    }
  }
  if (id === 'wsCanvasZoomInput' || kind === 'canvas-zoom') {
    evidence.push('contract-only');
  }
  if (kind.includes('find-replace') || id.includes('FindReplace') || id === 'wsGridApplyFindReplace' || id === 'wsGridScope') {
    evidence.push('contract-only');
  }
  if (!evidence.length) evidence.push('contract-only');
  return evidence;
}

function manualPriority(action, evidence) {
  const kind = String(action.contract?.actionKind || '');
  const id = String(action.controlId || '');
  if (evidence.includes('contract-only')) return 'HIGH';
  if (kind === 'undo' || kind === 'redo') return 'HIGH';
  if (id.startsWith('wsBrowse') || id.startsWith('ws-layer') || kind.startsWith('grid-')) return 'HIGH';
  return 'MEDIUM';
}

function buildRows(actions) {
  const rows = [];
  for (const action of actions) {
    const family = inferFamily(action);
    const evidence = classifyEvidence(action);
    const priority = manualPriority(action, evidence);
    for (const variant of action.contract?.variants || []) {
      rows.push({
        family,
        priority,
        controlId: action.controlId,
        selector: action.selector,
        actionKind: action.contract.actionKind,
        label: normalizeText(variant.label),
        preconditions: variantPreconditionsToText(variant.preconditions || []),
        expected: variantExpectedToText(variant.expected || []),
        machineEvidence: evidence.join('<br>'),
        humanCheck: 'Verify visually and behaviorally on root and prefixed hosts.',
        source: `${action.sourceFile}:${action.line}`,
      });
    }
  }
  rows.sort((a, b) => {
    const familyCmp = a.family.localeCompare(b.family);
    if (familyCmp) return familyCmp;
    const controlCmp = a.controlId.localeCompare(b.controlId);
    if (controlCmp) return controlCmp;
    return a.label.localeCompare(b.label);
  });
  return rows;
}

function renderMarkdown(rows, metadata) {
  function mdCell(value) {
    return String(value || '').replace(/\|/g, '\\|');
  }
  const out = [];
  out.push('# Whole-Sheet Manual Checklist');
  out.push('');
  out.push(`Generated: ${metadata.generatedAt}`);
  out.push('');
  out.push('Purpose: turn the current whole-sheet action-contract inventory into a human UI test checklist.');
  out.push('');
  out.push('Hosts to test:');
  out.push('- Root: `http://127.0.0.1:5071/workbench`');
  out.push('- Prefixed: `http://127.0.0.1:5073/xpedit/workbench`');
  out.push('');
  out.push('Priority legend:');
  out.push('- `HIGH`: no headed proof or only node/contract proof; human run is required');
  out.push('- `MEDIUM`: headed UI proof exists, but final human acceptance is still required');
  out.push('');
  out.push('Machine evidence legend:');
  out.push('- `headed-ui:<slice>` = Playwright headed UI proof exists');
  out.push('- `node-test:<slice>` = repo-level node proof only');
  out.push('- `contract-only` = modeled in SAR/action contracts but no direct UI proof artifact recorded');
  out.push('');

  let currentFamily = '';
  for (const row of rows) {
    if (row.family !== currentFamily) {
      currentFamily = row.family;
      out.push(`## ${currentFamily}`);
      out.push('');
      out.push('| Priority | Control | State Before | Action | Expected After | Machine Evidence | Human Check | Source |');
      out.push('| --- | --- | --- | --- | --- | --- | --- | --- |');
    }
      out.push(`| ${mdCell(row.priority)} | \`${mdCell(row.controlId)}\` | ${mdCell(row.preconditions)} | ${mdCell(row.label)} | ${mdCell(row.expected)} | ${mdCell(row.machineEvidence)} | ${mdCell(row.humanCheck)} | \`${mdCell(row.source)}\` |`);
  }
  out.push('');
  return out.join('\n');
}

function main() {
  if (!fs.existsSync(CONTRACT_JSON)) {
    console.error(`Missing contract inventory: ${CONTRACT_JSON}`);
    process.exit(1);
  }
  const contracts = readJson(CONTRACT_JSON);
  const rows = buildRows(contracts.actions || []);
  const metadata = {
    generatedAt: new Date().toISOString(),
    repoRoot: REPO_ROOT,
    sourceContract: path.relative(REPO_ROOT, CONTRACT_JSON),
    proofCatalog: listProofReports(),
    rowCount: rows.length,
  };
  writeJson(DEFAULT_JSON_OUT, { ...metadata, rows });
  writeText(DEFAULT_MD_OUT, renderMarkdown(rows, metadata));
  console.log(JSON.stringify({
    ok: true,
    mdOut: path.relative(REPO_ROOT, DEFAULT_MD_OUT),
    jsonOut: path.relative(REPO_ROOT, DEFAULT_JSON_OUT),
    rowCount: rows.length,
  }, null, 2));
}

main();
