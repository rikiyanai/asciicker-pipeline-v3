/**
 * CP437 Font Module Tests
 *
 * Run with: node tests/web/rexpaint-editor-cp437-font.test.js
 * Or via test framework: npm test -- tests/web/rexpaint-editor-cp437-font.test.js
 */

import { CP437Font } from '../../web/rexpaint-editor/cp437-font.js';

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
  toBeDefined() {
    if (value === undefined) {
      throw new Error(`Expected defined value, got undefined`);
    }
  },
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
  toThrow() {
    throw new Error('toThrow() should be used with a function wrapped in () =>');
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
      this.font = '12px monospace';
      this.textAlign = 'left';
      this.textBaseline = 'top';
      this.globalCompositeOperation = 'source-over';
      this.pixelData = new Map();
    }

    fillRect(x, y, w, h) {
      const [r, g, b] = this._parseColor(this.fillStyle);
      for (let py = y; py < y + h; py++) {
        for (let px = x; px < x + w; px++) {
          this.pixelData.set(`${px},${py}`, [r, g, b, 255]);
        }
      }
    }

    drawImage(source, sx, sy, sw, sh, dx, dy, dw, dh) {
      // Mock drawImage - store that it was called
      if (!this.drawImageCalls) {
        this.drawImageCalls = [];
      }
      this.drawImageCalls.push({ source, sx, sy, sw, sh, dx, dy, dw, dh });
    }

    clearRect(x, y, w, h) {
      for (let py = y; py < y + h; py++) {
        for (let px = x; px < x + w; px++) {
          this.pixelData.delete(`${px},${py}`);
        }
      }
    }

    fillText(text, x, y, maxWidth) {}

    createImageData(w, h) {
      return {
        data: new Uint8ClampedArray(w * h * 4),
        width: w,
        height: h,
      };
    }

    putImageData(imageData, x, y) {
      // Mock putImageData
      const { data, width, height } = imageData;
      for (let py = 0; py < height; py++) {
        for (let px = 0; px < width; px++) {
          const idx = (py * width + px) * 4;
          this.pixelData.set(`${x + px},${y + py}`, [data[idx], data[idx + 1], data[idx + 2], data[idx + 3]]);
        }
      }
    }

    _parseColor(colorStr) {
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

// Mock Image for Node.js environment
if (typeof Image === 'undefined') {
  global.Image = class {
    constructor() {
      this.width = 0;
      this.height = 0;
      this.onload = null;
      this.onerror = null;
      this.src = '';
    }
  };
}

// Run tests
const runner = new TestRunner();

runner.describe('CP437Font', () => {

  runner.it('should cache glyphs after first access', () => {
    const cp437 = new CP437Font('fonts/cp437-12x12.png', 12, 12);
    cp437.spriteSheet = document.createElement('canvas'); // Mock spritesheet
    cp437.spriteSheet.width = 192; // 16 glyphs * 12 pixels
    cp437.spriteSheet.height = 192; // 16 rows * 12 pixels

    const glyph1 = cp437.getGlyph(65);
    const glyph2 = cp437.getGlyph(65);

    if (glyph1 !== glyph2) {
      throw new Error('Expected cached glyph to be the same object');
    }
  });


  runner.it('should extract glyphs from correct spritesheet position', () => {
    const cp437 = new CP437Font('fonts/cp437-12x12.png', 12, 12);
    cp437.spriteSheet = document.createElement('canvas');
    cp437.spriteSheet.width = 192;
    cp437.spriteSheet.height = 192;
    cp437.spriteSheet.getContext = function (type) {
      return {
        drawImage: () => {},
        getImageData: () => {
          const data = new Uint8ClampedArray(192 * 192 * 4);
          for (let y = 0; y < 192; y++) {
            for (let x = 0; x < 192; x++) {
              const idx = (y * 192 + x) * 4;
              const glyphX = x % 12;
              const glyphY = y % 12;
              const luminance = (glyphX === 0 || glyphY === 0) ? 255 : 0;
              data[idx] = luminance;
              data[idx + 1] = luminance;
              data[idx + 2] = luminance;
              data[idx + 3] = 255;
            }
          }
          return {
            data,
            width: 192,
            height: 192,
          };
        },
      };
    };

    // Glyph 65 ('A') should be at row 4, col 1 (65 = 4*16 + 1)
    // Position in spritesheet: x=12, y=48
    const glyph = cp437.getGlyph(65);
    expect(glyph).toBeDefined();
  });

  runner.it('should build an atlas once and render glyphs through drawImage', () => {
    const cp437 = new CP437Font('fonts/cp437-12x12.png', 12, 12);
    cp437.spriteSheet = document.createElement('canvas');
    cp437.spriteSheet.width = 192;
    cp437.spriteSheet.height = 192;
    cp437.spriteSheet.getContext = function (type) {
      return {
        drawImage: () => {},
        getImageData: () => {
          const data = new Uint8ClampedArray(192 * 192 * 4);
          for (let y = 0; y < 192; y++) {
            for (let x = 0; x < 192; x++) {
              const idx = (y * 192 + x) * 4;
              const lit = (x % 12 === 0 || y % 12 === 0);
              const value = lit ? 255 : 0;
              data[idx] = value;
              data[idx + 1] = value;
              data[idx + 2] = value;
              data[idx + 3] = 255;
            }
          }
          return {
            data,
            width: 192,
            height: 192,
          };
        },
      };
    };

    cp437._buildAtlas();

    expect(cp437.atlasCanvas).toBeDefined();
    expect(cp437.atlasCanvas.width).toBe(192);
    expect(cp437.atlasCanvas.height).toBe(192);

    const atlasPixels = cp437.atlasCtx.getImageData(0, 0, 12, 12).data;
    if (atlasPixels[3] !== 255 || atlasPixels[(6 * 12 + 6) * 4 + 3] !== 0) {
      throw new Error('Expected atlas to contain transparent glyph masks');
    }

    const target = document.createElement('canvas').getContext('2d');
    cp437.drawGlyph(target, 65, 0, 0, [255, 255, 255], [0, 0, 0]);

    const tintedAtlas = cp437.getTintedAtlas([255, 255, 255]);
    if (!tintedAtlas) {
      throw new Error('Expected tinted atlas to be created');
    }

    if (cp437.getTintedAtlas([255, 255, 255]) !== tintedAtlas) {
      throw new Error('Expected tinted atlas cache to return the same canvas instance');
    }

    if (!target.drawImageCalls || target.drawImageCalls.length === 0) {
      throw new Error('Expected final glyph drawImage call');
    }

    const atlasCall = target.drawImageCalls[0];
    if (atlasCall.source !== tintedAtlas) {
      throw new Error('Expected final drawImage call to use the tinted atlas');
    }
  });

});

runner.report();
