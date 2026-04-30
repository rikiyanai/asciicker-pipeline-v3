/**
 * Touch Gestures Module — two-pointer pinch-zoom and pan detection.
 *
 * Exports:
 *   attach(canvas, callbacks) — start tracking pointer events on canvas
 *   detach(canvas)            — stop tracking and clean up
 *
 * Callbacks:
 *   onGestureStart()                — two pointers active, entering gesture mode
 *   onPinch(zoomDelta)              — continuous zoom delta during pinch
 *   onPan(dx, dy)                   — continuous pan delta in CSS pixels
 *   onGestureEnd(snappedZoomLevel)  — gesture ended, zoom snapped to discrete level
 *
 * Discrete zoom snap levels: 0.5, 0.75, 1.0, 1.5, 2.0, 3.0, 4.0
 */

const ZOOM_LEVELS = [0.5, 0.75, 1.0, 1.5, 2.0, 3.0, 4.0];

/** Minimum change in pinch distance (px) before reporting a zoom delta. */
const MIN_PINCH_DELTA = 8;

/**
 * Snap a continuous zoom value to the nearest discrete level.
 * @param {number} zoom
 * @returns {number}
 */
function snapToLevel(zoom) {
  let best = ZOOM_LEVELS[0];
  let bestDist = Math.abs(zoom - best);
  for (let i = 1; i < ZOOM_LEVELS.length; i++) {
    const d = Math.abs(zoom - ZOOM_LEVELS[i]);
    if (d < bestDist) {
      best = ZOOM_LEVELS[i];
      bestDist = d;
    }
  }
  return best;
}

/** Per-canvas state, keyed by the canvas element itself. */
const _states = new WeakMap();

/**
 * Compute the Euclidean distance between two pointer entries.
 */
function _pinchDistance(a, b) {
  const dx = a.clientX - b.clientX;
  const dy = a.clientY - b.clientY;
  return Math.sqrt(dx * dx + dy * dy);
}

/**
 * Compute the midpoint between two pointer entries (in client coords).
 */
function _midpoint(a, b) {
  return {
    x: (a.clientX + b.clientX) / 2,
    y: (a.clientY + b.clientY) / 2,
  };
}

// ── Event handlers ──

function _onPointerDown(e) {
  const state = _states.get(e.currentTarget);
  if (!state) return;

  // Only track the first two pointers
  if (state.pointers.size >= 2) return;

  state.pointers.set(e.pointerId, {
    clientX: e.clientX,
    clientY: e.clientY,
  });

  if (state.pointers.size === 2) {
    // Enter gesture mode
    state.gestureActive = true;
    const entries = Array.from(state.pointers.values());
    state.lastDist = _pinchDistance(entries[0], entries[1]);
    state.lastMid = _midpoint(entries[0], entries[1]);
    state.accumDist = 0;
    if (state.callbacks.onGestureStart) {
      state.callbacks.onGestureStart();
    }
  }
}

function _onPointerMove(e) {
  const state = _states.get(e.currentTarget);
  if (!state) return;
  if (!state.pointers.has(e.pointerId)) return;

  // Update this pointer's position
  state.pointers.set(e.pointerId, {
    clientX: e.clientX,
    clientY: e.clientY,
  });

  if (!state.gestureActive || state.pointers.size < 2) return;

  const entries = Array.from(state.pointers.values());
  const dist = _pinchDistance(entries[0], entries[1]);
  const mid = _midpoint(entries[0], entries[1]);

  // Pan: delta of midpoint
  const dx = mid.x - state.lastMid.x;
  const dy = mid.y - state.lastMid.y;
  if (dx !== 0 || dy !== 0) {
    if (state.callbacks.onPan) {
      state.callbacks.onPan(dx, dy);
    }
  }
  state.lastMid = mid;

  // Pinch: ratio of distance change → zoom delta
  const distDelta = dist - state.lastDist;
  state.accumDist += distDelta;
  if (Math.abs(state.accumDist) >= MIN_PINCH_DELTA) {
    // Positive accumDist = fingers moving apart = zoom in
    // Produce a multiplicative zoom delta: > 1 means zoom in, < 1 means zoom out
    const zoomDelta = dist / state.lastDist;
    if (state.callbacks.onPinch) {
      state.callbacks.onPinch(zoomDelta);
    }
    state.accumDist = 0;
  }
  state.lastDist = dist;
}

function _onPointerUpOrCancel(e) {
  const state = _states.get(e.currentTarget);
  if (!state) return;
  if (!state.pointers.has(e.pointerId)) return;

  state.pointers.delete(e.pointerId);

  if (state.gestureActive && state.pointers.size < 2) {
    state.gestureActive = false;
    if (state.callbacks.onGestureEnd) {
      state.callbacks.onGestureEnd(snapToLevel);
    }
  }
}

// ── Public API ──

/**
 * Attach pinch/pan gesture tracking to a canvas element.
 *
 * @param {HTMLElement} canvas — the element to track pointers on
 * @param {Object} callbacks — { onGestureStart, onPinch, onPan, onGestureEnd }
 */
export function attach(canvas, callbacks) {
  if (_states.has(canvas)) {
    detach(canvas);
  }

  const state = {
    pointers: new Map(),
    gestureActive: false,
    lastDist: 0,
    lastMid: { x: 0, y: 0 },
    accumDist: 0,
    callbacks: callbacks || {},
    // Bound handlers for cleanup
    _onPointerDown: _onPointerDown,
    _onPointerMove: _onPointerMove,
    _onPointerUpOrCancel: _onPointerUpOrCancel,
  };

  _states.set(canvas, state);

  canvas.addEventListener('pointerdown', _onPointerDown);
  canvas.addEventListener('pointermove', _onPointerMove);
  canvas.addEventListener('pointerup', _onPointerUpOrCancel);
  canvas.addEventListener('pointercancel', _onPointerUpOrCancel);
  canvas.addEventListener('pointerleave', _onPointerUpOrCancel);
}

/**
 * Detach all gesture tracking from a canvas element.
 *
 * @param {HTMLElement} canvas
 */
export function detach(canvas) {
  const state = _states.get(canvas);
  if (!state) return;

  canvas.removeEventListener('pointerdown', _onPointerDown);
  canvas.removeEventListener('pointermove', _onPointerMove);
  canvas.removeEventListener('pointerup', _onPointerUpOrCancel);
  canvas.removeEventListener('pointercancel', _onPointerUpOrCancel);
  canvas.removeEventListener('pointerleave', _onPointerUpOrCancel);

  _states.delete(canvas);
}

/**
 * Check if a gesture is currently active on the given canvas.
 *
 * @param {HTMLElement} canvas
 * @returns {boolean}
 */
export function isGestureActive(canvas) {
  const state = _states.get(canvas);
  return state ? state.gestureActive : false;
}

export { ZOOM_LEVELS, snapToLevel };
