import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, '..', '..');
const workbenchJs = fs.readFileSync(path.join(repoRoot, 'web', 'workbench.js'), 'utf8');

test('XP preview plays idle-only sheets by cycling angle rows', () => {
  const startPreview = workbenchJs.match(/function startPreview\(\)\s*\{[\s\S]*?\n  \}/);
  assert.ok(startPreview, 'expected startPreview() in workbench.js');
  assert.match(
    startPreview[0],
    /semanticFrames > 1 \? "frames" : \(angleCount > 1 \? "angles" : "still"\)/,
    'startPreview should choose angle playback for one-frame multi-angle sheets'
  );
  assert.match(
    startPreview[0],
    /\$\("previewAngle"\)\.value = String\(row\)/,
    'angle playback should update the Direction input as it cycles rows'
  );
  assert.match(
    startPreview[0],
    /renderPreviewFrame\(row, 0\)/,
    'angle playback should render the selected angle row with the single idle frame'
  );
});

test('XP preview still plays multi-frame sheets by frame column', () => {
  const startPreview = workbenchJs.match(/function startPreview\(\)\s*\{[\s\S]*?\n  \}/);
  assert.ok(startPreview, 'expected startPreview() in workbench.js');
  assert.match(
    startPreview[0],
    /renderPreviewFrame\(baseRow, state\.previewFrameIdx % semanticFrames\)/,
    'frame playback should keep the selected angle row and advance frame columns'
  );
});

test('workbench can directly open a saved raw XP session from query string', () => {
  assert.match(
    workbenchJs,
    /params\.get\("session_id"\) \|\| params\.get\("session"\)/,
    'workbench should accept direct session query params for root-editor XP open flows'
  );
  assert.match(
    workbenchJs,
    /loadSession\(initialSessionId,\s*\{ reason: `Opening session/,
    'query-session boot path should hydrate the same session loader as Browse'
  );
});
