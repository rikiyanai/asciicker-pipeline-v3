# Bundle Animation Types — Complete Map

Date: 2026-03-20
Status: research
Purpose: Map all player/NPC animation types for future bundle template expansion

## AHSW Equipment State Encoding

Every character sprite uses the naming convention `{family}-{AHSW}.xp` where the
4-digit suffix encodes equipment state:

| Digit | Meaning | Values |
|-------|---------|--------|
| A | Armor   | 0 = none, 1 = wearing |
| H | Helmet  | 0 = none, 1 = wearing |
| S | Shield  | 0 = none, 1 = holding |
| W | Weapon  | 0 = none, 1 = melee, 2 = ranged/heavy |

W is ternary (0/1/2). A, H, S are binary (0/1).
Max combinations per family: 2 x 2 x 2 x 3 = 24 variants.

## Sprite Families

### Player Families (overrideable for custom skins)

| Family | Animation | Variants in repo | Dims (chars) | Angles | Frames | Layers | Notes |
|--------|-----------|------------------|--------------|--------|--------|--------|-------|
| `player-nude` | Idle/walk (undressed) | 1 | 126x72 | 8 | [1,8] | 3 | Special: no AHSW suffix |
| `player` | Idle/walk | 24 (W=0,1,2) | 126x80 | 8 | [1,8] | 4 | All equipment combos |
| `attack` | Attack swing | 8 (W=1 only) | 144x80 | 8 | [8] | 4 | Only exists when W>=1 (need weapon to attack) |
| `plydie` | Death | 24 (W=0,1,2) | 110x88 | 8 | [5] | 3 | All equipment combos |
| `wolfie` | Mount idle/walk | 24 (W=0,1,2) | 180x96(H=0)/104(H=1) | 8 | [1,8] | 3–7 | Mounted on wolf. cell 10×(12\|13). Layers vary by equip. |
| `wolack` | Mount attack | 8 (W=1 only) | 160x104 | 8 | [8] | 5–8 | Mounted attack. cell 10×13. Layers vary by equip. |

### NPC Families (also in sprites/)

| Family | Animation | Variants in repo | Notes |
|--------|-----------|------------------|-------|
| `bigbee` | NPC enemy | 24 (W=0,1,2) | 66x104 chars, 4-5 layers |

### Non-AHSW Sprites (items, UI, etc.)

| Pattern | Count | Examples |
|---------|-------|---------|
| `grid-*.xp` | 30 | Inventory grid icons (sword, apple, armor...) |
| `item-*.xp` | 27 | World-dropped item sprites |
| `keyb-*.xp` | 5 | Keyboard layout sprites |
| `font-1.xp` | 1 | Font atlas |
| Other | ~5 | `asciicker.xp`, `character.xp`, `fire.xp`, etc. |

## Current Bundle Template Coverage

### `player_native_full` (current)

The only bundle template currently used for acceptance testing:

| Action | Family | Reference XP | AHSW range label | Current server-side override names | Status |
|--------|--------|-------------|------------------|------------------------------------|--------|
| idle | `player` | `player-0100.xp` | `all_16` | `player-nude.xp` + `player-{AHSW}.xp` for A,H,S in `{0,1}` and W in `{0,1,2}` | Tested |
| attack | `attack` | `attack-0001.xp` | `weapon_gte_1` | `attack-{AHSW}.xp` for A,H,S in `{0,1}` and W in `{1,2}` | Tested |
| death | `plydie` | `plydie-0000.xp` | `all_16` | `plydie-{AHSW}.xp` for A,H,S in `{0,1}` and W in `{0,1,2}` | Tested |

**Important naming caveat:** `all_16` is now a legacy template label, not a literal count.
Current server-side bundle payload generation emits ternary weapon variants (`W=0/1/2`)
for enabled families via `_action_override_names()` in `src/pipeline_v2/service.py`.

**What "weapon_gte_1" means today:** Only AHSW combos where W >= 1 are generated. Current
server-side behavior emits both W=1 and W=2 names. Attack animations only exist with a
weapon equipped.

### What's missing from the bundle

| Family | Gap | Impact |
|--------|-----|--------|
| `player-nude` | Not in any bundle template | Undressed player (before equipping anything) not customizable |
| `wolfie` | Not in bundle | Mounted idle — player rides wolf with default skin when mounted |
| `wolack` | Not in bundle | Mounted attack — same as above |
| ~~Browser debug override parity~~ | ~~`?overridemode=` lists are still binary `0000..1111`~~ | **FIXED** (BUG-09) — all override paths now use ternary AHSW (W∈{0,1,2}) |
| `bigbee` | Not in bundle | NPC enemy — would need a separate NPC skin system |

## Override Modes in Code

All override-generation paths now use per-family AHSW semantics (BUG-09 fixed 2026-03-24).
Shared rule: `FAMILY_W_RANGE` — player/plydie/wolfie get W∈{0,1,2} (`all_16`),
attack/wolack get W∈{1,2} (`weapon_gte_1`).

### 1. Browser debug override modes in `web/workbench.js`

Query-param driven lists for the webbuild iframe (`?overridemode=`). Uses
`_ahswNamesForFamilies()` helper with per-family W ranges.

### Default "mounted" mode (65 names)
```
player-nude.xp
player-{AHSW}.xp   (24, W∈{0,1,2})
wolfie-{AHSW}.xp   (24, W∈{0,1,2})
wolack-{AHSW}.xp   (16, W∈{1,2})
```
Excludes attack/plydie to avoid destabilizing NPCs that share those filenames.

### `full_parity` mode (105 names)
```
player-nude.xp
player-{AHSW}.xp   (24, W∈{0,1,2})
attack-{AHSW}.xp   (16, W∈{1,2})
plydie-{AHSW}.xp   (24, W∈{0,1,2})
wolfie-{AHSW}.xp   (24, W∈{0,1,2})
wolack-{AHSW}.xp   (16, W∈{1,2})
```
WARNING: FS-global — NPCs sharing attack/plydie filenames inherit the custom skin.

### 2. Server-side bundle payload override names in `service.py`

This is the path used by the current bundle-native workbench acceptance flow:

- `all_16` emits W∈{0,1,2} for player/plydie (wolfie not yet in ENABLED_FAMILIES)
- `weapon_gte_1` emits W∈{1,2} for attack (wolack not yet in ENABLED_FAMILIES)
- Non-bundle generators now exactly match these semantics per-family

### 3. Native sandbox + termpp skin lab

`_termpp_skin_override_names()` and `DEFAULT_OVERRIDE_SETS` in `termpp_skin_lab.js` use
the same per-family rule (105 names). All paths are now at parity.

**Open residual:** Committed native attack/wolack sprites on disk have W=1 only, while the
generated override contract includes W∈{1,2}. This is an inherited runtime-truth question.

## Gameplay Trigger Map

| State | Sprite loaded | Triggered by |
|-------|--------------|--------------|
| Nude/spawn | `player-nude.xp` | Initial spawn before any equipment |
| Idle/walk | `player-{AHSW}.xp` | Standing, walking (equipment-dependent) |
| Attack | `attack-{AHS1}.xp` or `attack-{AHS2}.xp` | Attacking with weapon equipped |
| Death | `plydie-{AHSW}.xp` | Player dies |
| Mounted idle | `wolfie-{AHSW}.xp` | Riding mount, idle/walking |
| Mounted attack | `wolack-{AHS1}.xp` | Riding mount, attacking |
| Item pickup | Changes AHSW state | Equipping armor/helmet/shield/weapon |

When the player picks up a sword: the game switches from `player-0000.xp` to
`player-0001.xp` (W=0→1). If `player-0001.xp` wasn't overridden by the bundle,
it falls back to the built-in WASM data package version.

## Recommended Future Bundle Expansions

This research note separates two different planning axes that should not be collapsed:

1. **Runtime-family expansion**
   - which filename families are authorable/overrideable at all
   - e.g. `player-nude`, `player`, `attack`, `plydie`, `wolfie`, `wolack`

2. **Gameplay/state coverage**
   - when the runtime switches between those families/variants
   - e.g. mounted vs unmounted, nude/spawn vs equipped, attack/death,
     AHSW equipment transitions, and separate non-player item/UI tracks

These are related, but not interchangeable. A bundle can include more families
without yet covering all gameplay transitions, and vice versa.

### Priority 1: Mount support (wolfie + wolack)
- Already in the default override set (65 names in mounted mode: 24 wolfie + 16 wolack + player)
- Gives full coverage for mounted gameplay
- 32 committed sprites (24 wolfie + 8 wolack); override names cover 40 per-family-semantic slots
- Different dimensions from player: wolfie 180×(96|104), wolack 160×104
- Variable layer counts: wolfie 3–7, wolack 5–8 (driven by equipment overlays)
- Would need new template entries in `config/template_registry.json` with per-variant dimension/layer handling

### ~~Priority 2: Browser debug override parity~~ — DONE (BUG-09 fixed 2026-03-24)
- All override paths now use ternary AHSW (W∈{0,1,2})
- Browser debug, native sandbox, and termpp skin lab all match bundle payload behavior

### Priority 3: player-nude
- Single file, simple addition
- Covers the naked spawn state
- Different dimensions (126x72 vs 126x80) — may need template adjustment

### Priority 4: NPC skins (bigbee etc.)
- Would need a separate template family and NPC-aware override system
- Risk: FS-global overrides affect all entities sharing a filename
- Lower priority — player skin is the core use case

## Explicit Product/Roadmap Questions Still Open

- If a user adds a new PNG sprite, must they manually recreate every mounted/unmounted
  and equipment-state variant, or can some runtime states legally reuse/derive from
  a smaller authored subset?
- Are helmet/armor/shield/weapon states effectively layer/state differences inside
  the player-family contract, or do some equipment classes require distinct authored
  families/assets?
- What is the minimum truthful contract for template-less native-runtime apply, as
  distinct from browser/webbuild debug injection?
- Which missing family/state combinations are blocking for “full player-state parity,”
  and which are acceptable fallback-to-native behavior?

## Source Files

- Template registry: `config/template_registry.json`
- Enabled families: `src/pipeline_v2/config.py` → `ENABLED_FAMILIES`
- Bundle payload override generation: `src/pipeline_v2/service.py` → `_action_override_names()`
- Browser debug override lists: `web/workbench.js` lines 26-49
- Runtime override sets: `runtime/termpp-skin-lab-static/termpp_skin_lab.js`
- Override name validation: `web/workbench.js` line 1005 (regex)
- Committed sprites: `sprites/*.xp` (170+ files)
