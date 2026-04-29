/**
 * Layer Stack Management
 *
 * Provides Layer and LayerStack classes for managing multiple drawing layers.
 * Each layer has independent cell data, visibility, and ordering.
 */

const MAX_LAYERS = 9;

function _createLayerCanvas(width, height) {
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
  throw new Error('No canvas implementation available for layer offscreen surfaces.');
}

export class Layer {
  /**
   * Create a layer
   * @param {number} id - Unique layer identifier
   * @param {string} name - Human-readable layer name
   * @param {number} width - Width in cells
   * @param {number} height - Height in cells
   */
  constructor(id, name, width, height) {
    this.id = id;
    this.name = name;
    this.visible = true;
    this.locked = false;
    this.opacity = 1; // 0-1 range, 1 = fully opaque
    this.width = width;
    this.height = height;
    this.offscreenCanvas = null;
    this.offscreenCtx = null;
    this.offscreenCellSize = 0;
    this.offscreenDirtyAll = true;
    this.offscreenDirtyCells = new Set();

    // Initialize empty cell grid
    this.data = Array.from({ length: height }, () =>
      Array.from({ length: width }, () => ({
        glyph: 0,
        fg: [255, 255, 255],
        bg: [0, 0, 0],
      }))
    );
  }

  /**
   * Set a cell's glyph and colors
   * @param {number} x - X coordinate
   * @param {number} y - Y coordinate
   * @param {number} glyph - CP437 glyph code
   * @param {number[]} fg - Foreground color [R, G, B]
   * @param {number[]} bg - Background color [R, G, B]
   */
  setCell(x, y, glyph, fg, bg) {
    if (x >= 0 && x < this.width && y >= 0 && y < this.height) {
      this.data[y][x] = { glyph, fg: [...fg], bg: [...bg] };
      this.offscreenDirtyCells.add(y * this.width + x);
    }
  }

  /**
   * Get a cell's data
   * @param {number} x - X coordinate
   * @param {number} y - Y coordinate
   * @returns {object|null} Cell data or null if out of bounds
   */
  getCell(x, y) {
    if (x >= 0 && x < this.width && y >= 0 && y < this.height) {
      return { ...this.data[y][x] };
    }
    return null;
  }

  /**
   * Set layer visibility
   * @param {boolean} visible - Whether layer should be visible
   */
  setVisible(visible) {
    this.visible = visible;
  }

  setLocked(locked) {
    this.locked = locked;
  }

  ensureOffscreen(cellSizePixels) {
    const widthPx = this.width * cellSizePixels;
    const heightPx = this.height * cellSizePixels;
    const needsNewSurface =
      !this.offscreenCanvas ||
      this.offscreenCanvas.width !== widthPx ||
      this.offscreenCanvas.height !== heightPx ||
      this.offscreenCellSize !== cellSizePixels;

    if (!needsNewSurface) {
      return;
    }

    this.offscreenCanvas = _createLayerCanvas(widthPx, heightPx);
    this.offscreenCtx = this.offscreenCanvas.getContext('2d');
    this.offscreenCellSize = cellSizePixels;
    this.offscreenDirtyAll = true;
    this.offscreenDirtyCells.clear();
  }

  markOffscreenDirty() {
    this.offscreenDirtyAll = true;
    this.offscreenDirtyCells.clear();
  }
}

export class LayerStack {
  /**
   * Create a layer stack
   * @param {number} width - Width of all layers in cells
   * @param {number} height - Height of all layers in cells
   */
  constructor(width, height) {
    this.width = width;
    this.height = height;
    this.layers = [];
    this.activeIndex = 0;
    this.offscreenCellSize = 0;

    // Create default layer
    this.addLayer('Layer 0');
  }

  /**
   * Add a new layer to the stack
   * @param {string} name - Layer name
   */
  addLayer(name) {
    if (this.layers.length >= MAX_LAYERS) {
      return false;
    }
    const layer = new Layer(this.layers.length, name, this.width, this.height);
    if (this.offscreenCellSize > 0) {
      layer.ensureOffscreen(this.offscreenCellSize);
    }
    this.layers.push(layer);
    this.activeIndex = this.layers.length - 1;
    return true;
  }

  /**
   * Remove a layer from the stack
   * @param {number} index - Layer index to remove
   */
  removeLayer(index) {
    if (this.layers.length > 1) {
      this.layers.splice(index, 1);
      if (this.activeIndex >= this.layers.length) {
        this.activeIndex = this.layers.length - 1;
      }
    }
  }

  /**
   * Move a layer to a new position in the stack
   * @param {number} fromIndex - Current layer index
   * @param {number} toIndex - Target layer index
   */
  moveLayer(fromIndex, toIndex) {
    const layer = this.layers.splice(fromIndex, 1)[0];
    this.layers.splice(toIndex, 0, layer);
    if (this.activeIndex === fromIndex) {
      this.activeIndex = toIndex;
    }
  }

  /**
   * Select/activate a layer by index
   * @param {number} index - Layer index
   */
  selectLayer(index) {
    if (index >= 0 && index < this.layers.length) {
      this.activeIndex = index;
    }
  }

  /**
   * Get the currently active layer
   * @returns {Layer} Active layer
   */
  getActiveLayer() {
    return this.layers[this.activeIndex];
  }

  /**
   * Get a copy of all layers
   * @returns {Layer[]} Array of layers
   */
  getLayers() {
    return [...this.layers];
  }

  ensureOffscreenCanvases(cellSizePixels) {
    this.offscreenCellSize = cellSizePixels;
    for (const layer of this.layers) {
      layer.ensureOffscreen(cellSizePixels);
      layer.markOffscreenDirty();
    }
  }
}
