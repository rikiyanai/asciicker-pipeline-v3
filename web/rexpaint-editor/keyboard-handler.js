/**
 * Keyboard Handler
 *
 * Manages keyboard shortcuts for the editor:
 * - Tool selection: C=Cell, L=Line, R=Rect, O=Oval, F=Fill, T=Text
 * - Undo/Redo: Ctrl+Z=undo, Ctrl+Y=redo
 * - Copy/Paste: Ctrl+C=copy, Ctrl+V=paste
 * - Delete: Delete=delete selection
 * - Browser integration: Ctrl+S prevents default browser save
 */

export class KeyboardHandler {
  /**
   * Create a new KeyboardHandler instance
   * @param {EditorApp} editorApp - The EditorApp instance to route actions to
   */
  constructor(editorApp) {
    this.app = editorApp;

    // Define shortcuts map with code-to-action mappings
    this.shortcuts = {
      'KeyC': (evt) => {
        if (evt.ctrlKey) {
          // Ctrl+C: copy selection
          evt.preventDefault();
          this.app.copy();
        } else {
          // C: activate cell tool
          this.app.activateTool('cell');
        }
      },
      'KeyL': () => this.app.activateTool('line'),
      'KeyR': () => this.app.activateTool('rect'),
      'KeyO': () => this.app.activateTool('oval'),
      'KeyF': () => this.app.activateTool('fill'),
      'KeyT': () => this.app.activateTool('text'),
      'KeyV': (evt) => {
        if (evt.ctrlKey) {
          // Ctrl+V: start paste mode
          evt.preventDefault();
          this.app.startPaste();
        }
      },
      'KeyZ': (evt) => evt.ctrlKey && this.app.undo(),
      'KeyY': (evt) => evt.ctrlKey && this.app.redo(),
      'KeyS': (evt) => evt.ctrlKey && evt.preventDefault(),
      'Delete': () => this.app.deleteSelection(),
      'Escape': () => {
        // Escape: cancel paste mode
        if (this.app.pasteMode) {
          this.app.cancelPaste();
        }
      },
    };

    this._element = null;
    this._handleKeyDown = this._handleKeyDown.bind(this);
    this._handleKeyUp = this._handleKeyUp.bind(this);
  }

  /**
   * Attach keyboard handler to a DOM element
   * @param {HTMLElement} element - Element to attach listener to
   */
  attach(element) {
    this._element = element;
    element.addEventListener('keydown', this._handleKeyDown);
    element.addEventListener('keyup', this._handleKeyUp);
  }

  /**
   * Handle keydown events and dispatch to shortcuts
   * @private
   * @param {KeyboardEvent} evt - The keyboard event
   */
  _handleKeyDown(evt) {
    // Handle Space key for pan mode
    if (evt.code === 'Space') {
      evt.preventDefault();
      if (this.app && typeof this.app.enablePanMode === 'function') {
        this.app.enablePanMode();
      }
      return;
    }

    const shortcut = this.shortcuts[evt.code];
    if (shortcut) {
      shortcut(evt);
    }
  }

  /**
   * Handle keyup events
   * @private
   * @param {KeyboardEvent} evt - The keyboard event
   */
  _handleKeyUp(evt) {
    // Handle Space key release for pan mode
    if (evt.code === 'Space') {
      evt.preventDefault();
      if (this.app && typeof this.app.disablePanMode === 'function') {
        this.app.disablePanMode();
      }
      return;
    }
  }

  /**
   * Detach keyboard handler from DOM element
   */
  detach() {
    if (this._element) {
      this._element.removeEventListener('keydown', this._handleKeyDown);
      this._element.removeEventListener('keyup', this._handleKeyUp);
      this._element = null;
    }
  }

  /**
   * Dispose of the handler and clean up resources
   */
  dispose() {
    this.detach();
  }
}
