# Handoff: Login/Menu Screen SRCL Reskin

**Date:** 2026-03-24
**Status:** READY FOR EXECUTION
**Prerequisite commit:** `01f6e72` (workbench reskin already applied on master)

---

## Task

Apply the same SRCL dark+gold reskin (already applied to the workbench) to the in-game login/menu screen — the "enter name / press Play" overlay that appears before the game starts.

## Critical Context

- The login screen is **HTML/CSS DOM**, NOT canvas-rendered. It lives in the committed runtime payload and is fully reskinnable with CSS.
- The runtime payload is committed inside this repo at `runtime/termpp-skin-lab-static/`. It is modifiable here. Do NOT claim it requires changes in any other repo.
- `scripts/self_containment_audit.py` enforces self-containment — run it after changes.

## Target File

`runtime/termpp-skin-lab-static/termpp-web-flat/index.html`

This is a single minified line. The CSS is inline in a `<style>` block at the top.

There is also a copy at `runtime/termpp-skin-lab-static/termpp-web/index.html` — check if it has the same login screen and apply the same changes there too.

## Current Login Screen CSS (extracted from minified index.html)

```css
#login-overlay {
  display: flex; position: fixed; top: 0; left: 0; right: 0; bottom: 0;
  background: rgba(0,0,0,.85); z-index: 100;
  justify-content: center; align-items: center;
}

#login-card {
  background: #1a1a2e;
  border: 2px solid #4a4a8a;
  border-radius: 12px;
  padding: 40px; text-align: center; min-width: 320px;
  box-shadow: 0 0 30px rgba(100,0,200,.3);
}

#login-card h1 {
  color: #e0e0ff; font-family: monospace; font-size: 28px;
  margin: 0 0 30px 0; letter-spacing: 4px;
}

#login-card label {
  color: #aaa; font-family: monospace; font-size: 14px;
  display: block; text-align: left; margin-bottom: 6px;
}

#login-card input[type=text] {
  width: 100%; padding: 10px; margin-bottom: 18px;
  background: #0f0f23; border: 1px solid #4a4a8a;
  border-radius: 6px; color: #fff; font-family: monospace;
  font-size: 16px; box-sizing: border-box; outline: 0;
}

#login-card input[type=text]:focus {
  border-color: #8080ff;
  box-shadow: 0 0 8px rgba(128,128,255,.3);
}

#play-btn {
  background: #4a4a8a; color: #fff; border: none;
  padding: 16px 50px; font-family: monospace; font-size: 20px;
  border-radius: 6px; cursor: pointer; letter-spacing: 2px;
  margin-top: 10px; touch-action: manipulation;
  min-height: 48px;
}

#play-btn:hover { background: #6060aa; }
#play-btn:disabled { background: #333; cursor: not-allowed; }
```

Also: `textarea.asciicker { font-family: monospace }` (4 occurrences in the `<style>` block) and the `#players-probe` debug panel uses `font-family: monospace`.

## Target Reskin Values (SRCL dark + gold, matching workbench)

| Element | Property | Current | New |
|---------|----------|---------|-----|
| `#login-card` | background | `#1a1a2e` | `#161616` |
| `#login-card` | border | `2px solid #4a4a8a` | `2px solid #393939` |
| `#login-card` | border-radius | `12px` | `0` |
| `#login-card` | box-shadow | `rgba(100,0,200,.3)` | `rgba(241,194,27,.15)` (gold glow) |
| `#login-card h1` | color | `#e0e0ff` | `#f1c21b` (gold) |
| `#login-card label` | color | `#aaa` | `#6f6f6f` |
| `#login-card input` | background | `#0f0f23` | `#000000` |
| `#login-card input` | border | `1px solid #4a4a8a` | `1px solid #393939` |
| `#login-card input` | border-radius | `6px` | `0` |
| `#login-card input:focus` | border-color | `#8080ff` | `#f1c21b` (gold) |
| `#login-card input:focus` | box-shadow | `rgba(128,128,255,.3)` | `rgba(241,194,27,.3)` |
| `#play-btn` | background | `#4a4a8a` | `#f1c21b` (gold) |
| `#play-btn` | color | `#fff` | `#000` (black on gold) |
| `#play-btn` | border-radius | `6px` | `0` |
| `#play-btn:hover` | background | `#6060aa` | `#ef6300` (daybreak orange) |
| `#play-btn:disabled` | background | `#333` | `#393939` |
| all `font-family: monospace` | font-family | `monospace` | `'DepartureMono-Regular', Consolas, monaco, monospace` |

## Font Loading

Add a `@font-face` declaration inside the `<style>` block (before the first rule):

```css
@font-face {
  font-family: 'DepartureMono-Regular';
  src: url('https://intdev-global.s3.us-west-2.amazonaws.com/public/internet-dev/2ed59eb2-a4a6-490c-8d70-757b68af681d.woff') format('woff');
  font-weight: normal; font-style: normal; font-display: swap;
}
```

## Constraints (from RESKIN_PREP archived doc)

- CSS-only changes — do NOT modify DOM structure, element IDs, or JS behavior
- The `#login-overlay`, `#login-card`, `#play-btn` IDs must remain unchanged (JS hooks depend on them)
- Do not change padding/margin/layout — only colors, fonts, border-radius, box-shadow
- The file is minified on a single line — be careful with edits, use string replacement

## Verification

After applying:
1. `python3 scripts/self_containment_audit.py` — must pass (0 errors)
2. Launch server: `PYTHONPATH=src python3 -m pipeline_v2.app`
3. Open `http://127.0.0.1:5071/workbench`
4. Click "Test This Skin" to load the game iframe
5. Verify the login screen shows DepartureMono font, gold title, gold play button, sharp corners, dark neutral background
6. Enter a name, click Play, verify game starts normally (no JS errors)

## DO NOT

- Reference or depend on any external repo (asciicker-Y9-2 or otherwise)
- Claim any source code "lives upstream" without proving it from files in THIS repo
- Modify JS behavior or DOM structure
- Skip the self-containment audit
