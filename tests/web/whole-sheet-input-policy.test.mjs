import test from 'node:test';
import assert from 'node:assert/strict';

import { shouldCycleActiveLayerOnWheel } from '../../web/whole-sheet-input-policy.mjs';

test('plain wheel and trackpad scroll do not cycle active layer', () => {
  assert.equal(shouldCycleActiveLayerOnWheel({ deltaY: 8, altKey: false, ctrlKey: false, metaKey: false }), false);
});

test('alt+wheel cycles active layer', () => {
  assert.equal(shouldCycleActiveLayerOnWheel({ deltaY: 8, altKey: true, ctrlKey: false, metaKey: false }), true);
});

test('ctrl/meta modified wheel does not cycle active layer', () => {
  assert.equal(shouldCycleActiveLayerOnWheel({ deltaY: 8, altKey: true, ctrlKey: true, metaKey: false }), false);
  assert.equal(shouldCycleActiveLayerOnWheel({ deltaY: 8, altKey: true, ctrlKey: false, metaKey: true }), false);
});
