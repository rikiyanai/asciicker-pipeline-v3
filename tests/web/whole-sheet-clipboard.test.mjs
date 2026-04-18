import test from 'node:test';
import assert from 'node:assert/strict';

import {
  captureVisibleSelectionClipboard,
  countClipboardCells,
  getVisibleUnlockedLayerIndices,
  resolveWritableClipboardLayers,
} from '../../web/whole-sheet-clipboard.mjs';

function createLayer(cellsByKey = {}, { visible = true, locked = false } = {}) {
  return {
    visible,
    locked,
    getCell(x, y) {
      const key = `${x},${y}`;
      const cell = cellsByKey[key] || { glyph: 0, fg: [255, 255, 255], bg: [0, 0, 0] };
      return {
        glyph: cell.glyph,
        fg: [...cell.fg],
        bg: [...cell.bg],
      };
    },
  };
}

test('captureVisibleSelectionClipboard preserves each visible layer independently', () => {
  const layerStack = {
    layers: [
      createLayer({
        '4,5': { glyph: 65, fg: [255, 0, 0], bg: [0, 0, 0] },
        '5,5': { glyph: 66, fg: [0, 255, 0], bg: [0, 0, 0] },
      }),
      createLayer({
        '4,5': { glyph: 77, fg: [1, 2, 3], bg: [4, 5, 6] },
      }, { visible: false }),
      createLayer({
        '4,5': { glyph: 90, fg: [0, 0, 255], bg: [10, 11, 12] },
        '5,5': { glyph: 91, fg: [9, 8, 7], bg: [6, 5, 4] },
      }),
    ],
  };

  const clipboard = captureVisibleSelectionClipboard(layerStack, { x: 4, y: 5, width: 2, height: 1 });
  assert.ok(clipboard);
  assert.deepEqual(clipboard.bounds, { x: 4, y: 5, w: 2, h: 1 });
  assert.deepEqual(clipboard.layers.map((entry) => entry.layerIndex), [0, 2]);
  assert.equal(countClipboardCells(clipboard), 4);
  assert.deepEqual(clipboard.layers[0].cells, [
    { glyph: 65, fg: [255, 0, 0], bg: [0, 0, 0] },
    { glyph: 66, fg: [0, 255, 0], bg: [0, 0, 0] },
  ]);
  assert.deepEqual(clipboard.layers[1].cells, [
    { glyph: 90, fg: [0, 0, 255], bg: [10, 11, 12] },
    { glyph: 91, fg: [9, 8, 7], bg: [6, 5, 4] },
  ]);
});

test('getVisibleUnlockedLayerIndices fails closed when a visible layer is locked', () => {
  const layerStack = {
    layers: [
      createLayer({}, { visible: true, locked: false }),
      createLayer({}, { visible: false, locked: true }),
      createLayer({}, { visible: true, locked: true }),
    ],
  };

  assert.equal(getVisibleUnlockedLayerIndices(layerStack), null);
});

test('resolveWritableClipboardLayers rejects locked or missing destinations', () => {
  const clipboard = {
    bounds: { x: 0, y: 0, w: 1, h: 1 },
    layers: [
      { layerIndex: 0, cells: [{ glyph: 1, fg: [1, 1, 1], bg: [0, 0, 0] }] },
      { layerIndex: 1, cells: [{ glyph: 2, fg: [2, 2, 2], bg: [0, 0, 0] }] },
    ],
  };

  const lockedTargets = {
    layers: [
      createLayer({}, { locked: false }),
      createLayer({}, { locked: true }),
    ],
  };
  assert.equal(resolveWritableClipboardLayers(lockedTargets, clipboard), null);

  const missingTargets = {
    layers: [createLayer({})],
  };
  assert.equal(resolveWritableClipboardLayers(missingTargets, clipboard), null);
});
