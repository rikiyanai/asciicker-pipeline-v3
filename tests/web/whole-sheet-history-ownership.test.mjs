import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, '..', '..');
const workbenchJs = fs.readFileSync(path.join(repoRoot, 'web', 'workbench.js'), 'utf8');
const wholeSheetInitJs = fs.readFileSync(path.join(repoRoot, 'web', 'whole-sheet-init.js'), 'utf8');

test('whole-sheet history is owned by whole-sheet-init, not workbench callbacks', () => {
  assert.equal(
    /onStrokeStart\s*:/.test(workbenchJs),
    false,
    'workbench.js must not push wrapper history from whole-sheet stroke start'
  );
  assert.equal(
    /onUndo\s*:|onRedo\s*:/.test(workbenchJs),
    false,
    'workbench.js must not own whole-sheet undo/redo callbacks'
  );
  assert.match(
    wholeSheetInitJs,
    /function undo\(\)[\s\S]*_applyDocumentSnapshot/,
    'whole-sheet-init.js should apply root-owned snapshots during undo'
  );
  assert.match(
    wholeSheetInitJs,
    /function redo\(\)[\s\S]*_applyDocumentSnapshot/,
    'whole-sheet-init.js should apply root-owned snapshots during redo'
  );
});

test('whole-sheet edit completion no longer writes wrapper history', () => {
  const mountBlock = workbenchJs.match(/wsEditor\.mount\(\{[\s\S]*?\}\)\.then/);
  assert.ok(mountBlock, 'expected workbench whole-sheet mount block');
  assert.equal(
    /pushHistory\(\)/.test(mountBlock[0]),
    false,
    'whole-sheet mount callbacks must not call wrapper pushHistory()'
  );
});
