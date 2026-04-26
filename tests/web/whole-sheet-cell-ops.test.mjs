import test from 'node:test';
import assert from 'node:assert/strict';

import {
  buildClearedEditorCell,
  cloneEditorCell,
  shouldCopyCellOnLayerMerge,
} from '../../web/whole-sheet-cell-ops.mjs';

test('buildClearedEditorCell preserves existing background color', () => {
  const cleared = buildClearedEditorCell({
    glyph: 65,
    fg: [12, 34, 56],
    bg: [90, 91, 92],
  });

  assert.deepEqual(cleared, {
    glyph: 0,
    fg: [255, 255, 255],
    bg: [90, 91, 92],
  });
});

test('cloneEditorCell normalizes missing cells to the editor default cell', () => {
  assert.deepEqual(cloneEditorCell(null), {
    glyph: 0,
    fg: [255, 255, 255],
    bg: [0, 0, 0],
  });
});

test('shouldCopyCellOnLayerMerge skips only the untouched default cell', () => {
  assert.equal(shouldCopyCellOnLayerMerge({
    glyph: 0,
    fg: [255, 255, 255],
    bg: [0, 0, 0],
  }), false);

  assert.equal(shouldCopyCellOnLayerMerge({
    glyph: 0,
    fg: [255, 255, 255],
    bg: [8, 9, 10],
  }), true);

  assert.equal(shouldCopyCellOnLayerMerge({
    glyph: 0,
    fg: [1, 2, 3],
    bg: [0, 0, 0],
  }), true);

  assert.equal(shouldCopyCellOnLayerMerge({
    glyph: 35,
    fg: [255, 255, 255],
    bg: [0, 0, 0],
  }), true);
});
