/**
 * EditorApp Controller
 *
 * Orchestrates all editor components (Canvas, Palette, GlyphPicker, Tools).
 * Manages canonical editor state and wires component events to keep all tools in sync.
 *
 * State Management:
 * - activeGlyph: Current CP437 glyph code (0-255)
 * - activeFg/activeBg: Current color palette [r, g, b]
 * - activeApplyModes: Which attributes to apply when painting {glyph, foreground, background}
 * - activeTool: Currently active drawing tool (CellTool, LineTool, RectTool, etc.)
 *
 * Event Wiring:
 * - Palette emits 'color-changed' → EditorApp updates all tools
 * - Palette emits 'apply-mode-changed' → EditorApp updates all tools
 * - GlyphPicker emits 'select' → EditorApp updates all tools
 * - Canvas emits mouse events → EditorApp routes to activeTool.paint/startDrag/drag/endDrag
 */

import { FillTool } from './tools/fill-tool.js';
import { SelectTool } from './tools/select-tool.js';
import { KeyboardHandler } from './keyboard-handler.js';
import { UndoStack } from './undo-stack.js';
import { LayerStack } from './layer-stack.js';
import { XPFileReader } from './xp-file-reader.js';
import { XPFileWriter } from './xp-file-writer.js';

export class EditorApp {
  /**
   * Create a new EditorApp instance
   * @param {Object} config - Configuration object
   * @param {Canvas} config.canvas - The Canvas instance
   * @param {Palette} config.palette - The Palette instance
   * @param {GlyphPicker} config.glyphPicker - The GlyphPicker instance
   * @param {Array} config.tools - (Optional) Array of tool instances
   * @param {HTMLElement} config.modalElement - (Optional) Element to attach keyboard handler to
   */
  constructor({ canvas, palette, glyphPicker, tools = [], modalElement = null }) {
    this.canvas = canvas;
    this.palette = palette;
    this.glyphPicker = glyphPicker;
    this.tools = tools;

    // Wire EditorApp reference to Canvas for pan event delegation
    if (this.canvas) {
      this.canvas.editorApp = this;
    }

    // Tool references for keyboard shortcuts
    this.cellTool = null;
    this.lineTool = null;
    this.rectTool = null;
    this.ovalTool = null;
    this.fillTool = null;
    this.textTool = null;
    this.selectTool = null;

    // Canonical state
    this.activeGlyph = 0;
    this.activeFg = [255, 255, 255];
    this.activeBg = [0, 0, 0];
    this.activeApplyModes = {
      glyph: true,
      foreground: true,
      background: true,
    };
    this.activeTool = null;

    // Pan/drag state
    this.panMode = false;
    this.panStartX = 0;
    this.panStartY = 0;
    this.offsetX = 0;
    this.offsetY = 0;

    // Copy/paste state
    this.clipboard = null; // Stores {cells, bounds}
    this.pasteMode = false; // Whether we're in paste placement mode
    this.pasteOffset = { x: 0, y: 0 }; // Offset for paste cursor tracking
    this._pasteMoveListener = null; // Reference to mousemove listener for cleanup
    this._pasteClickListener = null; // Reference to click listener for cleanup

    // Bundle mode / action context (for workbench grid integration)
    this.currentAction = 'idle'; // Current action: 'idle', 'attack', 'death'
    this.bundleMode = false; // Whether editor is in bundle mode

    // Undo/Redo stack
    this.undoStack = new UndoStack(50);
    this._toolOperationOpen = false;

    // Store event unsubscribe functions for cleanup
    this._unsubscribers = [];

    // Pan error handler - ensures cursor is restored if exception occurs during panning
    this._panErrorHandler = (event) => {
      if (this.panMode) {
        console.error('Uncaught error during pan mode:', event.error);
        this.disablePanMode();
      }
    };

    // Attach global error listener for pan mode safety
    if (typeof window !== 'undefined') {
      window.addEventListener('error', this._panErrorHandler);
      this._unsubscribers.push(() => {
        window.removeEventListener('error', this._panErrorHandler);
      });
    }

    // Create keyboard handler
    this.keyboardHandler = new KeyboardHandler(this);
    if (modalElement) {
      this.keyboardHandler.attach(modalElement);
    }

    // Wire component events
    this._wireComponentEvents();

    // Set up apply mode toggle buttons
    this._setupApplyModeToggles();

    // Set up grid toggle button
    this._setupGridToggle();

    // Set up status bar
    this._setupStatusBar();

    // Set up layer panel
    this._setupLayerPanel();
  }

  /**
   * Set up status bar display elements and event handlers
   * Attaches mousemove and click listeners to canvas to update position and cell displays
   * @private
   */
  _setupStatusBar() {
    // Cache status bar element references
    this.statusBar = {
      posDisplay: document.getElementById('posDisplay'),
      cellDisplay: document.getElementById('cellDisplay'),
      toolDisplay: document.getElementById('toolDisplay'),
      modeDisplay: document.getElementById('modeDisplay'),
    };

    // Only set up if status bar elements exist (REXPaint editor modal)
    if (!this.statusBar.posDisplay) {
      return;
    }

    // Get the canvas element
    const canvasElement = document.getElementById('rexpaintCanvas');
    if (!canvasElement) {
      return;
    }

    // Handle canvas mousemove to update position and cell display
    canvasElement.addEventListener('mousemove', (e) => {
      const rect = canvasElement.getBoundingClientRect();
      const screenX = e.clientX - rect.left;
      const screenY = e.clientY - rect.top;

      // Convert screen coordinates to cell coordinates using canvas font size
      const pixelsPerCell = this.getFontSize() || 12;
      const cellX = Math.floor(screenX / pixelsPerCell);
      const cellY = Math.floor(screenY / pixelsPerCell);

      // Update position display
      this.statusBar.posDisplay.textContent = `Pos: ${cellX}, ${cellY}`;

      // Get current cell from canvas and display glyph info
      if (this.canvas && typeof this.canvas.getCell === 'function') {
        const cell = this.canvas.getCell(cellX, cellY);
        if (cell) {
          const glyphCode = cell.glyph || 0;
          const glyphChar = String.fromCharCode(glyphCode);
          this.statusBar.cellDisplay.textContent = `Cell: ${glyphCode} (${glyphChar})`;
        } else {
          this.statusBar.cellDisplay.textContent = 'Cell: (empty)';
        }
      }
    });

    // Handle canvas click to update position display (in addition to mousemove)
    canvasElement.addEventListener('click', (e) => {
      const rect = canvasElement.getBoundingClientRect();
      const screenX = e.clientX - rect.left;
      const screenY = e.clientY - rect.top;

      const pixelsPerCell = this.getFontSize() || 12;
      const cellX = Math.floor(screenX / pixelsPerCell);
      const cellY = Math.floor(screenY / pixelsPerCell);

      this.statusBar.posDisplay.textContent = `Pos: ${cellX}, ${cellY}`;
    });

    // Initialize tool display with default tool name
    this._updateToolDisplay();

    // Initialize mode display with current modes
    this._updateModeDisplay();
  }

  /**
   * Update the tool display in the status bar
   * Called when tool is activated
   * @private
   */
  _updateToolDisplay() {
    if (!this.statusBar || !this.statusBar.toolDisplay) {
      return;
    }

    if (this.activeTool && this.activeTool.name) {
      // Remove 'Tool' suffix if present (e.g., 'CellTool' -> 'Cell')
      const toolName = this.activeTool.name.replace(/Tool$/, '');
      this.statusBar.toolDisplay.textContent = `Tool: ${toolName}`;
    } else {
      this.statusBar.toolDisplay.textContent = 'Tool: Cell';
    }
  }

  /**
   * Update the mode display in the status bar with active apply modes
   * Shows which of G (glyph), F (foreground), B (background) are active
   * @private
   */
  _updateModeDisplay() {
    if (!this.statusBar || !this.statusBar.modeDisplay) {
      return;
    }

    const activeModes = [];
    if (this.activeApplyModes.glyph) {
      activeModes.push('G');
    }
    if (this.activeApplyModes.foreground) {
      activeModes.push('F');
    }
    if (this.activeApplyModes.background) {
      activeModes.push('B');
    }

    const modeText = activeModes.length > 0 ? activeModes.join('|') : 'none';
    this.statusBar.modeDisplay.textContent = `Mode: ${modeText}`;
  }

  /**
   * Set up event listeners for all components
   * @private
   */
  _wireComponentEvents() {
    // Listen to glyph picker selections
    const unsubGlyph = this.glyphPicker.on('select', (code) => {
      this.activeGlyph = code;
      if (this.activeTool && typeof this.activeTool.setGlyph === 'function') {
        this.activeTool.setGlyph(code);
      }
    });
    this._unsubscribers.push(unsubGlyph);

    // Listen to palette color changes
    const unsubColor = this.palette.on('color-changed', ({ fg, bg }) => {
      this.activeFg = [...fg];
      this.activeBg = [...bg];
      if (this.activeTool && typeof this.activeTool.setColors === 'function') {
        this.activeTool.setColors(this.activeFg, this.activeBg);
      }
    });
    this._unsubscribers.push(unsubColor);

    // Listen to palette apply mode changes
    const unsubApplyMode = this.palette.on('apply-mode-changed', (modes) => {
      this.activeApplyModes = { ...modes };
      if (this.activeTool && typeof this.activeTool.setApplyModes === 'function') {
        this.activeTool.setApplyModes(this.activeApplyModes);
      }
    });
    this._unsubscribers.push(unsubApplyMode);
  }

  /**
   * Set up click handlers for apply mode toggle buttons
   * @private
   */
  _setupApplyModeToggles() {
    const glyphBtn = document.getElementById('applyGlyph');
    const fgBtn = document.getElementById('applyForeground');
    const bgBtn = document.getElementById('applyBackground');

    if (glyphBtn) {
      glyphBtn.addEventListener('click', () => {
        this.activeApplyModes.glyph = !this.activeApplyModes.glyph;
        glyphBtn.classList.toggle('active');
        this._syncApplyModesToTools();
      });
    }

    if (fgBtn) {
      fgBtn.addEventListener('click', () => {
        this.activeApplyModes.foreground = !this.activeApplyModes.foreground;
        fgBtn.classList.toggle('active');
        this._syncApplyModesToTools();
      });
    }

    if (bgBtn) {
      bgBtn.addEventListener('click', () => {
        this.activeApplyModes.background = !this.activeApplyModes.background;
        bgBtn.classList.toggle('active');
        this._syncApplyModesToTools();
      });
    }
  }

  /**
   * Sync apply modes to all active tools
   * @private
   */
  _syncApplyModesToTools() {
    if (this.activeTool && typeof this.activeTool.setApplyModes === 'function') {
      this.activeTool.setApplyModes(this.activeApplyModes);
    }

    // Update status bar with active modes
    this._updateModeDisplay();
  }

  /**
   * Set up click handler for grid toggle button
   * @private
   */
  _setupGridToggle() {
    const gridToggleBtn = document.getElementById('gridToggle');
    if (gridToggleBtn) {
      gridToggleBtn.addEventListener('click', () => {
        if (this.canvas && typeof this.canvas.setGridVisible === 'function') {
          const newState = !this.canvas.showGrid;
          this.canvas.setGridVisible(newState);
          gridToggleBtn.classList.toggle('active');
        }
      });
    }
  }

  /**
   * Set up layer panel UI with layer list, visibility toggles, opacity sliders, and add/remove buttons
   * Renders the layer list and attaches event handlers for layer management
   * @private
   */
  _setupLayerPanel() {
    const layerList = document.getElementById('layerList');
    const addLayerBtn = document.getElementById('addLayerBtn');
    const removeLayerBtn = document.getElementById('removeLayerBtn');

    if (!layerList) {
      return;
    }

    // Create LayerStack with canvas dimensions
    this.layerStack = new LayerStack(this.canvas.width, this.canvas.height);

    // Wire LayerStack to Canvas for multi-layer composition
    this.canvas.setLayerStack(this.layerStack);

    // Render initial layer list
    this._renderLayerList();

    // Attach event handlers
    if (addLayerBtn) {
      addLayerBtn.addEventListener('click', () => this._addNewLayer());
    }

    if (removeLayerBtn) {
      removeLayerBtn.addEventListener('click', () => this._removeActiveLayer());
    }
  }

  /**
   * Render the complete layer list in the UI
   * @private
   */
  _renderLayerList() {
    const layerList = document.getElementById('layerList');
    if (!layerList) {
      return;
    }

    // Get layers from canvas (which should have a LayerStack reference)
    // For now, we'll create a placeholder structure
    // This will be populated when the canvas is properly wired with LayerStack
    layerList.innerHTML = '';

    // Create layer items (placeholder for now - will be populated by canvas)
    if (this.canvas && this.canvas.layerStack) {
      const layers = this.canvas.layerStack.getLayers();
      layers.forEach((layer, index) => {
        const layerItem = this._createLayerItem(layer, index);
        layerList.appendChild(layerItem);
      });
    }
  }

  /**
   * Create a single layer item element with visibility toggle and opacity slider
   * @param {Layer} layer - The layer object
   * @param {number} index - The layer index
   * @returns {HTMLElement} The layer item DOM element
   * @private
   */
  _createLayerItem(layer, index) {
    const item = document.createElement('div');
    item.className = 'layer-item';
    if (this.canvas && this.canvas.layerStack && this.canvas.layerStack.activeIndex === index) {
      item.classList.add('active');
    }

    // Layer name label
    const nameLabel = document.createElement('div');
    nameLabel.className = 'layer-item-name';
    nameLabel.textContent = layer.name;
    nameLabel.addEventListener('click', () => this._selectLayer(index));

    // Visibility toggle button
    const visibilityBtn = document.createElement('button');
    visibilityBtn.className = 'layer-visibility-toggle';
    if (layer.visible) {
      visibilityBtn.classList.add('visible');
      visibilityBtn.textContent = '👁';
    } else {
      visibilityBtn.textContent = '👁‍🗨';
    }
    visibilityBtn.title = layer.visible ? 'Hide layer' : 'Show layer';
    visibilityBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      this._toggleLayerVisibility(index);
    });

    // Opacity slider
    const opacitySlider = document.createElement('input');
    opacitySlider.type = 'range';
    opacitySlider.className = 'layer-opacity-slider';
    opacitySlider.min = '0';
    opacitySlider.max = '100';
    opacitySlider.value = '100'; // Default full opacity
    opacitySlider.title = `Opacity: 100%`;
    opacitySlider.addEventListener('change', (e) => {
      e.stopPropagation();
      this._setLayerOpacity(index, parseInt(e.target.value));
    });
    opacitySlider.addEventListener('input', (e) => {
      opacitySlider.title = `Opacity: ${e.target.value}%`;
    });

    item.appendChild(nameLabel);
    item.appendChild(visibilityBtn);
    item.appendChild(opacitySlider);

    return item;
  }

  /**
   * Select a layer by index
   * @param {number} index - The layer index to select
   * @private
   */
  _selectLayer(index) {
    if (this.canvas && this.canvas.layerStack) {
      this.canvas.layerStack.selectLayer(index);
      this._renderLayerList();
      this.canvas.render();
    }
  }

  /**
   * Toggle layer visibility
   * @param {number} index - The layer index
   * @private
   */
  _toggleLayerVisibility(index) {
    if (this.canvas && this.canvas.layerStack) {
      const layer = this.canvas.layerStack.layers[index];
      if (layer) {
        layer.setVisible(!layer.visible);
        this._renderLayerList();
        this.canvas.render();
      }
    }
  }

  /**
   * Set layer opacity
   * @param {number} index - The layer index
   * @param {number} opacity - Opacity value (0-100)
   * @private
   */
  _setLayerOpacity(index, opacity) {
    if (this.canvas && this.canvas.layerStack) {
      const layer = this.canvas.layerStack.layers[index];
      if (layer) {
        layer.opacity = opacity / 100; // Convert to 0-1 range
        this.canvas.render();
      }
    }
  }

  /**
   * Add a new layer to the layer stack
   * @private
   */
  _addNewLayer() {
    if (this.canvas && this.canvas.layerStack) {
      const newIndex = this.canvas.layerStack.layers.length;
      const newName = `Layer ${newIndex}`;
      this.canvas.layerStack.addLayer(newName);
      this._renderLayerList();
      this.canvas.render();
    }
  }

  /**
   * Remove the currently active layer from the layer stack
   * @private
   */
  _removeActiveLayer() {
    if (this.canvas && this.canvas.layerStack) {
      if (this.canvas.layerStack.layers.length > 1) {
        const activeIndex = this.canvas.layerStack.activeIndex;
        this.canvas.layerStack.removeLayer(activeIndex);
        this._renderLayerList();
        this.canvas.render();
      }
    }
  }

  /**
   * Activate a drawing tool and sync current state to it
   * Deactivates the previous tool if one was active
   * @param {Object} tool - The tool to activate
   */
  activateTool(tool) {
    // Deactivate previous tool if it has a deactivate method
    if (this.activeTool && typeof this.activeTool.deactivate === 'function') {
      this.activeTool.deactivate();
    }

    // Set new active tool
    this.activeTool = tool;

    // Sync current state to the new tool
    if (tool) {
      if (typeof tool.setGlyph === 'function') {
        tool.setGlyph(this.activeGlyph);
      }
      if (typeof tool.setColors === 'function') {
        tool.setColors(this.activeFg, this.activeBg);
      }
      if (typeof tool.setApplyModes === 'function') {
        tool.setApplyModes(this.activeApplyModes);
      }
    }

    // Update status bar with active tool name
    this._updateToolDisplay();

    // Tell canvas about the active tool
    if (this.canvas && typeof this.canvas.setActiveTool === 'function') {
      this.canvas.setActiveTool(tool);
    }

    // After tool activation, if it's SelectTool, register it with canvas for visualization
    if (tool instanceof SelectTool) {
      this.canvas.setSelectionTool(tool);
      this.selectTool = tool;
    }
  }

  /**
   * Paint a single cell via the active tool
   * @param {number} x - Cell column
   * @param {number} y - Cell row
   */
  paint(x, y) {
    if (this.activeTool && typeof this.activeTool.paint === 'function') {
      this._beginToolOperation('paint');
      try {
        this.activeTool.paint(x, y);
      } finally {
        this._commitToolOperation();
      }
    }
  }

  /**
   * Start a drag operation on the active tool
   * @param {number} x - Starting cell column
   * @param {number} y - Starting cell row
   */
  startDrag(x, y) {
    if (this.activeTool && typeof this.activeTool.startDrag === 'function') {
      this._beginToolOperation('drag');
      this.activeTool.startDrag(x, y);
    }
  }

  /**
   * Continue a drag operation on the active tool
   * @param {number} x - Current cell column
   * @param {number} y - Current cell row
   */
  drag(x, y) {
    if (this.activeTool && typeof this.activeTool.drag === 'function') {
      this.activeTool.drag(x, y);
    }
  }

  /**
   * End the current drag operation on the active tool
   */
  endDrag() {
    if (this.activeTool && typeof this.activeTool.endDrag === 'function') {
      try {
        this.activeTool.endDrag();
      } finally {
        this._commitToolOperation();
      }
    }
  }

  _beginToolOperation(label = 'edit') {
    if (this._toolOperationOpen || !this.canvas || typeof this.canvas.beginOperation !== 'function') {
      return;
    }
    this.canvas.beginOperation(label);
    this._toolOperationOpen = true;
  }

  _commitToolOperation() {
    if (!this._toolOperationOpen || !this.canvas || typeof this.canvas.endOperation !== 'function') {
      return;
    }
    const command = this.canvas.endOperation();
    this._toolOperationOpen = false;
    if (command) {
      this.undoStack.push(command);
    }
  }

  /**
   * Change font size on the canvas
   * Valid sizes: 8, 10, 12, 16
   * @param {number} pixelsPerCell - Size in pixels
   */
  setFontSize(pixelsPerCell) {
    if (this.canvas && typeof this.canvas.setFontSize === 'function') {
      this.canvas.setFontSize(pixelsPerCell);
    }
  }

  /**
   * Get current font size
   * @returns {number} Current font size in pixels
   */
  getFontSize() {
    if (this.canvas && typeof this.canvas.getFontSize === 'function') {
      return this.canvas.getFontSize();
    }
    return 12; // Default
  }

  /**
   * Enable pan mode - called when Space key is pressed
   * Sets panMode flag and changes cursor to 'grab'
   */
  enablePanMode() {
    this.panMode = true;
    const canvasElement = document.getElementById('rexpaintCanvas');
    if (canvasElement) {
      canvasElement.style.cursor = 'grab';
    }
  }

  /**
   * Disable pan mode - called when Space key is released
   * Clears panMode flag and restores cursor to 'crosshair'
   * Safe to call even if pan mode is not active
   */
  disablePanMode() {
    this.panMode = false;
    const canvasElement = document.getElementById('rexpaintCanvas');
    if (canvasElement) {
      canvasElement.style.cursor = 'crosshair';
    }
  }

  /**
   * Set pan mode on/off
   * @param {boolean} enabled - Whether pan mode is active
   */
  setPanMode(enabled) {
    this.panMode = enabled;
  }

  /**
   * Start a pan operation at the given screen coordinates
   * @param {number} screenX - Starting X coordinate on screen
   * @param {number} screenY - Starting Y coordinate on screen
   */
  startPan(screenX, screenY) {
    this.panStartX = screenX;
    this.panStartY = screenY;
  }

  /**
   * Continue pan operation, calculating delta and updating canvas offset
   * Wrapped in try/finally to ensure cursor and pan mode are cleaned up on error
   * @param {number} screenX - Current X coordinate on screen
   * @param {number} screenY - Current Y coordinate on screen
   */
  pan(screenX, screenY) {
    try {
      if (!this.panMode) {
        return;
      }

      const deltaX = screenX - this.panStartX;
      const deltaY = screenY - this.panStartY;

      this.offsetX += deltaX;
      this.offsetY += deltaY;

      this.panStartX = screenX;
      this.panStartY = screenY;

      if (this.canvas && typeof this.canvas.setOffset === 'function') {
        this.canvas.setOffset(this.offsetX, this.offsetY);
      }
    } catch (error) {
      console.error('Error during pan operation:', error);
      // Force cleanup on error - disable pan mode and restore cursor
      this.disablePanMode();
      throw error; // Re-throw for test verification and higher-level handling
    }
  }

  /**
   * End the pan operation
   * Safely disables pan mode and restores cursor
   */
  endPan() {
    try {
      this.disablePanMode();
    } catch (error) {
      console.error('Error ending pan operation:', error);
      // Ensure pan mode is disabled even if there's an error
      this.panMode = false;
    }
  }

  /**
   * Copy the current selection to clipboard
   * Gets selected cells from the active tool (assumed to be SelectTool)
   * @returns {boolean} True if copy was successful, false if no selection
   */
  copy() {
    // Check if there's an active selection tool
    if (!this.activeTool || typeof this.activeTool.getSelectedCells !== 'function') {
      return false;
    }

    try {
      const selectedCells = this.activeTool.getSelectedCells();
      const selectionBounds = this.activeTool.getSelectionBounds();

      if (!selectedCells || selectedCells.length === 0) {
        return false;
      }

      // Store clipboard with cells and their bounds
      this.clipboard = {
        cells: selectedCells,
        bounds: selectionBounds,
      };

      return true;
    } catch (e) {
      console.warn('Copy failed:', e);
      return false;
    }
  }

  /**
   * Start paste mode - enables cursor tracking for paste placement
   * @returns {boolean} True if paste mode was started, false if no clipboard
   */
  startPaste() {
    if (!this.clipboard || !this.clipboard.cells || this.clipboard.cells.length === 0) {
      return false;
    }

    try {
      // Ensure any previous listeners are cleaned up before attaching new ones
      this.cancelPaste();

      // Enable paste mode
      this.pasteMode = true;

      // Attach mousemove listener to track paste cursor position
      const canvasElement = document.getElementById('rexpaintCanvas');
      if (canvasElement) {
        this._pasteMoveListener = (e) => {
          const rect = canvasElement.getBoundingClientRect();
          const screenX = e.clientX - rect.left;
          const screenY = e.clientY - rect.top;

          const pixelsPerCell = this.getFontSize() || 12;
          const cellX = Math.floor(screenX / pixelsPerCell);
          const cellY = Math.floor(screenY / pixelsPerCell);

          this.pasteOffset = { x: cellX, y: cellY };
        };

        // Add click listener to paste at clicked location
        this._pasteClickListener = (e) => {
          const rect = canvasElement.getBoundingClientRect();
          const screenX = e.clientX - rect.left;
          const screenY = e.clientY - rect.top;

          const pixelsPerCell = this.getFontSize() || 12;
          const cellX = Math.floor(screenX / pixelsPerCell);
          const cellY = Math.floor(screenY / pixelsPerCell);

          // Paste at clicked location
          this.paste(cellX, cellY);
        };

        canvasElement.addEventListener('mousemove', this._pasteMoveListener);
        canvasElement.addEventListener('click', this._pasteClickListener);
      }

      return true;
    } catch (error) {
      console.error('Error setting up paste listeners:', error);
      this.cancelPaste(); // Force cleanup on error
      throw error;
    }
  }

  /**
   * Cancel paste mode and remove cursor tracking
   */
  cancelPaste() {
    this.pasteMode = false;

    const canvasElement = document.getElementById('rexpaintCanvas');

    // Remove mousemove listener
    if (this._pasteMoveListener) {
      if (canvasElement) {
        canvasElement.removeEventListener('mousemove', this._pasteMoveListener);
      }
      this._pasteMoveListener = null;
    }

    // Remove click listener
    if (this._pasteClickListener) {
      if (canvasElement) {
        canvasElement.removeEventListener('click', this._pasteClickListener);
      }
      this._pasteClickListener = null;
    }

    this.pasteOffset = { x: 0, y: 0 };
  }

  /**
   * Paste clipboard contents at the current paste cursor position
   * Records the pasted cell mutations as a single undoable command
   * @param {number} x - Paste position X (cell column)
   * @param {number} y - Paste position Y (cell row)
   */
  paste(x, y) {
    if (!this.clipboard || !this.clipboard.cells || !this.canvas) {
      return;
    }
    this._beginToolOperation('paste');

    // Apply pasted cells
    const { cells } = this.clipboard;
    const { bounds } = this.clipboard;

    // Calculate offset from original selection position
    const offsetX = x - bounds.x;
    const offsetY = y - bounds.y;

    // Paint each cell from clipboard at new location
    cells.forEach((cell) => {
      const newX = cell.x + offsetX;
      const newY = cell.y + offsetY;

      // Only paint cells that fit within canvas bounds
      if (newX >= 0 && newX < this.canvas.width && newY >= 0 && newY < this.canvas.height) {
        this.canvas.setCell(newX, newY, cell.glyph, cell.fg, cell.bg);
      }
    });

    // Exit paste mode and re-render
    this.cancelPaste();
    this._commitToolOperation();
    this.canvas.render();
  }

  /**
   * Delete all cells in the current selection
   * Clears selected cells to empty (glyph 0) while preserving background color
   * Records the selection clear as a single undoable command
   * @returns {boolean} True if deletion was successful, false if no selection
   */
  deleteSelection() {
    // Check if there's an active selection tool
    if (!this.activeTool || typeof this.activeTool.getSelectionBounds !== 'function') {
      return false;
    }

    const bounds = this.activeTool.getSelectionBounds();
    if (!bounds) {
      return false;
    }

    try {
      this._beginToolOperation('delete-selection');

      // Clear all cells in selection
      for (let y = bounds.y; y < bounds.y + bounds.height; y++) {
        for (let x = bounds.x; x < bounds.x + bounds.width; x++) {
          // Get current cell to preserve background color
          const currentCell = this.canvas.getCell(x, y);
          const bgColor = currentCell ? currentCell.bg : [0, 0, 0];

          // Set glyph to 0 (empty/space), preserve background color
          this.canvas.setCell(x, y, 0, [255, 255, 255], bgColor);
        }
      }

      // Re-render canvas
      this._commitToolOperation();
      this.canvas.render();

      return true;
    } catch (e) {
      console.warn('Delete selection failed:', e);
      return false;
    }
  }

  /**
   * Undo the last action
   */
  undo() {
    const command = this.undoStack.undo();
    if (command && this.canvas) {
      this.canvas.render();
    }
  }

  /**
   * Redo the last undone action
   */
  redo() {
    const command = this.undoStack.redo();
    if (command && this.canvas) {
      this.canvas.render();
    }
  }

  /**
   * Activate the fill tool
   * Instantiates a FillTool, adds it to the tools array, and activates it
   * @returns {FillTool} The activated fill tool
   */
  activateFillTool() {
    const fillTool = new FillTool();
    fillTool.setCanvas(this.canvas);
    fillTool.setGlyph(this.activeGlyph);
    fillTool.setColors(this.activeFg, this.activeBg);
    fillTool.setApplyModes(this.activeApplyModes);

    // Add to tools array if not already present
    if (!this.tools.includes(fillTool)) {
      this.tools.push(fillTool);
    }

    // Activate the tool
    this.activateTool(fillTool);

    return fillTool;
  }

  /**
   * Dispose of the editor app and all components
   * Unsubscribes all listeners and calls dispose() on components
   */

  /**
   * Set the current action context for bundle mode (idle/attack/death)
   * Used by workbench grid panel to switch between action animations
   * @param {string} actionKey - Action key ('idle', 'attack', or 'death')
   * @returns {boolean} True if action changed, false if already active
   */
  setActionContext(actionKey) {
    if (!['idle', 'attack', 'death'].includes(actionKey)) {
      console.warn(`Invalid action context: ${actionKey}`);
      return false;
    }

    if (this.currentAction === actionKey) {
      return false; // No change needed
    }

    const oldAction = this.currentAction;
    this.currentAction = actionKey;

    // Update status bar if available
    if (this.statusBar && this.statusBar.toolDisplay) {
      this.statusBar.toolDisplay.textContent = `Action: ${actionKey}`;
    }

    return true;
  }

  /**
   * Get current action context
   * @returns {string} Current action ('idle', 'attack', or 'death')
   */
  getActionContext() {
    return this.currentAction;
  }

  /**
   * Enable or disable bundle mode
   * In bundle mode, editor works with multiple actions (idle/attack/death)
   * @param {boolean} enabled - Whether to enable bundle mode
   */
  setBundleMode(enabled) {
    this.bundleMode = enabled;
    this.currentAction = enabled ? 'idle' : 'idle';
  }

  /**
   * Load an XP file into the editor
   * Resizes canvas, creates LayerStack from file layers, and synchronizes canvas rendering
   * @param {ArrayBuffer} arrayBuffer - The XP file data
   * @throws {Error} If file is invalid or parsing fails
   */
  loadXPFile(arrayBuffer) {
    try {
      // Create and validate reader
      const reader = new XPFileReader(arrayBuffer);

      if (!reader.isValid()) {
        throw new Error('Invalid XP file: header validation failed');
      }

      // Resize canvas to match file dimensions
      this.canvas.width = reader.width;
      this.canvas.height = reader.height;

      // Update canvas element dimensions
      const canvasElement = this.canvas.canvasElement;
      if (canvasElement) {
        canvasElement.width = reader.width * this.canvas.cellSizePixels;
        canvasElement.height = reader.height * this.canvas.cellSizePixels;
      }

      // Get layers from file
      const fileLayers = reader.getLayers();

      // Create new LayerStack with file dimensions
      this.layerStack = new LayerStack(reader.width, reader.height);

      // Remove default layer and populate with file layers
      if (this.layerStack.layers.length > 0) {
        this.layerStack.layers.splice(0, 1); // Remove the default 'Layer 0'
      }

      // Copy each file layer into the LayerStack
      for (let i = 0; i < fileLayers.length; i++) {
        const fileLayer = fileLayers[i];
        this.layerStack.addLayer(`Layer ${i}`);
        const stackLayer = this.layerStack.layers[i];

        // Copy all cells from file layer to stack layer
        for (let y = 0; y < fileLayer.height; y++) {
          for (let x = 0; x < fileLayer.width; x++) {
            const cell = fileLayer.getCell(x, y);
            if (cell) {
              stackLayer.setCell(x, y, cell.glyph, cell.fg, cell.bg);
            }
          }
        }
      }

      // Connect LayerStack to Canvas for composition rendering
      this.canvas.setLayerStack(this.layerStack);

      // Clear undo/redo history for clean slate after load
      this.undoStack = new UndoStack(50);

      // Trigger render
      this.canvas.render();

      // Update layer panel if available
      this._renderLayerList();
    } catch (error) {
      console.error('Error loading XP file:', error);
      throw error;
    }
  }

  /**
   * Save the current canvas and layers to an XP file buffer
   * Exports LayerStack layers in the format expected by XPFileWriter
   * @returns {ArrayBuffer} The XP file data ready to download or transmit
   * @throws {Error} If LayerStack is not initialized or save fails
   */
  saveAsXP() {
    try {
      // Verify LayerStack is initialized
      if (!this.layerStack || !this.layerStack.layers || this.layerStack.layers.length === 0) {
        throw new Error('No layers available to save');
      }

      // Create XPFileWriter with canvas dimensions and layer count
      const writer = new XPFileWriter(
        this.canvas.width,
        this.canvas.height,
        this.layerStack.layers.length
      );

      // Export each layer from LayerStack to XPFileWriter format
      for (const layer of this.layerStack.layers) {
        // Build 2D cell array [y][x] for this layer
        const cells = [];
        for (let y = 0; y < layer.height; y++) {
          cells[y] = [];
          for (let x = 0; x < layer.width; x++) {
            const cell = layer.getCell(x, y);
            // Default to empty cell if not found
            cells[y][x] = cell || {
              glyph: 0,
              fg: [255, 255, 255],
              bg: [0, 0, 0],
            };
          }
        }
        // Add to writer
        writer.addLayer(cells);
      }

      // Write and return the complete XP buffer
      const buffer = writer.write();
      return buffer;
    } catch (error) {
      console.error('Error saving XP file:', error);
      throw error;
    }
  }

  dispose() {
    // Clean up paste mode
    this.cancelPaste();

    // Dispose keyboard handler
    if (this.keyboardHandler && typeof this.keyboardHandler.dispose === 'function') {
      this.keyboardHandler.dispose();
    }
    this.keyboardHandler = null;

    // Unsubscribe all event listeners
    for (const unsubscribe of this._unsubscribers) {
      unsubscribe();
    }
    this._unsubscribers = [];

    // Deactivate current tool
    if (this.activeTool && typeof this.activeTool.deactivate === 'function') {
      this.activeTool.deactivate();
    }
    this.activeTool = null;

    // Dispose all components
    if (this.canvas && typeof this.canvas.dispose === 'function') {
      this.canvas.dispose();
    }
    if (this.palette && typeof this.palette.dispose === 'function') {
      this.palette.dispose();
    }
    if (this.glyphPicker && typeof this.glyphPicker.dispose === 'function') {
      this.glyphPicker.dispose();
    }

    // Dispose all tools
    for (const tool of this.tools) {
      if (tool && typeof tool.dispose === 'function') {
        tool.dispose();
      }
    }
    this.tools = [];
  }
}
