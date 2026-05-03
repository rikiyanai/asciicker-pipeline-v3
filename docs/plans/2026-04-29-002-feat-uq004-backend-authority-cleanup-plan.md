---
title: "feat: UQ-004 backend authority cleanup — replace ENABLED_FAMILIES with registry-derived truth"
type: feat
status: active
date: 2026-04-29
---

# feat: UQ-004 backend authority cleanup — replace ENABLED_FAMILIES with registry-derived truth

## Summary

Replace the hardcoded `ENABLED_FAMILIES` gate in `service.py` with one registry-derived authority helper that consumes the full normalized contract (`filename_prefix`, `skin_family`, `skin_family_scope`, `prefix_catalog`), demote the compat `family` field in sessions to mirror-only data, and make registry load/fetch failures operator-visible and fail-closed in both backend API responses and the browser's `fetchTemplateRegistry()` path.

---

## Review Correction — 2026-04-29

Post-landing execution review found two parity bugs in the first `e40adda`
slice:

- backend template-driven authorization initially skipped template-set
  `skin_family_scope` and `prefix_catalog.template_actions` linkage
- legacy family-only sessions still loaded with empty `skin_family` until a
  save path rewrote them

Both are now fixed in the live code/tests covered by this plan. The
hardcoded classic/runtime AHSW range maps were then closed out:

- `web/workbench.js:FAMILY_W_RANGE` — deleted
- `src/pipeline_v2/service.py:_FAMILY_W_RANGE` — deleted
- `web/termpp_skin_lab.js:FAMILY_W_RANGE` — deleted
- `runtime/termpp-skin-lab-static/termpp_skin_lab.js:FAMILY_W_RANGE` — deleted

All four were deleted in `a58eda6`..`e23fd3f` (see closeout plan
`docs/plans/2026-04-29-003-feat-uq004-deletion-first-closeout-plan.md`).
`ahsw_range` was added to `prefix_catalog` entries, normalizer drift-check
wired, and all override-name paths now derive from registry. The
`preview_xp -> l0_ref` fallback was fail-closed in a later session
(normalizer raises ValueError on missing `preview_xp`). Registry load/fetch
errors return 503 and surface as browser warnings; empty registry truth is
not cached. `UQ-004` is closed.

---

## Problem Frame

The backend's five key bundle/session/export/runtime functions all gate on `ENABLED_FAMILIES`, a hardcoded static set (`{"player", "attack", "plydie"}`) in `config.py`. Meanwhile, the browser already gates correctly through `isTemplateActionAuthorable()` in `workbench-template-gating.js`, which checks the registry's `authorable`, `proof_only`, `mounted`, and `skin_family_scope` fields. This split means the backend bypasses the registry's rich metadata — it cannot distinguish proof-only families from deferred ones, cannot gate mounted families structurally, and cannot support staged enablement. Additionally, registry load/fetch errors are silently swallowed in both the backend (logs only) and the browser (`catch (_e) { /* ignore */ }`), leaving operators unable to diagnose why template operations fail.

---

## Requirements

- R1. No live backend bundle/session/export/runtime path takes authority from `family` or `ENABLED_FAMILIES`; one registry-derived helper is the sole authority (UQ-004 pass condition)
- R2. Browser and backend consume the same normalized contract (UQ-004 pass condition)
- R3. Legacy session `family` values normalize on load/save — newly written sessions depend on `filename_prefix` / `skin_family` as primary identity (S2-R1 closure)
- R4. Registry load/fetch failures are operator-visible and fail-closed for authoring surfaces, explicit in backend responses and visible in the UI (S2-R2 closure)
- R5. No fix restores browser-side fail-close logic, creates a second registry authority, or claims UQ-004 closure while backend split-authority code remains (UQ-004 stop condition)

---

## Scope Boundaries

- Browser-side gating logic (`isTemplateActionAuthorable()` / `getEnabledActions()`) already consumes registry correctly — no changes
- `family` compat alias in `_normalize_template_action_spec()` survives as mirror data; full removal is downstream work
- Remaining `ahsw_range` closeout is still in scope: delete the surviving hardcoded mirror maps and replace them with one shared registry-derived override-name path
- Export-quality contract wiring is UQ-005 scope (S2-R3 / S2-R4)
- Source-wrapper manifest work is UQ-006 scope
- Runtime identity layer is UQ-007 scope
- Mounted family enablement stays `authorable: false` / `specified_not_authorable` — the new helper correctly excludes them without a hardcoded set

### Deferred to Follow-Up Work

- Full removal of the `family` alias from the normalizer and all remaining readers (future after all callers migrate to `filename_prefix`)
- Session batch migration for historical session files on disk (in-place migration on next save is sufficient per §2.5.4.1)
- Y9-2 thin-client wiring (`UQ-010`) after the local duplicate `ahsw_range` owners are gone

---

## Context & Research

### Relevant Code and Patterns

- `src/pipeline_v2/config.py:38` — `ENABLED_FAMILIES: set[str] = {"player", "attack", "plydie"}` (the hardcoded authority to remove)
- `src/pipeline_v2/service.py` — 6 `ENABLED_FAMILIES` gate sites: `create_bundle()` (line 1388), `_blank_session_spec()` (line 2666), `workbench_create_blank_session()` (line 2947), `bundle_action_run()` (line 3009), `workbench_export_bundle()` (line 3747), `workbench_web_skin_bundle_payload()` (line 3799)
- `src/pipeline_v2/service.py` — `load_template_registry()` (line 1104): caches globally, returns empty registry on missing file (log only), validates L0 checksums at load
- `src/pipeline_v2/app.py:388-390` — `/api/workbench/templates` endpoint returns bare `load_template_registry()` with no error/validation info
- `web/workbench.js:7286-7294` — `fetchTemplateRegistry()`: silently catches errors, caches to `state.templateRegistry`, returns `undefined` on failure
- `web/workbench-template-gating.js:34-58` — `isTemplateActionAuthorable()`: the reference implementation for registry-derived authority (already checks `skin_family_scope.authorable`, `skin_family_scope.proof_only`, `prefix_catalog.authorable`, `prefix_catalog.filename_prefix`, `prefix_catalog.skin_family`, `prefix_catalog.template_actions`)
- `config/template_registry.json` — schema version 2 with `skin_family_scope`, `prefix_catalog`, `template_sets`
- `tests/test_template_registry_schema.py` — normalizer and schema tests (no coverage for `ENABLED_FAMILIES` interaction or error surfacing)

---

## Key Technical Decisions

- **Registry-derived helper mirrors browser gating logic**: The backend helper follows the same authority chain as `isTemplateActionAuthorable()` — `filename_prefix`, `skin_family`, template-set `skin_family_scope`, registry `skin_family_scope` (`authorable`, `proof_only`), `prefix_catalog` (`authorable`), and `template_actions` linkage when template context exists. This keeps browser and backend on one normalized contract instead of letting template-driven backend paths drift from the browser gate.
- **Helper takes action spec and full registry as inputs**: The helper does not access global state or re-load the registry. Callers pass the already-loaded registry, keeping the function pure and testable.
- **Silent skip in export/web-skin replaced with explicit logging**: `workbench_export_bundle()` and `workbench_web_skin_bundle_payload()` currently silently skip non-enabled families. The new helper makes the skip explicit by returning a reason string alongside the boolean, and callers log skipped actions with the reason.
- **Registry validation status exposed as a top-level field in the API response**: The `/api/workbench/templates` endpoint includes a `registry_status` field summarizing load-time validation results (L0 checksum mismatches, missing files). This lets operators and the browser detect degraded state without waiting for a downstream operation to fail.
- **Session normalization resolves on read and persists on save**: Per §2.5.4.1, legacy sessions must read as normalized `filename_prefix` / `skin_family` immediately, then write the normalized identity back on the next successful save. No batch migration script is needed.

---

## Open Questions

### Decided During Planning

- **Should the helper be a standalone function or a method on a registry wrapper?** Standalone function — aligns with the existing code style in `service.py` where helpers are module-level functions taking explicit arguments. No registry wrapper class exists and introducing one would be scope creep.
- **Should `_blank_session_spec()` validate family against the registry or just check `ENABLED_FAMILIES`?** It should validate against the registry like every other gate. The `_blank_session_spec()` path handles non-template blank sessions where the caller supplies a `family` directly — this must pass through registry truth, not a hardcoded set.

### Deferred to Implementation

- Exact log format for skipped actions in export/web-skin paths — implementation will determine the right `_log.info()` shape
- Whether `registry_status` in the API response uses a flat list or a nested dict keyed by prefix — implementation will determine the most useful shape for the browser consumer

---

## Implementation Units

- U1. **Registry-derived authority helper**

**Goal:** Create one backend function that replaces all `ENABLED_FAMILIES` checks by deriving authority from the full normalized registry contract.

**Requirements:** R1, R2

**Dependencies:** None

**Files:**
- Modify: `src/pipeline_v2/service.py`
- Test: `tests/test_template_registry_schema.py`

**Approach:**
- Add a function (e.g., `is_action_authorized(action_spec, registry)`) that checks: `filename_prefix` present, `skin_family` present, template-set `skin_family_scope` admits that family when template context exists, registry `skin_family_scope[skin_family]` exists with `authorable == True` and `proof_only != True`, `prefix_catalog[filename_prefix]` exists with `authorable == True`, and `template_actions` linkage matches when the prefix declares it. Return a `(bool, str)` tuple — authorized yes/no plus a reason string for logging/error messages.
- Also support a bare-prefix entry point (e.g., `is_prefix_authorized(prefix, registry)`) for call sites like `_blank_session_spec()` that have a user-supplied `family` string but no action spec. This entry point looks up the prefix in `prefix_catalog` and applies the same authority checks. Both entry points share the core authorization logic.
- Mirror the authority chain from `isTemplateActionAuthorable()` in `workbench-template-gating.js`, including template-set scope and `template_actions` linkage when the caller already has template context.

**Patterns to follow:**
- `isTemplateActionAuthorable()` in `web/workbench-template-gating.js:34-58` — the reference authority chain
- Existing helper style in `service.py` — module-level functions with explicit arguments

**Test scenarios:**
- Happy path: action with `authorable: true`, non-mounted, non-proof-only prefix and scope → authorized
- Edge case: action with `proof_only: true` in its `skin_family_scope` → not authorized, reason mentions proof-only
- Edge case: action with `mounted: true` and `authorable: false` in prefix_catalog → not authorized, reason mentions not authorable
- Edge case: action with `status: "deferred"` and `authorable: false` → not authorized
- Edge case: action with missing `filename_prefix` → not authorized, reason mentions missing prefix
- Edge case: action with `skin_family` that does not exist in `skin_family_scope` → not authorized
- Happy path (bare-prefix): `is_prefix_authorized("player", registry)` → authorized (prefix_catalog lookup succeeds, scope is authorable)
- Edge case (bare-prefix): `is_prefix_authorized("wolfie", registry)` → not authorized, reason mentions not authorable
- Error path: `None` action spec → not authorized gracefully (no crash)
- Error path: empty registry (no `skin_family_scope` or `prefix_catalog`) → not authorized gracefully

**Verification:**
- All test scenarios pass
- Helper returns consistent `(authorized, reason)` tuples for every registry state

---

- U2. **Replace all ENABLED_FAMILIES gates with registry-derived helper**

**Goal:** Remove every `ENABLED_FAMILIES` check in `service.py` and `config.py`, replacing each with the U1 helper. Fix silent skips in export/web-skin to log skipped actions.

**Requirements:** R1, R2, R5

**Dependencies:** U1

**Files:**
- Modify: `src/pipeline_v2/service.py` (6 sites)
- Modify: `src/pipeline_v2/config.py` (remove `ENABLED_FAMILIES`)
- Test: `tests/test_template_registry_schema.py`

**Approach:**
- At each of the 6 gate sites, replace `family in ENABLED_FAMILIES` / `family not in ENABLED_FAMILIES` with a call to the U1 helper, passing the action spec and the already-loaded registry.
- `create_bundle()` (line 1388): replace skip-if-not-enabled with skip-if-not-authorized, log the reason for skipped actions.
- `_blank_session_spec()` (line 2666): replace `ENABLED_FAMILIES` check with `is_prefix_authorized(family, registry)` — this call site has a user-supplied `family` string from the payload, not an action spec. The bare-prefix entry point looks up `prefix_catalog[family]` and applies the same scope/authorable checks.
- `workbench_create_blank_session()` (line 2947): replace gate with helper call.
- `bundle_action_run()` (line 3009): replace gate with helper call.
- `workbench_export_bundle()` (line 3747): replace silent `continue` with helper call + `_log.info()` for skipped actions.
- `workbench_web_skin_bundle_payload()` (line 3799): replace silent skip with helper call + log; keep the `unmapped_families` list populated from the reason string.
- Remove `ENABLED_FAMILIES` from `config.py` and its import in `service.py`.

**Patterns to follow:**
- Existing `ApiError` raise pattern in each function for unauthorized families
- Existing `_log.info()` / `_log.warning()` patterns in `service.py`

**Test scenarios:**
- Happy path: `create_bundle()` with an authorable template set creates sessions for authorized actions only
- Happy path: `workbench_create_blank_session()` with authorized family succeeds
- Happy path: `bundle_action_run()` with authorized family dispatches pipeline
- Happy path: `workbench_export_bundle()` exports authorized actions
- Happy path: `workbench_web_skin_bundle_payload()` builds payload for authorized actions
- Edge case: `_blank_session_spec()` with a non-authorable family (e.g., `wolfie`) raises `ApiError`
- Edge case: `create_bundle()` with a template set containing mixed authorized/non-authorized actions creates sessions only for authorized ones
- Edge case: `workbench_export_bundle()` with a non-authorized action logs the skip reason instead of silently continuing
- Edge case: `workbench_web_skin_bundle_payload()` correctly populates `unmapped_families` with reason from the helper
- Error path: `bundle_action_run()` with `proof_only` family raises descriptive `ApiError`
- Integration: after `ENABLED_FAMILIES` removal, `grep -r ENABLED_FAMILIES src/` returns zero matches

**Verification:**
- `ENABLED_FAMILIES` no longer exists in `config.py` or is imported anywhere in `service.py`
- All 5 key functions gate through the registry-derived helper
- No silent skips remain — every skipped action is logged with a reason

---

- U3. **Session family normalization on load/save**

**Goal:** Newly written sessions store `filename_prefix` and `skin_family` as primary identity, with `family` as compat mirror. Existing sessions with only `family` migrate through registry on load and normalize on next save.

**Requirements:** R3

**Dependencies:** U1

**Files:**
- Modify: `src/pipeline_v2/service.py` (session save/load paths)
- Test: `tests/test_template_registry_schema.py`

**Approach:**
- In session creation paths (`workbench_create_blank_session`, pipeline job session), write `filename_prefix` and `skin_family` alongside `family` (which becomes the compat mirror, always equal to `filename_prefix`).
- In session load path, when `filename_prefix` is absent but `family` is present, look up `prefix_catalog[family]` in the registry to populate `filename_prefix` and `skin_family`.
- Add `filename_prefix` / `skin_family` enrichment to `workbench_save_session()` — the save function currently has no family-related code, so this is entirely additive. On each save, if the session lacks `filename_prefix`, resolve `family` through `prefix_catalog` and write both normalized fields. Also ensure `_session_payload()` emits `filename_prefix` and `skin_family` alongside the existing `family` field.
- Do not modify sessions on disk eagerly — migration happens lazily per §2.5.4.1.

**Patterns to follow:**
- Existing session `to_dict()` / save/load pattern in `service.py`
- `_normalize_template_action_spec()` fallback logic: `filename_prefix = spec.get("filename_prefix") or spec.get("family")`

**Test scenarios:**
- Happy path: new blank session save includes `filename_prefix`, `skin_family`, and `family` (mirror)
- Happy path: load a legacy session with only `family: "player"` → populates `filename_prefix: "player"`, `skin_family: "human"` from registry
- Edge case: legacy session with `family` not in registry → load succeeds with a warning, session retains raw `family` value without crashing
- Edge case: session already has `filename_prefix` and `skin_family` → no re-lookup, values pass through
- Integration: round-trip save → load → save preserves normalized fields and compat `family`

**Verification:**
- Newly created sessions contain `filename_prefix` and `skin_family` as primary identity fields
- Legacy sessions normalize on first load+save cycle
- `family` field is always present as compat mirror (equal to `filename_prefix`)

---

- U4. **Backend registry error surfacing — fail-closed and operator-visible**

**Goal:** Make registry load-time validation errors (missing file, malformed JSON, L0 checksum mismatches) explicit in the API response so operators can diagnose issues before downstream operations fail.

**Requirements:** R4

**Dependencies:** None (can run in parallel with U1-U3)

**Files:**
- Modify: `src/pipeline_v2/service.py` (`load_template_registry()`, L0 validation)
- Modify: `src/pipeline_v2/app.py` (`/api/workbench/templates` endpoint)
- Test: `tests/test_template_registry_schema.py`

**Approach:**
- After `load_template_registry()` completes (including L0 reference validation), collect `_l0_reference_status` entries that are not `"ok"` into a summary dict.
- Modify the `/api/workbench/templates` endpoint to include a `registry_status` field alongside the registry data, listing any validation errors by prefix.
- When the registry file is missing, the API response should still include `registry_status` indicating the file was absent (the current graceful-degrade empty-registry behavior is preserved, but the error is now visible).
- `load_template_registry()` itself continues to return the best-effort registry (fail-closed means downstream authoring operations that need a missing/corrupt reference will still hit `_assert_l0_reference_available()` and raise `ApiError` — the new surfacing gives operators early warning, not a behavioral change to load).

**Patterns to follow:**
- Existing `_l0_reference_status` dict pattern
- Existing `_err(e)` pattern in `app.py` for error responses

**Test scenarios:**
- Happy path: registry loads cleanly → `registry_status` is empty or all-ok
- Edge case: registry file missing → API returns empty template_sets with `registry_status` indicating missing file
- Edge case: L0 reference checksum mismatch for one prefix → `registry_status` includes that prefix with mismatch detail
- Edge case: L0 reference file missing for one prefix → `registry_status` includes that prefix with file-missing status
- Error path: malformed JSON in registry file → API returns error response (not a silent empty registry)
- Integration: `client.get("/api/workbench/templates")` response includes `registry_status` field

**Verification:**
- API response always includes `registry_status` alongside template data
- Operators can see which prefixes have degraded L0 reference state without triggering a downstream operation
- Malformed registry file produces an explicit error response, not a silent empty registry

---

- U5. **Browser fetchTemplateRegistry error handling**

**Goal:** Make `fetchTemplateRegistry()` in `workbench.js` surface registry load/fetch errors to the operator instead of silently swallowing them. Consume the new `registry_status` field from U4.

**Requirements:** R4

**Dependencies:** U4

**Files:**
- Modify: `web/workbench.js` (`fetchTemplateRegistry()` function)
- Test: `tests/test_template_registry_schema.py` (API-level; browser-side behavior is verified via headed proof in UQ-003/UQ-009 scope)

**Approach:**
- Replace the `catch (_e) { /* ignore */ }` in `fetchTemplateRegistry()` with error handling that calls `status()` with a descriptive message when the fetch fails or returns a non-ok response.
- After a successful fetch, check `registry_status` in the response. If it contains validation errors, show a warning via `status()` so the operator knows the registry is degraded.
- Preserve the existing pattern where `state.templateRegistry` is `null` on failure — callers already check for this (e.g., `if (!reg) { status("Failed to load template registry", "err"); return; }`). The change is to add operator-visible context about _why_ it failed.
- Do not change `isTemplateActionAuthorable()` or `getEnabledActions()` — they already consume registry correctly.

**Patterns to follow:**
- Existing `status(msg, "err")` / `status(msg, "warn")` pattern in `workbench.js`
- Existing fetch error handling patterns elsewhere in `workbench.js`

**Test scenarios:**
- Happy path: registry fetches successfully with clean status → no warning shown, `state.templateRegistry` populated
- Edge case: fetch returns non-ok HTTP status → `status()` called with error message, `state.templateRegistry` remains `null`
- Edge case: fetch succeeds but `registry_status` contains a checksum mismatch → `status()` called with warning
- Error path: network error during fetch → `status()` called with connection error message
- Integration: callers of `fetchTemplateRegistry()` (e.g., `applyTemplateSet`) continue to handle `null` registry correctly

**Verification:**
- `fetchTemplateRegistry()` no longer silently swallows errors
- Registry degradation is visible in the workbench status bar
- Existing callers' null-check flow is preserved (no behavioral regression)

---

## System-Wide Impact

- **Interaction graph:** `load_template_registry()` is called by all 5 key functions, L0 reference loading, and the `/api/workbench/templates` endpoint. The new helper sits between registry load and gate decisions. No callbacks or observers are involved.
- **Error propagation:** Validation errors propagate from `load_template_registry()` → `registry_status` field in API response → browser `fetchTemplateRegistry()` → `status()` display. Downstream `_assert_l0_reference_available()` continues to raise `ApiError` for operations that need a corrupt/missing reference.
- **State lifecycle risks:** `_template_registry` is a global cache with `_reset_template_registry_cache()` for tests. Adding `registry_status` alongside it is safe because both are populated during the same load. No concurrent-write risk — the server is single-process.
- **API surface parity:** The `/api/workbench/templates` response gains a `registry_status` field. MCP tools that consume this endpoint get the same visibility. No other API endpoints change shape.
- **Unchanged invariants:** `isTemplateActionAuthorable()` and `getEnabledActions()` in `workbench-template-gating.js` are not modified. The browser gating contract is already correct and stays as-is.

---

## Risks & Dependencies

| Risk | Mitigation |
|------|------------|
| Removing `ENABLED_FAMILIES` could change behavior for callers outside the 5 key functions | `grep -r ENABLED_FAMILIES` confirms usage is limited to `config.py` definition and `service.py` import + 6 gate sites — no other callers exist |
| Session normalization could corrupt legacy sessions if registry lookup fails for an old `family` value | Load path preserves raw `family` on lookup failure with a warning log; never crashes or drops session data |
| Adding `registry_status` to the API response could break browser consumers that don't expect it | Browser code uses `state.templateRegistry = await r.json()` — extra top-level fields are ignored by existing consumers. New code reads it explicitly |
| `_blank_session_spec()` family validation now requires registry access | Registry is already loaded and cached globally by the time `_blank_session_spec()` runs — no performance concern |
| `_build_native_layers()` hard-dispatches on literal family strings (`player`, `attack`, `plydie`) — an implicit secondary constraint beyond registry authorization | Currently safe because only those three prefixes have `authorable: true` in the registry. Future authorable prefixes also require a corresponding native builder — this is a builder concern, not a registry-authority concern |

---

## Sources & References

- **Spec authority:** `docs/plans/2026-03-23-workbench-canonical-spec.md` — §2.5.4 (S2-R1, S2-R2), §2.5.4.1 (design policy), §Unified Queue (UQ-004)
- Related code: `web/workbench-template-gating.js:34-58` (reference authority chain)
- Related code: `src/pipeline_v2/config.py:38` (ENABLED_FAMILIES definition)
- Related code: `src/pipeline_v2/service.py:1104` (load_template_registry)
- Related code: `web/workbench.js:7286` (fetchTemplateRegistry)
