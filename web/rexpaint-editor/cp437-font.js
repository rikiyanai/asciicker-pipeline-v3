/**
 * CP437 Font Module - Handles CP437 glyph rendering from bitmap spritesheet
 *
 * Loads a CP437 spritesheet (16x16 grid of glyphs) and provides methods to:
 * - Extract individual glyphs with caching
 * - Draw glyphs to canvas contexts with color blending
 * - Support variable glyph dimensions (12x12, 16x16, etc.)
 */

export class CP437Font {
  /**
   * Create a CP437 font renderer from a spritesheet
   * @param {string} spriteSheetUrl - URL to the CP437 spritesheet PNG
   * @param {number} glyphWidth - Width of each glyph in pixels (default 12)
   * @param {number} glyphHeight - Height of each glyph in pixels (default 12)
   */
  constructor(spriteSheetUrl, glyphWidth = 12, glyphHeight = 12) {
    this.spriteSheetUrl = spriteSheetUrl;
    this.glyphWidth = glyphWidth;
    this.glyphHeight = glyphHeight;
    this.spriteSheet = null;
    this.atlasCanvas = null;
    this.atlasCtx = null;
    this.glyphCache = new Map(); // Maps glyph code (0-255) to extracted ImageData
    this.loadPromise = null;
  }

  /**
   * Load the CP437 spritesheet image
   * @returns {Promise<void>}
   */
  async load() {
    if (this.loadPromise) {
      return this.loadPromise;
    }

    this.loadPromise = new Promise((resolve, reject) => {
      const image = new Image();
      image.crossOrigin = 'anonymous';

      image.onload = () => {
        // Create a canvas copy of the loaded image for efficient access
        const canvas = document.createElement('canvas');
        canvas.width = image.width;
        canvas.height = image.height;
        const ctx = canvas.getContext('2d');
        ctx.drawImage(image, 0, 0);

        this.spriteSheet = canvas;
        this._buildAtlas();
        resolve();
      };

      image.onerror = () => {
        reject(new Error(`Failed to load CP437 spritesheet: ${this.spriteSheetUrl}`));
      };

      image.src = this.spriteSheetUrl;
    });

    return this.loadPromise;
  }

  /**
   * Create a canvas element compatible with browser and test environments.
   * @param {number} width
   * @param {number} height
   * @returns {HTMLCanvasElement|OffscreenCanvas}
   * @private
   */
  _createCanvas(width, height) {
    if (typeof OffscreenCanvas !== 'undefined') {
      return new OffscreenCanvas(width, height);
    }
    if (typeof document !== 'undefined' && document.createElement) {
      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;
      return canvas;
    }
    if (typeof HTMLCanvasElement !== 'undefined') {
      const canvas = new HTMLCanvasElement();
      canvas.width = width;
      canvas.height = height;
      return canvas;
    }
    throw new Error('No canvas implementation available to build CP437 atlas.');
  }

  /**
   * Build the atlas canvas from the loaded sprite sheet.
   * @private
   */
  _buildAtlas() {
    if (!this.spriteSheet) {
      return;
    }

    const needsNewAtlas =
      !this.atlasCanvas ||
      this.atlasCanvas.width !== this.spriteSheet.width ||
      this.atlasCanvas.height !== this.spriteSheet.height;

    if (needsNewAtlas) {
      this.atlasCanvas = this._createCanvas(this.spriteSheet.width, this.spriteSheet.height);
      this.atlasCtx = this.atlasCanvas.getContext('2d');
      if (!this.atlasCtx) {
        throw new Error('Failed to get atlas canvas context.');
      }
    }

    const sourceCtx = this.spriteSheet.getContext && this.spriteSheet.getContext('2d');
    if (!sourceCtx || typeof sourceCtx.getImageData !== 'function' || typeof this.atlasCtx.createImageData !== 'function') {
      this.atlasCtx.drawImage(this.spriteSheet, 0, 0);
      return;
    }

    const sourceImage = sourceCtx.getImageData(0, 0, this.spriteSheet.width, this.spriteSheet.height);
    const atlasImage = this.atlasCtx.createImageData(this.spriteSheet.width, this.spriteSheet.height);
    const sourceData = sourceImage.data;
    const atlasData = atlasImage.data;

    for (let i = 0; i < sourceData.length; i += 4) {
      const luminance = ((sourceData[i] + sourceData[i + 1] + sourceData[i + 2]) / 3) | 0;
      const alpha = sourceData[i + 3] === 0 ? 0 : luminance;
      atlasData[i] = 255;
      atlasData[i + 1] = 255;
      atlasData[i + 2] = 255;
      atlasData[i + 3] = alpha;
    }

    this.atlasCtx.putImageData(atlasImage, 0, 0);
  }

  /**
   * Ensure the atlas exists before attempting atlas-backed rendering.
   * @private
   */
  _ensureAtlas() {
    if (!this.atlasCanvas && this.spriteSheet) {
      this._buildAtlas();
    }
    return this.atlasCanvas;
  }

  /**
   * Get the atlas canvas, building it on demand if needed.
   * @returns {HTMLCanvasElement|OffscreenCanvas|null}
   */
  getAtlas() {
    return this._ensureAtlas();
  }

  /**
   * Extract a single glyph from the spritesheet
   * Spritesheet layout: 16 glyphs per row (columns 0-15)
   * Code 0-15 → row 0, 16-31 → row 1, etc.
   *
   * @param {number} code - CP437 glyph code (0-255)
   * @returns {ImageData} Image data for the glyph (dimensions: glyphWidth x glyphHeight)
   * @throws {Error} If code is outside 0-255 range or spritesheet not loaded
   */
  getGlyph(code) {
    // Validate code range
    if (code < 0 || code > 255) {
      throw new Error(`Invalid glyph code ${code}. Must be 0-255.`);
    }

    // Return cached glyph if available
    if (this.glyphCache.has(code)) {
      return this.glyphCache.get(code);
    }

    // Ensure spritesheet is loaded
    if (!this.spriteSheet) {
      throw new Error('Spritesheet not loaded. Call load() first.');
    }

    // Calculate spritesheet coordinates
    // Code: 0-15 (row 0), 16-31 (row 1), ..., 240-255 (row 15)
    const col = code % 16;
    const row = Math.floor(code / 16);
    const sx = col * this.glyphWidth;
    const sy = row * this.glyphHeight;

    // Extract glyph from spritesheet using a temporary canvas
    const glyphCanvas = document.createElement('canvas');
    glyphCanvas.width = this.glyphWidth;
    glyphCanvas.height = this.glyphHeight;
    const glyphCtx = glyphCanvas.getContext('2d');

    glyphCtx.drawImage(
      this.spriteSheet,
      sx,
      sy,
      this.glyphWidth,
      this.glyphHeight,
      0,
      0,
      this.glyphWidth,
      this.glyphHeight
    );

    // Get image data and cache it
    const imageData = glyphCtx.getImageData(0, 0, this.glyphWidth, this.glyphHeight);
    this.glyphCache.set(code, imageData);

    return imageData;
  }

  /**
   * Draw a glyph to a canvas context with color blending
   * Uses the glyph's alpha channel to blend the foreground color.
   * Uses a single reusable offscreen canvas to avoid per-call allocation.
   *
   * @param {CanvasRenderingContext2D} ctx - Target canvas context
   * @param {number} code - CP437 glyph code (0-255)
   * @param {number} x - Pixel X coordinate to draw at
   * @param {number} y - Pixel Y coordinate to draw at
   * @param {Array<number>} fg - Foreground color [R, G, B] (0-255)
   * @param {Array<number>} bg - Background color [R, G, B] (0-255)
   * @throws {Error} If code is invalid or glyph not available
   */
  drawGlyph(ctx, code, x, y, fg, bg) {
    if (code < 0 || code > 255) {
      throw new Error(`Invalid glyph code ${code}. Must be 0-255.`);
    }

    const fr = Array.isArray(fg) && fg.length >= 3 ? Math.max(0, Math.min(255, Math.round(fg[0]) || 0)) : 255;
    const fGreen = Array.isArray(fg) && fg.length >= 3 ? Math.max(0, Math.min(255, Math.round(fg[1]) || 0)) : 255;
    const fb = Array.isArray(fg) && fg.length >= 3 ? Math.max(0, Math.min(255, Math.round(fg[2]) || 0)) : 255;
    const br = Array.isArray(bg) && bg.length >= 3 ? Math.max(0, Math.min(255, Math.round(bg[0]) || 0)) : 0;
    const bGreen = Array.isArray(bg) && bg.length >= 3 ? Math.max(0, Math.min(255, Math.round(bg[1]) || 0)) : 0;
    const bb = Array.isArray(bg) && bg.length >= 3 ? Math.max(0, Math.min(255, Math.round(bg[2]) || 0)) : 0;

    // Draw background rectangle
    ctx.fillStyle = `rgb(${br},${bGreen},${bb})`;
    ctx.fillRect(x, y, this.glyphWidth, this.glyphHeight);

    const atlas = this._ensureAtlas();
    if (atlas && ctx && typeof ctx.drawImage === 'function' && typeof ctx.createImageData === 'function') {
      if (!this._tintCanvas) {
        this._tintCanvas = this._createCanvas(this.glyphWidth, this.glyphHeight);
        this._tintCtx = this._tintCanvas.getContext('2d');
        if (!this._tintCtx) {
          this._tintCanvas = null;
        }
      }

      if (this._tintCtx && typeof this._tintCtx.clearRect === 'function') {
        const col = code % 16;
        const row = Math.floor(code / 16);
        const sx = col * this.glyphWidth;
        const sy = row * this.glyphHeight;

        this._tintCtx.clearRect(0, 0, this.glyphWidth, this.glyphHeight);
        this._tintCtx.globalCompositeOperation = 'source-over';
        this._tintCtx.drawImage(
          atlas,
          sx,
          sy,
          this.glyphWidth,
          this.glyphHeight,
          0,
          0,
          this.glyphWidth,
          this.glyphHeight
        );
        this._tintCtx.globalCompositeOperation = 'source-in';
        this._tintCtx.fillStyle = `rgb(${fr},${fGreen},${fb})`;
        this._tintCtx.fillRect(0, 0, this.glyphWidth, this.glyphHeight);
        this._tintCtx.globalCompositeOperation = 'source-over';
        ctx.drawImage(this._tintCanvas, x, y);
        return;
      }
    }

    // Fallback: blend the cached glyph mask per call if no atlas buffer is available.
    const glyphData = this.getGlyph(code);
    const data = glyphData.data;

    // Lazy-init single reusable offscreen buffer
    if (!this._blendCanvas) {
      this._blendCanvas = this._createCanvas(this.glyphWidth, this.glyphHeight);
      this._blendCtx = this._blendCanvas.getContext('2d');
      this._blendImageData = this._blendCtx.createImageData(this.glyphWidth, this.glyphHeight);
    }

    const blendedPixels = this._blendImageData.data;

    // The bundled CP437 sheet is RGB (white glyphs on black), not RGBA.
    // Use source luminance as the glyph mask.
    for (let i = 0; i < data.length; i += 4) {
      const luminance = (data[i] + data[i + 1] + data[i + 2]) / 3 | 0;
      if (luminance > 0) {
        blendedPixels[i] = fr;
        blendedPixels[i + 1] = fGreen;
        blendedPixels[i + 2] = fb;
        blendedPixels[i + 3] = luminance;
      } else {
        blendedPixels[i + 3] = 0;
      }
    }

    this._blendCtx.putImageData(this._blendImageData, 0, 0);
    ctx.drawImage(this._blendCanvas, x, y);
  }

  /**
   * Clear the glyph cache (used when font properties change)
   */
  clearCache() {
    this.glyphCache.clear();
  }
}
