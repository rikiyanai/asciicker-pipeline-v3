# Player-State Parity Audit

Date: 2026-03-24
Status: worksheet
Purpose: Answer the four unresolved player-state questions before any implementation planning

## Audit Scope

This audit traces the current code/config/runtime contracts to answer:

1. If a user adds one PNG sprite, what families/states must be authored manually?
2. Are helmet/armor/shield/weapon states separate authored families or layer variants?
3. Which mounted/unmounted transitions are first-class product truth vs fallback-native?
4. What would a truthful template-less native-runtime apply mode need?

## Triad of Knowledge

### Q1: One PNG → What Must Be Manually Authored?

**KNOWN (from code):**

The current workbench/bundle model works like this:

1. User uploads ONE PNG per action (idle, attack, death).
2. The pipeline converts it to ONE XP file per session.
3. At skin-apply time, the bundle payload broadcasts that ONE XP to ALL AHSW filename variants for that family.

Evidence:
- `service.py:2936-2938` — for each action, reads ONE exported XP, then calls `_action_override_names(family, ahsw_range)` to generate the full filename list.
- `_action_override_names` (service.py:2772-2795) — generates ternary AHSW filenames (24 for `all_16`, 16 for `weapon_gte_1`). All get the SAME XP bytes.
- `workbench.js:1298-1303` (`injectBundleIntoWebbuild`) — iterates per-action override names, writes the same `xpBytes` to every filename in `/sprites/`.
- Native sandbox `_stage_termpp_skin_sandbox` (service.py:255-266) — copies ONE `xp_path` to ALL override names.

**Conclusion:** Users do NOT manually create AHSW variants. The pipeline applies one authored sprite to all equipment-state filenames. This is by design — the AHSW naming is a runtime lookup convention, and the skin override stamps the same visual over all states.

**What IS manual per-action:** Each **family** (player, attack, plydie, wolfie, wolack) needs a separate authored PNG, because they have different dimensions, frame counts, layer counts, and visual content. The bundle's `player_native_full` template has 3 actions (idle/attack/death), each requiring its own PNG. Adding wolfie/wolack would add 2 more authoring sessions.

**ASSUMED:** There is no automated derivation from one family to another. A player-idle PNG cannot auto-generate an attack or death sprite.

**Status: KNOWN.** One PNG per family action, one XP per family action, broadcast to all AHSW variants.

---

### Q2: Equipment State Representation (AHSW)

**KNOWN (from code and sprites):**

AHSW (Armor/Helmet/Shield/Weapon) is encoded in **filenames**, not in layers or composited assets.

- Committed sprites confirm ternary W encoding: `player-0000.xp` through `player-1112.xp` (24 variants).
- The runtime engine selects sprite by filename: when the player equips a sword, it switches from `player-0000.xp` to `player-0001.xp`.
- Each AHSW variant is a **complete, self-contained XP file**. There is no layer-based equipment composition at runtime.
- The native (built-in) sprites DO have visual differences between AHSW variants — a player with a helmet looks different from one without.
- The workbench skin override makes all variants look the same (same custom XP bytes), which means custom skins lose equipment-visual differentiation.

Evidence:
- `sprites/*.xp` — runtime-relevant player family has 24 AHSW files (`player-0000.xp` through `player-1112.xp`) plus `player-nude.xp`. The repo also contains two extra `player-*.xp` artifact files from earlier verifier work; those are not part of the runtime family contract. `attack` has 8 W≥1 files, `plydie` has 24.
- `_action_override_names` generates one filename per AHSW combo.
- `config/template_registry.json:17` — `"ahsw_range": "all_16"` for player (legacy label, actually 24 ternary names).
- `config/template_registry.json:52-53` — `"ahsw_range": "weapon_gte_1"`, `"weapon_filter": "W>=1"` for attack.

**ASSUMED:** Equipment-visual differentiation (e.g., drawing a helmet on the player) would require the user to author separate PNGs per equipment state, or would require a compositing system that does not exist today. The current bundle model intentionally sacrifices equipment-visual differentiation for simplicity (one authored sprite → all states).

**UNKNOWN:** Whether the game engine ever composites equipment visuals at runtime, or if the 24 separate XP files are always the only mechanism. Static code analysis suggests no compositing — the engine just loads the right filename. But this would need runtime observation to confirm.

**Status: KNOWN for current model. UNKNOWN for future equipment-composition.** Equipment states are filename-level selection. Custom skins currently broadcast one visual to all states.

---

### Q3: Mounted/Unmounted Support

**KNOWN (from code):**

Mounted support (wolfie/wolack) is currently:
- **Present in committed sprites:** wolfie has 24 AHSW files + wolfie.xp base, wolack has 8 files (W≥1).
- **Present in browser debug override lists:** workbench.js "mounted" mode (49 names) and "full_parity" mode (81 names) both include wolfie+wolack.
- **Present in native sandbox override list:** `_termpp_skin_override_names` (service.py:59-64) includes all 5 families (binary, 81 names).
- **Present in termpp_skin_lab.js:** `player_common` set (81 binary names) includes wolfie+wolack.
- **NOT present in bundle templates:** `config/template_registry.json` has NO wolfie/wolack entries.
- **NOT present in ENABLED_FAMILIES:** `config.py:38` — only `{"player", "attack", "plydie"}`.
- **NOT present in native layer builders:** `_build_native_layers` (service.py:1480-1498) only handles player/attack/plydie. wolfie/wolack would raise `unknown_family_builder` error.

**What mounted support would require (gap map):**

| Component | Current State | Required for Mounted Parity |
|-----------|--------------|---------------------------|
| `ENABLED_FAMILIES` | 3 families | Add `wolfie`, `wolack` |
| `template_registry.json` | No wolfie/wolack entries | New template entries with correct dims (180x96-104 / 160x104) |
| `_build_native_layers` | player/attack/plydie only | New `_build_native_wolfie_layers`, `_build_native_wolack_layers` |
| L0/L1 reference XP | None for wolfie/wolack | Need reference sprites for each |
| `_FAMILY_L0_COL0` | player/attack/plydie only | Add wolfie/wolack metadata patterns |
| Structural gates | Hardcoded for 3 families | Extend to wolfie/wolack dimensions |
| Pipeline PNG ingest | Family-agnostic (works) | Probably works, but untested for these dims |
| Browser debug overrides | Already included | W=2 gap still applies |

**ASSUMED:** wolfie has different cell_h and possibly different layer counts than player. The research note says 180x96-104 chars, 4 layers. wolack says 160x104, 5-6 layers. These would need template-level specification.

**UNKNOWN:** Exact wolfie/wolack metadata structure (L0 encoding, L1 pattern, frame counts per angle). Would need XP-level inspection of committed sprites.

**Status: KNOWN for current gaps. UNKNOWN for exact wolfie/wolack template specs.**

---

### Q4: Template-Less Native-Runtime Apply

**KNOWN (from code):**

The native runtime (Term++ binary) does not care about templates. It just loads sprites by filename from the `sprites/` directory. The template model is purely a **workbench/pipeline constraint** for authoring, validation, and session management.

Evidence:
- `_stage_termpp_skin_sandbox` (service.py:213-275) — creates a symlinked sandbox and copies ONE exported XP to all 81 override names. The helper itself does not consult template metadata, but the exposed workbench path still reaches it through `session_id -> export -> xp_path`.
- The sandbox path takes a `session_id` only to get the exported XP bytes. It doesn't read the template.
- `workbench_open_termpp_skin` (service.py:2573-2632) — the API entrypoint just needs a session_id to export XP, then calls `_stage_termpp_skin_sandbox`.

**What the template model currently enforces (and what template-less would bypass):**

| Template Constraint | Purpose | Required for native runtime? |
|--------------------|---------|-----|
| Fixed dimensions per action (xp_dims) | Ensures XP matches engine expectations | YES — engine expects specific dims per family |
| Layer count validation (G11) | Ensures L0 metadata + visual layers are present | YES — engine needs metadata layer |
| L0 metadata validation (G12) | Ensures angles/frames/projs encoded correctly | YES — engine reads this |
| AHSW range labeling | Determines override filename set | NO — sandbox just uses all 81 names |
| Reference XP SHA256 | Prevents stale reference | NO — convenience check only |
| Enabled families gate | Phase-gates family availability | NO — artificial constraint |

**Conclusion:** A truthful template-less apply would need to:

1. **Keep**: Dimension validation (XP must match family's expected geometry).
2. **Keep**: Layer structure validation (L0 metadata must be valid).
3. **Remove**: Template set lookup — instead, accept `(family, xp_bytes)` pairs directly.
4. **Remove**: Enabled families gate — if the XP has valid structure for a family, allow it.
5. **Remove**: Session/bundle/action_key machinery — this is workbench state management, not runtime requirement.
6. **Extend**: Override name generation to cover all families (currently bundle only covers 3).
7. **Reconcile**: W encoding — native sandbox uses binary (16 per family), server bundle uses ternary (24 per family). Both should use ternary to match committed sprites.

**What's blocking today:**
- No `_build_native_layers` for wolfie/wolack (can't create blank sessions for them).
- No template entries for wolfie/wolack (can't validate their geometry).
- `ENABLED_FAMILIES` explicitly excludes them.
- The native sandbox `_termpp_skin_override_names` uses binary W (misses W=2), which is a **real bug** — the runtime won't see custom skin for W=2 states.

**Status: KNOWN.** Template-less apply is architecturally simple (the sandbox already does it). The real work is family expansion (wolfie/wolack builders/templates) and W-encoding parity.

---

## Override Name Encoding Mismatch (Critical Finding)

There is a **systematic mismatch** between the committed sprite inventory and the override name generation:

| Override Path | W Encoding | Names per family | Families | Total |
|--------------|-----------|-----------------|----------|-------|
| Committed sprites (truth) | Ternary (0,1,2) | 24 (all_16) / 8 (W≥1) | 6 | ~113 |
| Server bundle `_action_override_names` | Ternary (0,1,2) | 24 / 16 | 3 | 65 |
| Native sandbox `_termpp_skin_override_names` | **Binary (0,1)** | **16** | 5 | **81** |
| Browser debug `WEBBUILD_DEFAULT_OVERRIDE_NAMES` | **Binary (0,1)** | **16** | 3-5 | **49-81** |
| termpp_skin_lab.js `player_common` | **Binary (0,1)** | **16** | 5 | **81** |

**Impact:** When the native sandbox or browser debug path applies a custom skin, W=2 variants (heavy/ranged weapon) do NOT get overridden. The player falls back to the built-in native sprite for W=2 equipment states. This means custom skins visually "break" when the player equips a ranged/heavy weapon.

The server-side bundle payload path is the ONLY path that correctly handles W=2.

---

## Gap Map: Full Player-State Parity

### Backend (service.py)

| Gap | Scope | Touched Functions | Difficulty |
|-----|-------|-------------------|-----------|
| Add wolfie/wolack to ENABLED_FAMILIES | config.py:38 | Config constant | Trivial |
| Build native layer builders for wolfie/wolack | service.py | New `_build_native_wolfie_layers`, `_build_native_wolack_layers` | Medium — need to inspect reference XPs for L0/L1 patterns |
| Add wolfie/wolack L0 col0 metadata | service.py:2798-2802 | `_FAMILY_L0_COL0` dict | Small — need reference XP analysis |
| Fix `_termpp_skin_override_names` to use ternary W | service.py:59-64 | One function | Trivial — match `_action_override_names` logic |
| Add player-nude to ENABLED_FAMILIES consideration | N/A | Not a family in the AHSW sense — it's a special filename | Trivial — already handled in `_action_override_names` for player |

### Frontend (workbench.js)

| Gap | Scope | Touched Lines | Difficulty |
|-----|-------|---------------|-----------|
| Fix browser debug override loops to ternary W | workbench.js:29-52 | WEBBUILD_DEFAULT_OVERRIDE_NAMES | Trivial — change `i < 16` binary loop to AHSW nested loop |

### Template Registry (config/template_registry.json)

| Gap | Scope | Difficulty |
|-----|-------|-----------|
| Add wolfie template entry (idle mount) | New action spec with dims 180x96-104, correct layer/angle/frame counts | Medium — need reference XP analysis |
| Add wolack template entry (mount attack) | New action spec with dims 160x104, correct layer/angle/frame counts | Medium — need reference XP analysis |

### Runtime (termpp_skin_lab.js)

| Gap | Scope | Difficulty |
|-----|-------|-----------|
| Fix DEFAULT_OVERRIDE_SETS to ternary W | All 3 override sets | Trivial |

---

## Answers to the Four Questions

### Q1: If a user adds one PNG sprite, what families/states must be authored manually?

**One PNG per family action.** For full player-state parity:
- 1 PNG for idle (player family) — REQUIRED
- 1 PNG for attack — optional
- 1 PNG for death (plydie) — optional
- 1 PNG for mounted idle (wolfie) — NOT YET SUPPORTED
- 1 PNG for mounted attack (wolack) — NOT YET SUPPORTED

Each PNG is converted to one XP, which is broadcast to all 24 (or 16) AHSW variants.
Users never author AHSW variants individually.

### Q2: Are equipment states separate families or layer variants?

**Filename-level variants, not layers.** AHSW is encoded in the filename. The runtime loads the whole XP file by filename. There is no layer-based equipment composition. Custom skins currently stamp the same visual over all AHSW filenames, losing equipment-visual differentiation by design.

### Q3: Which mounted/unmounted transitions are first-class product truth?

**Mounted (wolfie/wolack) is a real runtime behavior but is NOT covered by the current workbench bundle model.** It IS covered by the browser debug override path and the native sandbox override path. The gap is:
- No template entries for wolfie/wolack
- No native layer builders
- Not in ENABLED_FAMILIES
- W=2 encoding gap in all non-bundle paths

### Q4: What would template-less native-runtime apply need?

**Architecturally simple.** The native sandbox (`_stage_termpp_skin_sandbox`) already IS template-less — it copies XP bytes to override filenames without consulting any template. To make this a first-class feature:
1. Fix the W encoding to ternary (bug fix, not architecture)
2. Add wolfie/wolack families
3. Skip template/session/bundle machinery — accept `(family, xp_bytes)` directly
4. Keep dimension/layer validation as a lightweight pre-check (not gated by templates)

---

## Proposed Canon/Roadmap Wording Updates

Based on strictly evidenced findings:

### For `docs/plans/2026-03-23-workbench-canonical-spec.md`:

1. **W=2 encoding parity fix** should be listed as a bug/debt item, not a feature:
   > BUG: `_termpp_skin_override_names`, `WEBBUILD_DEFAULT_OVERRIDE_NAMES`, and `termpp_skin_lab.js DEFAULT_OVERRIDE_SETS` use binary W encoding (0-1), missing W=2 variants. Only the server bundle payload path (`_action_override_names`) is correct (ternary). Custom skins visually break for ranged/heavy weapon states on all non-bundle paths.

2. **Mounted parity** should clarify the scope:
   > Mounted family support (wolfie/wolack) requires: new template entries with validated dimensions, new native layer builders, ENABLED_FAMILIES expansion, and W-encoding parity fixes. The runtime already supports mounted override at the filename level via existing debug/sandbox paths.

3. **Template-less apply** should be characterized accurately:
   > The native sandbox already performs template-less apply. Formalizing it as a first-class feature requires (a) ternary W encoding fix, (b) family expansion, and (c) a lightweight validation layer that checks XP dimensions/layers without requiring template set/session/bundle state.

### For `docs/research/ascii/2026-03-20-bundle-animation-types.md`:

Update the "Override Modes" section to note the W=2 gap is now a confirmed bug (not just an observation), since the server bundle path proves ternary is the correct encoding.

---

## Appendix A — UX Design Exploration (Speculative, Non-Canonical)

This section is design exploration informed by the audit. It is not itself an evidence-backed
audit finding and should not be treated as canon without separate product/design review.

### Design Context

The current workbench is a single-page vertical-scroll layout built in DepartureMono on a
SRCL dark palette (#000 bg, #161616 panels, #f1c21b gold accent, zero-radius corners). The
interaction entry point is a template dropdown (`#templateSelect`) with two options. Selecting
"Full Bundle" creates action tabs (`[Idle/Walk ✓] [Attack ○] [Death ○]`). Each tab is a
separate authoring session. Below the template panel: Upload+Convert, Source Panel | Grid
Panel two-col, Whole-Sheet XPEdit, Animation+Metadata, XP Preview | Session, Skin Test Dock,
Verification, Export.

The personality is utilitarian terminal — labels are terse, buttons are flat, information
density is high. The user is a modder/skin creator making custom visuals for the Asciicker
game engine. They may be an artist exporting from Photoshop/Aseprite, or someone editing
directly in the ASCII cell editor.

### The Three Authoring Workflows

The audit reveals three distinct things a user might want to make. They should NOT be collapsed
into a single "more templates" dropdown — they have fundamentally different interaction shapes:

**1. Character Skin** (current, expand)
"I want my character to look like X in all gameplay states."
One PNG per action. Same visual for all equipment combos. This is the happy path.

**2. Equipment Variants** (new, advanced)
"I want my character with helmet to look different from without helmet."
Per-AHSW authoring. Up to 24 variants × N families. Power-user workflow.

**3. Items & Objects** (new, separate)
"I want to make custom inventory icons or world-drop sprites."
Simple single-sprite authoring. No angles, no frames, no AHSW. Different dimensions entirely
(grid-* is ~22×22 cells, item-* varies).

### Proposed UX: Project Type Selector

Replace the flat template dropdown with a **project type card selector** that replaces the
current `#templatePanel` contents. The card selector appears once on first visit or when the
user clicks "New Project." After selection, it collapses to a one-line summary with a
"Change" link.

```
┌───────────────────────────────────────────────────────────────────────┐
│ NEW PROJECT                                                          │
│                                                                      │
│ ┌─────────────────┐ ┌─────────────────┐ ┌─────────────────────────┐ │
│ │ CHARACTER SKIN  │ │ EQUIPMENT       │ │ ITEMS & OBJECTS         │ │
│ │                 │ │ VARIANTS        │ │                         │ │
│ │ One art per     │ │ Different look  │ │ Inventory icons,        │ │
│ │ action. All     │ │ per equipment   │ │ world drops, UI         │ │
│ │ equipment       │ │ combination.    │ │ sprites.                │ │
│ │ states match.   │ │                 │ │                         │ │
│ │                 │ │ ▲ ADVANCED      │ │ No angles or frames.    │ │
│ │ 3–5 PNGs       │ │ Up to 120+      │ │ 1 PNG each.             │ │
│ └─────────────────┘ └─────────────────┘ └─────────────────────────┘ │
│                                                                      │
│ ░░░░░░░░░ gold accent underline on hover ░░░░░░░░░░░░░░░░░░░░░░░░░ │
└───────────────────────────────────────────────────────────────────────┘
```

Card styling: `var(--panel)` background, 1px `var(--border)` border, hover state adds
`border-color: var(--accent)` and a 2px bottom gold bar. Selected card gets a persistent
gold bottom bar and a subtle `box-shadow: inset 0 0 0 1px rgba(241,194,27,0.18)`.
"ADVANCED" badge on Equipment Variants is a small inline pill in `var(--warn)` color.

**Why cards, not a dropdown:** The three workflows have such different effort levels and output
shapes that a flat list obscures the choice. Cards give the user a 2-second visual scan of
what each path means BEFORE committing. The dropdown can remain as a fallback/compact mode
for returning users.

### Character Skin: Expanded Action Slots

After selecting CHARACTER SKIN, the action tab strip expands beyond the current 3 tabs.
The tab strip uses the existing `#bundleActionTabs` pattern but adds mounted families as
greyed-out future slots:

```
┌──────────────────────────────────────────────────────────────────────┐
│ CHARACTER SKIN — Player Skin (Full Bundle)                          │
│                                                                     │
│ [Idle/Walk ✓] [Attack ○] [Death ○] ┊ [Mount Idle ·] [Mount Atk ·] │
│  ▔▔▔▔▔▔▔▔▔▔▔                       ┊  greyed, "coming soon"       │
│  126×80 • 8 angles • 4 layers       ┊  180×96 • 8 angles • 4 lyr  │
│                                     ┊                              │
│ ● = ready  ○ = needs art  · = not yet available                    │
└──────────────────────────────────────────────────────────────────────┘
```

Implementation: The tab strip already exists as `renderBundleActionTabs()` in workbench.js:6388.
Mount tabs would render with `btn.disabled = true` and a tooltip. The vertical separator
(┊) is a CSS `border-left: 1px dashed var(--border)` on the first mount tab. Dims shown
below active tab in `var(--muted)` small text.

**Why show unavailable tabs?** It tells the user the system knows about mounted sprites
and they're planned. Without this, users who want mount skins have zero signal that the
workbench will ever support them. The greyed tabs set expectations and build trust.

### Equipment Variants: The AHSW Matrix

After selecting EQUIPMENT VARIANTS, the template panel transforms into a two-level picker:

**Level 1: Family picker** (same tab strip as Character Skin)

```
[Player ●] [Attack] [Death] ┊ [Mount Idle ·] [Mount Atk ·]
```

**Level 2: Equipment matrix** (replaces the upload panel for this project type)

```
┌───────────────────────────────────────────────────────────────────┐
│ EQUIPMENT MATRIX — player family                     24 variants │
│                                                                  │
│              W=0 (none)    W=1 (melee)    W=2 (ranged)          │
│          ┌──────────────┬──────────────┬──────────────┐          │
│  No gear │  0000 [  ]   │  0001 [  ]   │  0002 [  ]  │          │
│          ├──────────────┼──────────────┼──────────────┤          │
│  Shield  │  0010 [  ]   │  0011 [  ]   │  0012 [  ]  │          │
│          ├──────────────┼──────────────┼──────────────┤          │
│  Helmet  │  0100 [  ]   │  0101 [  ]   │  0112 [  ]  │          │
│          ├──────────────┼──────────────┼──────────────┤          │
│  H+S     │  0110 [  ]   │  0111 [  ]   │  0112 [  ]  │          │
│          ├──────────────┼──────────────┼──────────────┤          │
│  Armor   │  1000 [  ]   │  1001 [  ]   │  1002 [  ]  │          │
│          ├──────────────┼──────────────┼──────────────┤          │
│  A+S     │  1010 [  ]   │  1011 [  ]   │  1012 [  ]  │          │
│          ├──────────────┼──────────────┼──────────────┤          │
│  A+H     │  1100 [  ]   │  1101 [  ]   │  1102 [  ]  │          │
│          ├──────────────┼──────────────┼──────────────┤          │
│  Full    │  1110 [  ]   │  1111 [  ]   │  1112 [  ]  │          │
│          └──────────────┴──────────────┴──────────────┘          │
│                                                                  │
│  SHORTCUTS                                                       │
│  [Fill All Same]  [Fill Column ▾]  [Fill Row ▸]  [Clear All]    │
│                                                                  │
│  ☐ Link Armor rows (same art ± armor)                           │
│  ☐ Link Helmet rows (same art ± helmet)                         │
│  ☐ Link Shield rows (same art ± shield)                         │
│  ☐ Link Weapon columns (same art for W=1 and W=2)               │
│                                                                  │
│  4 / 24 variants filled                                         │
└───────────────────────────────────────────────────────────────────┘
```

**Key interaction patterns:**

- **Fill All Same** — upload ONE PNG, stamp it to all 24 cells (equivalent to current behavior).
  This is the escape hatch: "I picked Equipment Variants but actually just want uniform."
- **Fill Column / Fill Row** — upload one PNG, fill an entire weapon column or equipment row.
  E.g., "same art for all W=1 states" or "same art for all Full-gear states."
- **Link checkboxes** — when checked, editing one cell auto-mirrors to its linked pair.
  E.g., "Link Armor rows" means 0000 and 1000 share the same art. This halves the work
  for equipment axes the user doesn't care about visually differentiating.
- **Each cell is a mini upload target.** Click → opens the existing Source Panel workflow
  scoped to that variant. The Grid Panel and Whole-Sheet editor work on the active cell's
  session.

**Why a matrix, not a list?** The AHSW encoding IS a matrix (3 binary axes × 1 ternary axis).
A flat list of 24 items is opaque — a user can't see that 0100 means "helmet only." The matrix
rows are labeled with human-readable equipment combos, so the user immediately understands the
structure. The column headers (W=0/1/2) make weapon ternary obvious.

**Progressive disclosure:** The matrix starts collapsed behind a "Show equipment matrix" toggle.
Default view is just the family tab strip + "Fill All Same" button (which IS the current
behavior). Users who want per-variant control explicitly opt in.

### Items & Objects: Simplified Single-Sprite Mode

After selecting ITEMS & OBJECTS, the workbench strips down to a minimal single-sprite
authoring flow. No angles, no frames, no AHSW, no action tabs.

```
┌────────────────────────────────────────────────────────────────────┐
│ ITEMS & OBJECTS                                                   │
│                                                                   │
│  Item Type  [Inventory Icon ▾]     Target  [grid-custom-name ___] │
│                                                                   │
│  Inventory Icon:  fits the 22×22 grid-* sprite slot               │
│  World Drop:     fits the item-* sprite slot (variable dims)      │
│  UI Element:     keyboard layout, custom UI (advanced)            │
│                                                                   │
│  [Upload PNG]  [Import XP]                                        │
└────────────────────────────────────────────────────────────────────┘
```

Below this, the workbench shows the **same** Source Panel → Grid Panel → Whole-Sheet editor
pipeline, but with constraints matching the item type:
- Grid dimensions locked to the item type's expected size
- No angle/frame metadata panel (hidden)
- No animation preview (hidden)
- Skin Test Dock shows the item in an inventory mock-up or world-drop context instead of
  the full character arena

**Why a separate mode?** Items have zero overlap with the character sprite pipeline. They
don't have AHSW, angles, frames, or family semantics. Showing them in the same template
dropdown as "Player Skin (Full Bundle)" creates false equivalence and confusing metadata
fields. A dedicated mode hides irrelevant controls and reduces cognitive load.

### How the Two Audit Axes Map to UX

The audit identified two axes that must not be collapsed:

**Axis 1: Runtime-family expansion** (which filename families are authorable)
→ Maps to the **action tab strip** in Character Skin mode.
→ Currently: Idle, Attack, Death. Future: + Mount Idle, + Mount Attack.
→ Each tab IS a family. Adding a family = adding a tab.

**Axis 2: Gameplay/state coverage** (AHSW equipment visual differentiation)
→ Maps to the **Equipment Variants project type** and its AHSW matrix.
→ Within Character Skin mode, this axis is collapsed by design (Fill All Same).
→ Within Equipment Variants mode, this axis is fully exposed per-cell.

The two axes are independent in the UX because they're independent in the runtime:
- You can author all 5 families with "Fill All Same" (full Axis 1, collapsed Axis 2).
- You can author only player idle with per-AHSW variants (minimal Axis 1, full Axis 2).
- Or any combination.

### Items Are a Third Axis

Items (`grid-*`, `item-*`, `keyb-*`) are a third axis not covered by the AHSW/family model:

| Axis | What It Covers | UX Surface |
|------|---------------|------------|
| 1. Runtime-family | player/attack/plydie/wolfie/wolack | Action tab strip |
| 2. Equipment state | AHSW per-variant art | Equipment matrix |
| 3. Items & objects | grid-*/item-*/keyb-* | Dedicated item mode |

These should stay separate in the UX because they're separate in the engine. An inventory
icon has nothing in common with a player idle sprite — different dimensions, different
override mechanism, different visual context.

### Interaction Flow Summary

```
User opens workbench
  │
  ├─ NEW PROJECT card selector appears
  │   │
  │   ├─ CHARACTER SKIN
  │   │   ├─ Template sub-selector: Idle Only / Full Bundle
  │   │   ├─ Action tab strip: [Idle ●] [Attack ○] [Death ○] ┊ [Mount ·] [MountAtk ·]
  │   │   ├─ Each tab: Upload PNG → pipeline → editor → Save
  │   │   ├─ All AHSW variants auto-filled (same art)
  │   │   └─ Test This Skin → Skin Dock shows character in-game
  │   │
  │   ├─ EQUIPMENT VARIANTS
  │   │   ├─ Same action tab strip (family picker)
  │   │   ├─ Per-family: AHSW matrix (24-cell grid)
  │   │   ├─ Shortcuts: Fill All Same, Fill Column, Fill Row, Link
  │   │   ├─ Each cell: Upload PNG → pipeline → editor → Save
  │   │   └─ Test → Skin Dock + equip/unequip to verify visual differences
  │   │
  │   └─ ITEMS & OBJECTS
  │       ├─ Item type selector: Inventory Icon / World Drop / UI Element
  │       ├─ Target filename input (grid-xxx / item-xxx)
  │       ├─ Simplified editor (no angles/frames/AHSW)
  │       └─ Test → inventory mock-up or world-drop preview
  │
  └─ LOAD EXISTING → file picker / session browser → resumes into correct mode
```

### What Does NOT Change

The core workbench authoring pipeline stays identical across all three modes:

- Upload PNG → pipeline converts to XP → Source Panel (sprite slicing) → Grid Panel
  (frame assignment) → Whole-Sheet XPEdit (cell editing) → Save / Export XP

The project type selector controls which **metadata** wraps around that pipeline:
template constraints, override name generation, available families, and downstream
test behavior. The pipeline itself is mode-agnostic.

### Aesthetic Notes (Design System Continuity)

- Cards use the existing `var(--panel)` / `var(--border)` / `var(--accent)` palette.
- Equipment matrix cells render as small canvases (same renderer as the frame grid)
  with AHSW filenames in `var(--muted)` mono text.
- "ADVANCED" pill uses the existing `warn` color (#ef6300) to signal effort, not danger.
- Greyed mount tabs use `opacity: 0.4` + `cursor: not-allowed`, matching existing
  `button:disabled` styling (styles.css:152).
- Item mode hides metadata/animation panels via the same `class="hidden"` pattern
  already used for `#wholeSheetPanel` and `#termppNativePanel`.
- No new fonts, no new colors, no new border radii. Everything inherits the existing
  DepartureMono industrial-terminal identity.

### Implementation Sizing (UX Layer Only)

| UX Change | Estimated Scope | Dependencies |
|-----------|----------------|-------------|
| Project type card selector | New HTML panel + ~80 lines CSS + JS click handlers | None — purely frontend, replaces template dropdown |
| Expanded action tab strip with mount placeholders | ~20 lines in `renderBundleActionTabs()` | None — disabled tabs, no backend needed |
| Equipment matrix panel | New HTML panel + ~200 lines JS for matrix state + fill/link logic | Backend: multi-session bundle support per family (currently one session per action) |
| Item mode simplified view | ~40 lines of visibility toggling | Backend: new template entries for grid-*/item-* dims, or template-less path |
| Mode-aware Skin Test Dock | ~30 lines to branch test behavior by project type | None for character skin; item preview needs new test harness |

The card selector and expanded tabs are pure frontend and can ship immediately. The equipment
matrix and item mode need the backend family/template expansion from the gap map above.

---

## Source Citations

| Claim | Source | Line(s) |
|-------|--------|---------|
| ENABLED_FAMILIES = {player, attack, plydie} | src/pipeline_v2/config.py | 38 |
| Bundle broadcasts ONE XP to all AHSW names | src/pipeline_v2/service.py | 2936-2946 |
| _action_override_names uses ternary W | src/pipeline_v2/service.py | 2772-2795 |
| _termpp_skin_override_names uses binary W | src/pipeline_v2/service.py | 59-64 |
| Native sandbox copies XP to all override names | src/pipeline_v2/service.py | 255-266 |
| Browser debug uses binary W loops | web/workbench.js | 29-52 |
| termpp_skin_lab.js uses binary names | runtime/termpp-skin-lab-static/termpp_skin_lab.js | 4-97 |
| injectBundleIntoWebbuild iterates per-action | web/workbench.js | 1291-1321 |
| No native layer builder for wolfie/wolack | src/pipeline_v2/service.py | 1495-1498 |
| Template registry has no wolfie/wolack | config/template_registry.json | 1-75 (entire file) |
| Runtime-relevant player AHSW sprites: 24 (ternary), excluding verifier artifact files | sprites/player-0000.xp … player-1112.xp | file count |
| Committed wolfie sprites: 24 (ternary) | sprites/wolfie-*.xp | file count |
| Committed wolack sprites: 8 (W≥1 ternary) | sprites/wolack-*.xp | file count |
| Committed attack sprites: 8 (W≥1 ternary) | sprites/attack-*.xp | file count |
