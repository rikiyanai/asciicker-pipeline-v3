/**
 * Undo/Redo Stack
 *
 * Maintains two stacks (undo and redo) with a maximum history size.
 * Stores command objects with `undo()`/`redo()` functions.
 */

export class UndoStack {
  /**
   * Create a new UndoStack instance.
   *
   * @param {number} maxSize - Maximum number of actions to keep in history (default: 50)
   */
  constructor(maxSize = 50) {
    this.undoStack = [];
    this.redoStack = [];
    this.maxSize = maxSize;
  }

  /**
   * Push a command onto the undo stack.
   * Clears the redo stack (standard undo/redo behavior).
   * Removes oldest action if maxSize is exceeded.
   *
   * @param {{undo: Function, redo: Function}} command
   */
  push(command) {
    if (!command || typeof command.undo !== 'function' || typeof command.redo !== 'function') {
      throw new Error('UndoStack only accepts command objects with undo() and redo() methods.');
    }
    if (this.undoStack.length >= this.maxSize) {
      this.undoStack.shift(); // Remove oldest
    }
    this.undoStack.push(command);
    this.redoStack = []; // Clear redo when new action taken
  }

  /**
   * Check if undo is available.
   *
   * @returns {boolean} true if undo stack is not empty
   */
  canUndo() {
    return this.undoStack.length > 0;
  }

  /**
   * Check if redo is available.
   *
   * @returns {boolean} true if redo stack is not empty
   */
  canRedo() {
    return this.redoStack.length > 0;
  }

  /**
   * Undo the last action and move it to the redo stack.
   *
   * @returns {*} The command that was undone, or null if the stack is empty
   */
  undo() {
    if (!this.canUndo()) return null;

    const command = this.undoStack.pop();
    command.undo();
    this.redoStack.push(command);
    return command;
  }

  /**
   * Redo the last undone action and move it back to the undo stack.
   *
   * @returns {*} The command that was redone, or null if redo stack is empty
   */
  redo() {
    if (!this.canRedo()) return null;
    const command = this.redoStack.pop();
    command.redo();
    this.undoStack.push(command);
    return command;
  }

  /**
   * Clear both undo and redo stacks.
   */
  clear() {
    this.undoStack = [];
    this.redoStack = [];
  }
}
