# ActorVisualProfile Delivery

**Date:** 2026-05-12
**Phase:** 1, Task 1 (COMPLETE ✅)
**Related FL Entries:** FL-3863
**Audit Reference:** `docs/plans/2026-05-12-001-e2e-user-workflow-audit.md` (Step 6: Author ActorVisualProfile)

---

## Summary

The ActorVisualProfile data structure is now defined and implemented. This is the **bridge object** between authored XP content and compiled RenderPlan rows. It defines:
- What layers exist
- What slots they fill
- What visual key dimensions (variation, mount state) they cover

---

## Deliverables

### 1. JSON Schema
**Path:** `config/actor_visual_profile_schema.json`

Validates ActorVisualProfile JSON files with:
- Required fields: `schema_version`, `profile_id`, `skin_definition_id`, `presentation_kind`, `domain`, `layers`
- Optional fields: `variation`, `mount_composition`, `source_refs`, `quality_gates`, `metadata`, `rig_data`
- Three example profiles included in schema `examples` array

### 2. Python Dataclasses
**Path:** `src/pipeline_v2/actor_visual_profile.py`

Provides:
- `ActorVisualProfile` — Main dataclass with serialization (to_dict, from_dict, to_json, from_json, to_file, from_file)
- `LayerAssignment` — Individual layer with slot, layer_definition_id, xp_ref, visual_style_id, item_definition_id, region
- `MountComposition` — Mount rear/rider/front layer split
- `Region` — Cell region within XP sheet (x, y, w, h)
- `SourceRefs` — References to XP/PNG/semantic maps/calibration artifacts
- `QualityGates` — G7/G8/G9/mounted_alignment results
- `create_profile()` — Factory function
- `load_profiles_from_directory()` — Batch loader
- `get_server_visual_key()` — Generates RenderPlan lookup key

### 3. Tests
**Path:** `tests/test_actor_visual_profile.py`

31 passing tests covering:
- Region serialization
- LayerAssignment with/without optional fields
- MountComposition
- SourceRefs
- QualityGates
- ActorVisualProfile creation, validation, serialization, file I/O
- ServerVisualKey generation (basic and mounted)
- Directory loading
- Full integration roundtrip

### 4. Example Profiles
**Path:** `config/actor_visual_profiles/examples/`

| File | Description |
|------|-------------|
| `01-human-idle-default.json` | Basic human idle walk skin (single body layer) |
| `02-human-attack-crossbow.json` | Human attack with crossbow (body + weapon layers, variation=crossbow_attack) |
| `03-wolf-mounted-idle.json` | Wolf mounted idle (mount_rear + mount_rider + mount_front layers, mount_composition) |

---

## Key Design Decisions

### 1. Variation is Explicit Field
```json
{
  "variation": "crossbow_attack"
}
```
**Rationale:** Crossbow is NOT a special case. It's a variation dimension like any other (e.g., "default", "full_height", "melee_attack"). This prevents the runtime from having crossbow-specific logic.

### 2. Mount is a Domain Dimension
```json
{
  "domain": "mount",
  "mount_composition": {
    "mount_definition_id": 300,
    "rear_layer_index": 0,
    "rider_layer_index": 1,
    "front_layer_index": 2
  }
}
```
**Rationale:** Mount is NOT a special case. It's a domain like "skin" or "wearable". The `mount_composition` object explicitly splits layers into rear/rider/front, preventing runtime mounted composer logic.

### 3. Layers are Ordered
```json
{
  "layers": [
    {"slot": "mount_rear", ...},
    {"slot": "mount_rider", ...},
    {"slot": "mount_front", ...}
  ]
}
```
**Rationale:** Array order defines render order. This is the exact layer composition that will become RenderPlan rows. No runtime fallback search needed.

### 4. ServerVisualKey Generation
```python
key = profile.get_server_visual_key()
# {
#   "skin_definition_id": 100,
#   "presentation_kind_id": "attack",
#   "variation": "crossbow_attack",
#   "domain": "skin",
#   "slot_state": {"body": 701, "weapon": 2001, ...},
#   "mount_state": {"is_mounted": False}
# }
```
**Rationale:** This is the lookup key for RenderPlanTable. The compiler will enumerate all possible keys and emit one RenderPlan row per key.

### 5. Schema Versioned
```json
{
  "schema_version": 1
}
```
**Rationale:** Forward compatibility. Future versions can add fields without breaking existing profiles.

---

## Integration Points

### Current State
- `config/runtime_identity_registry.json` — Referenced by ActorVisualProfile (skin_definition_id, layer_definition_id)
- `src/pipeline_v2/service.py:runtime_identity_for_action()` — Similar purpose but lacks variation, mount split, explicit layers
- `src/pipeline_v2/service.py:resolve_blueprint_targets()` — Similar purpose but uses template_set_key + action_key paradigm

### Migration Path
1. **Phase 1, Task 2:** Extend `appearance_bundle.py` to:
   - Load ActorVisualProfile files from `config/actor_visual_profiles/`
   - Generate ServerVisualKey for each profile
   - Enumerate full key space (presentation_kind × skin_id × variation × slot combinations × mount_state)
   - Emit `render_plans.json` with one ordered RenderPlan row per key

2. **Future:** Deprecate `runtime_identity_for_action()` in favor of ActorVisualProfile-based resolution

---

## Usage in Pipeline-v3 Workbench

### Future UI Flow (Step 6: Author ActorVisualProfile)
1. User chooses domain (skin/wearable/weapon/shield/mount)
2. User chooses presentation_kind (idle_walk/attack/plydie)
3. User chooses variation (default/crossbow_attack/etc.)
4. User assigns layers to slots (body/head/weapon/shield/etc.)
5. User specifies XP refs and regions for each layer
6. Workbench validates against schema
7. Workbench saves ActorVisualProfile JSON to `config/actor_visual_profiles/`

### Future Compiler Flow (Step 9: Compile RenderPlanTable)
1. Compiler loads all ActorVisualProfile JSON files
2. For each profile:
   - Generate ServerVisualKey
   - Extract ordered layers
   - Emit RenderPlan row
3. Validate full key space coverage
4. Write `render_plans.json` alongside `appearance_bundle.json`

---

## Validation

```bash
cd /Users/r/Downloads/asciicker-pipeline-v3
PYTHONPATH=. python3 -m pytest tests/test_actor_visual_profile.py -v
# 31 passed in 0.08s
```

---

## Next Steps

**Phase 1, Task 2:** Extend `appearance_bundle.py` to emit `render_plans.json`

**Deliverables:**
- New function: `compile_render_plan_table(actor_profiles: list[ActorVisualProfile]) -> dict`
- New output: `render_plans.json` with structure:
  ```json
  {
    "schema_version": 1,
    "render_plans": [
      {
        "server_visual_key": {...},
        "ordered_layers": [...],
        "profile_id": "human_attack_crossbow"
      }
    ]
  }
  ```
- Validation: Reject bundle if any ServerVisualKey is missing a RenderPlan row

---

## References

- **E2E Workflow Audit:** `docs/plans/2026-05-12-001-e2e-user-workflow-audit.md`
- **FL-3863:** Pipeline-v3 has no ActorVisualProfile data structure
- **Schema:** `config/actor_visual_profile_schema.json`
- **Implementation:** `src/pipeline_v2/actor_visual_profile.py`
- **Tests:** `tests/test_actor_visual_profile.py`
- **Examples:** `config/actor_visual_profiles/examples/`
