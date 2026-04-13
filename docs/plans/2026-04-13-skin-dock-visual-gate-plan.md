# Skin Dock Visual Gate Plan

**Created:** 2026-04-13
**Status:** PLANNING — unimplemented
**Depends on:** audit findings in PLAYWRIGHT_FAILURE_LOG.md § "G-RANDOM Visual Fidelity Gap"
**Goal:** Add a machine-readable gate that proves the authored XP skin is visually rendered by the TERM++ runtime in the Skin Dock, not an invisible/default sprite.

---

## Background

G-RANDOM seeds 2 and 3 passed all stability gates (pipeline builds, WASM loads, RAF advances, 0 crashes) but the character appeared invisible in the Skin Dock. The gate is a false positive. Root cause is undiagnosed. This plan closes the gap.

Two audit sources:
- `render_oracle.js` in `asciicker-Y9-2/.worktrees/bug1-remote-pose/scripts/` — cell buffer oracle, portability 3/5
- `PLAYWRIGHT_FAILURE_LOG.md` + `run_randomized_bundle_test.mjs` — Skin Dock infrastructure history

---

## What Is Known

### Injection path (workbench.js:1314 `injectBundleIntoWebbuild`)
```
bundlePayload.actions[key].xp_b64  →  b64ToUint8Array()  →  emfsReplaceFile(M, /sprites/name, bytes)
→  win.Load(playerName)  →  TERM++ runtime reloads sprite files from EMFS
```
- The return value `{ bytes: xpBytes.length, files: names.length }` is never logged by the Playwright runner — so byte counts are unknown at test time.
- If `xp_b64` is empty string: `b64ToUint8Array("")` = 0-byte array → 0-byte file written → runtime reads empty sprite → invisible.

### Canvas pixel access
- Iframe `#webbuildFrame` loads `./termpp-web-flat/index.html?solo=1&player=player` — **same-origin, no sandbox**.
- Canvas element: `#asciicker_canvas` inside iframe.
- `canvas.getContext('2d').getImageData(x, y, w, h)` is callable from within iframe context via `frameHandle.evaluate()`.
- Parent page cannot directly read iframe canvas (XSS boundary), but Playwright `frameHandle.evaluate()` executes inside iframe context.

### Cell buffer (`ak_buf`)
- `window.ak_buf` is **NOT exposed** in this repo's `runtime/termpp-skin-lab-static/termpp-web-flat/index.html` (same gap as Y9-2 worktree).
- The buffer is a live `Uint8Array` view of the WASM game's cell data: `[fg, bk, glyph, spare]` per cell, 4 bytes each.
- Exposing it requires a 1-line JS change inside `index.html` (after the FS buffer is created): `window.ak_buf = ak_buf; window.ak_width = render_w; window.ak_height = render_h;`

### Runtime debug surfaces available
```javascript
window.__ak_diag.raf          // frame counter
window.__ak_diag.crashes      // crash count
window.GameWorldReady()       // boolean
window.GetRenderStageCode()   // number (70+ = world running)
window.ak.getPos(arr, idx)    // player world position XYZ
window.Load(playerName)       // reload sprite
window.Keyb(code, count)      // keyboard sim
```
No pixel-read or cell-read surface exists yet.

### Render oracle (Y9-2 — not in this repo yet)
6-unit oracle (`render_oracle.js`, 344 lines) that:
1. Reads `window.ak_buf` cell buffer (currently not exposed)
2. Applies isometric projection (render.cpp matrix math ported to JS)
3. Scans ±12 cells around projected position for an expected glyph code
4. Reports body_ok, overdraw, diagnosis

Portability: **3/5** — isometric math and region scan are reusable; multi-player guards need simplification (~60 lines → ~12 lines); expected glyph is C++ dynamic value (must inject from XP Layer 2 or known constant).

---

## Diagnostic Split

Two root causes possible:

| Hypothesis | Test | Expected outcome if true |
|------------|------|--------------------------|
| **Injection bug**: xp_b64 empty/wrong, override_names mismatch, or emfsReplaceFile writes wrong path | Log byte counts + override_names before Load() | 0-byte writes or wrong filenames |
| **Rendering bug**: bytes reach FS correctly but TERM++ renders native/default instead of custom | Canvas pixel probe shows no yellow `#ffff55` cells at character position despite correct injection | Pixels are wrong color or absent |

**Phase 0 is mandatory first** — determining which branch applies changes what Phase 1 fixes.

---

## Phase 0: Injection Diagnostics (unblock Phase 1)

**Scope:** Add 5-10 lines to the G-RANDOM runner's Skin Dock step.

**What to add to `run_randomized_bundle_test.mjs`** (after `testCurrentSkinInDock()` call, before runaround):

```javascript
// Diagnostic: log bundle injection byte counts and override names
const injectionDiag = await page.evaluate(() => {
  const s = window.__wb_debug?._state?.();
  const payload = s?.lastBundlePayload;  // if exposed
  if (!payload) return { error: 'no_payload' };
  const diag = {};
  for (const [key, data] of Object.entries(payload.actions || {})) {
    diag[key] = {
      xp_b64_len: (data.xp_b64 || '').length,
      override_names: data.override_names,
    };
  }
  return diag;
});
console.error('[INJECT_DIAG]', JSON.stringify(injectionDiag));
```

**If xp_b64_len is 0 for any action** → injection bug. Fix: trace why the bundle payload has empty xp_b64 at the point of Skin Dock injection (is the export completing before injection? is the API returning empty payload?).

**If override_names are wrong** → naming mismatch. Compare against what the TERM++ runtime expects (likely `player-0100.xp`, `attack-0001.xp`, `plydie-0000.xp` based on native sprite filenames).

**If both look correct** → rendering bug, proceed to Phase 1.

**Note:** `window.__wb_debug._state()` may not expose `lastBundlePayload`. Alternatively, intercept `injectBundleIntoWebbuild` return value by logging it in workbench.js (diagnostic build only) or by reading from `win.Module.FS.readFile('/sprites/player-0100.xp')` after injection to confirm bytes were written.

---

## Phase 1: Canvas Pixel Probe (simpler visual gate)

**When:** After Phase 0 confirms injection is correct (or fixes injection bug).
**Scope:** ~30-50 lines in test runner + helper function.
**No runtime modification required.**

### How it works

After runaround completes, inject a probe into the iframe context:

```javascript
// In run_randomized_bundle_test.mjs after runaround:
const pixelResult = await frameHandle.evaluate(async () => {
  const canvas = document.getElementById('asciicker_canvas');
  if (!canvas) return { error: 'no_canvas' };
  const ctx = canvas.getContext('2d');
  if (!ctx) return { error: 'no_ctx' };

  // Get player world position
  const pos = new Float32Array(4);
  window.ak?.getPos?.(pos, 0);

  // Sample a region around canvas center (player is roughly centered)
  const cx = Math.floor(canvas.width / 2);
  const cy = Math.floor(canvas.height / 2);
  const w = 60, h = 80;  // ~6 cells × ~8 cells in pixels
  const imageData = ctx.getImageData(cx - w/2, cy - h/2, w, h);

  // Count non-background pixels (anything not pure black or dark grey)
  let nonBg = 0;
  for (let i = 0; i < imageData.data.length; i += 4) {
    const r = imageData.data[i], g = imageData.data[i+1], b = imageData.data[i+2];
    // Background is typically near-black in Asciicker's arena
    if (r > 30 || g > 30 || b > 30) nonBg++;
  }

  return {
    canvas_size: [canvas.width, canvas.height],
    sample_region: [cx - w/2, cy - h/2, w, h],
    player_world_pos: Array.from(pos.slice(0,3)),
    non_bg_pixels: nonBg,
    total_pixels: w * h,
  };
});
console.error('[PIXEL_PROBE]', JSON.stringify(pixelResult));
```

### Gate criteria (Phase 1 v1 — permissive)
```
render_skin_pixels_ok = pixelResult.non_bg_pixels >= 20
```
Any 20 non-background pixels in a 60×80 region centered on the canvas = character is visible.

### Gate criteria (Phase 1 v2 — color-matching)
Use `scripts/xp_cat.py --hb` to extract the dominant background color from the XP's visual layer (expected: `#ffff55` for vanilla reference sprites). Compare sampled pixels:
```
render_skin_color_ok = sampled_dominant_color ≈ #ffff55 (±20 per channel)
```
This is stronger — proves the authored XP colors appear on screen.

### Blocker
The probe assumes the player character is near canvas center. If the player has drifted far from center during the 10s runaround, the sample region misses the character. Mitigation: use `window.ak.getPos()` + a simplified isometric projection to compute approximate pixel position before sampling.

---

## Phase 2: Oracle Adaptation (ideal cell-level gate)

**When:** After Phase 1 is working and more precision is needed.
**Scope:** ~150 lines new file + 1-line runtime patch + ~20 lines runner integration.
**Requires:** 1-line change to `runtime/termpp-skin-lab-static/termpp-web-flat/index.html`.

### Step 2.1: Expose ak_buf in runtime

Find the line in `runtime/termpp-skin-lab-static/termpp-web-flat/index.html` where `ak_buf` is created (look for `new Uint8Array(heap.buffer, mem, render_w*render_h*4)`). Add after it:
```javascript
window.ak_buf = ak_buf;
window.ak_width = render_w;
window.ak_height = render_h;
```
This is a read-only data exposure. Low risk for single-player solo mode.

### Step 2.2: Create `scripts/skin_dock_oracle.js`

New 150-line single-player oracle. Port from `render_oracle.js` in Y9-2, simplified:
- **Keep:** isometric projection math (oracle_matrix, oracle_project — proven correct per C++ spec)
- **Keep:** region-bounded glyph scanner (oracle_scan_region)
- **Keep:** IIR Z-smoothing for cold-start suppression
- **Drop:** all multi-player guards (remote0_*, pose_source, yaw-latch for remote player)
- **Add:** single-player guard (`player_spawned` flag, `suppress` counter)
- **Input:** `expected_glyph` injected as test parameter (not C++ dynamic value)

Expected glyph extraction: read XP Layer 2 at the first frame's center cell using Python:
```bash
python3 - <<'EOF'
import sys; sys.path.insert(0, 'scripts')
from xp_core import XPFile
xp = XPFile('sprites/player-0100.xp')
layer = xp.layers[2]
# Frame 0, center cell: frame_w=9, frame_h=10 (from metadata)
center_x, center_y = 4, 5
glyph = layer.data[center_y][center_x][0]
print(glyph)
EOF
```

### Step 2.3: Integrate into runner

```javascript
// In run_randomized_bundle_test.mjs, during runaround:
const oracleSrc = fs.readFileSync('scripts/skin_dock_oracle.js', 'utf8');
await frameHandle.evaluate(oracleSrc);
await frameHandle.evaluate((expectedGlyph) => {
  window._sdk_oracle_init({ expected_glyph: expectedGlyph, player_spawned: true });
}, expectedGlyph);

// Per-second sample:
const sample = await frameHandle.evaluate(() => window._sdk_oracle_sample());
```

### Step 2.4: Wire gate

```javascript
const render_skin_visible = oracleSamples.filter(s => s.body_ok === true).length >= 3;
result.gates.render_skin_visible = render_skin_visible;
```

---

## Decision Tree

```
Phase 0: Log injection byte counts
    │
    ├── xp_b64_len === 0 for any action
    │       → FIX INJECTION BUG first
    │       → Then re-run Phase 0 to confirm fix
    │       → Then proceed to Phase 1
    │
    └── xp_b64_len > 0 AND override_names correct
            │
            ├── Phase 1 pixel probe: non_bg_pixels < 20
            │       → Rendering bug confirmed
            │       → Try Phase 2 oracle for cell-level diagnosis
            │
            └── Phase 1 pixel probe: non_bg_pixels >= 20
                    → Character IS rendering — the invisible appearance
                      was likely a color perception issue during manual review
                    → Upgrade to Phase 1 v2 color-matching for precision
                    → Wire Phase 1 v2 as gate
```

---

## Summary of Approaches

| Approach | Lines | Runtime mod | Precision | Status |
|----------|-------|-------------|-----------|--------|
| Phase 0: injection diagnostics | ~10 | No | Diagnostic only | FIRST STEP |
| Phase 1 v1: pixel count | ~30 | No | Low (any pixels) | Simple gate |
| Phase 1 v2: color match | ~50 | No | Medium (XP color match) | Stronger gate |
| Phase 2: cell oracle | ~170 | Yes (1 line) | High (glyph + position) | Ideal gate |

**Recommended execution order:** Phase 0 → Phase 1 v1 → Phase 1 v2 → Phase 2 (only if cell-level precision is needed for M2 closeout criteria).

---

## Files to Create / Modify

| File | Action | Phase |
|------|--------|-------|
| `scripts/xp_fidelity_test/run_randomized_bundle_test.mjs` | Add injection diag + pixel probe step | 0, 1 |
| `scripts/skin_dock_oracle.js` | Create (new, ~150 lines) | 2 |
| `runtime/termpp-skin-lab-static/termpp-web-flat/index.html` | Add 1-line ak_buf exposure | 2 |
| `docs/plans/2026-03-23-workbench-canonical-spec.md` | Update G-RANDOM gate status when proven | All |
| `PLAYWRIGHT_FAILURE_LOG.md` | Add evidence entries as phases complete | All |
