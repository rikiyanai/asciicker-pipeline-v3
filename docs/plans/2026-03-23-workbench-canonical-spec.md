# Workbench Canonical Spec

**Authority:** this file and `PLAYWRIGHT_FAILURE_LOG.md` are the only active canon docs for the browser workbench.

**Last updated:** 2026-04-26
**Checkpoint baseline:** `v3-refactor-start @ a536b81`
**Audit scope:** current branch after the 2026-04-14 through 2026-04-17 failed refactor narrative, the manual-assembly runtime proof, the Y9-2 generalized-bundle porting audit, the semantic-runtime contract coverage slice, and the surviving local/browser/runtime assets in this repo

## Section 0 — Behavior Rule, Scope, And Authority

### Cardinal Behavior Rule

**Purpose:** Prevent frame-blind fixes where the repo keeps making local changes
inside the wrong owner boundary, proof surface, or product surface and then
mistakes that activity for progress.

Every task in this repo is nested inside a larger requirement. Before acting,
identify what the user is actually asking for, which boundary or owner that
requirement touches, and whether the current file, workflow, artifact, or
subsystem is the correct place to act. Do not assume the current structure is
already valid. If the frame is wrong, changing things inside it is accumulated
misalignment, not progress. Never confuse the nearest actionable patch with the
correct architectural action. Verify the frame first.

### Scope And Authority

Only two application sections own product behavior in this canon:

1. Section 1 — the root editor contract
2. Section 2 — the Asciicker wrapper/runtime contract layered on top of it

Section 3 is the harness/proof section that observes and proves Sections 1 and
2. It is not a third product owner.

Only two active canon docs exist:

1. `PLAYWRIGHT_FAILURE_LOG.md`
2. `docs/plans/2026-03-23-workbench-canonical-spec.md`

All former handoff, worksheet, claim-verification, and reference docs are
archive/reference material only unless this section or the failure log
explicitly revives them.

For canon work in this repo, the startup/read order is:

1. `python3 scripts/conductor_tools.py status --auto-setup`
2. `PLAYWRIGHT_FAILURE_LOG.md`
3. `docs/plans/2026-03-23-workbench-canonical-spec.md`
4. the live code and tests for the behavior under audit

If an older workflow references missing helpers such as
`scripts/git_guardrails.py`, `scripts/analyze_failure_log.py`, or
`scripts/analyze_runs.py`, treat that as stale repo alignment, not as a reason
to invent a new authority path.

### Canon And Repo Alignment

The 2-doc canon is the live authority model, but repo alignment is still
incomplete:

1. `README.md:75-76` still points at retired canonical paths.
2. `scripts/doc_lifecycle_stitch.sh:24-39`,
   `scripts/doc_lifecycle_stitch.sh:63-75`, and
   `scripts/doc_lifecycle_stitch.sh:250-252` still point at retired
   failure-log/spec paths and the older protected-doc set.
3. `scripts/git_guardrails.py` is referenced by older doc-health instructions
   but is absent in this repo, so any startup flow that assumes it exists is
   stale.
4. Top-level `AGENTS.md` and `CLAUDE.md` must stay aligned to the 2-doc canon
   and the deletion-first architecture rule.

These are repo-health failures. They are separate from, and additive to, the
Section 1 and Section 2 architecture failures.

### Non-Negotiable Architecture Laws

These are top-level canon. They are not historical notes, convenience
guidelines, verifier-local rules, or temporary refactor suggestions.

#### Law 1 - Single Ownership Or No Ownership Claim

**Purpose:** Simplicity and modularity are the governing engineering rules in
this repo. Every mutable truth source must have one owner or later proof cannot
tell which path actually produced the behavior.

No mixed ownership is allowed at any abstraction level. If editor, wrapper,
runtime, proof, deployment, or documentation ownership moves, the old owner
must be deleted or hard-disabled before the replacement is added. Wrapping,
shadowing, bridge logic, compatibility fallbacks, and temporary parallel owners
are regressions unless they are explicitly non-runtime historical material.

#### Law 2 - Section 1 Owns The Editor Root

**Purpose:** Prevent template, bundle, runtime, or proof workflows from
redefining the base editor contract.

Section 1 is the root editor owner. Whole-sheet document state, editing
behavior, layers, history, browse mode, and root image actions belong to the
Section 1 owner graph. Section 2 may adapt, seed, validate, export, or preview
that state, but it may not replace the root editor, create a second
authoritative document/session owner, or redefine the base editing workflow.

#### Law 3 - Section 2 Owns Runtime And Engine Truth Only Downstream

**Purpose:** Keep the wrapper/runtime layer useful without letting it reclaim
authoring ownership.

Section 2 owns engine-facing filename/runtime truth, bundle structure, export
contracts, native-builder constraints, and runtime preview adaptation. It does
not own the root image/session, authored geometry, or the primary editor
workflow. If Section 1 and Section 2 disagree, Section 1 wins for editor
ownership and Section 2 wins only for downstream engine/runtime truth.

#### Law 4 - Proof Observes; It Does Not Own

**Purpose:** Prevent acceptance, structural, or runtime proof from becoming a
hidden architecture owner.

Acceptance proof, structural gates, and visual/runtime proof are observational
surfaces only. They may reveal contradictions, but they do not establish
product ownership, redefine behavior, or justify bypassing the shipped UI.
Verifier gaps are verifier gaps; they are not permission to move the boundary.

#### Law 5 - Debug And Diagnostic Paths Are Not Product Flows

**Purpose:** Keep `/workbench` honest about what a user can actually do.

Debug harnesses, raw iframe loaders, external XP injection helpers,
`/termpp-skin-lab`, MCP-only shortcuts, and other diagnostic paths may remain
for development, but they must stay explicitly diagnostic and off the primary
product path. Do not surface them as peer user actions inside `/workbench`, and
do not use them as acceptance substitutes.

#### Law 6 - Geometry Ownership Must Stay Explicit

**Purpose:** Prevent source analysis, template shape, and runtime constraints
from collapsing into one hidden geometry owner.

Source PNG mapping, authored frame geometry, and runtime/native export are
separate problems. The analyzer is advisory only. Frame navigation owns authored
row/frame geometry. The whole-sheet editor owns the stored document. Templates,
native builders, and runtime/export paths are downstream adapters that may seed,
normalize, or reject shapes, but they may not silently redefine authored
geometry.

#### Law 7 - Uniform Frame Geometry Is Session-Level Truth

**Purpose:** Preserve the whole-sheet/frame-nav contract and prevent
per-sprite special cases from becoming silent geometry owners.

One authored session/action has one frame-slot size. Individual sprite content
may vary inside those slots, but the slot geometry itself is uniform across the
session. If one mapped sprite must be larger, enlarge the authored session
geometry for that action. Do not create one special larger frame while other
frames remain smaller.

#### Law 8 - Live Pipeline-V2 Behavior Stays Frozen Until Replacement

**Purpose:** Prevent premature public cutover and split ownership on the live
`/xpedit` URL.

Do not change live pipeline-v2 `rikiworld.com/xpedit` behavior until the v3
replacement is complete, working, and ready for same-URL cutover. The target is
replacement, not indefinite dual ownership. Any ownership move on the public URL
must delete or retire the old owner rather than layering a second one beside it.

#### Law 9 - Canon Requirements Stay Above Status Mirrors

**Purpose:** Prevent doc cleanup from burying active rules under audits,
sequence notes, or historical narration.

This spec may contain deployment notes, sequence queues, audits, and current
state mirrors, but those sections may not replace or bury the laws above. If a
status note conflicts with a law, the law wins unless
`PLAYWRIGHT_FAILURE_LOG.md` records a reviewed replacement.

## Application Statement

Asciicker XPEdit is a browser-based XP sprite-sheet authoring workbench for the Asciicker / TERM++ game runtime.

It currently does all of the following:

- creates blank template-backed authoring sessions
- imports existing `.xp` files
- uploads `.png` source art as reference input
- optionally runs backend source loading to populate XP/session geometry
- edits XP cells and layers in an embedded whole-sheet editor
- shows source images and canonical layout state in a separate source panel
- provides a separate frame-navigation/grid surface for preview, selection, and metadata operations around the root sheet
- saves and exports `.xp`
- injects authored XP or bundle payloads into the embedded Skin Dock/runtime preview
- can stage native TERM++ diagnostic skin runs from repo-local assets

That is the current shipped application. It is not already a pure whole-sheet-root REXPaint clone, and it is not just a sprite-slicing wrapper.

The user-facing runtime lane is singular: the current whole-sheet XP editor state is what gets tested in the embedded Skin Dock/runtime preview (`Test This Skin` or the bundle equivalent). Debug-only harnesses such as `/termpp-skin-lab`, raw iframe loaders, or external-XP injection helpers may exist for developers, but they are not part of the `/workbench` product surface and must not appear as peer user actions.

Public/local parity note: the current local served workbench now exposes the
same named direct source controls (`Select`, `Draw Box`, `Drag Row`,
`Drag Column`, `Vertical Cut`, `Find Sprites`) and the same major panel
surfaces (`Recorder`, `Skin Test dock`, `Verification`, `Session`) on both
root-hosted and `/xpedit` local URLs. Full public parity is still not proven
until a direct live-vs-local audit is rerun against `rikiworld.com/xpedit`.

### Deployment Lineage And Replacement Target

The deployment lineage is now explicit:

1. The public `https://rikiworld.com/xpedit` site is still the behavior-frozen
   pipeline-v2 baseline served from its own repo/deploy line.
2. This repo/branch (`asciicker-pipeline-v3`, `v3-refactor-start`) is the
   refactor successor to that pipeline-v2 baseline.
3. The target end state is not long-term dual ownership. The target is
   retirement-and-replacement on the same public URL:
   - keep the live pipeline-v2 site frozen until the v3 replacement is ready
   - privately archive the current public pipeline-v2 repo/site so the old
     implementation is no longer publicly visible
   - retire the current `asciicker-pipeline-v3` repo identity
   - create the replacement repo named `xpedit` from this v3 code line
   - redeploy the v3 workbench so `rikiworld.com/xpedit` resolves to the
     replacement repo/deploy line
   - rerun public smoke/parity verification on the replacement before calling
     the cutover complete
4. Until that cutover is executed and logged, this repo remains the refactor
   candidate rather than the live public owner.

Deployment-path clarification verified from the live deploy files in this repo:

1. Public `/xpedit` traffic is routed by Cloudflare Worker to Cloud Run, not
   served directly from repo visibility.
   - `deploy/cloudflare-worker/wrangler.toml` routes both
     `rikiworld.com/xpedit` and `rikiworld.com/xpedit/*`.
   - `deploy/cloudflare-worker/xpedit-router.js` forwards those paths to the
     configured Cloud Run URL.
   - `.github/workflows/deploy-cloudrun.yml` deploys the app with
     `PIPELINE_BASE_PATH=/xpedit`.
2. Therefore, making the current live `xpedit` repo private should not by
   itself take down `https://rikiworld.com/xpedit`, as long as:
   - the current Cloud Run service remains up
   - the Cloudflare Worker routes remain in place
   - deploy secrets / workload identity / GitHub Actions access required for
     future deploys remain valid after the repo visibility change
3. This statement applies to the `/xpedit` app route only. It does not make any
   claim about unrelated non-`/xpedit` GitHub Pages/origin content on
   `rikiworld.com`.

### Verified Replacement Progress (2026-04-26)

The following replacement-sequence facts are now directly verified:

1. The current live GitHub repo `rikiyanai/asciicker-xpedit` was switched from
   `PUBLIC` to `PRIVATE` on 2026-04-26.
   - `https://rikiworld.com/xpedit` remained live because the app route is
     still served by Cloudflare Worker -> Cloud Run.
   - formal GitHub "archive" state was not toggled in this slice; only
     visibility was changed.
2. The current local branch has one real headed authored-XP runtime proof lane
   for the classic/manual-assembly path:
   - root-hosted PASS artifact:
     `output/manual_assembly_e2e_root_runtime_2026-04-26/report.json`
   - prefixed `/xpedit` PASS artifact:
     `output/manual_assembly_e2e_prefixed_runtime_fixed_2026-04-26/report.json`
3. The prefixed proof did not pass by assumption. It first failed on a real
   base-path defect:
   - `/xpedit/workbench` still referenced `/workbench-template-gating.js`
     without the `/xpedit` prefix
   - the prefixed HTML loaded, but the missing asset broke workbench JS
     readiness and blocked the headed verifier before any workflow action
4. That `/xpedit` asset-path defect is fixed in the current branch baseline by
   adding the missing base-path rewrite for
   `/workbench-template-gating.js` and pinning it with a focused prefixed-route
   regression test.

## Section 1 — Fundamental REXPaint-Parity Spec

This section is the root editor canon.

Everything in Section 2 is subordinate to this section. Sprite-sheet slicing, bundle/template helpers, Skin Dock, and runtime injection are wrappers over the editor contract defined here. They are not allowed to redefine the root owner or the base editor workflow.

### 1.1 Embedded Local REXPaint Manual (Verbatim)

The local manual is embedded here wholesale so the parity target lives inside the canon spec instead of in a separate active doc.

```text
=================================================================
 REXPaint v1.70 - Manual
=================================================================

A powerful and user-friendly ASCII art editor.


-----------------------------------------------------------------
 Background
-----------------------------------------------------------------

There are a number of ASCII art editors available on the web, but most suffer from poor usability or small feature sets (one notable exception being eigenbom's awesome fork of ASCII Paint). For development of my own projects, I needed an application equipped with a wide range of tools for quickly drawing and manipulating ASCII art, as well as the ability to easily browse the images created as stored in their native format. Thus REXPaint was born.

Over the years since its first public release, REXPaint has found use as a general purpose ASCII art editor, as well as a roguelike development tool for mockups, mapping, and design. I love seeing what people create with this program, so send me a link/copy if you've made something cool! (Or share it with us on the forums: www.gridsagegames.com/forums/index.php?board=8.0)


-----------------------------------------------------------------
 Features
-----------------------------------------------------------------

An overview of REXPaint's major features:
* Edit characters, foreground, and background colors separately
* Draw shapes and text
* Copy/cut/paste areas
* Undo/redo changes
* Preview effects simply by hovering the cursor over the canvas
* Palette manipulation
* Image-wide color tweaking and palette swaps
* True-color RGB/HSV color picker
* Create multi-layered images
* Zooming: Scale an image by changing font size on the fly
* Custom fonts and support for extended characters and tilesets
* Browse art assets and begin editing at the press of a button
* Images highly compressed
* Export PNGs for use in other programs or on the web
* Import/export .ANS files for ANSI art
* Other exportable formats: TXT, CSV, XML, XPM, BBCode, C:DDA
* Import .TXT files
* Skinnable interface


-----------------------------------------------------------------
 Table of Contents
-----------------------------------------------------------------

* Canvas
    Resizing
    Shifting
* Drawing
    Apply
    Draw Modes
    Text Input
    Preview
    Undo
* Fonts
    Glyphs
    Glyph Swapping
    Custom and Extended Fonts
    Custom Glyph Mirroring
    Custom Unicode Codepoints
* Palettes
    Selection & Editing
    Color Picker
    Palette Files
    Extraction
    Adding
    Organization
    Palette Swapping
    Transparency
* Layers
    Control
    Active Layer
    Order
    Visibility & Locking
    Merging
    Extended Layers Mode
* Browsing
    File/Image Control
    Viewing & Editing
    Saving
    Exporting
* Customization
    Options
    Skins
* Commands
* Appendix A: Known Issues
* Appendix B: .xp Format Specification
* Appendix C: External Libraries and Tools
* Appendix D: ANSI Art (.ans)
* Appendix E: Exportable Text Formats (.txt, .csv., .xml, BBCode)
* Appendix F: Importing Text Files
* Appendix G: Importing PNGs
* Appendix H: Additional Command Line Options
* Appendix I: Exporting ANSI art for C:DDA

-----------------------------------------------------------------
 Canvas
-----------------------------------------------------------------

The black area to the right of the tool menus is the canvas view where all image editing occurs, and the image itself initially appears as a box outline that defaults to the size of the entire canvas view.

 Resizing
----------
Resize the image as necessary (Ctrl-r), ideally before starting to draw so that later changes are not affected by a change in image dimensions. Resizing can be done at any time, but the dimensions are always based from the top-left corner of an image, so make sure the portion of a larger image you wish to retain is based in the top-left corner before shrinking it (move the relevant section with the copy tool).

 Shifting
----------
To view different parts of a large image (or reposition a smaller one), hold spacebar while left-clicking on the image and moving the mouse to drag it (Photoshop style). The numpad can also be used for eight-directional shifting of the image, Enter resets its location, and Ctrl-Enter centers it.


-----------------------------------------------------------------
 Drawing
-----------------------------------------------------------------

 Apply
-------
The apply menu determines what is actually produced by the current draw mode when you left-click on the image. Glyphs (characters), foreground color, and background color are each drawn/edited separately, and can be individually toggled on and off via the menu buttons or 'g', 'f', and 'b'. Thus if you activate "glyph" and deactivate "fore" and "back," when you draw only the current glyph will be applied, while the image's colors remain unchanged. Activating all modes will overwrite the glyph and both foreground and background colors when drawing. (Turning all apply modes off would draw... nothing, and be completely pointless!)
    The colors to be applied are shown to the right of their button, and the current glyph is that highlighted/chosen among the characters in the font box. Change the glyph by left-clicking on a different one in the font box, and change the colors by either left-clicking on the color square (see Color Picker explanation further below) or chosing a color from the palette (LMB choses a color for the foreground, RMB for the background).

 Draw Modes
------------
Drawing modes define the shape and area of the image affected while drawing. Only one mode can be active at a time, and some modes have an alternate setting that changes their behavior (left-click on the active mode to toggle its secondary feature, or cycle through them if more than one).
    Cell ('c'): Applies the effect to a single "cell" (space) on the image. Hold LMB and move the cursor to keep drawing. Alternate mode: Auto-wall/auto-box drawing.
    Line ('l'): Applies the effect to a line. Left-click at the line's start and release the button at its end, or press RMB/ESC before releasing the button to cancel the line.
    Rect ('r'): Applies the effect to a rectangular area. Left-click at one corner of the rectangle and release the button at the opposite corner, or press RMB/ESC before releasing the button to cancel the rectangle. Alternate mode: Fills the entire rectangle instead of drawing an outline.
    Oval ('o'): Like rect mode, but draws ovals. Alternate mode fills the oval. By default ovals are centered on the point chosen; to instead draw from any corner switch the oval drawing method via Alt-o.
    Fill ('i'): Applies the effect to all like cells attached to the one under the cursor. Alternate Mode: Fill search is performed in 8 directions rather than 4.
    Text ('t'): Types text onto the image.
    Copy (Ctrl-c): Copies a rectangular area of the image into the clipboard for later pasting. Alternate mode: Cut (Ctrl-x).
    Paste (Ctrl-v): Paste the clipboard contents to the image. Alternate modes: Flip clipboard contents horizontally, vertically, or both.

 Preview
---------
While the cursor is hovering over the image, applicable draw modes (cell, fill, paste) will show a preview of what the image will look like assuming a left-click at that location.

 Undo
------
All image manipulation actions can be undone/redone (Ctrl-z/Ctrl-y, or just z/y). Undo histories are also saved separately for each image.


-----------------------------------------------------------------
 Fonts
-----------------------------------------------------------------

Images themselves do not store font information, instead remembering only what glyph/character index belongs at each position. This means you can dynamically change the size and/or appearance of an image by simply switching the font (Ctrl-PgUp/Dn or '<'/'>').

 Glyphs
--------
Select a glyph to draw with by clicking on it in the font window. Right-click on a cell in the image to pick up its glyph and colors.
    Toggle highlighting of all used glyphs by pressing 'u'. To see where a specific glyph has been used, hold Alt while hovering over it in the font window.

 Glyph Swapping
----------------
To replace every occurence of a glyph in all visible unlocked layers, Shift-LMB on it in the font window, then Shift-LMB on the new glyph to replace it with.

 Custom and Extended Fonts
---------------------------
By default, both the GUI and images use a standard 256-glyph Code Page 437 font. REXPaint makes this same font available at several sizes. You can edit these fonts (in the "data/fonts/" directory), and/or add new ones by creating a new .png bitmap and listing it in the "data/fonts/_config.xt" text file. Fonts do not require square glyphs (rectangles are okay), but both the GUI and Art font must use the same glyph dimensions.
    Although the default number of rows in a font bitmap is 16, fonts with additional rows are supported, essentially allowing space for an unlimited number of glyphs in an image. Simply specify the proper number of rows available for the relevant art font in _config.xt.


-----------------------------------------------------------------
 Palette
-----------------------------------------------------------------

Palettes in REXPaint are tools intended purely for color selection and organization, thus images themselves do not store palettes (i.e., image colors are not "indexed").

 Selection & Editing
---------------------
Left-clicking on a palette color selects it as the foreground color; right-clicking selects it as the background color. Clicking on the same color again will allow you to edit it in the color picker.

 Color Picker
--------------
Left-click on a color to select it, and click on it again to accept it. Choose a precise color by specifying HSV/RGB number values (click on the number, or press 'h'/'s'/'v'/'r'/'g'/'b').

 Palette Files
---------------
Any number of palettes can be created by clicking on the '+' button (switch between them with the buttons or '['/']' keys). Stored in text format in the "data/palettes/" directory.

 Transparency
--------------
Background color 255,0,255 (hot pink) identifies transparent cells. Draw using the transparent background color to create a transparent cell/area.


-----------------------------------------------------------------
 Layers
-----------------------------------------------------------------

 Control
---------
Each image automatically comes with one base layer (required). More can be created with Ctrl-l or by clicking on the layer window's '+' button. A single image can have up to nine separate layers, and all newly created layers are automatically filled with transparent cells (255,0,255).

 Active Layer
--------------
The "active layer" is the one which effects are applied to when drawing. Change the active layer by clicking on a different number, pressing 1~9, or using the mouse wheel while the cursor is over the canvas area.

 Order
-------
Layers are listed in top to bottom order, and their order determines which are drawn on top. The relative order of layers can be changed by clicking on the arrow buttons.

 Visibility & Locking
----------------------
Individual layers can be hidden from view. Locked layers (Shift-# or the "Lck" button) prevent editing.

 Merging
---------
Use Ctrl-Shift-m to merge the active layer downward.


-----------------------------------------------------------------
 Browsing
-----------------------------------------------------------------

Switch between paint mode and browse mode with Tab. Browse mode allows you to view all the images in the "images/" directory and subdirectories.

 File/Image Control
--------------------
New images: Ctrl-n or New button. Rename (RMB), duplicate (Shift-LMB) and delete (Ctrl-Shift-Alt-LMB).
    Reload all image files: Ctrl-Shift-r or the "R" button.

 Viewing & Editing
-------------------
Images do not need to be explicitly opened. When the program starts, all images are loaded into memory. Browse through them by clicking on their name or pressing up/down.

 Saving
--------
Save with Ctrl-s or the Save button.

 Exporting
-----------
Export PNG: Ctrl-e. Export TXT: Ctrl-t. Export CSV: Ctrl-k. Export ANS: Ctrl-a. Export XML: Ctrl-m. Export XPM: Ctrl-p. Export BBCode: Ctrl-b.


-----------------------------------------------------------------
 Commands
-----------------------------------------------------------------

 Font
------
Ctrl-PgUp/Dn / </>      Change Font (Scale Image/UI)
LMB                     Select Glyph
Arrows                  Shift Selection
u                       Toggle Used Glyph Highlighting
Alt (hold)              Highlight Hovered Glyph in Current Layer
Shift-LMB x2            Swap Occurences of Glyph 1 with Glyph 2

 Palette
---------
[/]                     Change Palette
LMB (x2)                Set (Edit) Foreground Color
RMB (x2)                Set (Edit) Background Color
Shift-LMB x2            Swap Occurences of Color 1 with Color 2
Ctrl-Shift-o            Organize Palette
Ctrl-Shift-e            Extract Image Palette
Ctrl-Shift-p            Purge Unused Colors
Ctrl-LMB x2             Swap Palette Colors

 Drawing
---------
c (x2)                  Cell (Auto-walls)
l                       Line
r (x2)                  Rectangle (Filled)
o (x2)                  Oval (Filled)
Alt-o                   Toggle oval drawing method (center/corner)
i (x2)                  Fill (8-direction)
t                       Text
Ctrl-c                  Copy
Ctrl-x                  Cut
Ctrl-v (x2)             Paste (Flip)
ESC / RMB               Stop/Cancel

 Text Tool
-----------
Enter                   Confirm
Ctrl-Enter              New line below
Escape                  Cancel
Left/Right Arrow        Move caret
Backspace               Delete before caret
Delete                  Delete at caret
Up/Down                 Cycle text history
Ctrl-v                  Paste from clipboard

 Apply
-------
g (G)                   Toggle (Solo) Glyph
f (F)                   Toggle (Solo) Foreground Color
b (B)                   Toggle (Solo) Background Color
RMB                     Add Color to Palette
Alt-w                   Swap Foreground/Background Colors
d                       Increment Copy/Cut/Paste Layer Depth

 Canvas
--------
Spacebar (hold)         Enter Drag Mode
LMB                     Hold Canvas to Drag
RMB                     Copy Cell Contents (Applied Modes Only)
Shift/Alt (hold)        Hide Preview
z/Ctrl-z                Undo
y/Ctrl-y                Redo
Ctrl-d                  Toggle Rect Dimension Display
Ctrl-g                  Toggle Grid
Ctrl-Tab                Switch between current/latest image
Ctrl-Up/Down            Edit Previous/Next Image

 Layers
--------
Ctrl-l                  New Layer
Wheel                   Cycle Active Layer
1~9                     Activate Layer
Ctrl-1~9                Toggle Layer Hide
Shift-1~9               Toggle Layer Lock
Ctrl-Shift-m            Merge Active Layer
Ctrl-Shift-l            Toggle Extended Layers Mode

 Browse
--------
Wheel / PgUp/Dn         Scroll List
LMB                     View Image
Up/Down                 View Previous/Next Image
RMB                     Rename Image
Shift-LMB               Duplicate Image
Ctrl-Shift-Alt-LMB      Delete Image
Ctrl-Shift-r            Reload All Image Files
Home/End                First/Last Image

 Image
-------
Ctrl-n                  New (in Base Path)
Ctrl-r                  Resize
Ctrl-s                  Save
Ctrl-e                  Export PNG
Ctrl-t                  Export TXT
Ctrl-k                  Export CSV
Ctrl-a                  Export ANS
Ctrl-m                  Export XML
Ctrl-p                  Export XPM
Ctrl-b                  Export BBCode

 General
---------
Tab                     Toggle Paint/Browse
F1 / ?                  Commands
F3                      Options
F4                      Change Skin
Alt-F4                  Exit
Alt-Enter               Fullscreen


-----------------------------------------------------------------
 Appendix B: .xp Format Specification
-----------------------------------------------------------------

The .xp files are deflated with zlib (gzipped); once decompressed the format is binary:

#-----xp format version (32)
A-----number of layers (32)
 /----image width (32)
 |    image height (32)
 |  /-ASCII code (32) (little-endian!)
B|  | foreground color red (8)
 |  | foreground color green (8)
 |  | foreground color blue (8)
 | C| background color red (8)
 |  | background color green (8)
 \--\-background color blue (8)

Data stored in column-major order. Transparent cells identified by background color 255,0,255.


-----------------------------------------------------------------
 Appendix H: Additional Command Line Options
-----------------------------------------------------------------

 Exporting PNGs
----------------
-exportAll              Export every .xp file as PNG
-export:XXX             Export individual .xp file as PNG

 Creating/Opening Images
-------------------------
-create:XXX             Create new .xp file
-open:XXX               Open REXPaint with .xp file preselected
-txt2xp:XXX             Convert .txt file to .xp
-png2xp:XXX             Convert .png file to .xp (filename must include _WWWxHHH)
-uniqueGlyphs           Use unique glyphs for different characters in png2xp


-----------------------------------------------------------------
 Key Configuration Reference
-----------------------------------------------------------------

REXPaint.cfg options:
* unlimitedFontSize: Load all fonts even if too large for screen
* txtOutputUTF8: UTF8 encoding for TXT export
* baseImagePath: Base path for image loading (relative to .exe)
* exportsToBase: Export to base path vs source subdirectory
* ignorePath: Paths to exclude from browser
* ansiMode: Enable ANSI art restrictions
* fontKeyColorOverride: Override font background color detection
* glyphScrollRowCount: Mouse scroll rate for glyph area
* glyphSelectAlwaysAutoscrolls: Auto-scroll to selected glyph
* noSaveForOutOfBoundsGlyphs: Block saving images with OOB glyphs
* ansOutputNoCursorShift: Disable cursor shift in ANS export
```

### 1.2 Northstar Product Goal

The long-range product target is:

1. a web-based, mobile-accessible, REXPaint-class XP editor
2. with Asciicker-specific sprite/bundle/runtime helpers layered on top of it
3. without letting those helpers own the root image/session model

This means the current workbench must be treated as a transitional hybrid, not as
the final architecture.

Two corollaries are mandatory:

1. `rikiworld.com/xpedit` stays behavior-frozen until the deletion-first refactor is complete and working.
2. No design or implementation choice in Section 2 may override the root editor contract in Section 1.

### 1.3 Derived Non-Negotiable Parity Contract

The embedded manual yields the following non-negotiable editor contract:

1. The image/canvas is the primary object.
2. `New`, open/import, resize, save, and export are image actions.
3. Paint mode and browse mode are peer modes of the same editor.
4. Layers are intrinsic to every image and must be directly controllable.
5. Apply modes split glyph, foreground, and background behavior.
6. The active tool operates on the active image and active layer.
7. Undo/redo are editor-level operations, not wrapper-only helpers.
8. PNG/source workflows are helpers around the editor, not replacements for the editor.
9. The browser implementation must converge on pointer-device-agnostic interaction for mouse, touch, and pen. Detailed mobile UX remains a research-backed design phase, but the requirement itself is already part of the canon.

### 1.4 Canonical Root Behavior Families

The root editor SAR tree must be organized around editor behavior, not around
template or pipeline remnants:

1. **Image Lifecycle**
   - new
   - open/import
   - resize
   - save
   - export
2. **Mode Control**
   - paint mode
   - browse mode
3. **Canvas Navigation**
   - pan/shift
   - zoom/font scale
   - grid toggle
4. **Apply State**
   - glyph on/off
   - foreground on/off
   - background on/off
5. **Draw Tools**
   - cell
   - line
   - rect
   - oval
   - fill
   - text
   - copy/cut/paste
6. **Glyph and Palette**
   - glyph selection
   - palette selection/edit
   - eyedrop/sample semantics
7. **Layers**
   - create
   - select active
   - visibility
   - locking
   - ordering
   - merge
8. **Browse**
   - list images
   - select image
   - rename
   - duplicate
   - delete
   - reload
9. **History**
   - undo
   - redo

Everything in this tree belongs to Section 1. Source slicing, template/bundle
state, engine-family routing, and runtime injection belong to Section 2.

### 1.5 Canonical Owner Graph

The target owner graph is:

1. an image/session is created or loaded
2. the whole-sheet XP editor owns the image, layers, mode, and history
3. browse is a peer mode inside that same owner
4. source panel and frame navigation are views or overlays on that owner
5. save/export emit from that owner
6. bundle/runtime helpers observe or adapt that owner, but never become a parallel owner

No wrapper feature is allowed to replace this graph.

### 1.6 Current Section-1 Misalignment Ledger

The Step 2-7 deletion slices removed several earlier root-owner violations:
template-first startup, template-gated blank creation, legacy inspector fallback,
the deferred-browse placeholder state, raw-vs-XP source flipping,
viewport-hit-test drop targeting, duplicate frame-nav ownership, and the old
local history owner are no longer the current blockers. The Step 4 mirror-sync
owner (`FL-STEP4-01` / `FL-STEP4-06`) was also removed on `2026-04-16`; the
remaining live misalignments are below.

The audit below tracks the previously misaligned areas and whether they remain
open or are now resolved:

| Finding | Current evidence | Why this is misaligned |
|---------|------------------|------------------------|
| Wrapper views are now demoted into in-root drawers rather than peer sections | `web/workbench.html`, `web/workbench.js` | The standalone alpha/header peer shell was deleted on 2026-04-16, and source/frame/runtime/obs surfaces now open as toggleable drawers inside `#wholeSheetPanel` instead of living as separate top-level browser sections. RESOLVED. |
| Canonical manifest authoring now exists, but it is still JSON-first | `web/workbench.html:133-145`, `web/workbench.js:2196-2377`, `web/workbench.js:3278-3367`, `src/pipeline_v2/app.py:496-525`, `src/pipeline_v2/service.py:3831-3887` | The deleted source overlay owner was replaced with a manifest JSON draft editor, saved-manifest routes, and guide/region rendering on the source canvas. The remaining gap is ergonomic interactive slicer tooling; authoring is still a JSON-first wrapper flow. |
| Source panel now reloads canonical PNG/manifest without grid geometry | `web/workbench.js:2242-2305`, `web/workbench.js:3278-3367`, `web/workbench.js:4310-4332`, `src/pipeline_v2/app.py:496-525` | The source panel now reads `source_path` / `source_manifest` directly, reloads the PNG through `/api/workbench/source-image`, and can render manifest geometry before the PNG finishes loading. This Step 5 projection dependency is resolved. |
| Sprite-by-sprite source-to-frame drag coverage is now first-class in the official headed runner | `scripts/xp_fidelity_test/verifier_lib.mjs`, `scripts/xp_fidelity_test/run_source_to_grid_workflow_test.mjs`, `tests/fixtures/known_good/source_grid_multirow.png`, `PLAYWRIGHT_FAILURE_LOG.md` entries dated `2026-04-17` | The canonical runner now proves all currently visible source-box families through shipped UI actions only: manual single-box, auto-detected single-box, grouped row-select, and grouped column-select drags into `9A`. RESOLVED on `2026-04-17`. |
| Frame-nav multi-row selection and frame-slot deletion now behave as separate shipped interaction contracts | `web/workbench.html`, `web/workbench.js`, `scripts/xp_fidelity_test/run_m2d_action_proof_test.mjs`, `output/m2d_action_proof_multirow_v1/report.json` | `Clear Selected` remains the clear-content action, `Delete Frame` remains the semantic-slot removal action, and `shift+click` selection now persists across rows instead of collapsing back to one row. The official headed M2-D runner now proves cross-row clear/delete behavior through shipped UI actions only. RESOLVED on `2026-04-17` (`3dd7042`, `2ec2238`, `d689a14`). |
| Panel identity map and panel topology now exist in code, but public-parity proof is still open | `web/workbench.html`, `web/styles.css`, `web/workbench.js:7984-8099` | The current branch now exposes numbered/named panel badges (`8 source`, `9 grid`, `9A frame-nav`, `9B grid-panel`, `10 whole-sheet`, etc.) and a full clickable-ID overlay toggle (`hide IDs` / `Alt+I`). That closes the raw tagging gap that fueled the three-day refactor confusion, but it is still code-state until it is re-proved against the frozen public workflow grouping. |

These are architectural failures. They are not just missing buttons.

**AUDITOR FOUND GAP (2026-04-15):** The five ownership misalignments above are not the only Section 1 failures. The 2026-04-15 parallel audit found that parity contract items 2, 3, 4, 5, and 9 are also unimplemented or broken. These are feature gaps, not just ownership gaps. They must be tracked alongside the ownership items:

| Finding | Evidence | Why this violates the parity contract |
|---------|----------|---------------------------------------|
| Resize action completely missing | No Ctrl-r handler, no resize UI, no logic in `web/workbench.js` or `web/whole-sheet-init.js` | Parity item 2: resize is a first-class image action |
| Browse mode non-functional — Tab toggle not wired | `web/whole-sheet-init.js:1086-1091` renders a `BROWSE` button, but there is no mode state, no click binding, and no `Tab` handler in `web/whole-sheet-init.js:885-992` | Parity item 3: paint and browse are peer modes, Tab toggles them |
| Undo/redo surface is broken after the deletion pass | `web/whole-sheet-init.js:219-238`, `web/whole-sheet-init.js:896-901`, `web/workbench.js:5410-5509` | The whole-sheet UI still renders Undo/Redo controls and shortcuts, but `workbench.js` no longer supplies `onUndo`/`onRedo`, so Family 9 history has no live owner. |
| Apply mode keyboard shortcuts not bound | `applyGlyph`/`applyFg`/`applyBg` state exists; g/f/b handlers do not | Parity item 5: apply modes split glyph/fg/bg behavior |
| Draw tool set is still incomplete | `web/whole-sheet-init.js:16-20`, `web/whole-sheet-init.js:905-916`, `web/whole-sheet-init.js:965-992` | Cell/erase/eyedropper/line/rect/fill/select and clipboard shortcuts now exist, but Oval and Text are still absent, so the Family 5 draw-tool set and full keyboard map are incomplete. |
| Mouse-only input — touch and pen events absent | `web/whole-sheet-init.js` uses mousedown/mousemove/mouseup only | Parity item 9: pointer-device-agnostic interaction |
| Zoom / font-scale not implemented | No zoom control or font-scale handler in `web/whole-sheet-init.js` | Family 3 in Section 1.4: canvas navigation includes zoom |
| Grid control is only partially implemented | `web/whole-sheet-init.js:1241-1279` provides a sidebar toggle and step selector, but there is no Ctrl-g authority and no zoom/grid persistence contract | Family 3 in Section 1.4 requires grid control as a direct canvas-navigation behavior |
| Layer control is only partially implemented | `web/whole-sheet-init.js:1757-1850`, `web/workbench.js:3498-3505` | Click-based visibility/lock/reorder UI exists, but Ctrl-l / 1~9 / Ctrl-1~9 / Shift-1~9 / Ctrl-Shift-m / wheel authority is missing and lock state is not part of the root session save contract. |

These gaps must be explicitly designed before implementation begins. Do not implement piecemeal. See Unified Sequence Of Actions for the corrected task sequence.

### 1.6.1 Execution Checkpoint — 2026-04-26

The 2026-04-15 gap table above remains valid as historical audit context, but
some of those rows are no longer literally current code state.

What current code now does:

1. `web/whole-sheet-init.js` now ships a root-editor `Resize` action plus
   `Ctrl-r`.
2. `web/whole-sheet-init.js` now ships live `PAINT` / `BROWSE` mode toggling
   with `Tab`.
3. Oval and text tools are now wired into the whole-sheet editor surface.
4. Grid/zoom shortcuts and layer keyboard/wheel controls now exist in the root
   keymap.
5. `web/rexpaint-editor/canvas.js` now prefers Pointer Events when available,
   and whole-sheet session metadata now persists layer locks plus zoom/grid
   state through the Flask save/load contract.
6. The whole-sheet root now preserves cell state correctly for three Section 1
   parity cases that were regressed in the first slice:
   - selection delete preserves existing background colors while clearing glyphs
   - text-edit backspace restores the prior active-layer cell inside the current
     text session
   - layer-merge-down copies non-default source cells even when `glyph == 0`,
     so color-only/background-only cells survive the merge without letting
     untouched default blanks erase the target layer

Execution evidence:

- `python3 -m pytest tests/test_workbench_flow.py tests/test_base_path.py -q`
  passed on `2026-04-26` (`61 passed`)
- `tests/web/rexpaint-editor-canvas.test.js` passed through the VM-module
  runner on `2026-04-26` (`14 passed, 0 failed`)
- `node --test tests/web/whole-sheet-cell-ops.test.mjs` passed on
  `2026-04-26` (`3 tests`)

What remains open and still blocks honest `UQ-002` closure:

1. The root-owner law is still incomplete because `web/workbench.js` still owns
   the live undo/redo journal and still keeps compatibility mirrors of document
   state for wrapper rendering.
2. Root resize is still constrained by the current frame-topology save law; it
   is not yet the unrestricted Section 1 image action where Section 2 may only
   warn.
3. No headed UI-only Section 1 proof has been rerun yet on the root-hosted and
   prefixed `/xpedit` shipped surfaces.
4. Loaded headed-use findings now show three additional practical residuals on
   the shipped root surface:
   - historical note: these were fixed in product commit `d487e74`; they
     should not be treated as current blockers unless headed `UQ-003` rerun
     disproves the fix
5. The current hot path is still architecturally too slow because root edits
   fan back out into wrapper history, frame-grid rebuilds, and full-session
   save work.

### 1.6.2 Required UQ-002 Hot-Path Refactor Order — 2026-04-26

The remaining "super slow" feel is treated as part of `UQ-002`, not as a later
polish lane.

What current code still does:

1. `web/workbench.js:2057-2097` still owns live undo/redo through wrapper
   snapshots.
2. `web/workbench.js:2807-2826` still rebuilds the entire frame-grid DOM/canvas
   projection with `innerHTML = ""` and per-tile canvas recreation.
3. `web/workbench.js:3900-3965` still serializes full session payloads on the
   save path.
4. `web/workbench.js:6363-6394` and `web/workbench.js:6433-6461` still connect
   ordinary whole-sheet edit completion to wrapper projection churn and save
   work.

Required execution order inside `UQ-002`:

1. delete wrapper-owned undo/redo from the whole-sheet edit path and move live
   history ownership into `whole-sheet-init.js`
2. stop full `renderFrameGrid()` rebuilds on ordinary root edits; update only
   the dirty/visible shipped projection surfaces that actually need refresh
3. decouple session save/autosave from edit completion so normal drawing does
   not immediately serialize the full live session payload
4. only after the owner/hot-path cut is stable, move any remaining secondary
   projection or serialization work off the main thread

Stop rules:

1. Do not treat wrapper-side suppression flags, throttles, or more mirror logic
   as closure for this lane.
2. Do not move this work into `UQ-004` or any later Section 2/3 row.
3. Do not reopen a second document/root owner while reducing hot-path cost.

### 1.7 Section-1 Refactor Rule

Do not add a new owner while leaving the old owner alive.

The deletion-first order for Section 1 was:

1. remove template-first blank-image assumptions
2. promote whole-sheet image/session ownership to the root
3. make browse/new/save/export true image actions at that root
4. demote source and frame-nav into overlays/views on that root
5. only then preserve or rebuild wrapper features from Section 2

**AUDITOR FOUND GAP (2026-04-15):** These slices are NOT largely complete. The 2026-04-15 parallel audit found that the Section 1 parity alignment rate is 28% fully aligned, 44% partial, and 28% gap or missing. The ownership inversion is partially done (whole-sheet canvas exists) but the root owner contract (whole-sheet owns history/layers/mode, workbench.js is subordinate) is not met. Feature completeness (resize, browse, tools, shortcuts, touch) is also not met. The current state is a hybrid that passes structural syntax checks but does not deliver the behavioral contract. The current remaining sequence from this state is tracked in Unified Sequence Of Actions.

### 1.8 Section-1 Feature Behavioral Contract

This subsection is the required Step 2 design artifact from the Unified Sequence Of Actions. Step 3
and Step 4 implementation work must follow this contract; they are not allowed
to invent a second behavior model in code.

#### 1.8.1 Root Document And Surface Contract

1. The authoritative in-memory editor document contains:
   - geometry: `gridCols`, `gridRows`, frame geometry, viewport position, zoom
   - image data: ordered layers plus per-layer visibility and lock state
   - editor state: active layer, current mode, current tool, draw glyph/colors,
     apply toggles, selection, clipboard, and undo/redo history
2. `whole-sheet-init.js` is the owner of that document. `workbench.js` may
   request commands and observe snapshots, but it may not directly mutate
   layers, history, mode, tool state, or panel visibility.
3. The whole-sheet panel is always present as the root editor surface. When no
   image is loaded, it shows an empty-state root surface and image actions. It
   must not disappear merely because no session is mounted.
4. Frame focus, source selection, bundle navigation, and preview helpers are
   overlays on this owner. They may pan/select within the root canvas, but they
   do not decide whether the editor exists.

#### 1.8.2 Image Action Contract

1. `New` is a root image action. It creates a blank document through the
   whole-sheet owner after an explicit geometry prompt. Section 2 templates may
   seed the initial layer set, but they do so by calling the same root command.
2. `Open` / `Import XP` are root image actions. They replace the active
   document in the same whole-sheet owner; they do not mount a second editor.
3. `Resize` is a root image action. It opens a geometry dialog seeded from the
   current image size. Confirming resize:
   - applies one transaction to every layer
   - anchors preservation at top-left
   - fills new cells with transparent/blank cells when growing
   - crops right/bottom extents when shrinking
   - clips or clears selections outside the new bounds
   - recomputes frame/grid overlays derived from image geometry
4. Section 2 may warn that a resize breaks template/runtime expectations, but
   it may not block or own the resize behavior itself.
5. `Save` persists the current root document/session without download.
6. `Export XP` serializes the same root-document snapshot. If the document is
   dirty, export flushes save/autosave first, then exports from that snapshot.

#### 1.8.3 Mode Model: Paint And Browse

1. `PAINT` and `BROWSE` are peer modes inside the same whole-sheet owner.
2. `Tab` toggles between them. Clicking the mode buttons performs the same
   toggle.
3. `PAINT` exposes editing tools and allows canvas mutation.
4. `BROWSE` exposes the image list and image CRUD actions while keeping the
   whole-sheet canvas as the single preview/edit surface. Browse is not a
   second editor and not a separate workbench owner.
5. Browse mode supports list/select/open/rename/duplicate/delete/reload over
   the current image collection, regardless of whether that collection is
   backed by server sessions, local drafts, or file-picker imports.

#### 1.8.4 Apply, Tool, Selection, And Clipboard Contract

1. Apply channels are authoritative root-editor state. `g`, `f`, and `b`
   toggle glyph, foreground, and background application respectively.
2. `Shift-g`, `Shift-f`, and `Shift-b` solo the selected channel by turning it
   on and turning the other two off. Pressing the same solo key again while
   already solo restores all three channels.
3. The editor must never enter an all-off apply state. Attempting to disable
   the final active channel is a no-op.
4. The required tool set is:
   - cell
   - line
   - rect
   - oval
   - fill
   - text
   - eyedropper
   - erase
   - selection
5. Only one primary tool is active at a time. Required plain-key bindings are:
   `c`, `l`, `r`, `o`, `i`, `t`, plus additive browser-specific aliases `d`
   (eyedropper), `e` (erase), and `s` (selection).
6. Copy/cut/paste operate on a rectangular document selection, not on a frame
   tile abstraction. The clipboard preserves cells for every visible layer in
   the selected bounds, and paste commits as one transaction.
7. Tool switches do not implicitly destroy the current selection. Selection
   remains visible and authoritative until explicitly cleared, canceled, or
   invalidated by a geometry-changing document mutation.
8. `Delete` / `Backspace` clear the current selection on the active visible
   unlocked layer as one transaction.
9. `Cut` still operates on the visible-layer clipboard model: it captures the
   selection across visible layers, then clears the cut rectangle across the
   visible unlocked layers as one transaction.
10. `Esc` cancels in-progress line/rect/oval/text/paste interactions without
   emitting a history entry.
11. `Text` tool contract:
   - click sets the insertion anchor on the active unlocked layer
   - printable keys emit glyphs using current apply/color state
   - `Enter` moves to the next line from the anchor column
   - `Backspace` removes the previous typed cell inside the current text edit
   - `Esc` commits and exits text mode

#### 1.8.5 Keyboard Authority Map

The whole-sheet editor owns the following command map. Browser-default handlers
must be intercepted where necessary.

| Command family | Required keys |
|----------------|---------------|
| Image actions | `Ctrl-n` new, `Ctrl-o` open/import, `Ctrl-r` resize, `Ctrl-s` save, `Ctrl-Shift-s` export XP |
| Mode | `Tab` toggle paint/browse |
| Apply | `g` / `f` / `b` toggle, `Shift-g` / `Shift-f` / `Shift-b` solo |
| Draw tools | `c` cell, `l` line, `r` rect, `o` oval, `i` fill, `t` text, `d` eyedropper, `e` erase, `s` select |
| Selection / clipboard | `Ctrl-c`, `Ctrl-x`, `Ctrl-v`, `Delete`, `Backspace`, `Esc`, `[` rotate CCW, `]` rotate CW |
| History | `Ctrl-z` undo, `Ctrl-y` redo |
| Layers | `Ctrl-l` add, `1-9` select active, `Ctrl-1-9` toggle visibility, `Shift-1-9` toggle lock, `Ctrl-Shift-m` merge active downward, `Alt` + mouse wheel over canvas cycles active layer |
| Viewport | `Ctrl-g` grid toggle, `<` / `>` and `Ctrl-PgUp` / `Ctrl-PgDn` zoom/font-scale, `Space` + drag pan |

#### 1.8.6 Layer And History Contract

1. Layers are owned by the root document, not by workbench mirror state.
2. Layer add/delete/reorder/visibility/lock/merge are document mutations and
   therefore produce history transactions.
3. `Ctrl-l` creates a transparent layer matching current image geometry
   immediately above the active layer and makes it active.
4. Hidden layers remain part of the document and export payload; hiding affects
   viewport rendering and clipboard capture, not document existence.
5. Locked layers reject all mutating commands: draw, fill, text, paste,
   selection transforms, and merge targets.
6. Lock state, visibility, ordering, and layer names are part of session/draft
   persistence even if `.xp` export cannot encode every editor-only flag.
7. Undo/redo history is owned by the whole-sheet editor. Each of these is one
   history transaction:
   - one drag stroke
   - one fill
   - one text-edit session commit
   - one paste/cut/delete/transform command
   - one resize
   - one layer add/delete/reorder/visibility/lock/merge command
8. Viewport pan/zoom, active tool, browse selection, and other non-document UI
   state are not history transactions.
9. Each open image keeps its own undo journal. Switching images in browse mode
   swaps journals with the active document.

#### 1.8.7 Pointer, Pan, Zoom, And Grid Contract

1. Pointer input follows Section 1.9.1 exactly: Pointer Events are the only
   authoritative input model for canvas interaction.
2. One active pointer drives the current tool. Two active pointers are reserved
   for viewport pan/zoom and must never paint.
3. The canvas root owns `touch-action` and must prevent browser gesture capture
   on the active editing surface while tool input is active.
4. Mouse/pen panning uses `Space` + drag. Touch panning/zooming uses the
   two-pointer gesture path from Section 1.9.1.
5. Zoom changes viewport font scale only; it never changes XP cell geometry or
   export data. Required discrete zoom levels are `50%`, `75%`, `100%`,
   `150%`, `200%`, `300%`, and `400%`.
6. Grid display is viewport decoration, not document data. `Ctrl-g` toggles
   it. Grid spacing may switch between frame-aligned and cell-step modes, but
   grid lines must remain cell-aligned under pan, resize, and zoom.
7. Zoom level, pan offset, and grid visibility are editor-session state. They
   persist in drafts/sessions when possible, but never alter `.xp` export.

### 1.9 Research Requirements And Decisions

This subsection folds the former global research section into Section 1. The
relevant research areas for the root editor are:

1. mobile pointer model
2. browser/mobile persistence
3. small-screen editor layout
4. comparative editor behavior

These are design decisions for the refactor, not proof that the current code
already behaves this way.

#### 1.9.1 Touch / Mobile Interaction Contract

Evidence:

- MDN Pointer Events says pointer events provide a single DOM event model for
  mouse, pen, and touch, and expose `pointerType` for device-specific handling.
- MDN `touch-action` says the browser will otherwise take over panning/pinch
  gestures, fire `pointercancel`, and that custom-gesture intent should be
  declared on the top-level interactive element before handlers run.
- MDN pinch-zoom guidance shows two-pointer gesture detection via cached pointer
  events and explicit pinch-distance tracking.
- `xero/text0wnz` documents mouse/touch drawing support and explicit touch
  gesture control in a browser-first ASCII editor.

Decision (inference from sources):

1. The whole-sheet canvas remains the single mobile editing surface.
2. All editor interaction moves to Pointer Events. Do not keep a separate
   mouse-only path as the authoritative editor path.
3. Single-pointer contact on the canvas is tool input. Two active pointers are
   reserved for viewport pan/zoom only and must never paint.
4. The canvas root gets explicit `touch-action` ownership. Final implementation
   should use `touch-action: none` on the editor canvas while paint/select tools
   are active, with browser scrolling left enabled only on surrounding chrome.
5. Hover-only affordances are not acceptable as the sole UX. Any hover preview
   must have a touch equivalent: tap-hold inspect, explicit selection handles,
   or a visible status strip.
6. Context actions on touch use an explicit selection toolbar first. Long-press
   can open the same menu, but long-press is an accelerator, not the only path.

Sources:

- https://developer.mozilla.org/en-US/docs/Web/API/Pointer_events
- https://developer.mozilla.org/en-US/docs/Web/CSS/touch-action
- https://developer.mozilla.org/en-US/docs/Web/API/Pointer_events/Pinch_zoom_gestures
- https://github.com/xero/text0wnz

#### 1.9.2 Browser Persistence Contract

Evidence:

- MDN File System API says picker-based file access is secure-context only and
  exposes `showOpenFilePicker()` / `showSaveFilePicker()`.
- MDN says OPFS is private to the origin, not visible to the user, optimized
  for performance, and supports synchronous worker access.
- MDN install-prompt guidance uses `beforeinstallprompt` and `appinstalled` as
  the browser-managed install lifecycle hooks.
- `xero/text0wnz` uses local storage plus IndexedDB auto-save/restore and also
  documents platform-specific open flows for desktop, Android share sheet, and
  iPad/iOS file picker.
- `ASCII_Art_Paint` is explicitly offline-in-browser and TXT-file oriented.
- `ASCIIFlow` is client-side only, which is useful as a low-friction baseline
  but insufficient for multi-layer XP sessions and undo/history durability.

Decision (inference from sources):

1. Persistence is three-tier:
   - Tier A: always-on draft persistence for the active image and undo history.
   - Tier B: explicit user-facing import/open/save/export.
   - Tier C: optional PWA install/offline shell.
2. Tier A uses browser-local storage, with OPFS and/or IndexedDB for drafts and
   undo journals. OPFS is for internal durability, not for user-visible export.
3. Tier B prefers file pickers when available in secure contexts. When picker
   APIs are unavailable, the fallback is import via file input plus export via
   Blob download/share flows.
4. The editor must not require installation to work. PWA install is optional
   acceleration only, surfaced only after `beforeinstallprompt`.
5. Mobile persistence cannot assume desktop-class "save back to same file".
   Final mobile UX must always offer an explicit export/share path.

Sources:

- https://developer.mozilla.org/en-US/docs/Web/API/File_System_API
- https://developer.mozilla.org/en-US/docs/Web/API/File_System_API/Origin_private_file_system
- https://developer.mozilla.org/en-US/docs/Web/Progressive_web_apps/How_to/Trigger_install_prompt
- https://github.com/xero/text0wnz
- https://github.com/Kirilllive/ASCII_Art_Paint
- https://github.com/lewish/asciiflow

#### 1.9.3 Small-Screen Layout Contract

Evidence:

- REXPaint keeps the image/canvas as the primary workflow and treats browse/file
  operations as image-level actions, not as the main surface.
- `xero/text0wnz` keeps browser-native file handling, zoom, grid, and
  touch-capable drawing on one primary canvas experience.
- `ASCII_Art_Paint` exposes explicit hand/scroll, brush, fill, and selection
  shortcuts and keeps a simple editor-first layout.

Decision (inference from sources):

1. On narrow screens the whole-sheet canvas stays primary and visible. Do not
   preserve the current desktop two-column panel layout as the mobile baseline.
2. Layers, frame navigation, source helpers, and file/browse actions become
   drawers, sheets, or segmented overlays that can be summoned over the canvas.
3. Only one dense support panel may be expanded at a time on mobile:
   `layers`, `frames`, `source`, or `browse/files`.
4. The default small-screen chrome is:
   - top bar: file/new/save/export + mode toggle
   - center: canvas
   - bottom bar: tool switch + current layer + frame/location status
   - drawers/sheets: source helpers, frame nav, browse, layer management
5. The frame-navigation view should become a compact logical strip/filmstrip on
   mobile, not a second full grid competing with the canvas for space.

Sources:

- https://www.gridsagegames.com/rexpaint/features.html
- https://github.com/xero/text0wnz
- https://github.com/Kirilllive/ASCII_Art_Paint

#### 1.9.4 Comparative Editor Decisions

Evidence:

- REXPaint advertises layers, hover preview, browse, and image-first control.
- Durdraw documents mouse input, selection, undo/redo, frame-based animation,
  configurable undo size, and export paths.
- ASCIIFlow is a client-side-only ASCII diagram editor.
- `ASCII_Art_Paint` combines a graphic editor with bitmap-to-text conversion and
  uses plain TXT save/load compatibility.
- `xero/text0wnz` demonstrates a browser-first, offline-first ASCII editor with
  touch, IndexedDB persistence, and platform-specific open flows.

Decision (inference from sources):

- Borrow from REXPaint:
  image-first ownership, intrinsic layers, browse as a peer mode, and
  `New` / `Save` / `Export` as image actions.
- Borrow from Durdraw:
  strong undo/redo expectations, explicit selection workflows, frame/animation
  mental model, and mouse-assisted editing.
- Borrow from `xero/text0wnz`:
  offline-first browser durability, touch-capable tooling, and multi-platform
  open/install behavior.
- Use `ASCII_Art_Paint` as source-helper inspiration only:
  bitmap-to-text conversion and simple built-in text affordances are useful,
  but its TXT-first persistence model must not replace XP-root image ownership.
- Reject ASCIIFlow as the editor baseline:
  it is useful as proof that low-friction client-side drawing works, but it is
  too diagram-centric and too shallow for layer/history/browse/runtime needs.
- Reject terminal-era menu/chord UX as the mobile baseline:
  Durdraw is valuable for editor behavior, but Esc-heavy terminal interaction is
  not the touch/browser contract.

Sources:

- https://www.gridsagegames.com/rexpaint/features.html
- https://github.com/cmang/durdraw
- https://github.com/lewish/asciiflow
- https://github.com/Kirilllive/ASCII_Art_Paint
- https://github.com/xero/text0wnz

---

## Section 2 — Asciicker Engine Sprite Wrapper Spec

The Asciicker runtime now resolves character sprites through a canonical
`skin_family` axis plus presentation state and appearance bits. The final asset
filenames still follow `{family}-{AHSW}.xp`, where the suffix encodes equipment
state, but prefix selection is no longer the only family concept in the system:
main-game `engine/game.cpp` now derives those prefixes from `SkinFamilyDefinition`
tables. Base families are currently `human` and `green`; on-foot prefixes are
`player` / `plydie` / `attack` and `player-green` / `plydie-green` /
`attack-green`, while mounted/bee-related prefixes such as `wolfie`, `wolack`,
and `bigbee` still live on the human side with fallback behavior from green.

Section 2 defines the complete authoring pipeline that produces those files from
source art and gets them into the runtime for proof. An artist starts with a
PNG sprite sheet; Section 2 provides tooling to mark which pixel regions map to
the correct action/prefix slots, converts those regions into the engine's XP
cell format, maps the result into the correct runtime filenames, runs
structural gates that enforce dimensions, layer count, and the L0 metadata row
the engine requires, and then bundles and injects the validated files for a
live runtime smoke test. The goal is a repeatable, validated path from raw
source art to a runtime-proven skin — but Section 2 is only ever a set of tools
layered on top of the root XP editor (Section 1). It helps; it does not own.

This section defines the sprite-family, sprite-sheet, bundle, and runtime wrapper
behavior layered on top of Section 1.

The asset pipeline is the part of the project responsible for taking raw sprite artwork — character animations like "wolfie" and "wolack" — and converting them into the engine's runtime format. The intended flow is: an artist authors an XP (experience pack) by feeding it source sprite sheets, the pipeline slices and maps those sheets into per-action, per-angle frames, runs them through a series of structural quality gates (geometry density, non-empty content checks, ap handoff population), and exports a final bundle the game engine can load. A local web-based workbench server is the primary UI for this authoring loop.

From the launcher's perspective, this would have appeared as a top-level menu option — [3] ASSET PIPELINE — giving you three choices: launch the workbench server and open its URL in a browser, check pipeline server health and reachability, and configure the server path and port. The idea is that a content creator could sit down, run the launcher, start the workbench, drag in new sprites, see them validated, and export them into the game without touching code. The workbench also connects back into the game's Skin Dock and TERM++ sandbox for runtime observation of the converted result.

In practice, the pipeline is still gated from claiming more than it can prove. The node slot [3] remains reserved until the launcher path, export gates, and visual/runtime proof all agree. The refactor has already added mounted-family template definitions, so `wolfie` and `wolack` are no longer absent because of missing registry entries; the remaining question is how broadly family coverage should extend beyond the currently declared template sets. The spec's position is still clear: do not surface the launcher option as shipped capability until the whole wrapper path is proven.

The asset pipeline wizard (`scripts/pipeline/wizard/`) is a 6-screen questionary-based TUI that walks you through creating or converting a game asset step by step. It opens with an Intent screen — you pick what you're trying to do: create a new character, convert a sprite sheet into XP format, render from a Blender scene, import a 3D mesh, or modify an existing XP. It then walks you through Asset Type → Template → Source → Input Path → Summary, accumulating your answers in a state dict and maintaining a full back-navigation history stack so you can press ← Back at any point. At the Summary screen you confirm, and it fires the actual `AssetPipeline.run()` call.

The wizard is intentionally dual-mode. The `WizardEngine` (`engine.py`) is a pure state machine with no I/O — it takes `submit_answer()` calls and returns the next screen's metadata. The questionary TUI is just one driver; `mcp/wizard_mcp_server.py` is the other: it exposes `wizard_start`, `wizard_submit`, `wizard_get_status`, and `wizard_execute` as MCP tools, so an AI agent can step through the exact same wizard flow programmatically. The wizard also handles a special `ai_batch` source type that routes through `nanobanana_batch.run_batch()` instead of `AssetPipeline`, for bulk AI-generated frames.

The TUI wizard is entirely separate from the launcher's [3] ASSET PIPELINE menu node — it's the underlying interactive interface that node would eventually invoke via Launch Workbench. Currently, because [3] is still deferred (FL-813), the wizard is only accessible by running `python3 scripts/pipeline/wizard/main.py` directly or by invoking the MCP tools. It is not surfaced from the launcher.

Section 2 is not allowed to own the image/session root. It may only:

- help ingest source art
- help map sheet regions into engine families/actions
- validate exported XP against engine expectations
- inject/test authored XP in runtime surfaces

### 2.1 Engine Truth: `skin_family`, Legacy Combo Sheets, Direct Overlays, And AHSW Naming

The main game no longer treats player appearance as a presentation-state-only
lookup. The canonical runtime dispatch is now:

- `skin_family`
- `presentation_state`
- `appearance_bits`

That dispatch now spans two parallel asset owners in `asciicker-Y9-2`:

1. the legacy combo-sheet matrices (`SpriteGrid[2][A][H][S][W]`)
2. the direct presentation-overlay registry added for FL-903

Both are live today. Pipeline-v2 must not describe the engine as if the direct
overlay path replaced the legacy combo-sheet path entirely; the engine still
loads and warms both.

The family axis is wire-visible and compile-time bounded in
`server/network.h`:

- `SKIN_FAMILY::HUMAN = 0`
- `SKIN_FAMILY::GREEN = 1`
- `SKIN_FAMILY::SIZE`

`SIZE` is the only compile-time bound changed when adding a family, and it is
guarded to fit the join packet field. The current join-time family assignment
is server-owned in `server/server_tick.cpp::SvrResolveSkinFamilyAndName()`.
Today:

- `green:` name prefixes map to `SKIN_FAMILY::GREEN`
- `[green]` name prefixes map to `SKIN_FAMILY::GREEN`
- there is no client-side "choose skin family" packet yet

So adding a new family is not a template-only change. It requires server join
resolution, engine family registration, and assets.

The engine carries base-family identity through `SkinFamilyDefinition` entries
in `engine/game.cpp`. Each family entry now owns:

- debug family name
- per-motion filename prefixes
- legacy `SpriteGrid*` pointers for the combo-sheet path
- `fallback_family`

`fallback_family` is now part of the runtime contract. `LookupPresentationSprite()`
walks the family fallback chain when a direct overlay is missing. This is what
makes partial families viable: `green` can inherit missing overlays from
`human` without pretending that every strip/overlay exists independently.

The engine-facing filename convention for animated equipment-bearing strips is
still `{family}-{AHSW}.xp`, where:

- `A` = armor state index
- `H` = helmet state index
- `S` = shield state index
- `W` = weapon state index

Critical clarification from the engine re-audit:

1. The 4-character suffix is an equipment-state index, not animation frames.
2. Directions and animation frames live inside the XP file and its layer-0
   metadata, not in the filename suffix.
3. The canonical preview file for an animated family/prefix remains the
   representative action XP such as `{family}-0001.xp`; the direct overlay
   atlas files (`*-body.xp`, `*-armor-gold.xp`, etc.) do not replace that
   preview-owner contract.

The current base-family mapping in the main game is:

- `human`
  - on-foot idle/walk prefix: `player`
  - on-foot fall/death prefix: `plydie`
  - on-foot attack prefix: `attack`
  - mounted / bee-related prefixes: `wolfie`, `wolack`, `bigbee`
- `green`
  - on-foot idle/walk prefix: `player-green`
  - on-foot fall/death prefix: `plydie-green`
  - on-foot attack prefix: `attack-green`
  - mounted/bee strips are not independently authored yet; missing strips and
    overlays fall back to `human`

Two engine loading paths now matter for every family:

1. **Legacy combo-sheet path** — `LoadSpriteGridFiles()`
   - loads `{prefix}-AHSW.xp` matrices for supported equipment-state
     combinations
2. **Direct overlay path** — `LoadDirectPresentationAssetsForFamily()`
   - loads `*-body.xp`
   - loads slot overlays such as `*-armor-regular.xp`, `*-armor-gold.xp`,
     `*-helmet-dark.xp`, and `*-weapon-sword.xp`
   - registers them in the direct presentation registry

`WarmComposedPresentationCache()` then precomposes
`[kind][family][armor][helmet][shield][weapon]` combinations across the active
family set. Family count therefore scales cache warm time and memory.

Current engine-side evidence:

- `server/network.h`
- `server/server_tick.cpp`
- main-game `engine/game.cpp` family tables, direct-presentation loader,
  fallback lookup, and warm-cache code
- `scripts/pipeline/generate_presentation_overlays.py`

### 2.2 Engine Browser Schema, Wearable Schema, And The Active Workbench Gap

For launcher/browser purposes, sprites now group by engine-derived filename
prefix, not by this repo's old flat template list. The engine/browser-relevant
animated prefix groups are:

| Prefix Group | Base `skin_family` | Runtime role | Canonical preview file | Current pipeline-v2 state |
|-------------|--------------------|--------------|------------------------|---------------------------|
| `player` | `human` | on-foot idle/walk | `player-0001.xp` | partially authorable; backend execution still carries legacy `family` compatibility |
| `attack` | `human` | on-foot attack | `attack-0001.xp` | partially authorable; backend execution still carries legacy `family` compatibility |
| `plydie` | `human` | on-foot fall/death | `plydie-0001.xp` | partially authorable; backend execution still carries legacy `family` compatibility |
| `player-green` | `green` | on-foot idle/walk | `player-green-0001.xp` | runtime/proof-only |
| `attack-green` | `green` | on-foot attack | `attack-green-0001.xp` | runtime/proof-only |
| `plydie-green` | `green` | on-foot fall/death | `plydie-green-0001.xp` | runtime/proof-only |
| `wolfie` | `human` (green falls back here today) | mounted idle/walk | `wolfie-0001.xp` | engine-real; represented in the normalized registry as mounted `specified_not_authorable`; not yet authorable/proven end-to-end |
| `wolack` | `human` (green falls back here today) | mounted attack | `wolack-0001.xp` | engine-real; represented in the normalized registry as mounted `specified_not_authorable`; not yet authorable/proven end-to-end |
| `bigbee` | `human` | bee-mount / NPC path | `bigbee-0001.xp` | runtime-real, not authorable |

`player-nude.xp` remains a special runtime file, but it is not the canonical
animated preview representative for browser grouping.

There is now a second engine-relevant schema layered over those prefixes:

1. **Wearable slot schema**
   - the item wire format encodes wearable slot in the variant nibble
   - current authoritative slots are armor, helmet, and shield
2. **Wearable style schema**
   - the item wire format encodes wearable visual style in the style nibble
   - current authoritative styles are default, gold, and dark
3. **Presentation registry schema**
   - body overlays are looked up by `{family, kind, slot, variant}`
   - world/inventory item art is looked up by `{proto_kind, visual_style}`

Pipeline-v2 therefore has two related but distinct schema obligations:

1. action/prefix authoring contracts for exported character strips
2. slot/style contracts for direct overlays and wearable/item presentation

Current mismatch:

1. The engine/browser canon has both a base `skin_family` axis and a generalized
   wearable overlay schema.
2. The current branch's `config/template_registry.json` is now normalized and
   mounted-aware: it exposes explicit `filename_prefix` / `skin_family` /
   `preview_xp` metadata plus mounted/deferred prefix state.
3. The remaining split is execution, not config shape: runners and the browser
   consume the normalized contract, but backend bundle/runtime/export paths
   still keep the legacy `family` alias and `ENABLED_FAMILIES` gate alive.
4. There is still no wearable/item template surface in pipeline-v2, so the
   current workbench can only author full character strips, not standalone
   wearable or item sprites.
5. Current priority remains base skin authoring. Wearable authoring workflow /
   template design is future work and must not interrupt closure of the current
   on-foot skin-authoring surface plus its canonical from-scratch acceptance
   proof.

Current evidence:

- `config/template_registry.json`
- `src/pipeline_v2/app.py` `GET /api/workbench/templates`
- `src/pipeline_v2/service.py` backend bundle/runtime/export gates
- `web/workbench.js::getEnabledActions()`
- `scripts/xp_fidelity_test/bundle_contract.mjs`
- `web/termpp_skin_lab.js` runtime override path

This remains a wrapper/backend gap. It is not a justification for letting the
wrapper own the editor root.

### 2.3 Wrapper Layers

Section 2 wrapper behavior has four layers:

1. **Source-wrapper layer**
   - upload PNG or load source art
   - mark sprite regions, cuts, and selections
   - optionally populate grid/session state from source
2. **Family/action wrapper layer**
   - map authored XP into action/family wrappers
   - enforce family dimensions, layer counts, and metadata contracts
3. **Runtime injection layer**
   - emit web payloads or native sandbox staging
   - write override filenames
4. **Proof/test layer**
   - Skin Dock / webbuild preview
   - native TERM++ sandbox launch
   - failure-log-aware visual/runtime gates

None of these layers may replace the Section 1 owner graph.

**STEP 5 DESIGN OUTPUT (2026-04-15):** The source-wrapper layer is now defined by the four contracts below. These decisions unblock Step 6 and Step 7, but they do not by themselves implement either step.

#### 2.3.1 Source Sprite Sheet Layout Contract

1. Section 2 accepts exactly two source-layout modes:
   - `uniform_grid`: the only valid naked-PNG mode
   - `explicit_regions`: manifest-required mode for ad hoc or multi-action sheets
2. `uniform_grid` means:
   - one source PNG describes one logical sprite sheet
   - rows top-to-bottom map to angle indices `0..angles-1`
   - columns left-to-right map to frame slots
   - when `source_projs == 2`, columns are grouped as `[all proj0 frames][all proj1 frames]`, matching the current `run_pipeline()` arithmetic and output packing
   - when `source_projs == 1` but target output needs two projections, projection 1 is a derived mirror of projection 0 rather than a second independently-authored source track
3. A naked PNG may use `uniform_grid` only if the declared layout is evenly divisible by the target slot count (`image_w % (frames * source_projs) == 0`, `image_h % angles == 0`) and every required slot is present. If not, the sheet must be represented as `explicit_regions`.
4. `explicit_regions` is the canonical answer for irregular atlases, multi-action sheets, or any source where angle/frame/projection boundaries are not already encoded by a uniform grid. No implicit geometry guess is authoritative in this mode; the manifest must enumerate the regions explicitly.
5. Source pixels do not define engine geometry. Template/action geometry still comes from `template_registry.json` and the active action spec. The source-layout contract only defines how PNG-space maps into those target slots.

#### 2.3.2 Source Manifest Contract

1. The canonical Section 2 authority is a JSON sidecar adjacent to the source PNG: `<source>.asciicker-source.json`.
2. The sidecar is the only manifest authority. Workbench sessions may cache a snapshot of the current manifest for local editing continuity, but that snapshot is a mirror, not the source of truth.
3. The manifest root must contain:
   - `version`
   - `source`: path, sha256, image width, image height
   - `template_set_key`
   - `layout_mode`: `uniform_grid` or `explicit_regions`
   - `layout`: the mode-specific declaration
   - `guides`: optional editorial guides
   - `regions`: canonical target mappings
4. `layout` rules:
   - for `uniform_grid`, it declares `angles`, `frames`, `source_projs`, optional `angle_labels`, and optional `action_key` default
   - for `explicit_regions`, it may declare only shared sheet metadata; export/import behavior must come from `regions`
5. Each `regions[]` entry must contain:
   - stable `id`
   - `source_rect`: `[x, y, w, h]` in PNG pixels
   - `target`: `action_key`, `angle`, `frame`, `projection`
   - optional `notes`, `tags`, and `confidence`
6. `regions[]` are the only manifest entries that may drive conversion/import/export. Editorial helpers are separate:
   - `guides.anchor_rect`
   - `guides.cuts_v`
   - `guides.cuts_h`
   - `guides.detected_boxes`
7. Step 6 must demote live `extractedBoxes`, `sourceCutsV`, and `sourceCutsH` into these `guides` fields or derive them from `regions`; they may no longer be independent session authority once the manifest contract is implemented.

#### 2.3.3 Agent/Human Slicing Workflow Contract

1. Source slicing is a wrapper workflow layered over the Section 1 root editor. It may never export XP directly without first materializing a root-editor document/session snapshot.
2. Human workflow:
   - load PNG and existing sidecar if present
   - choose `uniform_grid` or `explicit_regions`
   - use the source panel as a slicer surface that edits manifest draft state
   - commit confirmed mappings into `regions[]`
   - materialize a target action into the root editor for inspection/editing
3. Agent workflow:
   - read or write the same sidecar manifest through MCP/HTTP tools
   - request manifest validation and action materialization using the same contract the UI uses
   - never rely on hidden session-local source arrays
4. `apply_action_grid()` remains a compatibility wrapper only. Its long-term contract is:
   - if given only `source_path`, it creates an ephemeral `uniform_grid` manifest from the template action geometry and then calls the generic manifest-driven materializer
   - if given a manifest in a later step, the manifest path/doc becomes authoritative and `source_path` is only provenance
5. The slicer produces root-editor documents, not final runtime files. Family/action export still happens only after the root editor snapshot exists and passes the wrapper gates.
6. The manifest contract is explicit even where front-door tooling is still incomplete. Missing slicer/UI/MCP front doors are implementation gaps tracked by `UQ-006` and `UQ-010`, not design gaps.

**RESOLVED (FL-STEP4-03, 2026-04-16):** `/api/workbench/create-blank-session` again accepts the legacy blank-root entry point. Bare `{}` now creates the default generic 126x80 root session, `blank_session` payloads are accepted for explicit geometry, and the template-backed `template_set_key`/`action_key` path still resolves against the mounted-aware registry. This does not claim mounted-family authoring/runtime parity or native-builder support.

#### 2.3.4 Conversion Quality And Agent Vision Substitute Contract

1. Section 2 quality validation must return a machine-readable report with `PASS`, `WARN`, or `FAIL`.
2. `FAIL` means any of the following:
   - a required target slot is unmapped or multiply mapped
   - manifest rectangles fall outside the declared source image
   - `uniform_grid` divisibility/layout requirements are violated
   - any required structural gate fails (`G7` through `G12`, or their direct replacement)
   - conversion falls back to the generic whole-image fit path during agent-autonomous export
3. `WARN` means the conversion is structurally legal but suspicious and needs human review or explicit override. Warning-class signals include:
   - fallback conversion used in a human-guided run
   - duplicate-frame clusters
   - large source-to-XP occupancy deltas
   - low non-empty coverage in otherwise mapped frames
4. `PASS` means:
   - every required `(action, angle, frame, projection)` slot is mapped exactly once
   - the declared layout mode is internally consistent
   - the conversion did not require warning-class fallback
   - the validation report contains no `FAIL` or `WARN` signals
5. The quality report must include enough signal for non-visual agent loops to decide deterministically:
   - required slot count, mapped slot count, unmapped slot count
   - fallback-used boolean
   - per-gate results for `G7`-`G12`
   - per-slot non-empty coverage summary
   - duplicate-frame or near-empty-frame findings
6. `xp_cat.py` or preview PNGs may remain human aids, but they are not the canonical agent proof surface. Agents proceed automatically only on `PASS`; `WARN` requires explicit human acceptance or a higher-level override policy.

**CONTRACT CLARIFICATION (2026-04-16):** `/api/workbench/validate-xp` remains intentionally non-exporting, but it now returns a predicted `xp_path` for compatibility together with `checksum`, `xp_size_bytes`, and `exported=false`. Callers that need an actual filesystem artifact must still use `/api/workbench/export-xp`; callers that need lightweight quality proof may use `/api/workbench/validate-xp` without causing a write. This is now locked by tracked coverage.

#### 2.3.5 Family Expansion Policy

1. Main-game `SkinFamilyDefinition` tables are the engine/runtime authority for
   base `skin_family`, filename-prefix inventory, direct-overlay prefix
   inventory, and fallback behavior. Pipeline-v2 may not invent a new base
   family or prefix group by template-only change.
2. Adding a new family is an engine-wide change, not a template-only change. At
   minimum it touches:
   - `server/network.h` `SKIN_FAMILY`
   - `server/server_tick.cpp::SvrResolveSkinFamilyAndName()`
   - `engine/game.cpp` family globals + `g_skin_family[]`
   - legacy AHSW assets
   - direct overlay generation inputs in
     `scripts/pipeline/generate_presentation_overlays.py`
3. `config/template_registry.json` is the pipeline-v2 authoring-surface
   authority, but it is not the engine authority. The required normalized
   action contract is:
   - `filename_prefix`
   - `skin_family`
   - `xp_dims`
   - `angles`
   - `frames`
   - `source_projs`
   - `projs`
   - `cell_w`
   - `cell_h`
   - `layers`
   - `ahsw_range`
   - `preview_xp`
   - `preview_xp_sha256`
   - `l0_ref`
   - `l0_ref_sha256`
4. The current branch does not yet meet that normalized template contract. The
   backend still keeps the old `family` field and `ENABLED_FAMILIES`
   compatibility path live, so `UQ-004` remains open until backend execution
   and operator-visible registry handling consume only the normalized action
   schema.
5. `preview_xp` is the canonical representative-preview authority. `l0_ref`
   remains the structural metadata authority. G12 or its direct replacement
   must derive expected L0 row-0 metadata from the referenced XP contract, not
   from a second handwritten family table when a reference XP is available.
6. Local sprite inventory is evidence, not authority. Pipeline-v2 may not infer
   family contracts by scanning disk; it must use the declared template/action
   contract plus engine-family truth.
7. Partial-family support is allowed only through explicit engine fallback:
   - pipeline-v2 may export a family/action subset
   - missing direct overlays or strips must be treated as inherited via
     engine-side `fallback_family`, not as silently-authorable coverage
8. Initial mounted-family scope remains explicit and limited once the normalized
   schema lands:
   - `wolfie` idle/walk
   - `wolack` attack
   - `bigbee` deferred
9. Green proof-prefix support exists in engine/runtime, but green remains
   proof-only in pipeline-v2 until checked-in green template/reference assets
   and authoring contracts exist in this repo.
10. `player-nude.xp` remains a special runtime filename derived from the human
    on-foot contract. It is not a separate family-expansion mechanism, and it
    is not the canonical browser preview representative for animated families.
11. UI/MCP/runtime implications:
    - `/api/workbench/templates`, bundle action tabs, blank-session creation,
      bundle export, and validation must derive authorable scope from
      template-set actions only
    - browser/launcher grouping should follow engine-derived filename prefixes,
      not old flat template labels
    - runtime override helpers are downstream name writers only
    - absence from the active template set means "not authorable here", even if
      runtime naming code knows the prefix
    - legacy saved sessions/jobs may still be read through `family` fallback,
      but new outward payloads must use `filename_prefix` / `skin_family`

#### 2.3.6 Wearable Slot/Style Expansion Policy

1. Wearables now use a generalized backend contract in `asciicker-Y9-2`:
   - item archetype/variant/style bits are packed into one 16-bit flags field
   - the variant nibble selects wearable slot
   - the style nibble selects wearable visual style
2. Two parallel engine lookups happen for each wearable:
   - world/inventory sprite lookup through `item_proto[]` rows keyed by
     wearable proto kind plus visual style
   - body overlay lookup through the presentation registry keyed by
     `{family, kind, slot, variant}`
3. Adding a new wearable style requires coordinated changes to:
   - `server/network.h` style constants and
     `PresentationVariantFromWearableStyle()`
   - `engine/game.cpp::NormalizeWearableVisualStyle()`
   - `item_proto[]` style rows
   - overlay-generation color maps and output assets
4. Adding a new wearable slot requires coordinated changes to:
   - the server-side item flag producer
   - `GetAuthoritativeWearableProtoKind()`
   - presentation-slot tokenization / registry keys
   - `item_proto[]`
   - overlay-generation prefix/slot output
   - the wire-packing budget if the current nibble allocation is exhausted
5. Pipeline-v2 currently has no wearable/item template surface. That is now an
   explicit backend/product gap, not an ambiguity about how the engine works.
6. `UQ-004` and the runner work that follows must distinguish:
   - character strip authoring
   - direct presentation-overlay compatibility
   - standalone wearable/item authoring, if and when that surface is added

#### 2.3.7 Required Contract Architecture Split

The normalized family/wearable model is now too broad to leave in one ambiguous
"template registry" blob. The required architecture split is:

1. **Engine schema truth**
   - sourced from Y9-2 family, prefix, fallback, slot, and style behavior
2. **Pipeline authoring registry**
   - the subset that is authorable in this repo now
3. **Runner contract helper**
   - a derived helper consumed by backend tests and fidelity runners so the
     same schema drives proofs instead of each runner re-encoding assumptions

If those three layers drift, the canon must treat that as a backend/schema
regression before it is treated as a UI problem.

#### 2.3.8 Porting Precondition — Semantic Runtime Parity, Not Just Action Tabs

The active Y9-2 runtime contract is no longer narrow "three action tabs"
truth. The current game repo (`/Users/r/Downloads/asciicker-Y9-2` on
`main @ 0ef8d327`, dirty worktree) now consumes generalized bundle identity and
semantic selector state:

1. `server/network.h` appearance V2 carries:
   - `appearance_profile_id`
   - `skin_definition_id`
   - `mount_definition_id`
   - per-entry `slot_kind_id`
   - per-entry `item_definition_id`
   - per-entry `visual_style_id`
2. `STRUCT_SNAPSHOT_ENTITY` carries bundle-era `presentation_kind_id`, and
   snapshot layout version `9` is the bundle-aware layout.
3. `engine/inventory.h` item instances now carry `item_definition_id`,
   `visual_style_id`, and `presentation_kind_id`.
4. `engine/game_app.cpp` reads
   `assets/appearance_bundle/current/compile_report.json` during join and
   requires bundle contract hashes.
5. The compiled appearance bundle in Y9-2 is selector-driven with semantic
   tables such as:
   - `on_foot_idle`
   - `on_foot_move`
   - `melee_attack`
   - `fall_dead`
   - `world_item`
   - `inventory_grid`
   and those selectors are keyed by semantic state inputs like
   `combat_states`, `life_states`, `locomotion_states`, `mount_states`, and
   `presentation_kinds`.

Therefore the porting/testing precondition is strict:

1. Current workbench authoring/runtime proof in this repo remains necessary.
2. It is **not sufficient** for generalized-bundle porting by itself.
3. Before claiming ported parity with the Y9-2 bundle system, this repo must
   add a verifier/contract layer that can prove the **same semantic
   action/state rows** the game repo uses, rather than only the current
   `idle` / `attack` / `death` authoring tabs.
4. Do not collapse this into "replace the editor tests." The correct split is:
   - keep editor/workbench authoring proof
   - add semantic runtime/bundle parity proof
   - only then claim generalized bundle-port readiness
5. Y9-2 canon law also requires the same reachable action surface for real
   players, manual runs, scripted runs, and proof artifacts, with recipes
   remaining input-only and analyzer gates owning proof. Any future porting
   verifier here must follow that same boundary.
6. Boundary correction: it is not accurate to say "Section 1 stayed unchanged
   and only Section 2 changed." Current code shows material Section 1 root
   editor changes (whole-sheet primary-surface ownership, Session Ops blank-root
   flow, whole-sheet browse/zoom/clipboard/mode behavior). The correct claim is:
   Section 1 changed materially, while the specific missing generalized-bundle
   parity layer lives in Section 2 semantic-runtime coverage.

#### 2.3.9 Semantic Runtime Parity Contract And Current Coverage

The repo now has an explicit contract-model layer for the Y9-2 semantic runtime
rows it must eventually prove.

Current contract surfaces:

1. `scripts/xp_fidelity_test/bundle_contract.mjs`
   - `getSemanticRuntimeParityContract()`
2. `scripts/xp_fidelity_test/run_semantic_runtime_contract_test.mjs`
   - contract-audit verifier lane
3. `tests/xp_fidelity_test/semantic_runtime_contract.test.mjs`
   - row/blocker assertions

Minimum semantic-runtime parity row set now modeled:

1. `actor.on_foot_idle`
2. `actor.on_foot_move`
3. `actor.melee_attack`
4. `actor.fall_dead.fall`
5. `actor.fall_dead.dead`
6. `item.world_item`
7. `item.inventory_grid`

Full generalized-bundle readiness remains broader than that minimum row set.
The next blocking extension rows are:

1. `actor.mounted_idle_walk`
2. `actor.mounted_attack`

Current modeled coverage state in this repo:

1. Mapped to the current authoring surface:
   - `actor.on_foot_idle` -> `player_native_full / idle / player`
   - `actor.on_foot_move` -> `player_native_full / idle / player`
   - `actor.melee_attack` -> `player_native_full / attack / attack`
   - `actor.fall_dead.fall` -> `player_native_full / death / plydie`
   - `actor.fall_dead.dead` -> `player_native_full / death / plydie`
2. Explicit current gaps:
   - `item.world_item`
   - `item.inventory_grid`
3. Explicit broader-readiness blockers:
   - mounted rows are specified but not authorable in the current registry
   - headed semantic gameplay proof is still missing

What this contract slice means:

1. The repo is no longer allowed to over-claim "generalized bundle parity"
   while silently remaining action-tab only.
2. The contract layer is necessary, but it is not the same thing as runtime
   proof.
3. `generalized_bundle_port_ready` remains `false` until:
   - the 7-row minimum is proven in runtime-facing lanes, not just modeled
   - item/world/inventory rows are implemented and verified
   - mounted extension rows are no longer blocked
   - headed semantic gameplay proof exists for the same action surface Y9-2
     canon requires

### 2.4 Structural Gate, Export, And Injection Contract

Current wrapper-side structural gates are:

- G10 dimension match
- G11 layer count match
- G12 L0 row-0 metadata glyphs

Current gate/export code path:

1. `workbench_export_bundle()` exports each ready action XP
2. `_run_structural_gates()` checks dims, layers, and L0 metadata
3. failing actions hard-stop bundle export or payload generation

Current evidence:

- `src/pipeline_v2/service.py:2829-2864`
- `src/pipeline_v2/service.py:2867-2918`
- `src/pipeline_v2/service.py:2921-2934`

These gates are wrapper safeguards. They do not define the editor root contract.

**AUDITOR FOUND (2026-04-15):** Three issues with the current gate and registry implementation:

1. **G7/G8/G9 still do not guard bundle export.** G7 (geometry cell count), G8 (non-empty content ≥5%), and G9 (handoff population) run during `run_pipeline()`, but they are NOT called from `workbench_export_bundle()`. Only G10/G11/G12 are active at bundle export time. These gates are the only programmatic substitute for visual quality inspection, so their absence from the export gate is especially significant for agent-driven workflows.

2. **The quality contract now exists in Section 2.3.4, but it is not yet enforced at the export boundary.** `POST /api/workbench/validate-xp` now exists for single-XP agent loops, but `workbench_export_bundle()` and `workbench_web_skin_bundle_payload()` still do not evaluate the full Step 5 quality report.

3. **Registry roles are fixed in design, but the current branch still leaks legacy authority in backend execution.** `config/template_registry.json` is still the intended authoring authority and the harness action registry seed is still fidelity test instrumentation only. The browser no longer uses `enabled_families`, but backend bundle/runtime/export code still reads the compat `family` alias and static `ENABLED_FAMILIES` set, so the implementation side of that authority cleanup remains open in `UQ-004`.

4. **FL-STEP4-04 resolved on `2026-04-16`: dead `force_fallback` and `crop_box` removed from `RunConfig`.** The live `/api/run` and `/pipeline/run` contracts no longer advertise fields the handlers ignore; legacy callers now get an explicit `unsupported_run_fields` error if they still send those keys.

### 2.5 Current Section-2 Misalignment Ledger

The live wrapper architecture is still misaligned in these exact ways after the
`2026-04-16` removal of the Step 4 mirror-sync owner:

| Finding | Current evidence | Why this is misaligned |
|---------|------------------|------------------------|
| Canonical manifest authoring now exists, but it is still JSON-first | `web/workbench.html:133-145`, `web/workbench.js:2196-2377`, `web/workbench.js:3278-3367`, `src/pipeline_v2/app.py:496-525`, `src/pipeline_v2/service.py:3831-3887`, `scripts/workbench_mcp_server.py` | Source guides/regions are now edited through the canonical sidecar and rendered on the source canvas without reviving session-local box/cut ownership, MCP exposes manifest read/write/region-marking tools against the same sidecar contract, and the source panel can now seed a canonical `uniform_grid` draft from the active run/template geometry for the common naked-PNG case. The remaining gap is interactive slicer tooling and richer manifest editing ergonomics. |
| Source panel now reloads canonical PNG/manifest without grid geometry | `web/workbench.js:2242-2305`, `web/workbench.js:3278-3367`, `web/workbench.js:4310-4332`, `src/pipeline_v2/app.py:496-525` | The source projection can now stand alone from `source_path` / `source_manifest`; it no longer requires pre-populated root grid geometry. RESOLVED. |
| Template registry is normalized and mounted-aware in data, but backend runtime/export paths still carry legacy authority | `config/template_registry.json`, `src/pipeline_v2/service.py:977-1097`, `src/pipeline_v2/service.py:1292-1317`, `src/pipeline_v2/service.py:2798-2890`, `src/pipeline_v2/service.py:3565-3675`, `scripts/xp_fidelity_test/bundle_contract.mjs` | The registry now has explicit `filename_prefix` / `skin_family` / `preview_xp` / `runtime_role` keys and explicit mounted prefixes (`wolfie`, `wolack`, deferred `bigbee`). But bundle creation, blank-session creation, bundle run, export, and web-skin payload generation still read the legacy `family` alias and static `ENABLED_FAMILIES={"player","attack","plydie"}` gate. Schema normalization therefore exists in config, but it is not yet the sole live backend authority. |
| MCP override-name validation now accepts engine-valid hyphenated prefixes | `scripts/workbench_mcp_server.py` | `_AHSW_RE` now accepts `player-green-0001.xp`-style names. RESOLVED. |
| Mounted-family contract now exists, but mounted-family authoring/runtime parity is still absent | `config/template_registry.json`, `src/pipeline_v2/service.py:1793-1812`, `scripts/xp_fidelity_test/bundle_contract.mjs`, `tests/xp_fidelity_test/semantic_runtime_contract.test.mjs`, `asciicker-Y9-2/engine/game.cpp` | `wolfie` and `wolack` are now represented explicitly in `prefix_catalog` with `runtime_role`, `mounted=true`, and blocker metadata. The remaining gap is execution: there are still no mounted template actions, no native builder for those families, and no runtime-facing proof lane that closes the mounted semantic rows. |
| Green proof coverage now exists, but green authoring remains deliberately proof-only until green reference assets exist | `src/pipeline_v2/service.py`, `config/template_registry.json`, `scripts/workbench_png_to_skin_test_playwright.mjs`, `web/workbench.js` | Runtime/proof helpers now preserve and inject `player-green` / `attack-green` / `plydie-green`, but the template authoring surface stays human-only by explicit boundary. This is a product-scope limitation, not a missing proof-path owner. |
| Skin Dock proof is now explicit, but it is still wrapper proof rather than editor proof | `src/pipeline_v2/service.py:2898-2921`, `web/workbench.js:1453-1558`, `web/workbench.html:320-404` | Single-session runtime scope and structural-vs-runtime verification are now explicit, but runtime proof still does not establish Section 1 editor correctness. |
| Wrapper run paths now materialize and consume canonical manifests end-to-end | `src/pipeline_v2/app.py:438-446`, `src/pipeline_v2/app.py:599-621`, `src/pipeline_v2/service.py:1437-1660`, `src/pipeline_v2/service.py:2558-2710`, `tests/test_workbench_validation.py` | Step 5 is now manifest-backed all the way through conversion: `/api/run`, `/pipeline/run`, and bundle action-apply persist canonical manifests before conversion, and `run_pipeline()` now dispatches to explicit `uniform_grid` / `explicit_regions` builders that reject invalid geometry instead of silently resizing. RESOLVED. |
| G7/G8/G9 are still not enforced at the bundle export / web-skin payload boundary | `src/pipeline_v2/service.py:3527-3562`, `src/pipeline_v2/service.py:3565-3675` | `workbench_export_bundle()` and `workbench_web_skin_bundle_payload()` still call `_run_structural_gates()`, which only runs G10/G11/G12. The quality-contract lane exists separately, but export/web-skin payload generation still lacks the full G7-G12 enforcement the canon requires for non-visual bundle safety. |
| Agent quality contract implemented as `/api/workbench/validate-xp` | `src/pipeline_v2/app.py`, `src/pipeline_v2/service.py` | `POST /api/workbench/validate-xp` returns a PASS/WARN/FAIL report with per-slot coverage and gate results. The endpoint remains non-exporting, but now returns a predicted `xp_path`, `checksum`, `xp_size_bytes`, and `exported=false` for compatibility; callers that need a real file on disk must still use `/api/workbench/export-xp`. |
| Agent session inspection is MCP-reachable | `scripts/workbench_mcp_server.py` | MCP now exposes `get_cell(session_id, x, y, layer=2)` for cell-level verification and `validate_session(session_id)` as a session-centric alias to `validate_xp(session_id)`. |
| Classic conversion no longer reintroduces geometry-first wrapper ownership | `web/workbench.html`, `web/workbench.js`, `src/pipeline_v2/app.py`, `src/pipeline_v2/service.py`, `tests/test_workbench_flow.py` | The upload panel remains source-only, while classic root geometry now enters through `Session Ops` / `New XP` and the active session. `Use Auto-Plan` is advisory only. `wbRun()` now requires an active session and posts explicit target geometry (`target_cols` / `target_rows`) into `/api/run`, and the backend honors that exact non-native target grid. RESOLVED for the browser-owned geometry path; richer frame-nav row/cell editing is still a separate product gap. |
| Browser bundle scope now derives from normalized template actions, but backend authority cleanup is still incomplete | `src/pipeline_v2/app.py:386-388`, `web/workbench.js:6995-7008`, `tests/test_template_registry_schema.py`, `tests/web/workbench-template-gating.test.js`, `tests/test_contracts.py` | The browser no longer reads `enabled_families`, `/api/workbench/templates` no longer emits it, and direct JS/tests now cover `isTemplateActionAuthorable()` plus `proof_only` exclusion. But the backend still keeps the legacy `family` alias and `ENABLED_FAMILIES` gate alive in bundle/runtime code, so `UQ-004` remains open as a backend authority cleanup, not as a browser fail-close bug. |
| `UQ-004` registry stabilization backlog is still open in backend code, load-path hardening, and operator visibility | `web/workbench.js:6979-6987`, `src/pipeline_v2/app.py:386-388`, `src/pipeline_v2/service.py:977-1097`, `src/pipeline_v2/service.py:1292-1317`, `src/pipeline_v2/service.py:2798-2890`, `src/pipeline_v2/service.py:3565-3675`, `tests/web/workbench-template-gating.test.js`, `tests/test_template_registry_schema.py` | Frontend action-authorability tests now exist and the browser consumes the normalized contract, but the backend still gates live behavior through `family`/`ENABLED_FAMILIES`, malformed-registry guard coverage is still partial, `load_template_registry()` still caches the empty-registry fallback when the config file is missing, fatal parse failures still lack an in-process sentinel/error mode, `preview_xp` still silently falls back to `l0_ref`, and template-registry fetch failure still degrades to silent empty client state instead of surfacing an operator-visible error. |
| Y9-2 HTTP API contract now exists | `src/pipeline_v2/app.py:317-325`, `src/pipeline_v2/app.py:562-587`, `src/pipeline_v2/service.py:3913-4027` | The server now exposes `GET /health`, `GET /pipeline/templates`, `POST /pipeline/run`, and `POST /pipeline/validate_xp`. The remaining Y9-2 gap is launcher/wizard wiring, not missing backend endpoints. |
| Y9-2 wizard not wired as launcher sub-action | `Y9-2 scripts/launcher.py`, `Y9-2 scripts/pipeline/wizard/engine.py` | `WizardEngine` exists but has no `_execute_action` branch in `launcher.py`; `[3] ASSET PIPELINE` node is fully absent rather than showing as `[DEFERRED]`. Tracked as Y9-2 DESIGN OPEN B-13. |
| **GAP: No wearable or item templates, and no backend parity runner for wearable slot/style contracts** | `config/template_registry.json`, `scripts/xp_fidelity_test/`, `tests/` | Pipeline-v2 has no wearable/item authoring surface, and there is no structural-contract runner that proves the local schema matches Y9-2 slot/style truth. That means gold/dark/default wearable semantics are still only partially covered by ad hoc runtime or engine-side knowledge. Tracked as S2-FAM-04. |
| **GAP: Semantic runtime contract is now modeled, but runtime selector proof is still missing** | `scripts/xp_fidelity_test/bundle_contract.mjs`, `scripts/xp_fidelity_test/run_semantic_runtime_contract_test.mjs`, `tests/xp_fidelity_test/semantic_runtime_contract.test.mjs`, `scripts/xp_fidelity_test/run_bundle_fidelity_test.mjs`, `scripts/xp_fidelity_test/run_manual_assembly_e2e_test.mjs`, `config/template_registry.json`, `Y9-2 server/network.h`, `Y9-2 engine/inventory.h`, `Y9-2 scripts/pipeline/staging/appearance_bundle/phase2-positive/appearance_bundle.json` | This repo now explicitly models the minimum 7 semantic runtime rows plus mounted blockers, so the contract gap is no longer silent. But the only headed/browser/runtime proof lanes still center on authoring actions such as `idle`, `attack`, and `death`, and item/world/inventory semantic rows still have no runtime-facing verifier lane. Generalized bundle-port readiness therefore remains blocked on actual semantic selector proof, not just contract modeling. |

### 2.6 Section-2 Scope Boundary

Section 2 must respect the following boundary:

1. The game engine selects sprites by filename and family/state rules.
2. The workbench wrapper may help author and inject those files.
3. The wrapper must not pretend its template model is the engine truth.
4. The wrapper must not pretend its action/bundle flow is the editor truth.
5. Family expansion and runtime parity are wrapper responsibilities only after Section 1 ownership is correct.

This means:

- templates are workbench constraints, not engine law
- bundle/session/action state is workbench state management, not runtime truth
- runtime proof is wrapper proof, not proof that the root editor architecture is correct

### 2.7 Section-2 Behavior Tree

The canonical Section 2 wrapper behavior tree is:

1. author or load an XP image through Section 1
2. optionally use source-wrapper tools to mark/import sheet content
3. map authored XP into family/action wrappers
4. run structural gates for engine-safe export
5. export single XP or bundle payload
6. inject/test via:
   - web Skin Dock/runtime iframe
   - native TERM++ sandbox launcher
7. observe runtime/failure results
8. return to Section 1 editor ownership for correction

**AUDITOR FOUND (2026-04-15, updated 2026-04-15):** Step 2 of the behavior tree is now designed but not implemented for agents. The authoritative future path is manifest-driven: UI slicer edits and MCP/HTTP edits must both write the same sidecar manifest and then materialize the result into the root editor. Until `UQ-006` lands and the remaining `UQ-010` front doors are wired, agent automation is still operationally blocked on missing tools, but the blocking issue is now implementation, not undefined design.

**Y9-2 dual-path note:** With the Section 2.10 HTTP backend contract now present, this behavior tree has two intended client paths that will share steps 3–8 once `UQ-010` is wired:
- **Human TUI path:** Y9-2 launcher `[3] Create / Convert Asset` → `WizardEngine` questionary screens → `POST /pipeline/run` → result shown in terminal.
- **Agent MCP path:** AI agent → `mcp/wizard_mcp_server.py` (`wizard_start` / `wizard_submit` / `wizard_execute` / `wizard_validate_xp`) → same `WizardEngine` state machine → same `POST /pipeline/run` endpoint.
Step 2 (source region marking) remains the human-only bottleneck until the Step 5 design contract in Section 2.3.1-2.3.4 is implemented and a `POST /pipeline/mark_regions` or equivalent MCP tool is added under `UQ-006` / `UQ-010`.

### 2.8 Section-2 Rebuild Update (2026-04-15)

The current Section 2 rebuild on top of the root-editor owner graph now has
these explicit contracts:

1. **Root-session save contract**
   - the whole-sheet/root-editor save path must persist `grid_cols`,
     `grid_rows`, `cell_w`, `cell_h`, full layers/cells, and canonical source
     manifest authority (`source_manifest_path`, `source_manifest`)
   - Section 2 wrapper state must not keep a stale geometry owner or any legacy
     source-overlay owner after the root editor changes the document
2. **Single-session runtime proof scope**
   - Skin Dock/web runtime proof must declare one explicit `runtime_scope`
   - `player_only` = safest single-session smoke for player filenames only
   - `mounted_default` = mounted-family proof (`player`, `wolfie`, `wolack`)
   - `full_parity` = debug-only five-family override scope
3. **Bundle/runtime flow**
   - bundle payloads do not use the single-session scope selector
   - bundle payload generation remains per-action/per-family
   - G10-G12 structural gates must pass before bundle runtime injection
4. **Proof separation**
   - built-in local XP sanity is structural proof only
   - Skin Dock and TERM++ command/native launch are runtime proof paths
   - neither structural proof nor runtime proof establishes Section 1
     ownership

### 2.9 Research Requirements And Decisions

This subsection folds the Section 2 research requirement into the wrapper spec.
The relevant research area is local Asciicker engine truth:

1. mounted family authoring requirements
2. runtime filename coverage vs active workbench family coverage
3. proof harness requirements for unambiguous skin application

#### 2.9.1 Mounted-Family / Runtime Scope Decision

Evidence:

- Runtime naming and override logic already cover `player`, `attack`,
  `plydie`, `wolfie`, and `wolack`:
  `src/pipeline_v2/service.py`, `runtime/termpp-skin-lab-static/termpp_skin_lab.js`,
  and `web/workbench.js`.
- Active workbench phase gating still only enables `player`, `attack`, and
  `plydie` via `src/pipeline_v2/config.py`.
- `web/workbench.js` documents that mounted default preview uses
  `player + wolfie + wolack`, while `full_parity` is debug-only because the
  override path is FS-global and can bleed into NPCs.
- Current verification profiles still separate local structural sanity from
  runtime proof in `src/pipeline_v2/service.py`.

Decision (inference from sources):

1. Do not treat mounted-family runtime coverage and workbench authoring coverage
   as already aligned. They are not.
2. Shipping authoring scope stays narrower than raw runtime filename truth until
   create/export/apply/verify all cover the same family set.
3. Runtime proof must be two-stage:
   - stage 1: structural XP sanity/export checks
   - stage 2: explicit runtime application proof with isolated override names
4. `full_parity` remains debug-only until the NPC/shared-filename contamination
   risk is removed. It is not valid as the default acceptance path.
5. The default proof path for user-facing work should prefer the smallest
   unambiguous override set possible, then expand only when mounted-family
   authoring and verification are reconciled.
6. The next reconciliation work is backend-first:
   - normalize the template/action schema
   - add mounted-family scope there
   - add structural-contract runners for family/prefix/fallback/wearable parity
   - only then expand broader UI/runtime acceptance claims

Sources:

- `src/pipeline_v2/config.py`
- `src/pipeline_v2/service.py`
- `runtime/termpp-skin-lab-static/termpp_skin_lab.js`
- `web/workbench.js`

### 2.10 Y9-2 Launcher Integration Contract

The Y9-2 repo (`asciicker-Y9-2`) contains a terminal wizard (`scripts/pipeline/wizard/engine.py`) and an MCP server (`mcp/wizard_mcp_server.py`) that are intended to be thin HTTP clients over this server. This subsection defines what pipeline-v2 must expose for that integration to work. The backend HTTP contract now exists in this repo. The remaining work is `UQ-010`: wiring the launcher, wizard lifecycle, and MCP front doors to that stable backend contract without creating a second pipeline owner.

**Integration model:** The Y9-2 `WizardEngine` drives the same questionary TUI state machine whether invoked from the launcher (`[3] Create / Convert Asset`) or via MCP tool calls from an AI agent (`mcp/wizard_mcp_server.py`). Both paths call this server at a configured `PIPELINE_SERVER_URL`. This server is the execution backend; the Y9-2 wizard is the front-end orchestrator. This does not give Y9-2 any ownership over the XP editor root (Section 1) or the wrapper architecture (Section 2) — those boundaries are unchanged. The HTTP API contract is the versioning surface between the two repos; pipeline-v2 internals can change without requiring Y9-2 wizard changes, as long as the API contract holds.

**Required HTTP endpoints (stable backend contract consumed by `UQ-010`):**

| Endpoint | Method | Purpose |
|----------|--------|---------|
| `/health` | GET | Server liveness; used by Y9-2 launcher status bar and `[3] Pipeline Status` sub-action |
| `/pipeline/templates` | GET | List available templates; accepts `?type=character\|item\|ui\|custom`; replaces local `WizardEngine._get_templates_by_type()` |
| `/pipeline/run` | POST | Execute pipeline with wizard nav state JSON; replaces local `AssetPipeline.run()` / `run_batch()`; returns output path on success |
| `/pipeline/validate_xp` | POST | Lightweight single-XP gate check (G7–G12); returns gate results, quality score, and PASS/FAIL verdict; used by Y9-2 `wizard_validate_xp` MCP tool for agent quality loops |

**Design decisions required before `UQ-010` follow-through:**
- Auth model: localhost-only assumed initially vs bearer token (cross-tracked as Y9-2 DESIGN OPEN B-12)
- Error shape: structured JSON for all responses so agents can parse failures deterministically; bare HTTP status codes are not sufficient
- Execution model: whether `POST /pipeline/run` is synchronous (returns output path on completion) or async (returns job ID + polling endpoint); async is safer for long conversions but increases Y9-2 wizard complexity
- Config key placement: `PIPELINE_SERVER_URL` in Y9-2 `server.env` (extension) vs dedicated `pipeline.env`

**Agent-interactability requirement:** All four endpoints must be usable by AI agents without human input. `POST /pipeline/validate_xp` must return a machine-readable quality score that an agent can evaluate programmatically — this directly resolves the agent vision gap from Section 2.5 for the single-XP validation case.

**Current state:** Backend endpoints exist in this repo; the open work is launcher/wizard/MCP follow-through and honest status surfacing. Cross-tracked in Y9-2 canon spec Section 2 [5] as DESIGN OPEN B-12 (API contract hardening), B-13 (wizard launcher wiring), B-14 (agent gateway scope). Do not treat Section 2.10 as a missing-backend-API task.

---

## Section 3 — User-Reachable Action Harness Spec

This section defines the acceptance harness for the shipped workbench UI. It
exists because the product surface is a many-action editor and UI regressions
are easy to hide behind narrow scripted demos. The harness must prove that
real user-reachable actions can drive the editor from valid starting states to
valid goal artifacts. It is not an XP repaint oracle, not an inspector
replayer, and not a license to mutate browser state through hidden debug hooks
and call that acceptance.

Section 3 also defines the required relationship between acceptance runners and
backend structural-contract runners. Acceptance remains UI-only. Structural
contract runners are required for family/wearable schema parity, but they do
not count as acceptance.

### 3.1 Purpose And Terminology

The correct model is:

1. **User-Reachable Action Graph**
   - the complete action surface a real user can reach in the shipped UI,
     including controls that only appear after prior actions such as tabs,
     context menus, tool modes, drawers, modal buttons, and submenu items
2. **Goal Artifact Contract**
   - the golden artifact set that defines success for a workflow, such as an
     exact XP sheet, a bundle payload, or a mounted runtime result derived from
     a representative input set
3. **Recipe Synthesizer**
   - the planner that chooses valid action sequences from the action graph
     toward the goal artifact contract
4. **Runner**
   - the executor that performs those actions through real browser gestures and
     records checkpoints, artifacts, and failure evidence

This replaces the older “truth table -> repaint recipe” framing. The old
truth-table lane described XP cells directly and then generated layer-2-centric
repaint steps. That model is not authoritative for a modern whole-sheet-root
editor because the acceptance problem is not “can we repaint these cells?” The
acceptance problem is “can a real user, through the shipped UI, reach the
required artifact state without cheating?”

### 3.2 Authoritative Inputs

The harness has two acceptance inputs and one required supporting structural
contract input.

1. **Input A: User-Reachable Action Graph**
   - authoritative inventory of every user-reachable action
   - each action entry must declare:
     - stable `action_id`
     - user-facing label or semantic purpose
     - gesture type (`click`, `fill`, `check`, `keypress`, `canvasClick`,
       `canvasDrag`, `contextMenu`, or equivalent future additions)
     - target selector or gesture target
     - preconditions
     - postconditions / expected state deltas
     - whether the action is acceptance-eligible
     - whether the action is eligible for bounded random exploration
     - whether the action is blocked by missing design or missing runner
       support
   - actions revealed only after prior actions are still first-class members of
     the graph; they are not optional edge cases

2. **Input B: Goal Artifact Contract**
   - authoritative definition of the finished target
   - each goal case must declare:
     - starting state contract
     - required checkpoints
     - final artifact comparator
     - allowed tolerances, if any
     - required export/runtime proof stage, if any
   - for this product, goal cases must include both:
     - recreation of a known-good XP sheet from a blank XP/root session path
     - recreation of a known-good XP sheet or bundle from representative PNG
       source sheets through the Section 2 wrapper path
   - the input list must be extensible. Refactors or new template sets must be
     able to add new goal cases without rewriting the harness model.

3. **Input C: Engine/Backend Structural Contract**
   - authoritative machine-readable contract for the non-UI proof surface
   - must cover at minimum:
     - `skin_family`
     - `filename_prefix`
     - `fallback_family`
     - mounted-family inclusion/exclusion
     - wearable slot ids
     - wearable style ids
     - expected template/action metadata for every authorable prefix
   - this input may be derived from the normalized template registry plus a
     checked contract helper, but it must not be re-handwritten separately in
     each runner
   - this input is required for backend parity runners and for recipe/goal
     synthesis, but it does not by itself constitute acceptance proof

### 3.3 Recipe Synthesizer Contract

The recipe synthesizer is a state-transition planner, not a brute-force
Cartesian enumerator and not a machine-learning authority.

1. It consumes:
   - the current editor/workflow state
   - the User-Reachable Action Graph
   - one Goal Artifact Contract
   - an optional seed and search budget
2. It emits:
   - a valid user-reachable recipe
   - deterministic checkpoint boundaries
   - any bounded random-exploration windows inserted between checkpoints
3. It chooses actions by planning over state transitions:
   - actions map to reachable state deltas and prerequisite satisfaction, not
     directly to target pixels
   - a good next action is one that satisfies a missing prerequisite, advances
     to the next checkpoint, or measurably reduces distance to the goal
4. Bounded random exploration is mandatory as a first-class mode:
   - the synthesizer may inject short seeded random segments between scripted
     checkpoints
   - random segments may only choose actions whose preconditions currently hold
   - random segments must have explicit length and seed recorded in the report
   - random exploration is for reachable-surface coverage, not for replacing
     the deterministic checkpoint contract
5. Acceptable planning implementations include beam search, A*, bounded DFS,
   Monte Carlo tree search, or other explicit search/planning methods. If a
   learned ranker is ever added, it may prioritize candidates but may not
   replace the explicit action graph, checkpoint contracts, or final artifact
   comparator.

### 3.4 Runner And Acceptance Contract

1. Acceptance execution must use real browser interactions:
   - DOM clicks
   - form input
   - keyboard input
   - canvas pointer gestures
   - context-menu flows
   - drag/selection gestures
2. Direct `window.__wb_debug` calls, direct API mutation, and `page.evaluate`
   state edits are diagnostic-only. They may help develop the harness or gather
   evidence, but they are not acceptance actions.
3. JS REPL is allowed as the interactive exploration engine for harness
   development because it can keep a persistent Playwright/browser session
   alive, execute seeded search loops, and shrink failures. Acceptance proof
   still requires committed runner scripts that can replay the same recipe and
   seed outside the REPL.
4. The runner must support the full action-graph gesture surface. `click` and
   `fill` alone are insufficient. The committed support target includes at
   minimum:
   - `click`
   - `fill`
   - `check`
   - `keypress`
   - `canvasClick`
   - `canvasDrag`
   - `contextMenu`
5. Every acceptance run must emit:
   - the selected goal case
   - the recipe / action trace
   - checkpoint outcomes
   - final artifact compare result
   - screenshots or other failure artifacts when a checkpoint or final compare
     fails
   - workflow-specific action artifacts whenever the workflow depends on
     geometry-sensitive drag/drop or slot-deletion behavior
     - source-to-grid drag artifacts must include selected source IDs,
       grouping shape, target row/col, expected changed rows/cols,
       frame-signature deltas, and visible status text
     - semantic slot deletion artifacts must include selected semantic frame
       IDs, before/after geometry, left-shift signature checks, repaired
       selection state, and visible status text
6. The overall verifier program now has two runner classes:
   - **Acceptance runners**
     - real browser interactions only
     - prove user-reachable UI workflows
   - **Structural-contract runners**
     - may use backend/API/file/fixture inspection
     - prove family schema, template schema, overlay-asset coverage,
       wearable slot/style parity, and export metadata invariants
     - never labeled acceptance or PASS for UI workflow proof
7. Mounted-family and wearable coverage require both runner classes:
   - acceptance runners for any shipped UI workflow that authors/applies those
     assets
   - structural-contract runners for backend schema parity, fallback behavior,
     and overlay/item coverage that the UI alone cannot prove today

### 3.5 State Capture And Artifact Oracles

1. Intermediate checkpoints are required. Final artifact equality alone is not
   enough because many editor regressions appear before export.
2. Checkpoints may assert:
   - action enablement / visibility
   - document geometry
   - layer, tool, and selection state
   - manifest/session state
   - undo/redo availability
   - bundle/runtime gating state
   - workflow-family invariants such as grouped drag span, target origin, or
     semantic-slot repack behavior
3. Final artifact comparators must be explicit and deterministic:
   - XP compare: geometry, layers, cell content, colors, metadata rows, and any
     other declared contract fields
   - bundle compare: expected ready/error states plus exported XP contract per
     action
   - runtime compare: only when the goal case explicitly includes runtime proof
4. The authoritative agent-readable proof surface is the structured report plus
   artifact comparator output. Screenshots aid humans but are not the sole
   oracle.

### 3.6 Current File Ownership Mapping

The current repo maps onto this harness model as follows:

1. The harness action registry seed and `action_registry_schema.json`
   - keep
   - this is the current seed of the User-Reachable Action Graph; this checkout no longer tracks a literal `action_registry.json` file
   - adapt by expanding conditional reachability, gesture coverage, checkpoint
     tags, and random-exploration eligibility
2. `scripts/xp_fidelity_test/run_source_to_grid_workflow_test.mjs`
   - keep
   - this is the current contract-driven source-to-grid workflow runner
   - grouped row-select and grouped column-select lanes are now first-class and
     headed-proven through shipped UI drag paths
3. `scripts/xp_fidelity_test/run_m2d_action_proof_test.mjs`
   - keep
   - this is the current grid/action proof runner
   - it must continue to prove `clear_selected_contents` and
     `delete_frame_slot` as distinct actions
4. `scripts/xp_fidelity_test/recipe_generator.mjs`
   - keep
   - this is temporary synthesizer scaffolding
   - adapt by replacing fixed recipes with goal-directed stateful synthesis
5. `scripts/xp_fidelity_test/dom_runner.mjs`
   - keep
   - this is temporary runner scaffolding
   - adapt by adding real keyboard/canvas/context-menu gesture support and
     deterministic checkpoint execution
6. `scripts/xp_fidelity_test/verifier_lib.mjs`
   - keep
   - this is shared harness infrastructure
   - it now owns headed cross-panel drag preparation, frame-signature capture,
     and visible status capture for official source/grid proofs
   - continue tightening readiness waits and reducing `_state()` dependence in
     acceptance-facing state capture
7. `scripts/workbench_bundle_manual_watchdog.mjs`
   - keep as downstream runtime smoke only
   - it is not the Section 3 acceptance oracle
8. `scripts/xp_fidelity_test/recipe_generator.py`,
   `truth_table.py`, `run.sh`, `run_fidelity_test.mjs`,
   `run_bundle.sh`, `run_bundle_split.sh`, and
   `run_bundle_fidelity_test.mjs`
   - legacy truth-table lane
   - these may remain available only for historical reproduction or diagnostic
     comparison
   - they are not the future acceptance architecture and must be marked as
     legacy wherever they remain in-tree
9. `scripts/xp_fidelity_test/bundle_contract.mjs`
   - keep, but promote into the shared contract-helper direction from
     Section 2.3.7
   - it must stop reading fields that do not exist in the live registry, or the
     registry must be normalized so this helper becomes truthful
10. New backend contract tests/runner helpers are required:
   - template registry vs engine-family parity
   - mounted-family scope parity
   - wearable slot/style parity
   - overlay asset presence/fallback expectations
   These are missing today and are now part of the Section 3 gap, not optional
   follow-up.

### 3.7 Consequence For The Task Sequence

1. The Section 3 harness contract is a required design artifact before further
   verifier/watchdog expansion.
2. Legacy truth-table entrypoints must be demoted out of the primary acceptance
   path before new coverage claims are made.
3. Future verifier work must be described in the Unified Sequence Of Actions as Section 3 harness
   implementation, not as a continuation of the old repaint-fidelity lane.
4. Family/wearable parity work must land backend/schema runners before broad UI
   acceptance claims. Do not use bundle/player-only acceptance lanes to imply
   mounted-family or wearable-schema closure.
5. The `2026-04-14` through `2026-04-17` failure timeline is part of the task
   sequence contract now:
   - do not preserve a `COMPLETE` label when live code or the failure log can
     still falsify it
   - do not promote boundary proof, structural smoke, or runtime click-only
     proof into product acceptance
   - if a later branch reintroduces a supposedly-deleted owner, reopen the step
     explicitly instead of leaving the earlier closeout text in place

---

## Unified Sequence Of Actions

This section is the literal bottom-up workflow for this repo. The ordering law
is:

1. **Section 1 first** — finish the REXPaint-parity root editor and owner graph.
2. **Section 2 second** — add wrapper/runtime/bundle behavior only on top of
   the proven Section 1 owner.
3. **Section 3 third** — build acceptance and structural-contract proof that is
   carefully decoupled and only describes behavior that actually exists.
4. **Y9-2 gateway and public replacement last** — launcher/wizard follow-through
   and `/xpedit` cutover happen only after the first three layers are current.

Already-landed foundation slices on this branch:

1. `b8df3af` — blank root image path (`New XP`)
2. `790b63f` — whole-sheet root session ownership
3. `359c508` — root image actions routed through whole-sheet
4. `8da9c16` — source panel as root overlay
5. `c0d387f` — single frame-nav owner
6. `5014671` — research-backed editor/runtime decisions captured in Section 1.9 and Section 2.9
7. `5d5af15` — explicit Section 2 runtime-proof scope and full root save shape

Legacy-step normalization for older references:

- Treat `UQ-*` row IDs and row titles below as the only execution authority.
- Historical step numbers are context only and must never override the queue row titles.
- The overloaded label "Step 11" is normalized here to exactly one live meaning:
  backend registry-authority cleanup on the normalized registry = `UQ-004`.
- The Y9-2 launcher/wizard/MCP follow-through work is not Step 11 here. It is
  `UQ-010`, on top of the already-landed Section 2.10 HTTP backend contract.
- `UQ-011` remains the public replacement / cutover lane.
- `UQ-013` remains the small-screen layout and persistence follow-through lane.

**Queue protocol:**

1. Start at the first row whose state is `CURRENT` or `READY`.
2. Before changing files, check `PLAYWRIGHT_FAILURE_LOG.md`, isolate unrelated
   dirt, and do not stage or revert user/unrelated changes.
3. Do exactly the row’s task. Do not pull future-layer work forward because it
   feels related.
4. A Section 2 row may adapt to Section 1 behavior, but it may not reopen
   Section 1 ownership or invent a second editor/root.
5. A Section 3 row may only prove current shipped behavior. It must not invent
   product behavior, bypass the UI acceptance boundary, or over-claim closure
   from structural/diagnostic paths.
6. When a row lands or its state changes materially, update this canon and
   `PLAYWRIGHT_FAILURE_LOG.md` in the same commit.
7. `PARKED` rows are backlog, not “maybe next.” They do not execute until the
   earlier `CURRENT` / `READY` rows pass or the user explicitly reprioritizes
   them.

| Seq | State | Robot Task | Preconditions | Do Exactly This | Pass Condition | Stop / Fail Condition | FL / Owner |
|---|---|---|---|---|---|---|---|
| UQ-001 | ALWAYS | Establish repo truth before work | none | Run the repo entry checks, check the failure log first, inspect branch/head/dirty files, and identify unrelated dirt that must be left alone | Current authority docs, branch/head, dirty files, and relevant blockers are known before edits begin | Any unknown dirty change intersects the target files and cannot be safely isolated | Repo rule / `PLAYWRIGHT_FAILURE_LOG.md` |
| UQ-002 | CURRENT | Close Section 1 REXPaint parity and root-owner law | UQ-001 complete | Use Section 1.6 and Section 1.8 as the exact scope. Land only root-editor work: resize, browse parity, undo/redo ownership, apply toggles, oval/text tools, pointer events, zoom/grid completeness, and layer keyboard/persistence parity. Keep `whole-sheet-init.js` the sole document owner. Within this row, cut the hot path in this order: move live history out of `workbench.js`, stop full frame-grid rebuilds on ordinary root edits, decouple save/autosave from edit completion, then offload any still-heavy secondary projection/serialization work. | Section 1 no longer has unresolved root-editor parity blockers, the shipped edit path no longer depends on wrapper-owned history or broad wrapper projection churn for ordinary edits, or any residuals are explicitly logged as open with proof state and no mixed ownership survives | Any patch reintroduces a second editor/root owner, leaves the old owner alive while adding a new authoritative path, or treats wrapper-side throttles/suppression flags as closure while wrapper-owned hot-path authority still survives | Section 1 / `FL-STEP4` family / §1.6 |
| UQ-003 | BLOCKED | Prove the Section 1 foundation on shipped surfaces | UQ-002 pass condition met | Run UI-only headed proof for the root-hosted and prefixed `/xpedit` Section 1 surface using shipped controls only; record evidence and update the ledger honestly | Root-hosted and prefixed Section 1 flows are proven on the shipped UI with no acceptance-boundary violation | Any proof relies on `fetch()`, `page.evaluate()` mutation, hidden hooks, or diagnostic-only paths and is labeled acceptance | Section 3 acceptance law / Section 1 proof |
| UQ-004 | READY AFTER UQ-002 | Finish backend authority cleanup on the normalized registry | UQ-002 pass condition met | Add backend-focused tests around `create_bundle()`, `workbench_create_blank_session()`, `bundle_action_run()`, `workbench_export_bundle()`, and `workbench_web_skin_bundle_payload()`. Replace live backend `family` / `ENABLED_FAMILIES` gates with one helper derived from normalized registry truth. Demote the compat `family` alias to compatibility-only data. Surface operator-visible registry load/fetch failures. | No live backend bundle/session/export/runtime path still takes authority from `family` or `ENABLED_FAMILIES`; browser and backend both consume the same normalized contract | Any fix restores browser-side fail-close logic, creates a second registry authority, or claims `UQ-004` closure while backend split-authority code remains | Section 2.5 / normalized-registry authority cleanup |
| UQ-005 | BLOCKED | Close the Section 2 export-quality contract at the wrapper boundary | UQ-004 pass condition met | Wire the full Step 5 quality contract into `workbench_export_bundle()` and `workbench_web_skin_bundle_payload()`. Keep `/api/workbench/validate-xp` aligned with the same contract and do not treat single-XP validation as a substitute for export-path enforcement. | Bundle export and web-skin payload generation reject artifacts that fail the full quality contract, not just G10-G12 | Any closure claim remains contradicted by live service code, or export/web-skin paths still skip G7/G8/G9 | Section 2.4 / quality gates |
| UQ-006 | BLOCKED | Finish the Section 2 source-wrapper implementation on the canonical manifest contract | UQ-004 pass condition met | Upgrade source authoring from JSON-first manifest editing to direct interactive slicer ergonomics on the same `<source>.asciicker-source.json` contract. Keep `extractedBoxes`, `sourceCutsV`, and `sourceCutsH` derived-only; do not revive session-local source ownership. | Source authoring is no longer JSON-first, and one canonical manifest contract still owns source layout for UI, MCP, and backend paths | Any fix creates a second source-layout model or makes session-local source state authoritative again | Section 2.3 / Step 8 |
| UQ-007 | BLOCKED | Close the minimum Section 2 semantic runtime parity row set | UQ-004 through UQ-006 pass conditions met | Implement and prove the minimum semantic row set on runtime-facing lanes: preserve the already-mapped on-foot rows and add the missing `item.world_item` and `item.inventory_grid` rows. Keep the proof runtime-facing; do not confuse contract modeling with runtime closure. | The minimum seven-row semantic parity slice is implemented and proven on honest runtime-facing lanes | Any row is still only modeled, not proven, or the proof surface remains action-tab-only while claiming semantic closure | Section 2.3.9 / semantic parity |
| UQ-008 | BLOCKED | Extend Section 2 to mounted-family authoring and runtime parity | UQ-007 pass condition met | On top of the normalized registry and minimum semantic rows, add mounted-family authoring/runtime parity for `wolfie` and `wolack`: mounted template/action surface, native builder support, export/runtime proof, and mounted semantic-row closure. Keep `bigbee` explicitly deferred unless canon changes. | `wolfie` and `wolack` are authorable/provable on the live Section 2 contract, and mounted rows are no longer “specified_not_authorable” | Any fix pulls `bigbee` into scope without canon change, or adds mounted support via a proof-only shim instead of the live authoring/runtime path | Section 2.5 / mounted parity |
| UQ-009 | CURRENT / SUPPORT | Keep Section 3 harness and structural-contract runners aligned to what exists | UQ-001 complete; target Section 1/2 source state exists | Update the Section 3 action graph, headed signoff lanes, and backend schema/contract runners only for the surfaces that actually exist after each landed Section 1/2 slice. Keep acceptance UI-only. Keep backend schema/runtime parity runners separate from UI acceptance. Keep legacy repaint/truth-table entrypoints demoted. | Section 3 proof describes current code honestly: no false-green acceptance lane, no stale action graph, no structural-contract runner claiming UI acceptance | Any verifier lane outruns product reality, uses debug/API mutation as acceptance, or implies mounted/item closure from player-only lanes | Section 3 / harness law |
| UQ-010 | PARKED | Finish Y9-2 gateway follow-through on the stable HTTP backend contract | UQ-004 through UQ-009 passed, or user explicitly reprioritizes it after backend truth is stable | Wire launcher / wizard / MCP front doors to the current HTTP backend (`GET /health`, `GET /pipeline/templates`, `POST /pipeline/run`, `POST /pipeline/validate_xp`) and remove any surviving second pipeline owner or local CLI substitution from the execution path. This row assumes the backend API already exists; it is wiring/orchestration work, not missing-endpoint work. | Y9-2 front doors use the same stable backend contract that Section 2 and Section 3 already prove | Any fix creates a second pipeline owner, keeps local subprocess behavior alive as parallel truth, or reclassifies backend endpoints as the open blocker after Section 2.10 already landed them | Section 2.10 / B-13 / launcher-wiring follow-through |
| UQ-011 | PARKED | Public replacement / cutover lane | UQ-003 through UQ-010 passed; user explicitly starts cutover | Run the direct public-parity audit against `rikiworld.com/xpedit`, freeze the exact replacement SHA and proof artifacts, validate the `/xpedit` deploy path, deploy the frozen candidate, and re-run headed proof on the live URL | Public replacement is backed by the same root-hosted, prefixed, and public evidence chain with no unresolved earlier-layer blocker | Any earlier row is still open, any public parity check fails, or cutover is claimed from code state alone | Replacement lane / public parity |
| UQ-012 | ALWAYS | Canon hygiene and anti-overclaiming | Every non-trivial source/doc/proof change | Keep `PLAYWRIGHT_FAILURE_LOG.md`, this canon spec, and any directly-adjacent proof-summary text aligned. Separate code state, proof state, and doc state explicitly. Reopen rows when live code falsifies an earlier closeout. | Authority docs and live source agree, and no stale completion claim survives a contradiction | A lower-priority note, stale sequence summary, or old “COMPLETE” wording contradicts the current failure log or source | Canon authority / process |
| UQ-013 | PARKED | Small-screen layout and browser persistence follow-through | Core Section 1-3 queue rows passed, or user explicitly reprioritizes | Finish the Section 1.9.1 pointer/touch migration, three-tier persistence model, and narrow-screen layout contract without reopening the Section 1 owner graph | Small-screen/persistence work lands on the proven root editor rather than competing with it | Any fix reopens owner boundaries or is used to dodge unfinished Section 1 parity work | Section 1.9.1 / legacy Step 14 |

Future after current skin-authoring closure:

1. Design the wearable authoring workflow/template surface only after UQ-002
   through UQ-011 are current.
2. Define a separate wearable verifier/signoff path instead of piggybacking on
   the skin-strip signoff lane.

---

## 2.11 Bundle Coverage Policy

**Added 2026-04-22. Based on cross-repo audit of `artifacts/bundled_xp_sprite_packs/`
in Y9-2.**

The active bundle (driven by `appearance_bundle.json` and `ids.lock.json`) currently
references approximately 74 of 441 XP sprite files in the Y9-2 `assets/sprites/`
directory — roughly 17% coverage. This is not an error; it reflects deliberate phase-2
scope. However, the spec does not currently define coverage policy, so there is no
machine-enforceable contract between the sprite library and the active bundle.

### 2.11.1 Coverage Baseline

Current phase-2 baseline intentionally includes:

- on-foot human idle/attack/death actions (player, attack, plydie families)
- standard color variant (default skin only)
- AHSW equipment encoding combinations for the three authorized families

Current phase-2 intentionally excludes:

- color-variant families (`attack-green-*`, `player-green-*`, `plydie-green-*`) —
  proof-only, not authorable; see §2.3.4 and §2.5 misalignment ledger
  (`src/pipeline_v2/service.py`, `config/template_registry.json`,
  `scripts/workbench_png_to_skin_test_playwright.mjs`, `web/workbench.js`)
- mounted families (`wolfie-*`, `wolack-*`) — deferred pending schema normalization;
  see §2.9.1
- `bigbee-*` — deferred explicitly; see Step 10 scope note
- world-item and inventory-grid item families — no item authoring surface exists yet

### 2.11.2 Coverage Expansion Contract

When the scope above expands (e.g. mounted families land after `UQ-008`), the bundle
coverage contract must expand simultaneously. The rule is:

1. Every sprite in `assets/sprites/` must be either:
   - referenced in the active bundle source manifest, OR
   - listed in `config/SPRITE_COVERAGE_EXCEPTIONS.txt` with an explicit reason

2. Accepted reasons for exclusion:
   - `deprecated` — asset is historical; not in active use
   - `proof-only` — runtime/proof helpers use it but the authoring surface does not
   - `future-scope` — planned for a future phase; include target milestone if known
   - `test-fixture` — test-only asset not in production bundles

3. If a new sprite file is added to `assets/sprites/` without a corresponding bundle
   reference or SPRITE_COVERAGE_EXCEPTIONS.txt entry, that is a coverage regression,
   not a cleanup task.

4. Coverage audits must be machine-driven. A script or CI step must enumerate
   `assets/sprites/*.xp`, cross-reference the active bundle, and emit a coverage
   report before any bundle export gate is declared PASS.

### 2.11.3 Current Exceptions (2026-04-22)

The following families are excluded from phase-2 bundle by design:

| Family pattern | Reason | Resolves in |
|----------------|--------|-------------|
| `attack-green-*`, `player-green-*`, `plydie-green-*` | proof-only (`§2.5`, `service.py`, `workbench.js`) | after `UQ-004` authoring-boundary cleanup and any later canon scope change |
| `wolfie-*`, `wolack-*` | future-scope: mounted authoring | after `UQ-008` mounted-family parity |
| `bigbee-*` | future-scope: bigbee deferred | explicitly post-mounted-family work |

This table must be updated whenever scope changes. Do not widen bundle coverage without
updating this table.

---

## 2.12 Rollback Asset Snapshot Contract

**Added 2026-04-22. Based on audit of `artifacts/bundled_xp_sprite_packs/rollbacks/`
in Y9-2.**

Current rollback snapshots (e.g. `rollback_20260422_193432/`) capture only JSON
metadata:

- `appearance_bundle.json`
- `ids.lock.json`
- `compile_report.json`

They do NOT capture XP sprite binary files. If a sprite binary changes between the
rollback snapshot and the rollback restore point, the rollback cannot reconstruct prior
asset state.

### 2.12.1 Required Rollback Snapshot Contents

A sound rollback snapshot must capture:

1. All JSON metadata (current behavior — retain as-is)
2. All XP sprite binaries referenced by the bundle at snapshot time
3. The expected SHA256 hash of each referenced sprite binary, stored in a
   `bundle_sha256_manifest.json` alongside the snapshot

Implementation:

- At snapshot creation time, copy all referenced XP files into the rollback directory
  under an `asset_binaries/` subdirectory
- At restore time: unpack `asset_binaries/` to the original sprite paths, recompile,
  and verify the resulting `compile_report.json` hashes match `bundle_sha256_manifest.json`

### 2.12.2 Rollback Validation Rule

After a rollback restore, all of the following must pass before the state is declared
sound:

1. `ids.lock.json` hashes match the snapshot
2. All sprite files named in `bundle_sha256_manifest.json` are present at their
   expected paths with matching hashes
3. A fresh bundle compile produces a `compile_report.json` that matches the snapshot

If any check fails, the rollback is partial and the operator must be notified before
any further bundle operations proceed.

### 2.12.3 Current State (2026-04-22)

This contract is not yet implemented. The existing rollback mechanism satisfies only
item 1 of §2.12.1. Items 2 and 3 are OPEN. This gap should be addressed before any
rollback is relied on in an automated or agent-driven workflow.

---

## 2.13 Y9-2 Wizard Parity Contract

**Added 2026-04-22. Expands on DESIGN OPEN B-13 from §2.10.**

Section 2.10 defines the HTTP API endpoints this server must expose for Y9-2
integration. DESIGN OPEN B-13 documents that the Y9-2 `[3] ASSET PIPELINE` launcher
node is absent rather than wired. This section defines the parity contract that must
hold between the Y9-2 `WizardEngine`, the Y9-2 launcher `option_tree`, and the
pipeline-v3 backend.

### 2.13.1 Wizard Parity Invariants

1. Every wizard option listed in the Y9-2 launcher `option_tree.py` under the
   `[3] ASSET PIPELINE` node must have a corresponding handler in
   `scripts/pipeline/wizard/engine.py` that calls a real pipeline-v3 backend endpoint.
   A listed option with no handler, or with a handler that does not reach the backend,
   is a parity violation.

2. Every wizard handler must implement a full lifecycle:
   - **Precondition check**: verify `PIPELINE_SERVER_URL` is reachable (`GET /health`)
     before the first user prompt; fail fast with a clear message if not
   - **Prompt sequence**: at least one user-facing prompt that collects required input
   - **Execution**: POST to the appropriate backend endpoint with the collected input
   - **Result display**: render the backend response in the terminal before returning
     to the menu

3. Tests must exercise the full lifecycle. A test that only checks for handler name
   existence (string matching on `option_tree.py`) does not satisfy this contract.

4. The `option_tree` must reflect the current backend capability. If an endpoint is
   not implemented, the corresponding launcher option must be either absent or
   explicitly labeled `[DEFERRED]` — never silently present with a broken or stub
   handler.

### 2.13.2 Priority Client Paths

Per §2.7, there are two client paths into the backend:

- **Human TUI path**: Y9-2 launcher `[3] Asset Pipeline` → `WizardEngine` → HTTP
- **Agent MCP path**: AI agent → `mcp/wizard_mcp_server.py` → `WizardEngine` → HTTP

Both paths must satisfy the same parity contract. An MCP tool that calls a wizard
action stub without reaching the backend is the same class of violation as a launcher
option with no handler.

### 2.13.3 Action Authoring Lifecycle (TUI)

When a user enters the bundle authoring wizard from the Y9-2 launcher:

1. **Status check**: wizard displays pipeline server URL and health status
2. **Template selection**: list available templates from `GET /pipeline/templates`;
   user selects family + action
3. **Source input**: prompt for source PNG path or existing XP path
4. **Run**: POST to `POST /pipeline/run` with wizard nav state; display progress
5. **Validate**: call `POST /pipeline/validate_xp` on the result; display gate
   outcomes (G7–G12) and quality score
6. **Accept or retry**: user reviews; if rejected, return to step 3

Status display rule: the wizard must always show which action is currently active
(e.g. `Authoring: player idle (action 1 of 3)`). The user must never be in a state
where it is unclear which bundle action they are editing.

### 2.13.4 Scope Boundary

The Y9-2 wizard is a thin client. It:

- does not own the XP editor root (Section 1 owns this)
- does not own the wrapper architecture (Section 2 owns this)
- does not define the family/template schema (the backend registry owns this)
- does not define the bundle export contract (§2.4 and §2.11 own this)

The wizard is responsible only for orchestrating user input, calling the correct
backend endpoints in order, and presenting results. Any design decision about what the
pipeline does must be captured in this spec, not in wizard code.

---

## V3 Migration Readiness Gates

**Added 2026-04-22. Tracks what must be true before a V3 migration is declared ready.**

This section lists the open gaps identified by the 2026-04-22 cross-repo audit. It is
not a task plan — it is a gate list. Migration is ready when all blocking gates PASS.

### Blocking Gates

| Gate | Section | Status |
|------|---------|--------|
| UQ-002 Section 1 REXPaint-parity foundation passes | §Unified Queue `UQ-002` | CURRENT — root-editor parity ledger still open (`workbench.js` history owner, topology-constrained resize, wrapper hot-path churn/full frame-grid rebuilds/full-session save coupling, no headed Section 1 proof) |
| UQ-003 root-hosted + prefixed Section 1 proof passes | §Unified Queue `UQ-003` | BLOCKED on UQ-002 |
| UQ-004 backend authority cleanup passes | §Unified Queue `UQ-004` | OPEN — backend `family` / `ENABLED_FAMILIES` split still live |
| UQ-005 export/web-skin quality contract fully enforced | §Unified Queue `UQ-005` | OPEN — export/web-skin paths still run only G10-G12 on the current branch |
| UQ-006 manifest-backed source authoring no longer JSON-first | §Unified Queue `UQ-006` | OPEN |
| UQ-007 minimum seven-row semantic runtime parity proven | §Unified Queue `UQ-007` | OPEN |
| UQ-008 mounted-family parity for `wolfie` / `wolack` proven | §Unified Queue `UQ-008` | OPEN |
| UQ-009 current-scope Section 3 signoff + contract runners current | §Unified Queue `UQ-009` | PARTIAL |
| UQ-010 Y9-2 wizard / launcher gateway wired to stable HTTP backend | §Unified Queue `UQ-010` | OPEN |
| UQ-011 cutover support gates ready (`§2.11`, `§2.12`) | §Unified Queue `UQ-011` | OPEN |

### Non-Blocking Gaps (required for full parity, not migration gate)

| Gap | Section | Status |
|-----|---------|--------|
| Wearable/item authoring surface | §2.3.6 / §2.3.7 | EXPLICITLY DEFERRED post skin-authoring signoff |
| Proof-only color-variant family authoring surface | §2.5 misalignment ledger | PROOF-ONLY by policy (`service.py`, `workbench.js`) |
| M2 E2E proof run (PNG→WS→export, committed headed run) | §Milestone 2 | PARTIAL |
| UQ-013 small-screen layout and persistence | §Unified Queue `UQ-013` | OPEN |

### Gate Maintenance Rule

A gate moves to IMPLEMENTED when the corresponding code is committed and the
spec section above reflects current state accurately. A gate moves to PASS only
when a verified test run or headed proof is committed with a dated evidence ref.
Do not remove rows when gates PASS — update Status in-place with the evidence ref.

**Ship gate:** Do not surface the `[3] ASSET PIPELINE` launcher node until the blocking queue rows required for a supported front door are PASS. At minimum that means honest Section 1 proof (`UQ-003`), stable Section 2 backend/wrapper truth (`UQ-004` through `UQ-009`), Y9-2 gateway wiring (`UQ-010`), and the Y9-2 Step 7.12 VERIFY gate. FL-813 is now blocked by end-to-end support truth, not by a missing Section 2.10 backend API implementation.
