---
title: "feat: UQ-004 deletion-first closeout — delete FAMILY_W_RANGE maps, derive from registry prefix_catalog"
type: feat
status: active
date: 2026-04-29
origin: docs/plans/2026-04-29-002-feat-uq004-backend-authority-cleanup-plan.md
---

# feat: UQ-004 deletion-first closeout — delete FAMILY_W_RANGE maps, derive from registry prefix_catalog

## Summary

Delete all four hardcoded `FAMILY_W_RANGE` / `_FAMILY_W_RANGE` maps that duplicate
registry `ahsw_range`, add `ahsw_range` to `prefix_catalog` entries in the registry
so mounted prefixes have a derivable source, wire a normalizer drift-check so
action-level `ahsw_range` cannot silently diverge from the prefix authority, and
replace every override-name consumer with one registry-derived path. This is the
last second-authority duplicate blocking `UQ-004` PASS and `UQ-010` thin-client
synchrony.

---

## Problem Frame

Four identical hardcoded maps (`FAMILY_W_RANGE` in `web/workbench.js`,
`web/termpp_skin_lab.js`, `runtime/termpp-skin-lab-static/termpp_skin_lab.js`;
`_FAMILY_W_RANGE` in `src/pipeline_v2/service.py`) encode per-prefix weapon-digit
ranges (`all_16` vs `weapon_gte_1`) that the registry already expresses at the
template-set action level via `ahsw_range`. Every override-name generation path
reads from a local hardcoded map instead of the registry. This is the last
surviving second-authority structure that prevents `UQ-004` closure. The
deletion-first architecture law requires the old maps to be deleted before any
replacement becomes authoritative.

(see origin: `docs/plans/2026-04-29-002-feat-uq004-backend-authority-cleanup-plan.md`,
Review Correction section)

---

## Requirements

- R1. All four hardcoded `FAMILY_W_RANGE` / `_FAMILY_W_RANGE` maps are deleted from source
- R2. Every override-name generation path derives from registry `prefix_catalog[prefix].ahsw_range`
- R3. The normalizer drift-checks action-level `ahsw_range` against `prefix_catalog` authority — action-level stays as mirror-only data, not a second authority
- R4. Regression tests prove backend and browser/runtime override-name paths cannot silently drift from registry `ahsw_range`
- R5. No new shared helper is added while any of the four old maps still exists as live fallback authority (deletion-first sequencing)

---

## Scope Boundaries

- Only the five live override prefixes get `ahsw_range` in `prefix_catalog`: player, attack, plydie, wolfie, wolack
- `bigbee` is deferred — do not guess its `ahsw_range` from runtime_role
- Action-level `ahsw_range` in template_sets stays as mirror-only data, verified by drift-check
- `_action_override_names(family, ahsw_range)` signature and logic are unchanged — callers already pass `ahsw_range` from the (now drift-checked) action spec
- Browser-side gating logic (`isTemplateActionAuthorable()` / `getEnabledActions()`) is unchanged
- `isSafePlayerOverride` regex in `normalizeWebbuildOverrideNames()` still hardcodes prefix names in a safety filter — this is a security concern, not an authority concern, and is out of scope for this plan
- `OVERRIDE_MODE` selection logic (full_parity vs mounted) is restructured to derive family lists from registry but the mode semantics are unchanged

### Deferred to Follow-Up Work

- Removal of action-level `ahsw_range` from `template_registry.json` (if desired after drift-check proves sufficient)
- Adding `ahsw_range` to deferred prefixes like `bigbee` (verify against actual sprites first)
- Y9-2 thin-client wiring (`UQ-010`) — unblocked by this plan but separate scope

---

## Context & Research

### Relevant Code and Patterns

- `src/pipeline_v2/service.py:79-85` — `_FAMILY_W_RANGE` dict (deletion target)
- `src/pipeline_v2/service.py:89-98` — `_termpp_skin_override_names()` consuming the dict, called at lines 290 and 3819
- `src/pipeline_v2/service.py:3832-3855` — `_action_override_names(family, ahsw_range)` — already registry-derived, stays unchanged
- `src/pipeline_v2/service.py:1036-1102` — `_normalize_template_registry()` with existing drift-check pattern at lines 1086-1093
- `web/workbench.js:30-33` — `FAMILY_W_RANGE` const (deletion target)
- `web/workbench.js:34-57` — `_ahswNamesForFamilies()` and `WEBBUILD_DEFAULT_OVERRIDE_NAMES` IIFE
- `web/workbench.js:7286-7309` — `fetchTemplateRegistry()` — async fetch, caches in `state.templateRegistry`
- `web/termpp_skin_lab.js:5-8` — `FAMILY_W_RANGE` (deletion target, identical to runtime copy)
- `runtime/termpp-skin-lab-static/termpp_skin_lab.js:5-8` — `FAMILY_W_RANGE` (deletion target, identical to web copy)
- `config/template_registry.json:40-146` — `prefix_catalog` entries (schema extension target)
- `config/template_registry.json:174,207,231,256` — existing action-level `ahsw_range` values

### Institutional Learnings

- BUG-09 (PLAYWRIGHT_FAILURE_LOG.md line 7348) originally introduced the four FAMILY_W_RANGE maps as a fix for W-encoding mismatch. The maps were necessary scaffolding at the time but were always intended as temporary — the canon explicitly calls them out as second authorities that must not remain after UQ-004.
- The normalizer drift-check pattern (lines 1086-1093 in service.py) is the established way to catch prefix/action divergence for fields like `filename_prefix`, `skin_family`, `preview_xp`. Adding `ahsw_range` to the same check is consistent.

---

## Key Technical Decisions

- **`prefix_catalog.ahsw_range` is the new authority**: The prefix entry — not the action spec, not a hardcoded map — is the single owner of per-prefix W range. Action-level `ahsw_range` is mirror data verified by the normalizer drift-check. This means `_action_override_names()` callers that read `ahsw_range` from the action spec are still correct (the normalizer guarantees the value matches prefix authority), but no code path reads W range from a hardcoded map.
- **Override-name generation reads prefix_catalog, not template_sets**: `_termpp_skin_override_names()` and its JS equivalents iterate `prefix_catalog` entries that have `ahsw_range`, calling `_action_override_names()` per entry. This naturally includes mounted prefixes (wolfie/wolack) and naturally excludes deferred ones (bigbee, which lacks the field).
- **On-demand fetch in workbench.js**: `WEBBUILD_DEFAULT_OVERRIDE_NAMES` cannot be a module-load IIFE because the registry is fetched async. It becomes an async function that calls `await fetchTemplateRegistry()` on demand, ensuring the registry is loaded before deriving names. This is necessary because `fetchTemplateRegistry()` is not called during page init — only on template selection — but override names may be needed earlier (user uploads skin directly).
- **Skin lab pages fetch the registry**: Both `termpp_skin_lab.js` copies gain a `fetch()` call to `/api/workbench/templates` at page load. Override sets are computed after the fetch succeeds. If the fetch fails (standalone/offline use), a safe fallback using `all_16` for all known prefixes provides correct-or-overshoot names.
- **Both termpp_skin_lab.js copies stay identical**: The web-served and runtime-static copies receive the same changes and remain byte-identical.

---

## Open Questions

### Decided During Planning

- **Should bigbee get ahsw_range?** No — user confirmed: do not guess deferred prefixes from runtime_role. Only the 5 live override prefixes get the field. bigbee stays without it until its sprites are explicitly verified.
- **Should action-level ahsw_range be removed from template_registry.json?** No — keep it as mirror-only data, verified by drift-check. Removing it would be a separate cleanup that doesn't affect authority.
- **How does the skin lab page get registry access?** Fetch from `/api/workbench/templates`. Both copies run when the pipeline server is active. Fallback for offline/standalone use generates override names with `all_16` for all 5 prefixes (safe overshoot).

### Deferred to Implementation

- Exact shape of the async override-name computation in workbench.js — whether `normalizeWebbuildOverrideNames` becomes fully async or whether the async fetch is hoisted to a caller that passes results down synchronously
- Whether the skin lab fallback override set should be computed from a hardcoded prefix list or embedded as a static array — implementation will determine the most maintainable shape

---

## Implementation Units

- U1. **Add ahsw_range to prefix_catalog and wire normalizer drift-check**

**Goal:** Make `prefix_catalog` entries the authority for per-prefix W range and ensure action-level `ahsw_range` cannot drift from it.

**Requirements:** R2, R3

**Dependencies:** None

**Files:**
- Modify: `config/template_registry.json`
- Modify: `src/pipeline_v2/service.py` (`_normalize_template_registry()`)
- Test: `tests/test_template_registry_schema.py`

**Approach:**
- Add `"ahsw_range": "all_16"` to player, plydie, wolfie entries in `prefix_catalog`
- Add `"ahsw_range": "weapon_gte_1"` to attack, wolack entries in `prefix_catalog`
- Do NOT add `ahsw_range` to bigbee (deferred)
- In `_normalize_template_registry()`, add `"ahsw_range"` to the drift-check field list at the existing loop (line 1086). When a prefix_catalog entry has `ahsw_range` and a linked action spec also has `ahsw_range`, the normalizer verifies they match (ValueError on mismatch)

**Patterns to follow:**
- Existing drift-check pattern at `service.py:1086-1093` — field-by-field equality check between prefix_catalog and linked action spec

**Test scenarios:**
- Happy path: registry loads cleanly with matching ahsw_range in both prefix_catalog and action specs — no error
- Edge case: prefix_catalog entry has `ahsw_range: "all_16"` but linked action spec has `ahsw_range: "weapon_gte_1"` — ValueError raised with drift message
- Edge case: prefix_catalog entry has no `ahsw_range` (bigbee) — no drift-check for ahsw_range on that entry, load succeeds
- Edge case: action spec has `ahsw_range` but prefix_catalog entry does not — no check (only checks when prefix has the field)
- Happy path: all 5 live prefixes have ahsw_range after load — prefix_catalog is the sole authority
- Edge case: wolfie/wolack have `template_actions: []` — drift-check loop body never executes for them, so their `ahsw_range` is sole-source with no cross-validation. This is acceptable: they have no linked actions to drift against. The test should document this explicitly rather than implying uniform coverage across all 5 prefixes

**Verification:**
- `config/template_registry.json` has `ahsw_range` on exactly the 5 live override prefixes
- Normalizer raises on ahsw_range mismatch between prefix and linked action (player/attack/plydie only — wolfie/wolack have no linked actions)
- Existing tests pass (schema validation, reference paths, authorization)

---

- U2. **Delete _FAMILY_W_RANGE from service.py, derive override names from registry**

**Goal:** Remove the backend hardcoded map and make `_termpp_skin_override_names()` registry-derived.

**Requirements:** R1, R2, R5

**Dependencies:** U1

**Files:**
- Modify: `src/pipeline_v2/service.py`
- Test: `tests/test_template_registry_schema.py`

**Approach:**
- Delete `_FAMILY_W_RANGE` dict (lines 79-86)
- Change `_termpp_skin_override_names()` signature to accept the loaded registry. Add `player-nude.xp` unconditionally at the start of the output list (matching old behavior at line 91, outside the loop). Then iterate `prefix_catalog` entries that have `ahsw_range`, calling `_action_override_names(prefix, ahsw_range)` for each. `_action_override_names` also adds `player-nude.xp` for the player prefix, but the existing dedup in callers handles this
- Update the two call sites:
  - `_stage_termpp_skin_sandbox()` (line 290): pass the already-loaded registry
  - `workbench_web_skin_bundle_payload()` (line 3819): pass the already-loaded registry
- Verify: `grep -r '_FAMILY_W_RANGE' src/` returns zero matches after deletion

**Execution note:** Delete the map FIRST, then update the function and callers. Compilation/import errors from the deletion are the proof that the old authority is gone before any replacement is wired.

**Patterns to follow:**
- Existing `_action_override_names(family, ahsw_range)` at service.py:3832 — already takes registry-derived values
- Existing `load_template_registry()` global cache pattern

**Test scenarios:**
- Happy path: `_termpp_skin_override_names(registry)` returns the same 105 names as the old hardcoded path (player: 24+nude, attack: 16, plydie: 24, wolfie: 24, wolack: 16)
- Edge case: registry with only 3 authorable prefixes (wolfie/wolack removed from prefix_catalog in test fixture) — returns only names for those 3
- Edge case: changing `ahsw_range` for attack from `weapon_gte_1` to `all_16` in a test fixture — attack gets 24 names instead of 16, proving the function derives from registry
- Error path: empty registry (no prefix_catalog) — returns `["player-nude.xp"]` only (graceful degrade)
- Integration: `_FAMILY_W_RANGE` does not exist anywhere in `src/` directory

**Verification:**
- `_FAMILY_W_RANGE` is deleted from `service.py`
- Both callers pass registry to `_termpp_skin_override_names()`
- Override names are derived from `prefix_catalog[prefix].ahsw_range`
- Changing the registry changes the names (no hidden hardcoded fallback)

---

- U3. **Delete FAMILY_W_RANGE from workbench.js, derive from registry**

**Goal:** Remove the browser hardcoded map and make override-name generation registry-derived via the already-loaded `state.templateRegistry`.

**Requirements:** R1, R2, R5

**Dependencies:** U1

**Files:**
- Modify: `web/workbench.js`
- Test: `tests/web/workbench-override-names.test.js` (new)

**Approach:**
- Delete `FAMILY_W_RANGE` const (lines 30-33)
- Modify `_ahswNamesForFamilies(families)` to accept the registry and derive W range from `prefix_catalog[prefix].ahsw_range` instead of the hardcoded map. Fallback: if the prefix lacks `ahsw_range` in prefix_catalog, use `all_16` (safe overshoot, matches existing `|| [0, 1, 2]` default)
- Replace the synchronous `WEBBUILD_DEFAULT_OVERRIDE_NAMES` IIFE with an async function (e.g., `getWebbuildDefaultOverrideNames()`) that calls `await fetchTemplateRegistry()` to ensure the registry is loaded, then reads `prefix_catalog` to determine which prefixes to include based on `OVERRIDE_MODE`:
  - `full_parity`: all prefix_catalog entries with `ahsw_range`
  - default (mounted): player + mounted prefixes with `ahsw_range`
- The on-demand `fetchTemplateRegistry()` call is critical: the registry is NOT fetched during page init — it's only fetched when the user selects a template (line 7622). Override names may be needed before that (e.g., user uploads a skin XP directly). The async function ensures the registry is loaded before deriving names, rather than hoping it was already loaded
- Update both use sites (line 1262 in `normalizeWebbuildOverrideNames`, line 1562 in `applyUploadedXpBytesToWebbuild`) to `await` the new function. `normalizeWebbuildOverrideNames` becomes async — trace callers to ensure they await it
- Verify: `grep 'FAMILY_W_RANGE' web/workbench.js` returns zero matches after deletion

**Patterns to follow:**
- Existing `fetchTemplateRegistry()` — `state.templateRegistry` caching pattern
- Existing `state.templateRegistry.prefix_catalog` access in other workbench functions

**Test scenarios:**
- Happy path: after registry loads, override names match the expected 105-name (full_parity) or 65-name (mounted) sets
- Edge case: registry not yet loaded when override names requested — function triggers `fetchTemplateRegistry()` on demand, waits for result, then derives names (no silent empty-array regression)
- Edge case: prefix in prefix_catalog without ahsw_range (bigbee) — excluded from override names (no ahsw_range = no override generation)
- Edge case: OVERRIDE_MODE=full_parity includes all 5 override prefixes from prefix_catalog
- Edge case: OVERRIDE_MODE=mounted includes only player + mounted prefixes from prefix_catalog
- Integration: `FAMILY_W_RANGE` does not exist in `web/workbench.js`

**Verification:**
- `FAMILY_W_RANGE` is deleted from `workbench.js`
- Override names are derived from `state.templateRegistry.prefix_catalog`
- Both override mode paths (full_parity, mounted) correctly filter from registry

---

- U4. **Delete FAMILY_W_RANGE from both termpp_skin_lab.js copies, derive from registry**

**Goal:** Remove the hardcoded map from both identical skin lab copies and derive override sets from the server registry.

**Requirements:** R1, R2, R5

**Dependencies:** U1

**Files:**
- Modify: `web/termpp_skin_lab.js`
- Modify: `runtime/termpp-skin-lab-static/termpp_skin_lab.js`

**Approach:**
- Delete `FAMILY_W_RANGE` const (lines 5-8) from both files
- Only `player_common` in `DEFAULT_OVERRIDE_SETS` uses `FAMILY_W_RANGE`. The other modes (`single_player_nude` and `all_visible_test`) are static constant arrays — they remain synchronous and unchanged
- Replace the `player_common` computation with an async init pattern:
  - Add a `_fetchOverrideConfig()` function that fetches `/api/workbench/templates`, reads `prefix_catalog`, extracts entries with `ahsw_range`, and returns `{prefix, ahsw_range}` pairs
  - Compute `DEFAULT_OVERRIDE_SETS.player_common` after the fetch succeeds using the registry-derived W ranges
  - On fetch failure: use a safe fallback that generates `all_16` names for the 5 known prefixes (correct-or-overshoot, matches the pre-existing `|| [0, 1, 2]` default behavior)
- `selectedOverrideNames()` must handle the case where `player_common` mode is selected but the async init hasn't finished yet — guard with a loading state or defer the call until init succeeds
- Keep `_ahswNames()` as the AHSW expansion helper but change it to accept `{prefix, wRange}` pairs instead of looking up from a hardcoded map
- Both files receive identical changes and remain byte-identical
- Verify: `grep 'FAMILY_W_RANGE' web/termpp_skin_lab.js runtime/termpp-skin-lab-static/termpp_skin_lab.js` returns zero matches

**Patterns to follow:**
- Existing fetch pattern in `workbench.js:fetchTemplateRegistry()`
- Existing `setStatus()` / `setWebbuildState()` feedback pattern in the skin lab

**Test scenarios:**
- Happy path: skin lab page loads, fetches registry, computes `player_common` with correct 105 names
- Edge case: server unavailable — fallback generates 105 names using `all_16` for all 5 prefixes (overshoot for attack/wolack, but safe — extra override files are harmless)
- Edge case: registry response missing prefix_catalog — fallback path activates
- Integration: both copies remain byte-identical after changes
- Integration: `FAMILY_W_RANGE` does not exist in either file

**Verification:**
- `FAMILY_W_RANGE` is deleted from both copies
- Override sets derive from registry `prefix_catalog` on successful fetch
- Fallback on fetch failure is safe (all_16 overshoot)
- Both copies are identical

---

- U5. **Regression tests proving registry derivation and no drift**

**Goal:** Add test coverage that proves override-name paths cannot silently drift from registry `ahsw_range` — the test fails if a code path generates names from anything other than the registry.

**Requirements:** R4

**Dependencies:** U1, U2, U3

**Files:**
- Test: `tests/test_template_registry_schema.py`
- Test: `tests/web/workbench-override-names.test.js` (new)

**Approach:**
- **Backend (pytest):**
  - Test that `_termpp_skin_override_names(registry)` output exactly matches `_action_override_names(prefix, ahsw_range)` applied to each prefix_catalog entry with `ahsw_range`
  - Test that mutating `prefix_catalog["attack"].ahsw_range` to `"all_16"` changes the override name count for attack (proves derivation, not hardcoding)
  - Test that removing `ahsw_range` from a prefix_catalog entry removes that prefix's names from the output
  - Test that the normalizer drift-check catches ahsw_range mismatch between prefix and action
- **Browser (node test):**
  - Extract `_ahswNamesForFamilies` (or its replacement) into a testable form
  - Test that passing a mock registry with known ahsw_range values produces the expected name sets
  - Test that changing ahsw_range in the mock changes the output (proves derivation)
  - Test that prefixes without ahsw_range are excluded

**Patterns to follow:**
- Existing `tests/test_template_registry_schema.py` fixture pattern with `_reset_template_registry_cache()`
- Existing `tests/web/workbench-template-gating.test.js` TestRunner/expect harness

**Test scenarios:**
- Happy path (backend): override names from registry match expected counts — player:25, attack:16, plydie:24, wolfie:24, wolack:16 = 105 total
- Mutation test (backend): change attack ahsw_range to all_16 — attack count becomes 24, total becomes 113
- Deletion test (backend): remove wolfie ahsw_range — wolfie excluded, total drops to 81
- Drift test (backend): set prefix attack.ahsw_range to all_16 while action has weapon_gte_1 — normalizer raises ValueError
- Happy path (browser): mock registry — expected name arrays
- Mutation test (browser): change mock registry — output changes correspondingly

**Verification:**
- All regression tests pass
- Tests prove derivation from registry (not hardcoding) via mutation
- Tests prove drift-check catches mismatches

---

- U6. **Doc updates — failure log, canonical spec, and existing plan**

**Goal:** Update the three authority docs to reflect code state, proof state, and queue status after the deletion-first closeout.

**Requirements:** (doc accuracy)

**Dependencies:** U1, U2, U3, U4, U5

**Files:**
- Modify: `docs/PLAYWRIGHT_FAILURE_LOG.md`
- Modify: `docs/plans/2026-03-23-workbench-canonical-spec.md`
- Modify: `docs/plans/2026-04-29-002-feat-uq004-backend-authority-cleanup-plan.md`

**Approach:**
- **PLAYWRIGHT_FAILURE_LOG.md:** Add a new audit entry recording that all four `FAMILY_W_RANGE` / `_FAMILY_W_RANGE` owners have been deleted, override-name generation now derives from registry `prefix_catalog.ahsw_range`, and the normalizer drift-check is wired. Update the "Still not claimed" section to remove the `FAMILY_W_RANGE` deletion items. State clearly whether `UQ-004` is now PASS or still OPEN (and if still OPEN, what remains). Reference evidence (commit hash, FL entry ID).
- **Canonical spec (2026-03-23):** Update the UQ-004 row in the Unified Queue table to reflect the new state. Update the "Classic/runtime AHSW range truth" row in the section 2.5.1 remaining-gap table. Update Locked Design Decision #10 to note that `FAMILY_W_RANGE` maps have been deleted and `prefix_catalog.ahsw_range` is now the authority.
- **Existing plan (2026-04-29-002):** Update the Review Correction section to note that the four deletion targets have been addressed by this closeout plan. Update status if appropriate.

Test expectation: none — doc-only changes

**Verification:**
- All three docs accurately reflect the post-closeout code state
- No stale claims about `FAMILY_W_RANGE` still existing
- UQ-004 status correctly reflects current proof state
- Status claims have evidence refs (commit hashes or FL entry IDs)

---

## System-Wide Impact

- **Interaction graph:** `_termpp_skin_override_names()` is called by `_stage_termpp_skin_sandbox()` (native preview) and `workbench_web_skin_bundle_payload()` (web skin API). Both callers already have registry access through the global `load_template_registry()` cache. `_action_override_names()` is called by `workbench_export_bundle()` for per-action names — this path is unchanged (it already reads `ahsw_range` from the action spec). No callbacks, observers, or middleware involved.
- **Error propagation:** A missing `ahsw_range` in `prefix_catalog` means that prefix is excluded from override-name generation (graceful degrade, not crash). A drift between prefix and action `ahsw_range` raises `ValueError` at registry load time (fail-fast during server startup).
- **State lifecycle risks:** `_template_registry` is a global cache populated once at first access. Adding a field to the cached JSON adds no lifecycle risk. The async override-name function in workbench.js calls `await fetchTemplateRegistry()` on demand, which loads-and-caches the registry if not already loaded. `normalizeWebbuildOverrideNames` becomes async, requiring callers to await it — trace the call chain to ensure no synchronous caller is broken.
- **API surface parity:** No API response shape changes. The web skin payload response already includes `override_names` computed by `_termpp_skin_override_names()` — the values change only in that they now derive from registry instead of a hardcoded map (identical results for current registry state).
- **Unchanged invariants:** `_action_override_names(family, ahsw_range)` signature and logic unchanged. `isTemplateActionAuthorable()` and `getEnabledActions()` unchanged. `is_action_authorized()` and `is_prefix_authorized()` unchanged. Override mode semantics (full_parity vs mounted) unchanged — only the source of family lists and W ranges changes.

---

## Risks & Dependencies

| Risk | Mitigation |
|------|------------|
| Skin lab page can't fetch registry when opened offline/standalone | Safe fallback: generate all_16 for all 5 known prefixes. Produces more names than needed for attack/wolack (24 vs 16) but doesn't miss any — runtime ignores files that don't exist |
| Override names requested before registry is loaded | The async replacement function calls `await fetchTemplateRegistry()` on demand, ensuring the registry is loaded before deriving names. If the fetch itself fails (network error), warn via `status()` and fall back to all_16 for known prefixes (safe overshoot) |
| Normalizer drift-check could break on future registry edits where someone changes action ahsw_range without updating prefix | This is the intended behavior — the drift-check catches the mistake immediately at load time. The error message names both the prefix and the drifted action |
| `_termpp_skin_override_names()` now takes a registry parameter, changing its call signature | Only 2 internal call sites, both already have registry access. No external API change |
| `isSafePlayerOverride` regex in `normalizeWebbuildOverrideNames()` still hardcodes prefix names | Noted as out-of-scope. This is a security safety filter, not an authority source. It doesn't generate names or determine W ranges — it only filters which injected names are allowed |

---

## Sources & References

- **Origin document:** [docs/plans/2026-04-29-002-feat-uq004-backend-authority-cleanup-plan.md](docs/plans/2026-04-29-002-feat-uq004-backend-authority-cleanup-plan.md) — Review Correction section identifying the four deletion targets
- **Spec authority:** [docs/plans/2026-03-23-workbench-canonical-spec.md](docs/plans/2026-03-23-workbench-canonical-spec.md) — section 2.5.2 Locked Design Decision #10 (ahsw_range authority), Unified Queue UQ-004
- **Failure log authority:** [docs/PLAYWRIGHT_FAILURE_LOG.md](docs/PLAYWRIGHT_FAILURE_LOG.md) — "Audit — UQ-004 Deletion-First Restatement" entry
- Related code: `src/pipeline_v2/service.py:3832` (`_action_override_names` — the already-correct registry-derived path)
- Related code: `web/workbench-template-gating.js:34-58` (`isTemplateActionAuthorable` — unchanged, already correct)
- Related code: `config/template_registry.json` (registry authority)
- BUG-09 history: PLAYWRIGHT_FAILURE_LOG.md line 7348 (original introduction of FAMILY_W_RANGE maps)
