'use strict';
// scripts/skin_dock_oracle.js
// Single-player skin dock render oracle.
//
// Reads window.ak_buf (WASM cell buffer, exposed by 1-line runtime patch) and scans
// a region around screen center for the expected glyph. Single-player version of the
// Y9-2 render_oracle.js: the local player is followed by the camera, so the player
// projects to approximately (W/2, H/2) in cell space.
//
// Ported from render_oracle.js (Y9-2 bug1-remote-pose branch):
//   KEPT:   oracle_readCellBuffer, oracle_scan_region structure
//   KEPT:   cold-start suppression counter
//   DROPPED: all multi-player guards (remote0_*, pose_source, camera_yaw latch)
//   DROPPED: isometric projection (not needed — single player is at screen center)
//   ADDED:  single-player guard (suppress counter only; no pos needed)
//
// Usage (from Playwright runner via frameHandle.evaluate):
//   const oracleSrc = fs.readFileSync('scripts/skin_dock_oracle.js', 'utf8');
//   await frameHandle.evaluate(oracleSrc);
//   await frameHandle.evaluate((g) => window._sdk_oracle_init({ expected_glyph: g }), glyph);
//   const sample = await frameHandle.evaluate(() => window._sdk_oracle_sample());
//
// Requires: window.ak_buf (Uint8Array), window.ak_width, window.ak_height
//   These are script-level vars in the runtime. The runtime patch adds
//   window.ak_buf=ak_buf immediately after the Uint8Array creation so the oracle
//   reads the current buffer instance.
//
// AnsiCell buffer layout (render.cpp / game_types.h):
//   Each cell is 4 bytes: [fg:uint8, bk:uint8, glyph:uint8, spare:uint8]
//   Buffer is row-major: cell(col, row) at offset (row * width + col) * 4
//   glyph byte is at offset + 2.

(function () {
  'use strict';

  // ---- Constants ----
  var _SUPPRESS_DEFAULT = 10; // samples suppressed after cold start
  var _SCAN_R = 15;           // scan radius in cells around screen center

  // ---- Oracle state (persistent within the iframe page session) ----
  if (!window.__sdk_oracle_state) {
    window.__sdk_oracle_state = {
      suppress: _SUPPRESS_DEFAULT,
      expected_glyph: null,
      initialized: false,
      sample_count: 0,
    };
  }

  // ---- window._sdk_oracle_init ----
  // Call once after WASM is ready and playable state is confirmed.
  // opts.expected_glyph  — CP437 glyph code (number) to scan for near screen center
  // opts.suppress        — optional override for cold-start suppression count
  window._sdk_oracle_init = function (opts) {
    var st = window.__sdk_oracle_state;
    st.expected_glyph = (opts && opts.expected_glyph != null) ? opts.expected_glyph : null;
    st.suppress = (opts && typeof opts.suppress === 'number') ? opts.suppress : _SUPPRESS_DEFAULT;
    st.initialized = true;
    st.sample_count = 0;
  };

  // ---- Cell buffer reader ----
  // Returns {ok, buf, w, h} or {ok:false, reason}.
  // Makes a COPY of the buffer to prevent torn reads from WASM growth events.
  function _readCellBuffer() {
    try {
      var buf = window.ak_buf;
      var w = window.ak_width;
      var h = window.ak_height;
      if (!buf || !w || !h) return { ok: false, reason: 'ORACLE_NOT_READY' };
      // Detect detached backing ArrayBuffer (WASM memory growth invalidates views)
      if (buf.buffer.byteLength === 0) return { ok: false, reason: 'ORACLE_PTR_DRIFT' };
      if (buf.length !== w * h * 4) return { ok: false, reason: 'ORACLE_DIM_MISMATCH', w: w, h: h };
      return { ok: true, buf: new Uint8Array(buf), w: w, h: h };
    } catch (e) {
      return { ok: false, reason: 'ORACLE_READ_FAIL', err: String(e) };
    }
  }

  // ---- Region scanner ----
  // Scans ±r cells around (c0, r0) for all cells where glyph byte == code.
  function _scanRegion(code, buf, w, h, c0, r0, r) {
    var hits = [];
    var rmin = r0 - r < 0 ? 0 : r0 - r;
    var rmax = r0 + r >= h ? h - 1 : r0 + r;
    var cmin = c0 - r < 0 ? 0 : c0 - r;
    var cmax = c0 + r >= w ? w - 1 : c0 + r;
    for (var ri = rmin; ri <= rmax; ri++) {
      var base = ri * w;
      for (var ci = cmin; ci <= cmax; ci++) {
        if (buf[(base + ci) * 4 + 2] === code) {
          hits.push({ col: ci, row: ri });
        }
      }
    }
    return hits;
  }

  // ---- window._sdk_oracle_sample ----
  // Call once per second during runaround. Returns a flat diagnostic object.
  // body_ok === true  — expected glyph found near screen center (skin is rendering)
  // body_ok === false — glyph not found (skin may be absent or wrong frame)
  // body_ok === null  — oracle not ready (suppressed, not initialized, or read fail)
  window._sdk_oracle_sample = function () {
    var st = window.__sdk_oracle_state;
    var out = {
      oracle_ready: false,
      oracle_read_fail: false,
      oracle_ptr_drift: false,
      body_ok: null,
      glyph_hits: 0,
      scan_center_col: null,
      scan_center_row: null,
      scan_radius: _SCAN_R,
      expected_glyph: st.expected_glyph,
      buf_w: null,
      buf_h: null,
      suppress_remaining: st.suppress,
      oracle_ready_reason: null,
      sample_count: st.sample_count,
    };

    st.sample_count++;

    if (!st.initialized) {
      out.oracle_ready_reason = 'ORACLE_NOT_INITIALIZED';
      return out;
    }

    if (st.suppress > 0) {
      st.suppress--;
      out.oracle_ready_reason = 'ORACLE_SUPPRESSED';
      return out;
    }

    if (st.expected_glyph === null || st.expected_glyph === undefined) {
      out.oracle_ready_reason = 'ORACLE_NO_EXPECTED_GLYPH';
      return out;
    }

    var br = _readCellBuffer();
    if (!br.ok) {
      out.oracle_read_fail = br.reason === 'ORACLE_READ_FAIL' || br.reason === 'ORACLE_DIM_MISMATCH';
      out.oracle_ptr_drift = br.reason === 'ORACLE_PTR_DRIFT';
      out.oracle_ready_reason = br.reason;
      return out;
    }

    var W = br.w;
    var H = br.h;
    var c0 = W >> 1;
    var r0 = H >> 1;

    out.buf_w = W;
    out.buf_h = H;
    out.scan_center_col = c0;
    out.scan_center_row = r0;
    out.oracle_ready = true;

    var hits = _scanRegion(st.expected_glyph, br.buf, W, H, c0, r0, _SCAN_R);
    out.glyph_hits = hits.length;
    out.body_ok = hits.length > 0;

    return out;
  };

}());
