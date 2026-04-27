/**
 * Undo/Redo Stack Tests
 *
 * Run via js_repl import or an ESM-capable runner.
 */

import { UndoStack } from '../../web/rexpaint-editor/undo-stack.js';
import { Canvas } from '../../web/rexpaint-editor/canvas.js';
import { CellTool } from '../../web/rexpaint-editor/tools/cell-tool.js';

class TestRunner {
  constructor() {
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
  toBeNull() {
    if (value !== null) {
      throw new Error(`Expected null, got ${value}`);
    }
  },
});

if (typeof HTMLCanvasElement === 'undefined') {
  global.HTMLCanvasElement = class {
    constructor() {
      this.width = 0;
      this.height = 0;
      this._context = null;
      this.style = {};
      this.parentElement = null;
    }

    getContext() {
      if (!this._context) {
        this._context = new CanvasContext(this);
      }
      return this._context;
    }

    addEventListener() {}
    removeEventListener() {}
    getBoundingClientRect() {
      return {
        left: 0,
        top: 0,
        width: this.width || 1,
        height: this.height || 1,
      };
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
      this.globalCompositeOperation = 'source-over';
    }

    fillRect() {}
    strokeRect() {}
    beginPath() {}
    moveTo() {}
    lineTo() {}
    stroke() {}
    fillText() {}
    drawImage() {}
    clearRect() {}
    setLineDash() {}
    createImageData(w, h) {
      return {
        data: new Uint8ClampedArray(w * h * 4),
        width: w,
        height: h,
      };
    }
    putImageData() {}
    getImageData(x, y, w, h) {
      return {
        data: new Uint8ClampedArray(w * h * 4),
        width: w,
        height: h,
      };
    }
  }
}

if (typeof document === 'undefined') {
  global.document = {
    createElement(tag) {
      if (tag === 'canvas') {
        return new HTMLCanvasElement();
      }
      return {
        addEventListener() {},
        removeEventListener() {},
        appendChild() {},
        classList: {
          add() {},
          remove() {},
          toggle() {},
        },
        style: {},
        textContent: '',
      };
    },
    getElementById() {
      return null;
    },
    querySelector() {
      return null;
    },
    querySelectorAll() {
      return [];
    },
  };
}

if (typeof window === 'undefined') {
  global.window = {
    addEventListener() {},
    removeEventListener() {},
  };
}

if (typeof requestAnimationFrame === 'undefined') {
  global.requestAnimationFrame = () => 0;
}

if (typeof cancelAnimationFrame === 'undefined') {
  global.cancelAnimationFrame = () => {};
}

function createEditorHarness() {
  const canvas = new Canvas(document.createElement('canvas'), 10, 10);
  const tool = new CellTool();
  const undoStack = new UndoStack(50);
  tool.setCanvas(canvas);
  tool.setGlyph(65);
  tool.setColors([255, 0, 0], [0, 0, 0]);
  return { canvas, tool, undoStack };
}

const runner = new TestRunner();

runner.describe('UndoStack', () => {
  runner.it('stores command objects and executes undo/redo callbacks', () => {
    const stack = new UndoStack();
    const log = [];
    const command = {
      undo: () => log.push('undo'),
      redo: () => log.push('redo'),
    };

    stack.push(command);
    expect(stack.canUndo()).toBeTruthy();

    const undone = stack.undo();
    expect(undone).toBe(command);
    expect(log).toEqual(['undo']);
    expect(stack.canRedo()).toBeTruthy();

    const redone = stack.redo();
    expect(redone).toBe(command);
    expect(log).toEqual(['undo', 'redo']);
  });

  runner.it('clears redo history when a new command is pushed after undo', () => {
    const stack = new UndoStack();
    const commandA = { undo() {}, redo() {} };
    const commandB = { undo() {}, redo() {} };

    stack.push(commandA);
    stack.undo();
    expect(stack.canRedo()).toBeTruthy();

    stack.push(commandB);
    expect(stack.canRedo()).toBeFalsy();
  });

  runner.it('returns null when undo or redo is unavailable', () => {
    const stack = new UndoStack();
    expect(stack.undo()).toBeNull();
    expect(stack.redo()).toBeNull();
  });

  runner.it('enforces max history size', () => {
    const stack = new UndoStack(2);
    stack.push({ undo() {}, redo() {} });
    stack.push({ undo() {}, redo() {} });
    stack.push({ undo() {}, redo() {} });
    expect(stack.undoStack.length).toBe(2);
  });
});

runner.describe('Canvas Command Replay', () => {
  runner.it('round-trips a painted cell through undo and redo', () => {
    const { canvas, tool, undoStack } = createEditorHarness();

    canvas.beginOperation('paint');
    tool.paint(2, 3);
    undoStack.push(canvas.endOperation());
    expect(canvas.getCell(2, 3).glyph).toBe(65);
    expect(undoStack.canUndo()).toBeTruthy();

    undoStack.undo();
    expect(canvas.getCell(2, 3).glyph).toBe(0);
    expect(undoStack.canRedo()).toBeTruthy();

    undoStack.redo();
    expect(canvas.getCell(2, 3).glyph).toBe(65);
  });

  runner.it('groups a drag stroke into a single undo command', () => {
    const { canvas, tool, undoStack } = createEditorHarness();

    canvas.beginOperation('drag');
    tool.startDrag(1, 1);
    tool.drag(2, 1);
    tool.drag(3, 1);
    tool.endDrag();
    undoStack.push(canvas.endOperation());

    expect(canvas.getCell(1, 1).glyph).toBe(65);
    expect(canvas.getCell(2, 1).glyph).toBe(65);
    expect(canvas.getCell(3, 1).glyph).toBe(65);
    expect(undoStack.undoStack.length).toBe(1);

    undoStack.undo();
    expect(canvas.getCell(1, 1).glyph).toBe(0);
    expect(canvas.getCell(2, 1).glyph).toBe(0);
    expect(canvas.getCell(3, 1).glyph).toBe(0);

    undoStack.redo();
    expect(canvas.getCell(1, 1).glyph).toBe(65);
    expect(canvas.getCell(2, 1).glyph).toBe(65);
    expect(canvas.getCell(3, 1).glyph).toBe(65);
  });
});

runner.report();
