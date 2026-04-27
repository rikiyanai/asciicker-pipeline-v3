#!/usr/bin/env node

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, '..', '..');
const WHOLE_SHEET_PATH = path.join(REPO_ROOT, 'web', 'whole-sheet-init.js');
const WORKBENCH_PATH = path.join(REPO_ROOT, 'web', 'workbench.js');

const DEFAULT_JSON_OUT = path.join(REPO_ROOT, 'output', 'whole_sheet_action_contracts.json');
const DEFAULT_MD_OUT = path.join(REPO_ROOT, 'output', 'whole_sheet_action_contracts.md');

function readSource(filePath) {
  return fs.readFileSync(filePath, 'utf8');
}

function normalizeWhitespace(value) {
  return String(value || '').replace(/\s+/g, ' ').trim();
}

function shellQuote(value) {
  return `'${String(value).replace(/'/g, `'\\''`)}'`;
}

function crossProduct(dimensions, index = 0, seed = {}, out = []) {
  if (index >= dimensions.length) {
    out.push({ ...seed });
    return out;
  }
  const dim = dimensions[index];
  for (const value of dim.values) {
    seed[dim.key] = value;
    crossProduct(dimensions, index + 1, seed, out);
  }
  delete seed[dim.key];
  return out;
}

function parseObservableStateFields(sourceText) {
  const match = sourceText.match(/function getState\(\)\s*\{([\s\S]*?)\n\}/);
  if (!match) return [];
  const block = match[1];
  const fields = new Set();
  for (const fieldMatch of block.matchAll(/^\s*([a-zA-Z0-9_]+)\s*:/gm)) {
    fields.add(fieldMatch[1]);
  }
  return [...fields];
}

function parseControlBlocks(sourceText, sourceFile) {
  const lines = sourceText.split('\n');
  const blocks = [];
  let current = null;

  function flushCurrent(endLine) {
    if (!current) return;
    current.endLine = endLine;
    current.text = current.lines.join('\n');
    blocks.push(current);
    current = null;
  }

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const createMatch = line.match(/^\s*const\s+([A-Za-z0-9_]+)\s*=\s*document\.createElement\('([a-z]+)'\);/);
    if (createMatch) {
      flushCurrent(i);
      current = {
        varName: createMatch[1],
        elementType: createMatch[2],
        startLine: i + 1,
        lines: [line],
        sourceFile,
      };
      continue;
    }
    if (current) current.lines.push(line);
  }
  flushCurrent(lines.length);

  const controls = [];
  for (const block of blocks) {
    const text = block.text;
    const hasEventListener = new RegExp(`${block.varName}\\.addEventListener\\(`).test(text);
    if (!hasEventListener) continue;

    const id = text.match(new RegExp(`${block.varName}\\.id\\s*=\\s*'([^']+)'`))?.[1] || null;
    const className = text.match(new RegExp(`${block.varName}\\.className\\s*=\\s*'([^']+)'`))?.[1] || null;
    if (!id && className && (/^ws-layer-/.test(className) || className === 'ws-toggle')) continue;
    const textContent = text.match(new RegExp(`${block.varName}\\.textContent\\s*=\\s*'([^']*)'`))?.[1] || null;
    const title = text.match(new RegExp(`${block.varName}\\.title\\s*=\\s*'([^']*)'`))?.[1] || null;
    const inputType = text.match(new RegExp(`${block.varName}\\.type\\s*=\\s*'([^']+)'`))?.[1] || null;

    const handlers = [];
    const handlerRegex = new RegExp(`${block.varName}\\.addEventListener\\('([^']+)',\\s*([\\s\\S]*?)\\);`, 'g');
    for (const handlerMatch of text.matchAll(handlerRegex)) {
      handlers.push({
        eventType: handlerMatch[1],
        handlerSource: normalizeWhitespace(handlerMatch[2]),
      });
    }
    if (!handlers.length) continue;

    controls.push({
      controlId: id || className || `${block.elementType}:${block.varName}`,
      selector: id ? `#${id}` : (className ? `.${className.split(/\s+/)[0]}` : null),
      id,
      className,
      textContent,
      title,
      inputType,
      elementType: block.elementType,
      sourceFile,
      line: block.startLine,
      handlers,
    });
  }
  return controls;
}

function parseToggleControls(sourceText, sourceFile) {
  const controls = [];
  const toggleRegex = /_buildToggle\('([^']+)', '([^']+)', [^,]+, \(on\) => \{([\s\S]*?)\}\)/g;
  for (const match of sourceText.matchAll(toggleRegex)) {
    const prefix = sourceText.slice(0, match.index);
    const line = prefix.split('\n').length;
    controls.push({
      controlId: match[2],
      selector: `#${match[2]}`,
      id: match[2],
      className: 'ws-toggle',
      textContent: match[1],
      title: `Toggle ${match[1]}`,
      inputType: null,
      elementType: 'button',
      sourceFile,
      line,
      handlers: [{
        eventType: 'click',
        handlerSource: normalizeWhitespace(match[3]),
      }],
    });
  }
  return controls;
}

function parseWrapperControls(sourceText, sourceFile) {
  const controls = [];
  const patterns = [
    {
      selector: '#layerSelect',
      controlId: 'layerSelect',
      elementType: 'select',
      eventType: 'change',
      regex: /\$\("layerSelect"\)\.addEventListener\("change", \(\) => \{([\s\S]*?)\n\s*\}\);/,
    },
    {
      selector: '#layerVisibility input[data-layer]',
      controlId: 'layerVisibility',
      elementType: 'checkbox-group',
      eventType: 'change',
      regex: /\$\("layerVisibility"\)\.addEventListener\("change", \(e\) => \{([\s\S]*?)\n\s*\}\);/,
    },
  ];
  for (const pattern of patterns) {
    const match = sourceText.match(pattern.regex);
    if (!match) continue;
    const line = sourceText.slice(0, match.index).split('\n').length;
    controls.push({
      controlId: pattern.controlId,
      selector: pattern.selector,
      id: pattern.controlId,
      className: null,
      textContent: null,
      title: null,
      inputType: null,
      elementType: pattern.elementType,
      sourceFile,
      line,
      handlers: [{
        eventType: pattern.eventType,
        handlerSource: normalizeWhitespace(match[1]),
      }],
    });
  }
  return controls;
}

function addDynamicLayerControls(allControls) {
  allControls.push(
    {
      controlId: 'ws-layer-add-btn',
      selector: '.ws-layer-add-btn',
      id: null,
      className: 'ws-layer-add-btn',
      textContent: '+',
      title: 'Add layer',
      inputType: null,
      elementType: 'button',
      sourceFile: 'web/whole-sheet-init.js',
      line: 2942,
      handlers: [{ eventType: 'click', handlerSource: '_addLayer()' }],
      dynamicParam: 'layerIndex',
    },
    {
      controlId: 'ws-layer-del-btn',
      selector: '.ws-layer-del-btn',
      id: null,
      className: 'ws-layer-del-btn',
      textContent: '−',
      title: 'Delete active layer',
      inputType: null,
      elementType: 'button',
      sourceFile: 'web/whole-sheet-init.js',
      line: 2948,
      handlers: [{ eventType: 'click', handlerSource: '_deleteActiveLayer()' }],
      dynamicParam: 'layerCount',
    },
    {
      controlId: 'ws-layer-row',
      selector: '.ws-layer-row',
      id: null,
      className: 'ws-layer-row',
      textContent: null,
      title: 'Select layer row',
      inputType: null,
      elementType: 'button-row',
      sourceFile: 'web/whole-sheet-init.js',
      line: 2959,
      handlers: [{ eventType: 'click', handlerSource: '_switchActiveLayer(i)' }],
      dynamicParam: 'layerIndex',
    },
    {
      controlId: 'ws-layer-vis-btn',
      selector: '.ws-layer-vis-btn',
      id: null,
      className: 'ws-layer-vis-btn',
      textContent: 'V|-',
      title: 'Show or hide layer',
      inputType: null,
      elementType: 'button',
      sourceFile: 'web/whole-sheet-init.js',
      line: 2966,
      handlers: [{ eventType: 'click', handlerSource: '_toggleLayerVisibility(i)' }],
      dynamicParam: 'layerIndex',
    },
    {
      controlId: 'ws-layer-lock-btn',
      selector: '.ws-layer-lock-btn',
      id: null,
      className: 'ws-layer-lock-btn',
      textContent: 'L|U',
      title: 'Lock or unlock layer',
      inputType: null,
      elementType: 'button',
      sourceFile: 'web/whole-sheet-init.js',
      line: 2975,
      handlers: [{ eventType: 'click', handlerSource: '_toggleLayerLock(i)' }],
      dynamicParam: 'layerIndex',
    },
    {
      controlId: 'ws-layer-move-up',
      selector: '.ws-layer-move-btn[data-direction="up"]',
      id: null,
      className: 'ws-layer-move-btn',
      textContent: '↑',
      title: 'Move layer up',
      inputType: null,
      elementType: 'button',
      sourceFile: 'web/whole-sheet-init.js',
      line: 2990,
      handlers: [{ eventType: 'click', handlerSource: '_moveLayerUp(i)' }],
      dynamicParam: 'layerIndex',
    },
    {
      controlId: 'ws-layer-move-down',
      selector: '.ws-layer-move-btn[data-direction="down"]',
      id: null,
      className: 'ws-layer-move-btn',
      textContent: '↓',
      title: 'Move layer down',
      inputType: null,
      elementType: 'button',
      sourceFile: 'web/whole-sheet-init.js',
      line: 2996,
      handlers: [{ eventType: 'click', handlerSource: '_moveLayerDown(i)' }],
      dynamicParam: 'layerIndex',
    },
  );
}

function dedupeControls(controls) {
  const seen = new Set();
  const out = [];
  for (const control of controls) {
    const key = `${control.controlId}|${control.selector}|${control.handlers.map((handler) => `${handler.eventType}:${handler.handlerSource}`).join('|')}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(control);
  }
  return out;
}

function stateCondition(field, op, value, surface = 'wsState') {
  return { surface, field, op, value };
}

function domCondition(selector, op, value) {
  return { surface: 'dom', selector, op, value };
}

function hookCondition(hookName, op, value = true) {
  return { surface: 'hook', hookName, op, value };
}

function noteCondition(note) {
  return { surface: 'note', note };
}

function localScenarioMatrix(dimensions, builder) {
  return crossProduct(dimensions).map((ctx) => builder(ctx));
}

function buildToolActionContract(control, toolName) {
  return {
    actionKind: 'tool-select',
    variants: [
      {
        key: `${toolName}_paint_mode`,
        label: `${toolName} tool selected from paint mode`,
        preconditions: [stateCondition('mode', 'eq', 'paint')],
        expected: [
          stateCondition('activeTool', 'eq', toolName),
          domCondition(control.selector, 'hasClass', 'ws-tool-active'),
        ],
      },
    ],
  };
}

function buildSimpleModeContract(targetMode) {
  return {
    actionKind: 'mode-switch',
    variants: localScenarioMatrix(
      [{ key: 'currentMode', values: ['paint', 'browse'] }],
      ({ currentMode }) => ({
        key: `${targetMode}_from_${currentMode}`,
        label: `${targetMode.toUpperCase()} button from ${currentMode} mode`,
        preconditions: [stateCondition('mode', 'eq', currentMode)],
        expected: [
          stateCondition('mode', 'eq', targetMode),
          domCondition(`#wsMode${targetMode === 'paint' ? 'Paint' : 'Browse'}`, 'hasClass', 'ws-tool-active'),
          ...(targetMode === 'browse'
            ? [noteCondition('Browse sections become visible and the canvas becomes preview-only.')]
            : [noteCondition('Paint sections become visible and the active tool is re-armed.')]),
        ],
      }),
    ),
  };
}

function buildUndoRedoContract(kind) {
  const canField = kind === 'undo' ? 'canUndo' : 'canRedo';
  const deltaField = kind === 'undo' ? 'historyDepth' : 'futureDepth';
  return {
    actionKind: kind,
    variants: localScenarioMatrix(
      [{ key: 'enabled', values: [false, true] }],
      ({ enabled }) => ({
        key: `${kind}_${enabled ? 'enabled' : 'disabled'}`,
        label: `${kind} button when ${enabled ? 'enabled' : 'disabled'}`,
        preconditions: [stateCondition(canField, 'eq', enabled)],
        expected: enabled
          ? [
              stateCondition(canField, 'changed', null),
              stateCondition(deltaField, 'changed', null),
            ]
          : [
              stateCondition(canField, 'eq', false),
              stateCondition(deltaField, 'unchanged', null),
            ],
      }),
    ),
  };
}

function buildGridToggleContract() {
  return {
    actionKind: 'grid-toggle',
    variants: localScenarioMatrix(
      [{ key: 'gridVisible', values: [false, true] }],
      ({ gridVisible }) => ({
        key: `grid_toggle_from_${gridVisible ? 'on' : 'off'}`,
        label: `Grid toggle when grid is ${gridVisible ? 'visible' : 'hidden'}`,
        preconditions: [stateCondition('gridVisible', 'eq', gridVisible)],
        expected: [stateCondition('gridVisible', 'eq', !gridVisible)],
      }),
    ),
  };
}

function buildGridStepContract() {
  return {
    actionKind: 'grid-step',
    variants: [
      {
        key: 'grid_step_frame',
        label: 'Grid step select switched to frame spacing',
        preconditions: [stateCondition('mode', 'eq', 'paint')],
        expected: [stateCondition('gridStep', 'eq', 'frame')],
      },
      {
        key: 'grid_step_numeric',
        label: 'Grid step select switched to numeric spacing',
        preconditions: [stateCondition('mode', 'eq', 'paint')],
        expected: [stateCondition('gridStep', 'changed', null)],
      },
    ],
  };
}

function buildApplyToggleContract(channel, selector) {
  const uiName = channel === 'glyph' ? 'apply glyph' : channel === 'foreground' ? 'apply FG' : 'apply BG';
  return {
    actionKind: 'apply-toggle',
    variants: [
      {
        key: `${channel}_toggle_general`,
        label: `${uiName} toggle with at least one other apply channel active`,
        preconditions: [noteCondition('At least one apply channel besides the clicked one remains enabled.')],
        expected: [domCondition(selector, 'classChanged', 'ws-toggle-on')],
      },
      {
        key: `${channel}_toggle_last_channel_guard`,
        label: `${uiName} toggle when it is the final enabled apply channel`,
        preconditions: [noteCondition('Clicked channel is the only enabled apply channel.')],
        expected: [
          domCondition(selector, 'hasClass', 'ws-toggle-on'),
          noteCondition('Guard rejects all-off state; toggle remains on.'),
        ],
      },
    ],
  };
}

function buildResizeContract() {
  return {
    actionKind: 'resize',
    variants: [
      {
        key: 'resize_prompt_cancel',
        label: 'Resize prompt cancelled',
        preconditions: [stateCondition('gridCols', 'truthy', true), stateCondition('gridRows', 'truthy', true)],
        expected: [
          stateCondition('gridCols', 'unchanged', null),
          stateCondition('gridRows', 'unchanged', null),
        ],
      },
      {
        key: 'resize_prompt_invalid',
        label: 'Resize prompt receives invalid dimensions',
        preconditions: [noteCondition('Prompt input does not match "cols x rows".')],
        expected: [
          stateCondition('gridCols', 'unchanged', null),
          stateCondition('gridRows', 'unchanged', null),
        ],
      },
      {
        key: 'resize_prompt_valid',
        label: 'Resize prompt receives valid new dimensions',
        preconditions: [noteCondition('Prompt input parses to a new positive cols x rows pair.')],
        expected: [
          stateCondition('gridCols', 'changed', null),
          stateCondition('gridRows', 'changed', null),
          noteCondition('Top-left content is preserved and the document snapshot is committed once.'),
        ],
      },
    ],
  };
}

function buildHookOnlyContract(actionKind, hookName, note) {
  return {
    actionKind,
    variants: [
      {
        key: `${actionKind}_hook`,
        label: `${actionKind} delegates through shipped callback`,
        preconditions: [hookCondition(hookName, 'available', true)],
        expected: [
          hookCondition(hookName, 'invoked', true),
          ...(note ? [noteCondition(note)] : []),
        ],
      },
    ],
  };
}

function buildDrawStateContract(kind) {
  if (kind === 'zoom') {
    return {
      actionKind: 'canvas-zoom',
      variants: [
        {
          key: 'canvas_zoom_change',
          label: 'Canvas zoom slider moved',
          preconditions: [stateCondition('mounted', 'eq', true)],
          expected: [
            stateCondition('canvasZoom', 'changed', null),
            stateCondition('appliedCanvasZoom', 'changed', null),
          ],
        },
      ],
    };
  }
  if (kind === 'glyph') {
    return {
      actionKind: 'draw-glyph',
      variants: [
        {
          key: 'draw_glyph_change',
          label: 'Draw glyph changed through picker or input',
          preconditions: [stateCondition('mode', 'eq', 'paint')],
          expected: [stateCondition('drawGlyph', 'changed', null)],
        },
      ],
    };
  }
  if (kind === 'fg') {
    return {
      actionKind: 'draw-fg',
      variants: [
        {
          key: 'draw_fg_change',
          label: 'Foreground color changed',
          preconditions: [stateCondition('mode', 'eq', 'paint')],
          expected: [stateCondition('drawFg', 'changed', null)],
        },
      ],
    };
  }
  if (kind === 'bg') {
    return {
      actionKind: 'draw-bg',
      variants: [
        {
          key: 'draw_bg_change',
          label: 'Background color changed',
          preconditions: [stateCondition('mode', 'eq', 'paint')],
          expected: [stateCondition('drawBg', 'changed', null)],
        },
      ],
    };
  }
  if (kind === 'stroke-end') {
    return {
      actionKind: 'stroke-complete',
      variants: [
        {
          key: 'stroke_complete_clean',
          label: 'Pointer release without dirty stroke',
          preconditions: [noteCondition('No root cell edits occurred during the stroke.')],
          expected: [stateCondition('historyDepth', 'unchanged', null)],
        },
        {
          key: 'stroke_complete_dirty',
          label: 'Pointer release after dirty stroke',
          preconditions: [noteCondition('A root cell edit dirtied the active stroke transaction.')],
          expected: [
            stateCondition('historyDepth', 'changed', null),
            stateCondition('canUndo', 'eq', true),
          ],
        },
      ],
    };
  }
  return null;
}

function buildSelectionClipboardContract(kind) {
  const hasSelectionCondition = stateCondition('selectionBounds', 'truthy', true);
  if (kind === 'copy') {
    return {
      actionKind: 'copy',
      variants: [
        {
          key: 'copy_without_selection',
          label: 'Copy with no selection',
          preconditions: [stateCondition('selectionBounds', 'falsy', false)],
          expected: [stateCondition('hasClipboard', 'unchanged', null)],
        },
        {
          key: 'copy_with_selection',
          label: 'Copy with an active selection',
          preconditions: [hasSelectionCondition],
          expected: [
            stateCondition('hasClipboard', 'eq', true),
            stateCondition('clipboardCellCount', 'gt', 0),
          ],
        },
      ],
    };
  }
  if (kind === 'cut') {
    return {
      actionKind: 'cut',
      variants: [
        {
          key: 'cut_without_selection',
          label: 'Cut with no selection',
          preconditions: [stateCondition('selectionBounds', 'falsy', false)],
          expected: [stateCondition('hasClipboard', 'unchanged', null)],
        },
        {
          key: 'cut_with_selection',
          label: 'Cut with an active selection',
          preconditions: [hasSelectionCondition],
          expected: [
            stateCondition('hasClipboard', 'eq', true),
            stateCondition('clipboardCellCount', 'gt', 0),
            stateCondition('historyDepth', 'changed', null),
          ],
        },
      ],
    };
  }
  if (kind === 'paste') {
    return {
      actionKind: 'paste-mode',
      variants: [
        {
          key: 'paste_without_clipboard',
          label: 'Paste with empty clipboard',
          preconditions: [stateCondition('hasClipboard', 'eq', false)],
          expected: [stateCondition('pasteMode', 'eq', false)],
        },
        {
          key: 'paste_with_clipboard',
          label: 'Paste with clipboard content',
          preconditions: [stateCondition('hasClipboard', 'eq', true)],
          expected: [stateCondition('pasteMode', 'eq', true)],
        },
      ],
    };
  }
  if (kind === 'clear') {
    return {
      actionKind: 'selection-clear',
      variants: [
        {
          key: 'clear_without_selection',
          label: 'Clear with no selection',
          preconditions: [stateCondition('selectionBounds', 'falsy', false)],
          expected: [stateCondition('historyDepth', 'unchanged', null)],
        },
        {
          key: 'clear_with_selection',
          label: 'Clear with an active selection',
          preconditions: [hasSelectionCondition],
          expected: [stateCondition('historyDepth', 'changed', null)],
        },
      ],
    };
  }
  return null;
}

function buildTransformContract(kind) {
  return {
    actionKind: `selection-${kind}`,
    variants: [
      {
        key: `${kind}_without_selection`,
        label: `${kind} with no selection`,
        preconditions: [stateCondition('selectionBounds', 'falsy', false)],
        expected: [stateCondition('historyDepth', 'unchanged', null)],
      },
      {
        key: `${kind}_with_selection`,
        label: `${kind} with an active selection`,
        preconditions: [stateCondition('selectionBounds', 'truthy', true)],
        expected: [
          stateCondition('historyDepth', 'changed', null),
          stateCondition('selectionBounds', 'truthy', true),
        ],
      },
    ],
  };
}

function buildFillOrReplaceContract(kind) {
  if (kind === 'fill') {
    return {
      actionKind: 'selection-fill',
      variants: [
        {
          key: 'fill_without_selection',
          label: 'Fill selection with no selection',
          preconditions: [stateCondition('selectionBounds', 'falsy', false)],
          expected: [stateCondition('historyDepth', 'unchanged', null)],
        },
        {
          key: 'fill_with_selection',
          label: 'Fill selection with an active selection',
          preconditions: [stateCondition('selectionBounds', 'truthy', true)],
          expected: [stateCondition('historyDepth', 'changed', null)],
        },
      ],
    };
  }
  return {
    actionKind: `selection-replace-${kind}`,
    variants: localScenarioMatrix(
      [
        { key: 'hasSelection', values: [false, true] },
        { key: 'hasSample', values: [false, true] },
      ],
      ({ hasSelection, hasSample }) => ({
        key: `replace_${kind}_${hasSelection ? 'sel' : 'no_sel'}_${hasSample ? 'sample' : 'no_sample'}`,
        label: `Replace ${kind.toUpperCase()} with${hasSelection ? '' : 'out'} selection and${hasSample ? '' : 'out'} eyedropper sample`,
        preconditions: [
          stateCondition('selectionBounds', hasSelection ? 'truthy' : 'falsy', hasSelection),
          noteCondition(hasSample ? 'An eyedropper sample exists.' : 'No eyedropper sample exists.'),
        ],
        expected: hasSelection && hasSample
          ? [stateCondition('historyDepth', 'changed', null)]
          : [stateCondition('historyDepth', 'unchanged', null)],
      }),
    ),
  };
}

function buildFindReplaceContract() {
  return {
    actionKind: 'find-replace',
    variants: [
      {
        key: 'find_replace_without_match_criteria',
        label: 'Find & Replace with no match criteria enabled',
        preconditions: [noteCondition('wsFrMatchGlyph, wsFrMatchFg, and wsFrMatchBg are all unchecked.')],
        expected: [stateCondition('historyDepth', 'unchanged', null)],
      },
      {
        key: 'find_replace_without_replacement_criteria',
        label: 'Find & Replace with no replacement criteria enabled',
        preconditions: [noteCondition('At least one match criterion is enabled but all replacement criteria are unchecked.')],
        expected: [stateCondition('historyDepth', 'unchanged', null)],
      },
      {
        key: 'find_replace_selection_scope_without_selection',
        label: 'Find & Replace in selection scope without a selection',
        preconditions: [
          noteCondition('At least one match and one replacement criterion are enabled.'),
          stateCondition('selectionBounds', 'falsy', false),
          noteCondition('Scope is set to selection.'),
        ],
        expected: [stateCondition('historyDepth', 'unchanged', null)],
      },
      {
        key: 'find_replace_valid_run',
        label: 'Find & Replace with valid criteria and addressable scope',
        preconditions: [
          noteCondition('At least one match and one replacement criterion are enabled.'),
          noteCondition('Scope is canvas or selection with a current selection.'),
        ],
        expected: [stateCondition('historyDepth', 'changed', null)],
      },
    ],
  };
}

function buildBrowseActionContract(kind) {
  if (kind === 'reload') {
    return {
      actionKind: 'browse-reload',
      variants: [
        {
          key: 'browse_reload',
          label: 'Reload browse list',
          preconditions: [stateCondition('mode', 'eq', 'browse'), hookCondition('onBrowseList', 'available', true)],
          expected: [hookCondition('onBrowseList', 'invoked', true)],
        },
      ],
    };
  }

  const hookName = `onBrowse${kind[0].toUpperCase()}${kind.slice(1)}`;
  const postPaint = kind === 'open';
  return {
    actionKind: `browse-${kind}`,
    variants: localScenarioMatrix(
      [{ key: 'hasSelection', values: [false, true] }],
      ({ hasSelection }) => ({
        key: `browse_${kind}_${hasSelection ? 'selected' : 'unselected'}`,
        label: `Browse ${kind} with${hasSelection ? '' : 'out'} a selected session`,
        preconditions: [
          stateCondition('mode', 'eq', 'browse'),
          stateCondition('browseSelectedId', hasSelection ? 'truthy' : 'falsy', hasSelection),
          hookCondition(hookName, 'available', true),
        ],
        expected: hasSelection
          ? [
              hookCondition(hookName, 'invoked', true),
              ...(postPaint ? [stateCondition('mode', 'eq', 'paint')] : []),
            ]
          : [hookCondition(hookName, 'invoked', false)],
      }),
    ),
  };
}

function buildLayerContract(kind) {
  if (kind === 'add') {
    return {
      actionKind: 'layer-add',
      variants: [
        {
          key: 'layer_add',
          label: 'Add layer',
          preconditions: [stateCondition('layerCount', 'truthy', true)],
          expected: [
            stateCondition('layerCount', 'changed', null),
            stateCondition('activeLayerIndex', 'changed', null),
            hookCondition('onAddLayer', 'invoked', true),
          ],
        },
      ],
    };
  }
  if (kind === 'delete') {
    return {
      actionKind: 'layer-delete',
      variants: localScenarioMatrix(
        [{ key: 'layerCount', values: [1, 2] }],
        ({ layerCount }) => ({
          key: `layer_delete_${layerCount === 1 ? 'min' : 'multi'}`,
          label: `Delete active layer with ${layerCount} layer${layerCount === 1 ? '' : 's'}`,
          preconditions: [stateCondition('layerCount', 'eq', layerCount)],
          expected: layerCount <= 1
            ? [stateCondition('layerCount', 'eq', 1)]
            : [
                stateCondition('layerCount', 'changed', null),
                hookCondition('onDeleteLayer', 'invoked', true),
              ],
        }),
      ),
    };
  }
  if (kind === 'select') {
    return {
      actionKind: 'layer-select',
      variants: [
        {
          key: 'layer_select_row',
          label: 'Select layer row',
          preconditions: [stateCondition('layerCount', 'gt', 0)],
          expected: [stateCondition('activeLayerIndex', 'changed', null)],
        },
      ],
    };
  }
  if (kind === 'visibility') {
    return {
      actionKind: 'layer-visibility',
      variants: [
        {
          key: 'layer_visibility_toggle',
          label: 'Toggle layer visibility',
          preconditions: [noteCondition('Target layer row exists.')],
          expected: [
            stateCondition('historyDepth', 'changed', null),
            hookCondition('onLayerVisibilityChanged', 'invoked', true),
          ],
        },
      ],
    };
  }
  if (kind === 'lock') {
    return {
      actionKind: 'layer-lock',
      variants: [
        {
          key: 'layer_lock_toggle',
          label: 'Toggle layer lock',
          preconditions: [noteCondition('Target layer row exists.')],
          expected: [stateCondition('historyDepth', 'changed', null)],
        },
      ],
    };
  }
  if (kind === 'move-up' || kind === 'move-down') {
    const isUp = kind === 'move-up';
    return {
      actionKind: `layer-${kind}`,
      variants: [
        {
          key: `${kind}_blocked_edge`,
          label: `${kind} at list edge`,
          preconditions: [noteCondition(isUp ? 'Target layer is already at index 0.' : 'Target layer is already the last layer.')],
          expected: [stateCondition('historyDepth', 'unchanged', null)],
        },
        {
          key: `${kind}_middle`,
          label: `${kind} away from list edge`,
          preconditions: [noteCondition(isUp ? 'Target layer index > 0.' : 'Target layer index < layerCount - 1.')],
          expected: [
            stateCondition('historyDepth', 'changed', null),
            hookCondition('onMoveLayer', 'invoked', true),
          ],
        },
      ],
    };
  }
  return null;
}

function buildWrapperLayerContract(kind) {
  if (kind === 'select') {
    return {
      actionKind: 'wrapper-layer-select',
      variants: [
        {
          key: 'wrapper_layer_select_root_mounted',
          label: 'Wrapper layer select while whole-sheet root is mounted',
          preconditions: [noteCondition('window.__wholeSheetEditor is mounted and exposes setActiveLayer().')],
          expected: [hookCondition('setActiveLayer', 'invoked', true)],
        },
        {
          key: 'wrapper_layer_select_fallback',
          label: 'Wrapper layer select fallback path without mounted whole-sheet root',
          preconditions: [noteCondition('window.__wholeSheetEditor is absent or missing setActiveLayer().')],
          expected: [noteCondition('Falls back to wrapper state.activeLayer + renderAll().')],
        },
      ],
    };
  }
  return {
    actionKind: 'wrapper-layer-visibility',
    variants: [
      {
        key: 'wrapper_layer_visibility_root_mounted',
        label: 'Wrapper layer visibility checkbox while whole-sheet root is mounted',
        preconditions: [noteCondition('window.__wholeSheetEditor is mounted and exposes setLayerVisibility().')],
        expected: [hookCondition('setLayerVisibility', 'invoked', true)],
      },
      {
        key: 'wrapper_layer_visibility_fallback',
        label: 'Wrapper layer visibility fallback path without mounted whole-sheet root',
        preconditions: [noteCondition('window.__wholeSheetEditor is absent or missing setLayerVisibility().')],
        expected: [noteCondition('Falls back to wrapper visibleLayers mutation with no-all-off guard.')],
      },
    ],
  };
}

function classifyContract(control) {
  const handler = normalizeWhitespace(control.handlers[0]?.handlerSource || '');
  if (control.id === 'wsGlyphPickerCanvas') return buildDrawStateContract('glyph');

  const toolMatch = handler.match(/_switchTool\('([^']+)'\)/);
  if (toolMatch) return buildToolActionContract(control, toolMatch[1]);

  if (handler.includes("_setMode('paint')")) return buildSimpleModeContract('paint');
  if (handler.includes("_setMode('browse')")) return buildSimpleModeContract('browse');
  if (handler.includes('editorState.canvasZoom = _normalizeCanvasZoomValue')) return buildDrawStateContract('zoom');
  if (handler.includes('_setDrawGlyph(') || handler.includes("_onPaletteClick(e, 'fg')")) {
    if (handler.includes("_onPaletteClick(e, 'fg')")) return buildDrawStateContract('fg');
    return buildDrawStateContract('glyph');
  }
  if (handler.includes('editorState.drawFg = _hexToRgb')) return buildDrawStateContract('fg');
  if (handler.includes('editorState.drawBg = _hexToRgb') || handler.includes("_onPaletteClick(e, 'bg')")) return buildDrawStateContract('bg');
  if (handler.includes('_onStrokeEnd')) return buildDrawStateContract('stroke-end');
  if (handler === 'undo()' || handler.includes('undo(')) return buildUndoRedoContract('undo');
  if (handler === 'redo()' || handler.includes('redo(')) return buildUndoRedoContract('redo');
  if (handler.includes("_setApplyChannel('glyph', on)")) return buildApplyToggleContract('glyph', control.selector);
  if (handler.includes("_setApplyChannel('foreground', on)")) return buildApplyToggleContract('foreground', control.selector);
  if (handler.includes("_setApplyChannel('background', on)")) return buildApplyToggleContract('background', control.selector);
  if (handler.includes('editorState.gridVisible') || handler.includes("setGridVisible(on)")) return buildGridToggleContract();
  if (handler.includes('editorState.gridStep = gridStepSel.value')) return buildGridStepContract();
  if (handler.includes('_promptResizeDocument(')) return buildResizeContract();
  if (handler.includes('editorState.onSave')) return buildHookOnlyContract('save', 'onSave', 'Save is owned by the wrapper/service callback.');
  if (handler.includes('editorState.onExport')) return buildHookOnlyContract('export', 'onExport', 'Export is owned by the wrapper/service callback.');
  if (handler.includes('_copySelection()')) return buildSelectionClipboardContract('copy');
  if (handler.includes('_cutSelection()')) return buildSelectionClipboardContract('cut');
  if (handler.includes('_enterPasteMode()')) return buildSelectionClipboardContract('paste');
  if (handler.includes('_deleteSelection()')) return buildSelectionClipboardContract('clear');
  if (handler.includes("_transformSelection('rot_cw')")) return buildTransformContract('rotate-cw');
  if (handler.includes("_transformSelection('rot_ccw')")) return buildTransformContract('rotate-ccw');
  if (handler.includes("_transformSelection('flip_h')")) return buildTransformContract('flip-h');
  if (handler.includes("_transformSelection('flip_v')")) return buildTransformContract('flip-v');
  if (handler.includes('_fillSelection()')) return buildFillOrReplaceContract('fill');
  if (handler.includes("_replaceSelectionColor('fg')")) return buildFillOrReplaceContract('fg');
  if (handler.includes("_replaceSelectionColor('bg')")) return buildFillOrReplaceContract('bg');
  if (handler.includes('_findReplace()')) return buildFindReplaceContract();
  if (handler.includes('_refreshBrowseItems')) return buildBrowseActionContract('reload');
  if (handler.includes('_browseOpenSelected(')) return buildBrowseActionContract('open');
  if (handler.includes('_browseRenameSelected(')) return buildBrowseActionContract('rename');
  if (handler.includes('_browseDuplicateSelected(')) return buildBrowseActionContract('duplicate');
  if (handler.includes('_browseDeleteSelected(')) return buildBrowseActionContract('delete');
  if (handler.includes('_addLayer()')) return buildLayerContract('add');
  if (handler.includes('_deleteActiveLayer()')) return buildLayerContract('delete');
  if (handler.includes('_switchActiveLayer(i)')) return buildLayerContract('select');
  if (handler.includes('_toggleLayerVisibility(i)')) return buildLayerContract('visibility');
  if (handler.includes('_toggleLayerLock(i)')) return buildLayerContract('lock');
  if (handler.includes('_moveLayerUp(i)')) return buildLayerContract('move-up');
  if (handler.includes('_moveLayerDown(i)')) return buildLayerContract('move-down');
  if (handler.includes('wsEditor.setActiveLayer')) return buildWrapperLayerContract('select');
  if (handler.includes('wsEditor.setLayerVisibility')) return buildWrapperLayerContract('visibility');

  return null;
}

function buildActionContracts(controls) {
  return controls.map((control) => {
    const contract = classifyContract(control);
    return {
      controlId: control.controlId,
      selector: control.selector,
      elementType: control.elementType,
      inputType: control.inputType,
      textContent: control.textContent,
      title: control.title,
      sourceFile: control.sourceFile,
      line: control.line,
      eventType: control.handlers[0]?.eventType || null,
      handlerSource: control.handlers[0]?.handlerSource || '',
      dynamicParam: control.dynamicParam || null,
      contract,
      mapped: !!contract,
    };
  });
}

function buildSummary(actionContracts, observableStateFields) {
  const mapped = actionContracts.filter((action) => action.mapped);
  const unmapped = actionContracts.filter((action) => !action.mapped);
  return {
    extractedControlCount: actionContracts.length,
    mappedControlCount: mapped.length,
    unmappedControlCount: unmapped.length,
    variantCount: mapped.reduce((sum, action) => sum + (action.contract?.variants?.length || 0), 0),
    observableStateFields,
    generatorStrategy: {
      approach: 'local-action-state-matrix',
      note: 'This generator does not expand the full global 2^n state space. It enumerates only the state predicates relevant to each control contract.',
    },
    unmappedControls: unmapped.map((action) => ({
      controlId: action.controlId,
      selector: action.selector,
      handlerSource: action.handlerSource,
      sourceFile: action.sourceFile,
      line: action.line,
    })),
  };
}

function buildWholeSheetContractReport() {
  const wholeSheetSource = readSource(WHOLE_SHEET_PATH);
  const workbenchSource = readSource(WORKBENCH_PATH);
  const observableStateFields = parseObservableStateFields(wholeSheetSource);

  const controls = dedupeControls([
    ...parseControlBlocks(wholeSheetSource, 'web/whole-sheet-init.js'),
    ...parseToggleControls(wholeSheetSource, 'web/whole-sheet-init.js'),
    ...parseWrapperControls(workbenchSource, 'web/workbench.js'),
  ]);
  addDynamicLayerControls(controls);

  const actionContracts = buildActionContracts(dedupeControls(controls));
  const summary = buildSummary(actionContracts, observableStateFields);

  return {
    generatedAt: new Date().toISOString(),
    repoRoot: REPO_ROOT,
    sourceFiles: ['web/whole-sheet-init.js', 'web/workbench.js'],
    observableStateFields,
    summary,
    actions: actionContracts,
  };
}

function renderMarkdown(report) {
  const lines = [];
  lines.push('# Whole-Sheet Action Contracts');
  lines.push('');
  lines.push(`Generated: ${report.generatedAt}`);
  lines.push('');
  lines.push('## Summary');
  lines.push('');
  lines.push(`- Extracted controls: ${report.summary.extractedControlCount}`);
  lines.push(`- Mapped controls: ${report.summary.mappedControlCount}`);
  lines.push(`- Unmapped controls: ${report.summary.unmappedControlCount}`);
  lines.push(`- Generated action variants: ${report.summary.variantCount}`);
  lines.push(`- State-space strategy: ${report.summary.generatorStrategy.approach}`);
  lines.push(`- Note: ${report.summary.generatorStrategy.note}`);
  lines.push('');
  lines.push('## Observable State Fields');
  lines.push('');
  for (const field of report.observableStateFields) lines.push(`- \`${field}\``);
  lines.push('');
  lines.push('## Contracts');
  lines.push('');
  lines.push('| Selector | Event | Handler | Variant | Preconditions | Expected | Mapping |');
  lines.push('| --- | --- | --- | --- | --- | --- | --- |');

  for (const action of report.actions) {
    const variants = action.contract?.variants || [{
      key: 'unmapped',
      label: 'Unmapped control',
      preconditions: [],
      expected: [],
    }];
    for (const variant of variants) {
      const pre = (variant.preconditions || [])
        .map((item) => item.surface === 'note'
          ? item.note
          : item.surface === 'hook'
            ? `${item.hookName} ${item.op}`
            : `${item.surface}.${item.field || item.selector} ${item.op}${item.value !== null && item.value !== undefined ? ` ${JSON.stringify(item.value)}` : ''}`)
        .join('<br>');
      const expected = (variant.expected || [])
        .map((item) => item.surface === 'note'
          ? item.note
          : item.surface === 'hook'
            ? `${item.hookName} ${item.op}`
            : `${item.surface}.${item.field || item.selector} ${item.op}${item.value !== null && item.value !== undefined ? ` ${JSON.stringify(item.value)}` : ''}`)
        .join('<br>');
      lines.push(`| \`${action.selector || action.controlId}\` | \`${action.eventType || '-'}\` | \`${action.handlerSource || '-'}\` | \`${variant.label}\` | ${pre || '-'} | ${expected || '-'} | ${action.mapped ? 'mapped' : 'UNMAPPED'} |`);
    }
  }

  if (report.summary.unmappedControls.length) {
    lines.push('');
    lines.push('## Unmapped Controls');
    lines.push('');
    for (const control of report.summary.unmappedControls) {
      lines.push(`- \`${control.selector || control.controlId}\` at \`${control.sourceFile}:${control.line}\` -> \`${control.handlerSource}\``);
    }
  }

  return `${lines.join('\n')}\n`;
}

function ensureParentDir(filePath) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
}

function writeOutputs(report, jsonOut, mdOut) {
  ensureParentDir(jsonOut);
  ensureParentDir(mdOut);
  fs.writeFileSync(jsonOut, JSON.stringify(report, null, 2));
  fs.writeFileSync(mdOut, renderMarkdown(report));
}

function parseArgs(argv) {
  const args = {
    jsonOut: DEFAULT_JSON_OUT,
    mdOut: DEFAULT_MD_OUT,
    stdout: false,
  };
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === '--json-out') args.jsonOut = path.resolve(REPO_ROOT, argv[++i]);
    else if (arg === '--md-out') args.mdOut = path.resolve(REPO_ROOT, argv[++i]);
    else if (arg === '--stdout') args.stdout = true;
  }
  return args;
}

export {
  buildWholeSheetContractReport,
  renderMarkdown,
};

if (import.meta.url === `file://${process.argv[1]}`) {
  const args = parseArgs(process.argv.slice(2));
  const report = buildWholeSheetContractReport();
  writeOutputs(report, args.jsonOut, args.mdOut);
  if (args.stdout) {
    process.stdout.write(JSON.stringify({
      jsonOut: args.jsonOut,
      mdOut: args.mdOut,
      extractedControlCount: report.summary.extractedControlCount,
      mappedControlCount: report.summary.mappedControlCount,
      unmappedControlCount: report.summary.unmappedControlCount,
      variantCount: report.summary.variantCount,
    }, null, 2) + '\n');
  } else {
    process.stdout.write(
      [
        `json_out=${shellQuote(args.jsonOut)}`,
        `md_out=${shellQuote(args.mdOut)}`,
        `extracted=${report.summary.extractedControlCount}`,
        `mapped=${report.summary.mappedControlCount}`,
        `unmapped=${report.summary.unmappedControlCount}`,
        `variants=${report.summary.variantCount}`,
      ].join('\n') + '\n',
    );
  }
}
