# Checkpoint: UI Identity Map and Tagging
**Task:** Add stable visible panel/sub-panel ID badges to every user-visible workbench surface
**Branch:** v3-refactor-start
**Base commit:** 4abfd5a
**Checkpoint path:** .claude/checkpoints/ui-identity-map-and-tagging.md
**Temp path:** /tmp/claude-checkpoint-ui-identity-map-and-tagging.md

---

## Status: COMPLETE — awaiting commit

## State at checkpoint write
- Worktree: /Users/r/Downloads/asciicker-pipeline-v3
- Branch: v3-refactor-start
- HEAD: 4abfd5a
- Server: HTTP/1.1 200 OK at http://127.0.0.1:5071/workbench
- Conductor: READY
- Self-containment: pre-existing warnings only (external paths in deploy/README.md etc.)

## Existing badge infrastructure (discovered)
- CSS: `.panel[data-panel-number]::before` shows `attr(data-panel-number)` as a badge top-left
- CSS: `.ws-frame-nav[data-panel-number]::before` shows `attr(data-panel-number) " " attr(data-panel-tag)`
- All 18 `.panel` elements have `data-panel-number` set (numbers only, no names)
- `#wsFrameNav` has `data-panel-number="9A"` and `data-panel-tag="wsFrameNav"`
- NO JS references to `data-panel-number` or `data-panel-tag` — safe to change values

## Planned changes (not yet made)

### web/workbench.html
- Extend all 18 panel `data-panel-number` values to include names
  - Panel 1: `"1"` → `"1 banner"`
  - Panel 2: `"2"` → `"2 guide"`
  - Panel 3: `"3"` → `"3 preflight"`
  - Panel 4: `"4"` → `"4 template"`
  - Panel 5: `"5"` → `"5 ops"`
  - Panel 6: `"6"` → `"6 recorder"`
  - Panel 7: `"7"` → `"7 upload"`
  - Panel 8: `"8"` → `"8 source"`
  - Panel 9: `"9"` → `"9 grid"`
  - Panel 10: `"10"` → `"10 whole-sheet"`
  - Panel 11: `"11"` → `"11 anim"`
  - Panel 12: `"12"` → `"12 preview"`
  - Panel 13: `"13"` → `"13 session"`
  - Panel 14: `"14"` → `"14 skin-dock"`
  - Panel 15: `"15"` → `"15 termpp"`
  - Panel 16: `"16"` → `"16 verify"`
  - Panel 17: `"17"` → `"17 export"`
  - Panel 18: `"18"` → `"18 inspector"`
- Update `#wsFrameNav` `data-panel-tag` from `"wsFrameNav"` → `"frame-nav"`
- Add `data-panel-number="9B" data-panel-tag="grid-panel"` to `#gridPanel`

### web/styles.css
- Add badge rule for `.frame-grid[data-panel-tag]::before` (covers #gridPanel / 9B)
- The badge is positioned top-right to avoid conflicting with ws-frame-nav badge at top-left

## Naming scheme (canonical)
| ID     | Name         | Element                | Notes                          |
|--------|-------------|------------------------|--------------------------------|
| 1      | banner      | .panel.alpha-banner    | Pre-alpha warning              |
| 2      | guide       | #firstStepsGuide       | Getting started guide          |
| 3      | preflight   | #runtimePreflightBanner| Runtime preflight (hidden)     |
| 4      | template    | #templatePanel         | Template picker                |
| 5      | ops         | Panel 5 (anon)         | Load/Save/Export/Import ops    |
| 6      | recorder    | Panel 6 details        | UI event recorder              |
| 7      | upload      | Panel 7 (anon)         | Upload + Convert PNG           |
| 8      | source      | Panel 8 (anon)         | Source Panel (canvas)          |
| 9      | grid        | Panel 9 (anon)         | Grid Panel container           |
| 9A     | frame-nav   | #wsFrameNav            | Frame navigation strip         |
| 9B     | grid-panel  | #gridPanel             | Frame grid (.frame-grid)       |
| 10     | whole-sheet | #wholeSheetPanel       | XPEdit whole-sheet (hidden)    |
| 11     | anim        | Panel 11 (anon)        | Animation + Metadata           |
| 12     | preview     | Panel 12 (anon)        | XP Preview                     |
| 13     | session     | Panel 13 (anon)        | Session info                   |
| 14     | skin-dock   | #webbuildDockPanel     | Skin Test dock                 |
| 15     | termpp      | #termppNativePanel     | TERM++ native (hidden)         |
| 16     | verify      | #verificationPanel     | Verification                   |
| 17     | export      | Panel 17 (anon)        | Export                         |
| 18     | inspector   | #cellInspectorPanel    | XP cell inspector (hidden)     |

## Deferred (per handoff)
- Delete Frame action
- Sprite-by-sprite drag completion
- Panel topology layout correction (grid/frame-nav placement)
- Canvases can't be badged with ::before (replaced elements); skip
- Context menus skip (ephemeral popups)
- Overlay badge skip (#bugReportModal has clear h3 header already)

## Evidence — COMPLETE
- [x] node --check web/workbench.js passes
- [x] curl -I http://127.0.0.1:5071/workbench returns HTTP/1.1 200 OK
- [x] Headed browser shows named badges on all 18 panels (screenshot verified)
- [x] #wsFrameNav shows "9A frame-nav" (renamed from "9A wsFrameNav") — screenshot confirmed
- [x] #gridPanel shows "9B grid-panel" top-right — screenshot confirmed
- [x] No click targets broken by badges (pointer-events: none on ::before)
- [ ] git commit (awaiting user request)

## Phase 2 additions (this session — user requested "every single thing")
- [x] `web/workbench.js`: appended `wbIdOverlay()` IIFE — 120 lines
  - Selectors: `button[id]`, `input[id]:not([type=hidden])`, `select[id]`, `textarea[id]`, `canvas[id]`, `iframe[id]`
  - 162 total badges, 73 visible in initial viewport (hidden elements auto-hidden)
  - Each badge: `position:fixed`, 8px mono, rgba dark bg, `pointer-events:none`
  - Badge positioned at top-left of each element via `getBoundingClientRect()`
  - Scroll/resize tracking via `requestAnimationFrame` scheduler
  - Toggle: fixed `#wb-id-toggle-btn` bottom-right + `Alt+I` keyboard shortcut
  - Rebuilds after 900ms for dynamic content (bundle action tabs etc.)
  - `window.rebuildWbIdOverlay()` available for manual rebuild
- [x] Screenshots: /tmp/wb-ids-top.png, /tmp/wb-ids-source-grid.png

## Screenshots captured
- /tmp/workbench-tags-verify.png — panels 1/2/4/5 area
- /tmp/wb-tags-framenav.png — 9B/11/12/13 area
- /tmp/wb-tags-9a.png — 8 source + 9 grid + 9A frame-nav + 9B grid-panel confirmed
