# Original Asciicker Game Asset Layering

This note captures what the original `msokalski/asciicker` code actually does
with sprite XP layers. The important conclusion is that XP layers are an
import-time metadata and precomposition contract, not a runtime body/mount/gear
ownership system.

## Primary source files

- `sprite.cpp`
- `sprite.h`
- `game.cpp`
- `game.h`

Reference clone used for this note:

- `https://github.com/msokalski/asciicker`

Key source locations:

- `sprite.cpp`: `LoadSprite(...)`
- `game.cpp`: `LoadSprites()` and `GetSprite(...)`
- `game.h`: `ACTION`, `WEAPON`, `SHIELD`, `HELMET`, `ARMOR`, `MOUNT`, `SpriteReq`

## Loader contract

The original loader in `sprite.cpp` hardcodes a three-layer minimum:

- `layer0`: metadata and color-key source
- `layer1`: per-cell height or depth encoded in glyph digits
- `layer2`: visible image map

Any XP layers above `2` are merged into `layer2` during `LoadSprite()`.
Runtime does not preserve those extra authoring layers as separate live owners.

Two more details matter:

- `layer0` also drives angles, animation lengths, projection or reflection
  layout, reference points, and `meta_xy`
- the last extra layer can use a special cyan-highlight merge path for attack or
  swoosh-like overlays

## Runtime contract

The original runtime does not compose a mounted character from separate XP
layers. Instead, `game.cpp` selects one already-loaded sprite family from a
`SpriteReq`:

- `kind`
- `mount`
- `action`
- `armor`
- `helmet`
- `shield`
- `weapon`

`GetSprite(...)` chooses one family asset such as:

- `player`
- `attack`
- `plydie`
- `wolfie`
- `wolack`
- `bigbee`

That means mount, action, and equipment variation are represented mostly by
choosing a different whole-sheet XP file, not by live runtime stacking of body,
mount, and weapon layers.

## Filename axes

For the main combinatorial families, the original code uses four suffix digits:

- `a`: armor, `0 none`, `1 regular`
- `h`: helmet, `0 none`, `1 regular`
- `s`: shield, `0 none`, `1 regular`
- `w`: weapon, `0 none`, `1 sword`, `2 crossbow`

Examples:

- `player-1012.xp` = armor on, helmet off, shield on, crossbow
- `wolfie-1111.xp` = mounted wolf idle or move with armor, helmet, shield, sword
- `wolack-1111.xp` = mounted wolf melee attack with armor, helmet, shield, sword

Crossbow attack is a special case. The original `GetSprite(...)` falls back to
the idle family for crossbow attack instead of using the attack family.

## Family worksheet

| Family | Runtime meaning in original game | File pattern | Layer range | Why it has that shape |
| --- | --- | --- | --- | --- |
| `player` | Human on foot, idle or move | `player-ahsw.xp` | `3-6` | Base three-layer engine contract plus extra premerge passes for equipment overlap |
| `attack` | Human on foot, melee attack | `attack-ahs1.xp` | `4-6` | Attack sheets need extra overlay passes; some final layers use the cyan highlight path |
| `plydie` | Human fall, dead, stand | `plydie-ahsw.xp` | `3-6` | Death and fall variants of the same equipment matrix |
| `wolfie` | Human mounted on wolf, idle or move | `wolfie-ahsw.xp` | `3-7` | Mounted rider plus gear overlap requires more authoring passes than on-foot idle |
| `wolack` | Human mounted on wolf, melee attack | `wolack-ahs1.xp` | `5-8` | Deep mounted attack composites; extra layers are precomposition helpers, not runtime owners |
| `bigbee` | Human mounted on bee, idle or move | `bigbee-ahsw.xp` | `3-8` | Same mounted-equipment matrix as wolf, with some sheets needing many merge passes |
| `wolfie.xp` | Bare wolf creature, `kind=WOLF` | single file | `3` | Minimal creature sheet using only the required metadata or image layers |
| `bigbee.xp` | Bare bee creature, `kind=BEE` | single file | `3` | Same minimum contract as bare wolf |
| `player-nude.xp` | Special standalone player asset | single file | `3` | Separate asset outside the normal equipment matrix |
| `item-*` | World item sprites | single-purpose files | `3` | No need for extra composite passes |
| `grid-*` | Inventory grid icons | single-purpose files | `3` | Simple icon sheets |
| `keyb-*`, `character.xp`, `inventory.xp`, `fire.xp`, `font-1.xp`, `desert_plants.xp`, `enemygen.xp`, `asciicker.xp` | UI, world, or support sheets | single files | mostly `3` | Standard metadata plus height plus image contract |
| `gamepad.xp` | Controller or UI sheet | single file | `4` | One extra authoring pass |

## Verified layer-count ranges from the original repo

- `player`: `3-6`
- `attack`: `4-6`
- `plydie`: `3-6`
- `wolfie`: `3-7`
- `wolack`: `5-8`
- `bigbee`: `3-8`
- `item-*`: `3`
- `grid-*`: `3`
- `keyb-*`: `3`
- `gamepad.xp`: `4`
- most other support sheets: `3`

Important correction:

- `wolfie` does not reach `8` layers in the original repo snapshot inspected
- `wolack` and `bigbee` are the families that reach `8`

## Architectural takeaway

If we want to match original Asciicker honestly, we should not read extra XP
layers as native runtime owners. In the original game they are:

1. engine metadata layers
2. base image data
3. extra authoring-time composite passes merged at load

The runtime owner is the selected sprite family asset, not the raw XP layer
stack.

## Known gap in the original code

`LoadSprites()` allocates mounted fall-family arrays, but the original source
leaves them unset:

- `wolfie_fall[...] = 0`
- `bigbee_fall[...] = 0`

So mounted fall, dead, and stand paths do not have a real mounted-fall asset
family behind them in the inspected original code.
