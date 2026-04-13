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
- The return value `{ bytes: xpBytes.length, files: names.length }` **is** written to `#webbuildOut` by workbench.js as the `inject` field of the JSON payload summary. Byte counts are accessible via `page.evaluate(() => document.getElementById('webbuildOut')?.textContent)` — zero new logging code required.
- If `xp_b64` is empty string: `b64ToUint8Array("")` = 0-byte array → 0-byte file written → runtime reads empty sprite → invisible.

### Canvas pixel access
- Iframe `#webbuildFrame` loads `./termpp-web-flat/index.html?solo=1&player=player` — **same-origin, no sandbox**.
- Canvas element: `#asciicker_canvas` inside iframe.
- **`#asciicker_canvas` is WebGL-bound** (`ak_ctx = ak_canvas.getContext("webgl", {alpha:false,...})`). Calling `getContext('2d')` on an already-WebGL-bound canvas returns `null`; `getImageData` cannot be used.
- Pixel reads require WebGL: `window.ak_ctx.readPixels(x, y, w, h, gl.RGBA, gl.UNSIGNED_BYTE, pixels)` — but this also returns zeros unless the WebGL context was created with `preserveDrawingBuffer:true` (default is false). **Phase 1 requires a 1-line runtime change** to add `preserveDrawingBuffer:true` to the WebGL context options in index.html.
- Parent page cannot directly read iframe canvas (XSS boundary), but Playwright `frameHandle.evaluate()` executes inside iframe context — `window.ak_ctx` is accessible from there.

### Cell buffer (`ak_buf`)
- `window.ak_buf` is **NOT exposed** in this repo's `runtime/termpp-skin-lab-static/termpp-web-flat/index.html` (same gap as Y9-2 worktree).
- The buffer is a live `Uint8Array` view of the WASM game's cell data: `[fg, bk, glyph, spare]` per cell, 4 bytes each.
- Exposing it requires adding `window.ak_buf = ak_buf;` after the `ak_buf=new Uint8Array(...)` line in index.html. `ak_width` and `ak_height` are already globally accessible as script vars.

### Runtime debug surfaces available
```javascript
window.__ak_diag.raf          // frame counter
window.__ak_diag.crashes      // crash count
window.GameWorldReady()       // boolean
window.GetRenderStageCode()   // number (70+ = world running)
window.Remote0PosX()          // player world X (cwrap'd WASM)
window.Remote0PosY()          // player world Y (cwrap'd WASM)
window.Remote0PosZ()          // player world Z (cwrap'd WASM)
window.Load(playerName)       // reload sprite
window.Keyb(code, count)      // keyboard sim
```
**Note:** `window.ak` is not defined in this runtime. `window.ak.getPos()` does not exist; do not use it. Player position is accessible via `Remote0PosX/Y/Z()`.

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
| **Injection bug**: xp_b64 empty/wrong, action override_names mismatch, or emfsReplaceFile writes wrong path | Log byte counts from `#webbuildOut` and log per-action `override_names` from the live bundle payload before Load() | 0-byte writes, missing names, or names outside the expected per-family AHSW set |
| **Rendering bug**: bytes reach FS correctly but TERM++ renders native/default instead of custom | Canvas pixel probe (via WebGL readPixels) shows no pixels at character position despite correct injection | Pixels are absent or match default background |

**Phase 0 is mandatory first** — determining which branch applies changes what Phase 1 fixes.

---

## Phase 0: Injection Diagnostics (mandatory pre-requisite)

> **Note:** Phase 0 is diagnostic plumbing, not a gate deliverable. Nothing toward the stated goal is delivered by Phase 0 alone. It must run first to determine which root cause branch applies.

**Scope:** Add ~5 lines to the G-RANDOM runner's Skin Dock step.

**Primary approach** — read `#webbuildOut` DOM for byte/file counts (workbench page context, no iframe needed):

workbench.js writes the injection result to `#webbuildOut` as JSON containing a `inject` field with per-action `{ bytes, files }` counts. Read it directly after the Skin Dock step:

```javascript
// After testCurrentSkinInDock() call, before runaround:
const webbuildOut = await page.evaluate(() =>
  document.getElementById('webbuildOut')?.textContent
);
console.error('[INJECT_DIAG]', webbuildOut);
// Parse and check: JSON.parse(webbuildOut).inject should have bytes > 0 per action
```

`#webbuildOut` is sufficient for `bytes`/`files`, but **not** for filenames. Current workbench.js summarizes bundle payloads and inject results as counts only; it does not serialize `override_names`. To validate names, fetch the live bundle payload in page context using the current bundle id already exposed by `window.__wb_debug.getState()`:

```javascript
const payloadDiag = await page.evaluate(async () => {
  const bundleId = window.__wb_debug?.getState?.()?.bundleId || "";
  if (!bundleId) return { error: "no_bundle_id" };
  const r = await fetch('/api/workbench/web-skin-bundle-payload', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ bundle_id: bundleId }),
  });
  const j = await r.json();
  if (!r.ok) return { error: j?.error || 'payload_fetch_failed', response: j };
  const actions = {};
  for (const [key, v] of Object.entries(j.actions || {})) {
    actions[key] = {
      family: v.family,
      xp_size_bytes: v.xp_size_bytes,
      override_names: v.override_names || [],
    };
  }
  return { bundle_id: bundleId, actions };
});
console.error('[PAYLOAD_DIAG]', JSON.stringify(payloadDiag));
```

This is **diagnostic evidence only**. It is valid here because Phase 0 is not an acceptance lane.

**Expected override_names contract** (current repo truth, not legacy reference XP filenames):
- `idle` / family `player` → `player-nude.xp` plus `player-<AHSW>.xp` for all `A,H,S ∈ {0,1}` and `W ∈ {0,1,2}`
- `attack` / family `attack` → `attack-<AHSW>.xp` for all `A,H,S ∈ {0,1}` and `W ∈ {1,2}`
- `death` / family `plydie` → `plydie-<AHSW>.xp` for all `A,H,S ∈ {0,1}` and `W ∈ {0,1,2}`

**Fallback** (if `#webbuildOut` is empty or the payload fetch is inconclusive): read from the iframe's Emscripten FS directly:

```javascript
const fsBytes = await frameHandle.evaluate(() =>
  window.Module?.FS?.readFile?.('/sprites/player-0100.xp')?.length ?? -1
);
console.error('[FS_BYTES]', fsBytes);
```

Note: the FS fallback above checks a legacy reference filename only. It is useful as a coarse "did anything land in `/sprites`?" sanity check, but it is **not** a valid override-name contract check for bundle mode.

**If inject.bytes === 0 for any action** → injection bug. Fix: trace why `xp_b64` is empty at injection time.

**If action override_names are wrong** → naming mismatch. Fix the bundle payload contract or the runtime-side normalization expectations, then re-run Phase 0.

**If both look correct** → rendering bug, proceed to Phase 1.

---

## Phase 1: Canvas Pixel Probe (simpler visual gate)

**When:** After Phase 0 confirms injection is correct (or fixes injection bug).
**Scope:** ~30-50 lines in test runner + helper function.
**Requires:** 1-line change to `runtime/termpp-skin-lab-static/termpp-web-flat/index.html` to add `preserveDrawingBuffer:true` to the WebGL context options. Without this, `readPixels` always returns zeros (WebGL clears the backbuffer after compositing by default).

**Runtime change:** In index.html, find the WebGL context creation (look for `getContext("webgl",` or `getContext("experimental-webgl",`) and add `preserveDrawingBuffer:true` to the options object.

### How it works

After runaround completes, use the WebGL context (`window.ak_ctx`) to read pixels from the canvas:

```javascript
// In run_randomized_bundle_test.mjs after runaround:
const pixelResult = await frameHandle.evaluate(() => {
  const canvas = document.getElementById('asciicker_canvas');
  if (!canvas) return { error: 'no_canvas' };
  // Canvas is WebGL-bound; use ak_ctx (not getContext('2d') which returns null)
  const gl = window.ak_ctx;
  if (!gl) return { error: 'no_webgl_ctx' };

  // Get player world position via Remote0PosX/Y/Z (window.ak.getPos does not exist)
  const px = window.Remote0PosX?.() ?? 0;
  const py = window.Remote0PosY?.() ?? 0;
  const pz = window.Remote0PosZ?.() ?? 0;

  // Sample a region around canvas center (player is roughly centered post-runaround)
  const cx = Math.floor(canvas.width / 2);
  const cy = Math.floor(canvas.height / 2);
  const w = 60, h = 80;  // ~6 cells × ~8 cells in pixels
  // WebGL readPixels uses bottom-left origin; flip y-axis
  const glX = Math.max(0, cx - w/2);
  const glY = Math.max(0, canvas.height - (cy + h/2));
  const pixels = new Uint8Array(w * h * 4);
  gl.readPixels(glX, glY, w, h, gl.RGBA, gl.UNSIGNED_BYTE, pixels);

  // Count non-background pixels (anything not pure black or dark grey)
  let nonBg = 0;
  for (let i = 0; i < pixels.length; i += 4) {
    const r = pixels[i], g = pixels[i+1], b = pixels[i+2];
    // Background is typically near-black in Asciicker's arena
    if (r > 30 || g > 30 || b > 30) nonBg++;
  }

  return {
    canvas_size: [canvas.width, canvas.height],
    sample_region: [glX, glY, w, h],
    player_world_pos: [px, py, pz],
    non_bg_pixels: nonBg,
    total_pixels: w * h,
  };
});
console.error('[PIXEL_PROBE]', JSON.stringify(pixelResult));
```

### Gate criteria (Phase 1 v1 — permissive)
```
render_skin_pixels_ok = pixelResult.non_bg_pixels >= N
```
N must be calibrated against a known-good seed before this gate is wired. Run Phase 0 + Phase 1 against seed 42 (which previously passed stability AND visual inspection) and record the actual `non_bg_pixels` value — that establishes the lower bound. A threshold of 20 is a placeholder only; do not wire it without calibration data.

### Gate criteria (Phase 1 v2 — color-matching)
Extract the dominant background color **from the generated XP** (not hardcoded). The `#ffff55` reference color is for the vanilla sprite only — G-RANDOM seeds produce different colors. Use `scripts/xp_core.py` directly:

```python
import sys; sys.path.insert(0, 'scripts')
from xp_core import XPFile
xp = XPFile(generated_idle_xp_path)  # path to the generated idle XP for this seed
layer = xp.layers[min(2, len(xp.layers)-1)]
bg_colors = {}
for row in layer.data:
    for cell in row:
        bg = (cell[4], cell[5], cell[6])
        if bg != (255, 0, 255):  # skip transparent cells
            bg_colors[bg] = bg_colors.get(bg, 0) + 1
dominant_bg = max(bg_colors, key=bg_colors.get) if bg_colors else None
```

Do **not** accept a gate based on "at least 1 matching pixel anywhere near canvas center". That can false-positive on unrelated scene pixels.

Gate must require all of the following:
- a **player window** sampled from the expected player screen neighborhood for the paused pose under test
- a **negative-control window** of the same size, offset away from the player
- matching-pixel count in the player window `>= M`
- matching-pixel count in the player window `>= K * negative_control_matches`
- the condition must hold on at least 3 paused samples during the runaround, not a single frame

`M` and `K` must be calibrated from a known-good visible seed before the gate is wired. Reasonable placeholders are `M >= 12` and `K >= 3`, but do not ship those without seed-42 calibration data.

### Player drift note
The probe cannot rely on raw canvas center for final acceptance. During the 10s runaround the player remains near spawn, but "near center" is only good enough for early diagnostics. Final Phase 1 acceptance must anchor the player window to a bounded expected player neighborhood for the paused sample under test, and compare it against a negative-control window. If that bounded window cannot be made stable enough, escalate to Phase 2 oracle math instead of weakening the gate.

---

## Phase 2: Oracle Adaptation (cell-level gate — CURRENT EXECUTION PATH)

> **Status: IMMEDIATE BLOCKER** — current execution direction requires oracle-grade proof before further progress. Porting `render_oracle.js` from Y9-2 is no longer deferred follow-up work; it is the next implementation target after Phase 0 confirms injection diagnostics.

**When:** Immediately after Phase 0 is wired and run at least once. Phase 1 remains a supporting diagnostic, not the primary closure path.
**Scope:** ~150 lines new file + 1-line runtime patch + ~20 lines runner integration.
**Requires:** 1-line change to `runtime/termpp-skin-lab-static/termpp-web-flat/index.html`.

### Step 2.1: Expose ak_buf in runtime

Search for the literal string `ak_buf=new Uint8Array` in `runtime/termpp-skin-lab-static/termpp-web-flat/index.html` (the file is minified; the human-readable variable names `heap`, `mem`, `render_w`, `render_h` do not appear). Add immediately after the match:
```javascript
window.ak_buf = ak_buf;
```
Note: `ak_width` and `ak_height` are already script-global vars accessible as `window.ak_width`/`window.ak_height` — only `window.ak_buf` needs to be added. This is a read-only data exposure. Low risk for single-player solo mode.

### Step 2.2: Create `scripts/skin_dock_oracle.js`

New 150-line single-player oracle. Port from `render_oracle.js` in Y9-2, simplified:
- **Keep:** isometric projection math (oracle_matrix, oracle_project — proven correct per C++ spec)
- **Keep:** region-bounded glyph scanner (oracle_scan_region)
- **Keep:** IIR Z-smoothing for cold-start suppression
- **Drop:** all multi-player guards (remote0_*, pose_source, yaw-latch for remote player)
- **Add:** single-player guard (`player_spawned` flag, `suppress` counter)
- **Input:** `expected_glyph` injected as test parameter (not C++ dynamic value)

Expected glyph extraction: read XP Layer 2 dynamically from the generated XP. **Do not hardcode coordinates** — Layer 2 is the full sprite sheet (126×80 for player-0100.xp), not a single frame. The oracle needs the glyph for the specific animation frame rendered during the test, which must be determined from the runtime's current frame counter, not from a fixed offset.

Placeholder extraction (for reference XP only — for G-RANDOM, use generated XP path and validate frame offset against the runtime's active frame):
```python
import sys; sys.path.insert(0, 'scripts')
from xp_core import XPFile
xp = XPFile(generated_idle_xp_path)
layer = xp.layers[min(2, len(xp.layers)-1)]
# TODO: determine active frame index from runtime before reading
# frame_w and frame_h from XP metadata; center_x = frame_w//2, center_y = frame_h//2
# glyph = layer.data[frame_y_offset + center_y][center_x][0]
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
Phase 0: Read #webbuildOut inject.bytes per action
    │
    ├── bytes === 0 for any action
    │       → FIX INJECTION BUG first
    │       → Then re-run Phase 0 to confirm fix
    │       → Then proceed to Phase 1
    │
    └── bytes > 0 AND action override_names match current AHSW contract
            │
            ├── Phase 1 pixel probe: player-window signal fails calibrated threshold
            │       → Rendering bug confirmed
            │       → Investigate: preserveDrawingBuffer added? ak_ctx accessible?
            │       → If pixel read confirmed working: continue with Phase 2 oracle
            │
            └── Phase 1 pixel probe: player-window signal exceeds negative control
                    → Character IS rendering
                    → (If seeds 2/3 were previously invisible: investigate
                       whether the original observation was a display/env issue
                       or a seed-specific non-deterministic failure)
                    → Calibrate threshold against known-good seed
                    → Upgrade to Phase 1 v2 per-seed color-matching
                    → Wire Phase 1 v2 as gate (see Gate Acceptance Criterion)
```

---

## Summary of Approaches

| Approach | Lines | Runtime mod | Precision | Status |
|----------|-------|-------------|-----------|--------|
| Phase 0: injection diagnostics | ~5 | No | Diagnostic only | FIRST STEP |
| Phase 1 v1: pixel count | ~40 | Yes (1 line: preserveDrawingBuffer) | Low (any pixels, calibration req'd) | Simple gate |
| Phase 1 v2: color match + negative control | ~80 | Yes (same 1 line) | Medium (per-seed XP color match in player-localized window) | Stronger gate |
| Phase 2: cell oracle | ~170 | Yes (1 line: ak_buf) | High (glyph + position) | CURRENT EXECUTION PATH |

**Recommended execution order:** Phase 0 → Phase 2 oracle → use Phase 1 readPixels only as supporting diagnostic where it helps calibration or isolates rendering-path bugs.

---

## Gate Acceptance Criterion

The G-RANDOM visual gate is **PROVEN** when ALL of the following hold:

1. Phase 0 confirms `inject.bytes > 0` for all 3 actions
2. Phase 0 confirms the live bundle payload's per-action `override_names` match the current repo contract: `player-nude.xp` + `player-<AHSW>.xp` for idle, `attack-<AHSW>.xp` with `W ∈ {1,2}` for attack, and `plydie-<AHSW>.xp` for death
3. Phase 2 oracle is ported into this repo, wired into the randomized-bundle runner, and produces repeated body/glyph visibility samples near the projected player position
4. Oracle-backed samples prove the authored skin is rendered for the paused/player-localized samples under test; Phase 1 pixel probes may support this but do not replace it
5. The gate implementation stores the visual check in the existing randomized-bundle report shape. If a `result.gates` object is added, wire `render_skin_visual_ok` there; otherwise add a top-level report field and keep the report schema internally consistent.
6. `docs/plans/2026-03-23-workbench-canonical-spec.md` G-RANDOM gate entry updated from PARTIALLY MET → FULLY MET with a log citation showing seeds 2, 3, and 42 all passing the oracle-backed gate
7. Evidence committed to `PLAYWRIGHT_FAILURE_LOG.md` under a new "G-RANDOM Gate: Visual Fidelity Resolved" entry

---

## Files to Create / Modify

| File | Action | Phase |
|------|--------|-------|
| `scripts/xp_fidelity_test/run_randomized_bundle_test.mjs` | Add injection diag (#webbuildOut read) + pixel probe step (readPixels) | 0, 1 |
| `runtime/termpp-skin-lab-static/termpp-web-flat/index.html` | Add `preserveDrawingBuffer:true` to WebGL context options | 1 |
| `runtime/termpp-skin-lab-static/termpp-web-flat/index.html` | Add `window.ak_buf = ak_buf` (single additional assignment) | 2 |
| `scripts/skin_dock_oracle.js` | Create (new, ~150 lines) — port from Y9-2 `render_oracle.js` | 2 |
| `docs/plans/2026-03-23-workbench-canonical-spec.md` | Update G-RANDOM gate status per Gate Acceptance Criterion | All |
| `PLAYWRIGHT_FAILURE_LOG.md` | Add evidence entries as phases complete | All |
