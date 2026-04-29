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

test('wrapper render path no longer force-syncs the root whole-sheet editor', () => {
  const renderAllBlock = workbenchJs.match(/function renderAll\(\)\s*\{[\s\S]*?\n  \}/);
  assert.ok(renderAllBlock, 'expected renderAll() block');
  assert.equal(
    /syncWholeSheetFromState\(\)/.test(renderAllBlock[0]),
    false,
    'renderAll() must not push blanket whole-sheet syncs on every wrapper render'
  );
});

test('ordinary whole-sheet stroke completion avoids full frame-grid rebuilds', () => {
  const strokeBlock = workbenchJs.match(/onStrokeComplete:\s*function\(\)\s*\{[\s\S]*?\n\s*\},\n\s*onSave:/);
  assert.ok(strokeBlock, 'expected whole-sheet onStrokeComplete callback');
  assert.equal(
    /renderFrameGrid\(\)/.test(strokeBlock[0]),
    false,
    'ordinary whole-sheet stroke completion must not rebuild the full frame grid'
  );
  assert.match(
    strokeBlock[0],
    /queueDirtyFrameGridRefresh/,
    'ordinary whole-sheet stroke completion should queue dirty frame-grid cells for secondary refresh'
  );
  assert.equal(
    /refreshDirtyFrameGridCells\(/.test(strokeBlock[0]),
    false,
    'ordinary whole-sheet stroke completion must not run secondary frame-grid projection synchronously'
  );
});

test('ordinary whole-sheet stroke completion queues autosave instead of serializing', () => {
  const strokeBlock = workbenchJs.match(/onStrokeComplete:\s*function\(\)\s*\{[\s\S]*?\n\s*\},\n\s*onSave:/);
  assert.ok(strokeBlock, 'expected whole-sheet onStrokeComplete callback');
  assert.equal(
    /saveSessionState\(/.test(strokeBlock[0]),
    false,
    'ordinary whole-sheet stroke completion must not call full session serialization directly'
  );
  assert.match(
    strokeBlock[0],
    /queueWholeSheetAutosave/,
    'ordinary whole-sheet stroke completion should hand off persistence to the autosave queue'
  );
});

test('whole-sheet root exports a document replacement API for wrapper button flows', () => {
  assert.match(
    wholeSheetInitJs,
    /function replaceDocumentSnapshot\(/,
    'whole-sheet-init.js should define replaceDocumentSnapshot()'
  );
  assert.match(
    wholeSheetInitJs,
    /window\.__wholeSheetEditor\s*=\s*\{[\s\S]*replaceDocumentSnapshot/,
    'whole-sheet public API should expose replaceDocumentSnapshot()'
  );
});

test('whole-sheet resize is no longer constrained by wrapper frame topology', () => {
  const resizeBlock = wholeSheetInitJs.match(/async function _promptResizeDocument\(\)\s*\{[\s\S]*?\n\}/);
  assert.ok(resizeBlock, 'expected _promptResizeDocument() block');
  assert.equal(
    /Resize must preserve the current frame topology/.test(resizeBlock[0]),
    false,
    'whole-sheet resize prompt must not enforce wrapper frame-topology divisibility'
  );
});

test('wrapper layer controls delegate to the mounted whole-sheet editor API', () => {
  assert.match(
    workbenchJs,
    /\$\("layerSelect"\)\.addEventListener\("change", \(\) => \{[\s\S]*wsEditor\.setActiveLayer/,
    'layerSelect control should delegate active-layer changes to whole-sheet editor'
  );
  assert.match(
    workbenchJs,
    /\$\("layerVisibility"\)\.addEventListener\("change", \(e\) => \{[\s\S]*wsEditor\.setLayerVisibility/,
    'layerVisibility control should delegate visibility changes to whole-sheet editor'
  );
});
