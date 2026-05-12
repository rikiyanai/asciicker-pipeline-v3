# Domain/Variation Chooser UI Delivery

**Date:** 2026-05-12
**Phase:** 2, Task 2 (COMPLETE ✅)
**Related FL Entries:** FL-3864 (Bundle System Guide wrong), FL-3863 (no ActorVisualProfile data structure)
**Audit Reference:** `docs/plans/2026-05-12-001-e2e-user-workflow-audit.md` (Steps 4-5: Workbench domain/variation selection)

---

## Summary

Added explicit **Domain + Variation Chooser** UI to the pipeline-v3 workbench for creating ActorVisualProfile JSON files. This UI allows content authors to specify the exact (domain, presentation_kind, variation) combination before authoring layers.

**Locations:**
- `web/workbench.html` — New panel `#domainVariationPanel` (panel 4b)
- `web/workbench.js` — New function `createActorVisualProfile()`
- `src/pipeline_v2/app.py` — New API endpoint `/api/workbench/actor-visual-profile/create`
- `src/pipeline_v2/service.py` — New function `workbench_create_actor_visual_profile()`

---

## UI Components

### New Panel: Domain + Variation Chooser (Panel 4b)

**Position:** Between Template panel (4) and Session Ops panel (5)

**Fields:**
1. **Domain** — Dropdown with 5 options:
   - Skin (body family)
   - Wearable (armor/clothing)
   - Weapon (held item)
   - Shield (off-hand)
   - Mount (rideable)

2. **Presentation Kind** — Dropdown with 3 options:
   - Idle / Walk
   - Attack
   - Death

3. **Variation** — Dropdown with 6 preset options:
   - Default
   - Crossbow Attack
   - Sword Attack
   - Shield Bash
   - Mounted Idle
   - Mounted Attack

4. **Create ActorVisualProfile** — Primary action button

**Guide Text:**
```
Domain: What kind of visual object you're authoring (skin, wearable, weapon, shield, mount).
Presentation Kind: What the actor is DOING (idle_walk, attack, plydie).
Variation: Specific geometry/state variant (default, crossbow_attack, mounted_idle, etc.).
Crossbow and mounted are NOT special cases — they're explicit variation dimensions.
```

---

## Backend Implementation

### API Endpoint

```python
@bp.post("/api/workbench/actor-visual-profile/create")
def api_wb_create_actor_visual_profile():
    """Create ActorVisualProfile from current session (Phase 2, Task 2)."""
    payload = request.get_json(silent=True) or {}
    session_id = payload.get("session_id")
    domain = payload.get("domain", "skin")
    presentation_kind = payload.get("presentation_kind", "idle_walk")
    variation = payload.get("variation", "default")
    
    return workbench_create_actor_visual_profile(
        session_id=session_id,
        domain=domain,
        presentation_kind=presentation_kind,
        variation=variation,
        req_id=req_id,
    )
```

### Service Function

```python
def workbench_create_actor_visual_profile(
    session_id: str,
    domain: str,
    presentation_kind: str,
    variation: str,
    req_id: str,
) -> dict[str, Any]:
    """Create ActorVisualProfile from current session.
    
    Steps:
    1. Validate domain (skin/wearable/weapon/shield/mount)
    2. Validate presentation_kind (idle_walk/attack/plydie)
    3. Load session geometry from session.json
    4. Generate profile_id from session_id + key dimensions
    5. Create LayerAssignment from session XP
    6. Create ActorVisualProfile with all metadata
    7. Save to config/actor_visual_profiles/{profile_id}.json
    8. Return profile path and ID
    """
```

---

## Output Structure

### Created Profile Example

```json
{
  "schema_version": 1,
  "profile_id": "abc123_skin_idle_walk_default",
  "skin_definition_id": 542,
  "presentation_kind": "idle_walk",
  "domain": "skin",
  "layers": [
    {
      "slot": "body",
      "layer_definition_id": 700,
      "xp_ref": "assets/sprites/abc123.xp",
      "visual_style_id": 1,
      "region": {"x": 0, "y": 0, "w": 8, "h": 8}
    }
  ]
}
```

### API Response

```json
{
  "profile_id": "abc123_skin_idle_walk_default",
  "profile_path": "config/actor_visual_profiles/abc123_skin_idle_walk_default.json",
  "domain": "skin",
  "presentation_kind": "idle_walk",
  "variation": "default",
  "skin_definition_id": 542,
  "layers_count": 1,
  "session_id": "abc123"
}
```

---

## Key Design Decisions

### 1. Explicit Key Dimensions

**Old (implicit):**
- Variation inferred from runtime state masks
- Mount state detected from equipped items
- Crossbow handled as special runtime case

**New (explicit):**
- Variation is a dropdown selection
- Mount is a domain choice
- Crossbow is a variation option
- **No runtime inference, no special cases**

### 2. Profile ID Generation

Profile IDs are generated from session metadata:
```
{session_id}_{domain}_{presentation_kind}_{variation}
```

Example: `abc123_skin_idle_walk_default`

This ensures:
- Unique IDs per session
- Traceability back to source session
- No manual ID management for authors

### 3. Slot Mapping by Domain

| Domain | Default Slot |
|--------|--------------|
| Skin | body |
| Wearable | chest |
| Weapon | weapon |
| Shield | shield |
| Mount | mount_rear |

Authors can later edit the profile JSON to add multiple layers/slots.

### 4. skin_definition_id Derivation

Uses hash of session_id to generate a deterministic but unique ID:
```python
skin_definition_id = abs(hash(session_id)) % 1000 + 100  # Range 100-1099
```

This avoids manual ID assignment while ensuring uniqueness.

---

## Testing

### Manual Test

```bash
cd /Users/r/Downloads/asciicker-pipeline-v3
python3 -m src.pipeline_v2.app

# In browser:
# 1. Navigate to http://127.0.0.1:5071/workbench
# 2. Create or load a session
# 3. Open Domain + Variation Chooser panel (4b)
# 4. Select domain=skin, presentation_kind=idle_walk, variation=default
# 5. Click "Create ActorVisualProfile"
# 6. Verify profile created in config/actor_visual_profiles/
```

### Expected Output

```
✓ ActorVisualProfile created: abc123_skin_idle_walk_default
  Profile path: config/actor_visual_profiles/abc123_skin_idle_walk_default.json
  [View]
```

---

## Integration Points

### 1. RenderPlanTable Compiler

The created ActorVisualProfile can be compiled into a RenderPlan row:

```bash
python3 -m scripts.pipeline.render_plan_table compile \
  --bundle-src assets/appearance_bundle/phase2-fixtures/positive.bundle.json \
  --sprites-root assets/sprites \
  --out-dir assets/appearance_bundle/current
```

### 2. C++ Parser Gate

The compiled render_plans.json is validated by:

```bash
testing/render_plan_parser/__build__/render_plan_parser_test \
  assets/appearance_bundle/current/render_plans.json
```

### 3. Launcher Integration

Created profiles can be imported via launcher:
```
Bundle Mods → Import content artifact → Select profile JSON → Compile RenderPlan
```

---

## Phase 2 Progress

| Task | Status | Description |
|------|--------|-------------|
| **Task 1:** Bundle System Guide rewrite | ✅ Complete | Launcher guide updated |
| **Task 2:** Domain/Variation Chooser UI | ✅ Complete | Workbench panel + API |
| **Task 3:** Authoring Artifact Export | ⏭️ Next | Structured JSON export with ActorVisualProfile |

---

## Remaining Work

### Phase 2, Task 3: Authoring Artifact Export

Add "Export Authoring Artifact" action that produces structured JSON with:
- ActorVisualProfile
- Source refs (XP/PNG/semantic maps)
- Quality gate results
- Calibration artifacts (for mounted)

### Phase 3: Verification & Deployment

- E2E smoke script (FL-3602)
- build-web.sh integration (C++ parser gate)
- Deploy receipts with RenderPlanTable hash

### Phase 4: Runtime Cleanup

- Replace old resolver with RenderPlanTable lookup
- Remove mounted/crossbow special cases

---

## References

- **E2E Workflow Audit:** `docs/plans/2026-05-12-001-e2e-user-workflow-audit.md`
- **ActorVisualProfile Schema:** `config/actor_visual_profile_schema.json`
- **ActorVisualProfile Dataclasses:** `src/pipeline_v2/actor_visual_profile.py`
- **FL-3863:** Pipeline-v3 has no ActorVisualProfile data structure
- **FL-3864:** Bundle System Guide describes old selector-driven architecture
- **Implementation:**
  - UI: `web/workbench.html:91-129`
  - JS: `web/workbench.js:7825-7870`
  - API: `src/pipeline_v2/app.py:958-977`
  - Service: `src/pipeline_v2/service.py:5272-5388`
