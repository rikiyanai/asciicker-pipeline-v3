/**
 * Canvas Module Tests
 *
 * Run with: node tests/web/rexpaint-editor-canvas.test.js
 * Or via test framework: npm test -- tests/web/rexpaint-editor-canvas.test.js
 */

import { Canvas } from '../../web/rexpaint-editor/canvas.js';
import { LayerStack } from '../../web/rexpaint-editor/layer-stack.js';

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
  toBeGreaterThan(expected) {
    if (value <= expected) {
      throw new Error(`Expected > ${expected}, got ${value}`);
    }
  },
  toHaveBeenCalledWith(...args) {
    if (!this._mockCalls) {
      throw new Error('toHaveBeenCalledWith called on non-mock');
    }
    const callMatches = this._mockCalls.some(callArgs =>
      JSON.stringify(callArgs) === JSON.stringify(args)
    );
    if (!callMatches) {
      throw new Error(`Expected to be called with ${JSON.stringify(args)}, but calls were: ${JSON.stringify(this._mockCalls)}`);
    }
  },
});

// Mock HTMLCanvasElement for Node.js environment
if (typeof HTMLCanvasElement === 'undefined') {
  global.HTMLCanvasElement = class {
    constructor() {
      this.width = 0;
      this.height = 0;
      this._context = null;
    }

    getContext(type) {
      if (!this._context) {
        this._context = new CanvasContext(this);
      }
      return this._context;
    }
  };

  class CanvasContext {
    constructor(canvas) {
      this.canvas = canvas;
      this.fillStyle = '#000000';
      this.strokeStyle = '#000000';
      this.lineWidth = 1;
      this.lineDashOffset = 0;
      this.font = '12px monospace';
      this.textAlign = 'left';
      this.textBaseline = 'top';
      this.pixelData = new Map(); // Store pixel data for getImageData
      this.strokeRectCalls = []; // Track strokeRect calls for testing
      this.setLineDashCalls = []; // Track setLineDash calls for testing
    }

    fillRect(x, y, w, h) {
      // Parse fillStyle color and store pixel data
      const [r, g, b] = this._parseColor(this.fillStyle);
      for (let py = y; py < y + h; py++) {
        for (let px = x; px < x + w; px++) {
          this.pixelData.set(`${px},${py}`, [r, g, b, 255]);
        }
      }
    }

    strokeRect(x, y, w, h) {
      // Track calls for testing
      this.strokeRectCalls.push([x, y, w, h]);
    }

    beginPath() {}

    moveTo(x, y) {}

    lineTo(x, y) {}

    stroke() {}

    fillText(text, x, y, maxWidth) {}

    setLineDash(dash) {
      // Track calls for testing
      this.setLineDashCalls.push(dash);
    }

    _parseColor(colorStr) {
      // Parse rgb(r, g, b) format
      const match = colorStr.match(/rgb\((\d+),\s*(\d+),\s*(\d+)\)/);
      if (match) {
        return [parseInt(match[1]), parseInt(match[2]), parseInt(match[3])];
      }
      return [0, 0, 0];
    }

    getImageData(x, y, w, h) {
      const data = new Uint8ClampedArray(w * h * 4);
      for (let py = 0; py < h; py++) {
        for (let px = 0; px < w; px++) {
          const pixel = this.pixelData.get(`${px},${py}`) || [0, 0, 0, 0];
          const idx = (py * w + px) * 4;
          data[idx] = pixel[0];
          data[idx + 1] = pixel[1];
          data[idx + 2] = pixel[2];
          data[idx + 3] = pixel[3];
        }
      }
      return {
        data: data,
        width: w,
        height: h,
      };
    }
  }
}

// Mock document.createElement
if (typeof document === 'undefined') {
  global.document = {
    createElement(tag) {
      if (tag === 'canvas') {
        return new HTMLCanvasElement();
      }
      throw new Error(`Unsupported element: ${tag}`);
    },
  };
}

// Mock requestAnimationFrame for Node.js environment
if (typeof requestAnimationFrame === 'undefined') {
  global.requestAnimationFrame = (callback) => {
    // In tests, just call immediately instead of scheduling
    return 0;
  };
}

// Run tests
const runner = new TestRunner();

runner.describe('Canvas Module', () => {
  runner.it('should render a single cell with glyph and colors', () => {
    const canvas = new Canvas(document.createElement('canvas'), 80, 25);
    canvas.setCell(0, 0, 65, [255, 255, 255], [0, 0, 0]); // 'A' in white on black

    // Verify the cell was stored correctly
    const cell = canvas.getCell(0, 0);
    expect(cell.glyph).toBe(65); // 'A'
    expect(cell.fg[0]).toBe(255); // Red component of white
    expect(cell.bg[0]).toBe(0); // Red component of black background

    // Verify we can render without errors
    canvas.render();
    const imageData = canvas.getImageData();
    expect(imageData.data.length).toBeGreaterThan(0);
  });


  runner.it('should return defensive copy from getCell() - mutating returned cell does not corrupt canvas', () => {
    const canvas = new Canvas(document.createElement('canvas'), 80, 25);
    canvas.setCell(5, 10, 65, [255, 0, 0], [0, 0, 255]); // 'A' in red on blue

    // Get the cell and mutate the returned object
    const cell = canvas.getCell(5, 10);
    cell.glyph = 999;
    cell.fg[0] = 100;
    cell.fg[1] = 100;
    cell.bg[2] = 100;

    // Original cell should be unchanged
    const original = canvas.getCell(5, 10);
    expect(original.glyph).toBe(65);
    expect(original.fg[0]).toBe(255);
    expect(original.fg[1]).toBe(0);
    expect(original.fg[2]).toBe(0);
    expect(original.bg[0]).toBe(0);
    expect(original.bg[1]).toBe(0);
    expect(original.bg[2]).toBe(255);
  });


  runner.it('should detach mouse event handlers on dispose()', () => {
    const canvasElement = document.createElement('canvas');
    const listeners = new Map();

    // Mock addEventListener/removeEventListener to track calls
    canvasElement.addEventListener = function(event, handler) {
      if (!listeners.has(event)) {
        listeners.set(event, []);
      }
      listeners.get(event).push(handler);
    };

    canvasElement.removeEventListener = function(event, handler) {
      if (listeners.has(event)) {
        const arr = listeners.get(event);
        const idx = arr.indexOf(handler);
        if (idx > -1) {
          arr.splice(idx, 1);
        }
      }
    };

    const canvas = new Canvas(canvasElement, 80, 25);

    // Verify handlers were attached
    expect(listeners.get('mousedown').length).toBe(1);
    expect(listeners.get('mousemove').length).toBe(1);
    expect(listeners.get('mouseup').length).toBe(1);
    expect(listeners.get('mouseleave').length).toBe(1);

    // Dispose should remove all handlers
    canvas.dispose();

    // Verify all handlers were removed
    expect(listeners.get('mousedown').length).toBe(0);
    expect(listeners.get('mousemove').length).toBe(0);
    expect(listeners.get('mouseup').length).toBe(0);
    expect(listeners.get('mouseleave').length).toBe(0);
  });

  runner.it('should prefer pointer event handlers when PointerEvent is available', () => {
    const originalPointerEvent = global.PointerEvent;
    global.PointerEvent = class {};

    const listeners = new Map([
      ['pointerdown', []],
      ['pointermove', []],
      ['pointerup', []],
      ['pointerleave', []],
      ['pointercancel', []],
    ]);
    const canvasElement = document.createElement('canvas');
    canvasElement.style = {};
    canvasElement.addEventListener = function(event, handler) {
      if (!listeners.has(event)) listeners.set(event, []);
      listeners.get(event).push(handler);
    };
    canvasElement.removeEventListener = function(event, handler) {
      if (!listeners.has(event)) return;
      const arr = listeners.get(event);
      const idx = arr.indexOf(handler);
      if (idx > -1) arr.splice(idx, 1);
    };

    const canvas = new Canvas(canvasElement, 8, 8);
    expect(listeners.get('pointerdown').length).toBe(1);
    expect(listeners.get('pointermove').length).toBe(1);
    expect(listeners.get('pointerup').length).toBe(1);
    expect(listeners.get('pointerleave').length).toBe(1);
    expect(listeners.get('pointercancel').length).toBe(1);
    expect(canvasElement.style.touchAction).toBe('none');
    canvas.dispose();

    if (typeof originalPointerEvent === 'undefined') delete global.PointerEvent;
    else global.PointerEvent = originalPointerEvent;
  });

  runner.it('should change font size and update canvas dimensions', () => {
    const canvas = new Canvas(document.createElement('canvas'), 80, 25);
    expect(canvas.cellSizePixels).toBe(12); // Default

    canvas.setFontSize(16);
    expect(canvas.cellSizePixels).toBe(16);
    expect(canvas.canvasElement.width).toBe(80 * 16);
    expect(canvas.canvasElement.height).toBe(25 * 16);
  });

  runner.it('should throw error on invalid font size', () => {
    const canvas = new Canvas(document.createElement('canvas'), 80, 25);

    let errorThrown = false;
    try {
      canvas.setFontSize(7);
    } catch (e) {
      errorThrown = true;
      expect(e.message).toBe('Font size must be 8, 10, 12, or 16 pixels');
    }
    if (!errorThrown) {
      throw new Error('Expected error for invalid font size 7');
    }

    errorThrown = false;
    try {
      canvas.setFontSize(13);
    } catch (e) {
      errorThrown = true;
      expect(e.message).toBe('Font size must be 8, 10, 12, or 16 pixels');
    }
    if (!errorThrown) {
      throw new Error('Expected error for invalid font size 13');
    }

    errorThrown = false;
    try {
      canvas.setFontSize(20);
    } catch (e) {
      errorThrown = true;
      expect(e.message).toBe('Font size must be 8, 10, 12, or 16 pixels');
    }
    if (!errorThrown) {
      throw new Error('Expected error for invalid font size 20');
    }
  });

  runner.it('should re-render when font size changes', () => {
    const canvas = new Canvas(document.createElement('canvas'), 80, 25);
    canvas.setCell(0, 0, 65, [255, 255, 255], [0, 0, 0]); // 'A'

    const oldWidth = canvas.canvasElement.width;
    const oldHeight = canvas.canvasElement.height;

    canvas.setFontSize(16);

    expect(canvas.canvasElement.width).toBe(oldWidth * (16 / 12));
    expect(canvas.canvasElement.height).toBe(oldHeight * (16 / 12));

    // Cell data should still be intact after re-render
    const cell = canvas.getCell(0, 0);
    expect(cell.glyph).toBe(65);
    expect(cell.fg).toEqual([255, 255, 255]);
    expect(cell.bg).toEqual([0, 0, 0]);
  });

  runner.it('should render selection outline when SelectTool has active selection', () => {
    const canvasElement = document.createElement('canvas');
    const canvas = new Canvas(canvasElement, 4, 4);

    // Create a mock SelectTool with active selection
    const mockSelectTool = {
      getSelectionBounds: () => ({
        x: 1,
        y: 1,
        width: 2,
        height: 2,
      }),
    };

    canvas.setSelectionTool(mockSelectTool);

    // Verify that setSelectionTool was called and stored
    expect(canvas.selectionTool).toBe(mockSelectTool);

    // Render and verify no errors
    canvas.render();

    // Verify that strokeRect was called with correct pixel bounds
    // Bounds (x:1, y:1, w:2, h:2) with cellSize 12 = pixels (12, 12, 24, 24)
    const ctx = canvasElement.getContext('2d');
    expect(ctx.strokeRectCalls.length).toBeGreaterThan(0);

    // Check that the last strokeRect call matches our expected bounds
    const lastCall = ctx.strokeRectCalls[ctx.strokeRectCalls.length - 1];
    expect(lastCall[0]).toBe(1 * 12); // x pixel
    expect(lastCall[1]).toBe(1 * 12); // y pixel
    expect(lastCall[2]).toBe(2 * 12); // width pixels
    expect(lastCall[3]).toBe(2 * 12); // height pixels
  });

  runner.it('should animate selection outline with marching ants effect', () => {
    const canvasElement = document.createElement('canvas');
    const canvas = new Canvas(canvasElement, 4, 4);

    // Create a mock SelectTool with active selection
    const mockSelectTool = {
      getSelectionBounds: () => ({
        x: 0,
        y: 0,
        width: 2,
        height: 2,
      }),
    };

    canvas.setSelectionTool(mockSelectTool);

    const ctx = canvasElement.getContext('2d');

    // First render - animation frame 0
    canvas.render();
    const firstDashOffsets = [...ctx.setLineDashCalls]; // Copy call history
    const firstAnimFrame = canvas._animationFrame;

    // Second render - animation frame 1
    canvas.render();
    const secondAnimFrame = canvas._animationFrame;

    // Animation frame should increment
    expect(secondAnimFrame).toBe(firstAnimFrame + 1);

    // With active selection, there should be setLineDash calls
    expect(ctx.setLineDashCalls.length).toBeGreaterThan(0);
  });

  runner.it('should use yellow dashed line for selection outline', () => {
    const canvasElement = document.createElement('canvas');
    const canvas = new Canvas(canvasElement, 4, 4);

    // Create a mock SelectTool with active selection
    const mockSelectTool = {
      getSelectionBounds: () => ({
        x: 0,
        y: 0,
        width: 2,
        height: 2,
      }),
    };

    canvas.setSelectionTool(mockSelectTool);
    canvas.render();

    const ctx = canvasElement.getContext('2d');

    // Verify yellow stroke style
    expect(ctx.strokeStyle).toBe('#FFFF00');

    // Verify dashed line pattern (4px dash, 4px gap)
    expect(ctx.setLineDashCalls.length).toBeGreaterThan(0);
    const dashPattern = ctx.setLineDashCalls[ctx.setLineDashCalls.length - 2]; // Second to last is the dash pattern
    expect(JSON.stringify(dashPattern)).toBe(JSON.stringify([4, 4]));
  });

  runner.it('should not render selection outline when no SelectTool is set', () => {
    const canvasElement = document.createElement('canvas');
    const canvas = new Canvas(canvasElement, 4, 4);

    // Don't set a selection tool
    canvas.render();

    const ctx = canvasElement.getContext('2d');
    expect(ctx.strokeRectCalls.length).toBe(0);
  });

  runner.it('should not render selection outline when SelectTool has no selection', () => {
    const canvasElement = document.createElement('canvas');
    const canvas = new Canvas(canvasElement, 4, 4);

    // Create a mock SelectTool with NO active selection
    const mockSelectTool = {
      getSelectionBounds: () => null,
    };

    canvas.setSelectionTool(mockSelectTool);
    canvas.render();

    const ctx = canvasElement.getContext('2d');
    expect(ctx.strokeRectCalls.length).toBe(0);
  });

  runner.it('should use a darker grid overlay stroke for whole-sheet visibility', () => {
    const canvasElement = document.createElement('canvas');
    const canvas = new Canvas(canvasElement, 4, 4);

    canvas.setGridVisible(true);
    const ctx = canvasElement.getContext('2d');

    expect(ctx.strokeStyle).toBe('rgba(48,72,96,0.92)');
  });

  runner.it('should composite multiple visible layers in z-order', () => {
    const canvas = new Canvas(document.createElement('canvas'), 4, 4);
    const layerStack = new LayerStack(4, 4);

    layerStack.addLayer('Layer 1');
    layerStack.addLayer('Layer 2');

    const layers = layerStack.getLayers();
    const layer1 = layers[0];
    layer1.setCell(0, 0, 65, [255, 0, 0], [0, 0, 0]); // Red 'A'

    const layer2 = layers[1];
    layer2.setCell(0, 0, 66, [0, 255, 0], [0, 0, 0]); // Green 'B'

    canvas.setLayerStack(layerStack);
    canvas.render();

    const renderedCell = canvas.getCell(0, 0);
    expect(renderedCell.glyph).toBe(66); // Green 'B' from top layer
  });

  runner.it('should skip hidden layers when compositing', () => {
    const canvas = new Canvas(document.createElement('canvas'), 4, 4);
    const layerStack = new LayerStack(4, 4);

    layerStack.addLayer('Layer 1');
    layerStack.addLayer('Layer 2');

    const layers = layerStack.getLayers();
    const layer1 = layers[0];
    layer1.setCell(0, 0, 65, [255, 0, 0], [0, 0, 0]);

    const layer2 = layers[1];
    layer2.setCell(0, 0, 66, [0, 255, 0], [0, 0, 0]);
    layer2.setVisible(false); // Hide layer 2

    canvas.setLayerStack(layerStack);
    canvas.render();

    const renderedCell = canvas.getCell(0, 0);
    expect(renderedCell.glyph).toBe(65); // Red 'A' from layer 1
  });
});

runner.report();
