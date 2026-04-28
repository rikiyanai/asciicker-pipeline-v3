import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

const repoRoot = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..', '..');
const generatorPath = path.join(repoRoot, 'scripts', 'xp_fidelity_test', 'generate_whole_sheet_manual_checklist.mjs');
const mdOut = path.join(repoRoot, 'output', 'whole_sheet_manual_checklist.md');
const jsonOut = path.join(repoRoot, 'output', 'whole_sheet_manual_checklist.json');

test('whole-sheet manual checklist generator emits checklist artifacts', () => {
  execFileSync('node', [generatorPath], { cwd: repoRoot, stdio: 'pipe' });

  assert.equal(fs.existsSync(mdOut), true);
  assert.equal(fs.existsSync(jsonOut), true);

  const md = fs.readFileSync(mdOut, 'utf8');
  const json = JSON.parse(fs.readFileSync(jsonOut, 'utf8'));

  assert.match(md, /# Whole-Sheet Manual Checklist/);
  assert.match(md, /Hosts to test:/);
  assert.match(md, /contract-only/);
  assert.ok(Array.isArray(json.rows));
  assert.ok(json.rows.length > 0);
  assert.ok(json.rows.some((row) => row.machineEvidence.includes('contract-only')));
});
