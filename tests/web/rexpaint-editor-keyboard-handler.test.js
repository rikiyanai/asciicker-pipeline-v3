/**
 * Keyboard Handler Tests
 *
 * Run with: node tests/web/rexpaint-editor-keyboard-handler.test.js
 * Or via test framework: npm test -- tests/web/rexpaint-editor-keyboard-handler.test.js
 */

import { KeyboardHandler } from '../../web/rexpaint-editor/keyboard-handler.js';

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
  toHaveBeenCalled() {
    if (!value.called) {
      throw new Error(`Expected function to have been called`);
    }
  },
  toHaveBeenCalledWith(...args) {
    if (!value.called) {
      throw new Error(`Expected function to have been called`);
    }
    if (JSON.stringify(value.lastArgs) !== JSON.stringify(args)) {
      throw new Error(
        `Expected to be called with ${JSON.stringify(args)}, got ${JSON.stringify(value.lastArgs)}`
      );
    }
  },
  toHaveBeenCalledTimes(times) {
    if (value.callCount !== times) {
      throw new Error(`Expected to be called ${times} times, got ${value.callCount}`);
    }
  },
});

// Mock function helper
const vi = {
  fn: (implementation = () => {}) => {
    const fn = (...args) => {
      fn.called = true;
      fn.callCount++;
      fn.lastArgs = args;
      return implementation(...args);
    };
    fn.called = false;
    fn.callCount = 0;
    fn.lastArgs = [];
    return fn;
  },
};

// Mock EditorApp
class MockEditorApp {
  constructor() {
    this.activateTool = vi.fn();
    this.undo = vi.fn();
    this.redo = vi.fn();
  }
}

// Helper to create a mock keyboard event (Node.js compatible)
const createKeyboardEvent = (code, options = {}) => {
  return {
    code,
    ctrlKey: options.ctrlKey || false,
    key: options.key || code,
    bubbles: true,
    preventDefault: vi.fn(),
  };
};

// Run tests
const runner = new TestRunner();

runner.describe('KeyboardHandler', () => {
  runner.it('should be instantiated with an EditorApp reference', () => {
    const app = new MockEditorApp();
    const handler = new KeyboardHandler(app);
    expect(handler.app).toBe(app);
  });

  runner.it('should have a shortcuts map', () => {
    const app = new MockEditorApp();
    const handler = new KeyboardHandler(app);
    expect(typeof handler.shortcuts).toBe('object');
  });






  runner.it('should activate text tool on KeyT', () => {
    const app = new MockEditorApp();
    const handler = new KeyboardHandler(app);
    let keydownCallback = null;
    const mockElement = {
      addEventListener: vi.fn((event, callback) => {
        if (event === 'keydown') {
          keydownCallback = callback;
        }
      }),
    };
    handler.attach(mockElement);

    const event = createKeyboardEvent('KeyT');
    keydownCallback(event);

    expect(app.activateTool.called).toBe(true);
    expect(app.activateTool.lastArgs[0]).toBe('text');
  });

  runner.it('should undo on Ctrl+Z', () => {
    const app = new MockEditorApp();
    const handler = new KeyboardHandler(app);
    let keydownCallback = null;
    const mockElement = {
      addEventListener: vi.fn((event, callback) => {
        if (event === 'keydown') {
          keydownCallback = callback;
        }
      }),
    };
    handler.attach(mockElement);

    const event = createKeyboardEvent('KeyZ', { ctrlKey: true });
    keydownCallback(event);

    expect(app.undo.called).toBe(true);
  });

  runner.it('should NOT undo on plain Z key without Ctrl', () => {
    const app = new MockEditorApp();
    const handler = new KeyboardHandler(app);
    let keydownCallback = null;
    const mockElement = {
      addEventListener: vi.fn((event, callback) => {
        if (event === 'keydown') {
          keydownCallback = callback;
        }
      }),
    };
    handler.attach(mockElement);

    const event = createKeyboardEvent('KeyZ', { ctrlKey: false });
    keydownCallback(event);

    expect(app.undo.called).toBe(false);
  });

  runner.it('should redo on Ctrl+Y', () => {
    const app = new MockEditorApp();
    const handler = new KeyboardHandler(app);
    let keydownCallback = null;
    const mockElement = {
      addEventListener: vi.fn((event, callback) => {
        if (event === 'keydown') {
          keydownCallback = callback;
        }
      }),
    };
    handler.attach(mockElement);

    const event = createKeyboardEvent('KeyY', { ctrlKey: true });
    keydownCallback(event);

    expect(app.redo.called).toBe(true);
  });

  runner.it('should NOT redo on plain Y key without Ctrl', () => {
    const app = new MockEditorApp();
    const handler = new KeyboardHandler(app);
    let keydownCallback = null;
    const mockElement = {
      addEventListener: vi.fn((event, callback) => {
        if (event === 'keydown') {
          keydownCallback = callback;
        }
      }),
    };
    handler.attach(mockElement);

    const event = createKeyboardEvent('KeyY', { ctrlKey: false });
    keydownCallback(event);

    expect(app.redo.called).toBe(false);
  });

  runner.it('should prevent default on Ctrl+S', () => {
    const app = new MockEditorApp();
    const handler = new KeyboardHandler(app);
    let keydownCallback = null;
    const mockElement = {
      addEventListener: vi.fn((event, callback) => {
        if (event === 'keydown') {
          keydownCallback = callback;
        }
      }),
    };
    handler.attach(mockElement);

    const event = createKeyboardEvent('KeyS', { ctrlKey: true });
    keydownCallback(event);

    expect(event.preventDefault.called).toBe(true);
  });

  runner.it('should not prevent default on plain S key', () => {
    const app = new MockEditorApp();
    const handler = new KeyboardHandler(app);
    let keydownCallback = null;
    const mockElement = {
      addEventListener: vi.fn((event, callback) => {
        if (event === 'keydown') {
          keydownCallback = callback;
        }
      }),
    };
    handler.attach(mockElement);

    const event = createKeyboardEvent('KeyS', { ctrlKey: false });
    keydownCallback(event);

    expect(event.preventDefault.called).toBe(false);
  });

  runner.it('should attach event listener to element', () => {
    const app = new MockEditorApp();
    const handler = new KeyboardHandler(app);
    const mockElement = {
      addEventListener: vi.fn(),
    };
    handler.attach(mockElement);

    expect(mockElement.addEventListener.called).toBe(true);
  });

  runner.it('should ignore unknown key codes', () => {
    const app = new MockEditorApp();
    const handler = new KeyboardHandler(app);
    let keydownCallback = null;
    const mockElement = {
      addEventListener: vi.fn((event, callback) => {
        if (event === 'keydown') {
          keydownCallback = callback;
        }
      }),
    };
    handler.attach(mockElement);

    const event = createKeyboardEvent('KeyX');
    keydownCallback(event);

    expect(app.activateTool.called).toBe(false);
    expect(app.undo.called).toBe(false);
    expect(app.redo.called).toBe(false);
  });

  runner.it('should enable pan mode when Space key is pressed', () => {
    const app = new MockEditorApp();
    app.enablePanMode = vi.fn();
    const handler = new KeyboardHandler(app);
    let keydownCallback = null;
    const mockElement = {
      addEventListener: vi.fn((event, callback) => {
        if (event === 'keydown') {
          keydownCallback = callback;
        }
      }),
    };
    handler.attach(mockElement);

    const event = createKeyboardEvent('Space');
    event.preventDefault = vi.fn();
    keydownCallback(event);

    expect(app.enablePanMode.called).toBe(true);
  });

  runner.it('should disable pan mode when Space key is released', () => {
    const app = new MockEditorApp();
    app.disablePanMode = vi.fn();
    const handler = new KeyboardHandler(app);
    let keyupCallback = null;
    const mockElement = {
      addEventListener: vi.fn((event, callback) => {
        if (event === 'keyup') {
          keyupCallback = callback;
        }
      }),
    };
    handler.attach(mockElement);

    // Release Space (should disable)
    const keyUpEvent = createKeyboardEvent('Space');
    keyUpEvent.preventDefault = vi.fn();
    keyupCallback(keyUpEvent);

    expect(app.disablePanMode.called).toBe(true);
  });
});

runner.report();
