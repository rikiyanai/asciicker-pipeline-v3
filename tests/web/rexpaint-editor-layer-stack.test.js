/**
 * Layer Stack Tests
 *
 * Run with: node tests/web/rexpaint-editor-layer-stack.test.js
 */

import { Layer, LayerStack } from '../../web/rexpaint-editor/layer-stack.js';

// Simple test framework (polyfill for vitest-like API)
class TestRunner {
  constructor() {
    this.tests = [];
    this.passed = 0;
    this.failed = 0;
  }

  describe(suiteName, suiteFunc) {
    console.log(`\n${suiteName}`);
    suiteFunc();
  }

  it(testName, testFunc) {
    try {
      testFunc();
      this.passed++;
      console.log(`  ✓ ${testName}`);
    } catch (error) {
      this.failed++;
      console.log(`  ✗ ${testName}`);
      console.log(`    ${error.message}`);
    }
  }

  report() {
    console.log(`\n${this.passed} passed, ${this.failed} failed`);
    process.exit(this.failed > 0 ? 1 : 0);
  }
}

// Simple assertion helpers
const expect = (value) => ({
  toBe(expected) {
    if (value !== expected) {
      throw new Error(`Expected ${expected}, got ${value}`);
    }
  },
  toEqual(expected) {
    if (JSON.stringify(value) !== JSON.stringify(expected)) {
      throw new Error(`Expected ${JSON.stringify(expected)}, got ${JSON.stringify(value)}`);
    }
  },
  toHaveLength(expected) {
    if (value.length !== expected) {
      throw new Error(`Expected length ${expected}, got ${value.length}`);
    }
  },
  toBeTruthy() {
    if (!value) {
      throw new Error(`Expected truthy value, got ${value}`);
    }
  },
  toBeFalsy() {
    if (value) {
      throw new Error(`Expected falsy value, got ${value}`);
    }
  },
});

// Run tests
const runner = new TestRunner();

runner.describe('Layer', () => {
  runner.it('should create a layer with correct properties', () => {
    const layer = new Layer(0, 'Test Layer', 80, 30);
    expect(layer.id).toBe(0);
    expect(layer.name).toBe('Test Layer');
    expect(layer.visible).toBe(true);
    expect(layer.width).toBe(80);
    expect(layer.height).toBe(30);
  });

  runner.it('should initialize empty cell grid', () => {
    const layer = new Layer(0, 'Test Layer', 10, 10);
    expect(layer.data).toBeTruthy();
    expect(layer.data.length).toBe(10);
    expect(layer.data[0].length).toBe(10);
  });

  runner.it('should set and get cell data', () => {
    const layer = new Layer(0, 'Test Layer', 10, 10);
    const fg = [255, 0, 0];
    const bg = [0, 0, 255];
    layer.setCell(5, 5, 65, fg, bg);
    const cell = layer.getCell(5, 5);
    expect(cell.glyph).toBe(65);
    expect(cell.fg).toEqual([255, 0, 0]);
    expect(cell.bg).toEqual([0, 0, 255]);
  });

  runner.it('should return null for out-of-bounds cells', () => {
    const layer = new Layer(0, 'Test Layer', 10, 10);
    const cell = layer.getCell(100, 100);
    expect(cell).toBe(null);
  });

  runner.it('should toggle visibility', () => {
    const layer = new Layer(0, 'Test Layer', 80, 30);
    expect(layer.visible).toBe(true);
    layer.setVisible(false);
    expect(layer.visible).toBe(false);
    layer.setVisible(true);
    expect(layer.visible).toBe(true);
  });

  runner.it('should not set cell data outside bounds', () => {
    const layer = new Layer(0, 'Test Layer', 10, 10);
    layer.setCell(-1, 5, 65, [255, 0, 0], [0, 0, 255]);
    layer.setCell(100, 5, 65, [255, 0, 0], [0, 0, 255]);
    const cell1 = layer.getCell(0, 5);
    const cell2 = layer.getCell(9, 5);
    expect(cell1.glyph).toBe(0); // Should remain default
    expect(cell2.glyph).toBe(0); // Should remain default
  });

  runner.it('should copy color values to prevent external mutation', () => {
    const layer = new Layer(0, 'Test Layer', 10, 10);
    const fg = [255, 0, 0];
    const bg = [0, 0, 255];
    layer.setCell(5, 5, 65, fg, bg);
    fg[0] = 100;
    bg[0] = 100;
    const cell = layer.getCell(5, 5);
    expect(cell.fg[0]).toBe(255); // Should not be affected
    expect(cell.bg[0]).toBe(0);   // Should not be affected
  });
});

runner.describe('LayerStack', () => {
  runner.it('should create layer stack with default layer', () => {
    const stack = new LayerStack(80, 30);
    expect(stack.width).toBe(80);
    expect(stack.height).toBe(30);
    expect(stack.layers.length).toBe(1);
  });

  runner.it('should have default layer as active', () => {
    const stack = new LayerStack(80, 30);
    const active = stack.getActiveLayer();
    expect(active).toBeTruthy();
    expect(active.name).toBe('Layer 0');
  });

  runner.it('should add new layer to stack', () => {
    const stack = new LayerStack(80, 30);
    stack.addLayer('Layer 1');
    expect(stack.layers.length).toBe(2);
    const active = stack.getActiveLayer();
    expect(active.name).toBe('Layer 1');
  });

  runner.it('should set newly added layer as active', () => {
    const stack = new LayerStack(80, 30);
    stack.addLayer('Layer 1');
    stack.addLayer('Layer 2');
    const active = stack.getActiveLayer();
    expect(active.name).toBe('Layer 2');
    expect(stack.activeIndex).toBe(2);
  });

  runner.it('should remove layer from stack', () => {
    const stack = new LayerStack(80, 30);
    stack.addLayer('Layer 1');
    stack.addLayer('Layer 2');
    expect(stack.layers.length).toBe(3);
    stack.removeLayer(1);
    expect(stack.layers.length).toBe(2);
    expect(stack.layers[1].name).toBe('Layer 2');
  });

  runner.it('should prevent removing last layer', () => {
    const stack = new LayerStack(80, 30);
    stack.removeLayer(0);
    expect(stack.layers.length).toBe(1);
    expect(stack.layers[0].name).toBe('Layer 0');
  });

  runner.it('should move layer up in stack', () => {
    const stack = new LayerStack(80, 30);
    stack.addLayer('Layer 1');
    stack.addLayer('Layer 2');
    stack.selectLayer(0);
    stack.moveLayer(0, 2);
    expect(stack.layers[2].name).toBe('Layer 0');
    expect(stack.layers[0].name).toBe('Layer 1');
    expect(stack.layers[1].name).toBe('Layer 2');
  });

  runner.it('should move layer down in stack', () => {
    const stack = new LayerStack(80, 30);
    stack.addLayer('Layer 1');
    stack.addLayer('Layer 2');
    stack.selectLayer(2);
    stack.moveLayer(2, 0);
    expect(stack.layers[0].name).toBe('Layer 2');
    expect(stack.layers[1].name).toBe('Layer 0');
    expect(stack.layers[2].name).toBe('Layer 1');
  });

  runner.it('should select/activate a layer', () => {
    const stack = new LayerStack(80, 30);
    stack.addLayer('Layer 1');
    stack.addLayer('Layer 2');
    stack.selectLayer(0);
    const active = stack.getActiveLayer();
    expect(active.name).toBe('Layer 0');
    expect(stack.activeIndex).toBe(0);
  });

  runner.it('should return correct active layer', () => {
    const stack = new LayerStack(80, 30);
    const layer0 = stack.getActiveLayer();
    expect(layer0.name).toBe('Layer 0');
    stack.addLayer('Layer 1');
    const layer1 = stack.getActiveLayer();
    expect(layer1.name).toBe('Layer 1');
  });

  runner.it('should maintain independent cell data per layer', () => {
    const stack = new LayerStack(80, 30);
    stack.addLayer('Layer 1');

    const layer0 = stack.layers[0];
    const layer1 = stack.layers[1];

    layer0.setCell(5, 5, 65, [255, 0, 0], [0, 0, 255]);
    layer1.setCell(5, 5, 66, [0, 255, 0], [255, 0, 0]);

    const cell0 = layer0.getCell(5, 5);
    const cell1 = layer1.getCell(5, 5);

    expect(cell0.glyph).toBe(65);
    expect(cell1.glyph).toBe(66);
    expect(cell0.fg).toEqual([255, 0, 0]);
    expect(cell1.fg).toEqual([0, 255, 0]);
  });

  runner.it('should adjust active index when removing active layer', () => {
    const stack = new LayerStack(80, 30);
    stack.addLayer('Layer 1');
    stack.addLayer('Layer 2');
    stack.selectLayer(2);
    stack.removeLayer(2);
    expect(stack.activeIndex).toBe(1);
    expect(stack.getActiveLayer().name).toBe('Layer 1');
  });

  runner.it('should update active index when moving active layer', () => {
    const stack = new LayerStack(80, 30);
    stack.addLayer('Layer 1');
    stack.addLayer('Layer 2');
    stack.selectLayer(0);
    stack.moveLayer(0, 2);
    expect(stack.activeIndex).toBe(2);
    expect(stack.getActiveLayer().name).toBe('Layer 0');
  });

  runner.it('should return copy of layers array', () => {
    const stack = new LayerStack(80, 30);
    stack.addLayer('Layer 1');
    const layers = stack.getLayers();
    expect(layers.length).toBe(2);
    expect(layers[0].name).toBe('Layer 0');
    expect(layers[1].name).toBe('Layer 1');
  });

  runner.it('should ignore invalid select index', () => {
    const stack = new LayerStack(80, 30);
    stack.addLayer('Layer 1');
    const currentActive = stack.getActiveLayer();
    stack.selectLayer(-1);
    expect(stack.getActiveLayer()).toEqual(currentActive);
    stack.selectLayer(100);
    expect(stack.getActiveLayer()).toEqual(currentActive);
  });

  runner.it('should assign sequential ids to layers', () => {
    const stack = new LayerStack(80, 30);
    stack.addLayer('Layer 1');
    stack.addLayer('Layer 2');
    expect(stack.layers[0].id).toBe(0);
    expect(stack.layers[1].id).toBe(1);
    expect(stack.layers[2].id).toBe(2);
  });

  runner.it('should maintain layer dimensions matching stack', () => {
    const stack = new LayerStack(80, 30);
    stack.addLayer('Layer 1');

    for (const layer of stack.layers) {
      expect(layer.width).toBe(80);
      expect(layer.height).toBe(30);
    }
  });
});

runner.report();
