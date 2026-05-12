# RenderPlanTable Compiler Delivery

**Date:** 2026-05-12
**Phase:** 1, Task 2 (COMPLETE ✅)
**Related FL Entries:** FL-3861
**Audit Reference:** `docs/plans/2026-05-12-001-e2e-user-workflow-audit.md` (Step 9: Compile RenderPlanTable)

---

## Summary

The RenderPlanTable compiler is now implemented. This module compiles ActorVisualProfile files into RenderPlan rows — the exact ordered layer compositions that the runtime uses for dumb presentation.

**Architecture:**
```
ActorVisualProfile (authored) 
    → ServerVisualKey (lookup key) 
    → RenderPlan row (compiled) 
    → render_plans.json (output)
```

---

## Deliverables

### 1. RenderPlanTable Compiler
**Path:** `asciicker-Y9-2/scripts/pipeline/render_plan_table.py`

500+ lines implementing:
- `ServerVisualKey` — Dataclass for RenderPlan lookup keys
- `RenderPlanRow` — Compiled row with ServerVisualKey + ordered layers
- `load_actor_profiles()` — Load ActorVisualProfile JSON files from directory
- `load_id_maps()` — Extract ID mappings from appearance bundle
- `compile_render_plan_row()` — Compile single profile into RenderPlan row
- `compile_render_plan_table()` — Compile full table from all profiles
- `write_render_plan_table()` — Write render_plans.json
- `verify_render_plan_table()` — Verify committed file matches fresh compile
- `integrate_with_appearance_bundle()` — Integration helper for appearance_bundle.py
- CLI: `python3 -m scripts.pipeline.render_plan_table compile|verify`

### 2. Tests
**Path:** `tests/test_render_plan_table.py`

18 passing tests covering:
- ServerVisualKey serialization and canonical key generation
- ServerVisualKey.from_profile() for basic and mounted profiles
- RenderPlanRow serialization
- load_id_maps() extraction from bundle
- compile_render_plan_row() for simple and multi-layer profiles
- compile_render_plan_table() full table compilation
- write_render_plan_table() file output
- verify_render_plan_table() verification (pass, missing file, stale content)
- Integration: full compile → write → verify workflow
- Duplicate key detection

### 3. Example Profiles (Shared with Task 1)
**Path:** `config/actor_visual_profiles/examples/`

| File | RenderPlan Rows |
|------|-----------------|
| `01-human-idle-default.json` | 1 row: body layer only |
| `02-human-attack-crossbow.json` | 1 row: body + weapon layers |
| `03-wolf-mounted-idle.json` | 1 row: mount_rear + mount_rider + mount_front layers |

---

## Output Structure

```json
{
  "schema_version": 1,
  "generated_by": "render_plan_table@v1",
  "bundle_slug": "positive",
  "render_plans": [
    {
      "server_visual_key": {
        "skin_definition_id": 100,
        "presentation_kind_id": 601,
        "variation": "crossbow_attack",
        "slot_state": {
          "body": 701,
          "weapon": 2001,
          "head": null,
          "chest": null,
          "shield": null,
          "armor": null
        },
        "mount_state": {
          "is_mounted": false
        }
      },
      "ordered_layers": [
        {
          "slot": "body",
          "layer_definition_id": 701,
          "xp_ref": "assets/sprites/player_native_full.xp",
          "render_order_index": 0,
          "region": {"x": 0, "y": 8, "w": 8, "h": 8}
        },
        {
          "slot": "weapon",
          "layer_definition_id": 750,
          "xp_ref": "assets/sprites/player_native_full.xp",
          "item_definition_id": 2001,
          "visual_style_id": 1,
          "render_order_index": 1,
          "region": {"x": 8, "y": 8, "w": 8, "h": 8}
        }
      ],
      "profile_id": "human_attack_crossbow",
      "render_order": [0, 1]
    }
  ],
  "key_space_coverage": {
    "total_keys": 3,
    "covered_keys": 3,
    "missing_keys": []
  },
  "profile_count": 3
}
```

---

## Key Design Decisions

### 1. ServerVisualKey Canonical Key
```python
def canonical_key(self) -> str:
    """Generate a canonical string key for deduplication."""
    return json.dumps(self.to_dict(), sort_keys=True)
```
**Rationale:** Enables duplicate detection across profiles. Two profiles with same ServerVisualKey = error.

### 2. Ordered Layers Array
```json
"ordered_layers": [
  {"slot": "mount_rear", ...},
  {"slot": "mount_rider", ...},
  {"slot": "mount_front", ...}
]
```
**Rationale:** Exact render order. No runtime sorting, no fallback search. Dumb presenter just iterates and draws.

### 3. Key Space Coverage Tracking
```json
"key_space_coverage": {
  "total_keys": 42,
  "covered_keys": 42,
  "missing_keys": []
}
```
**Rationale:** Future enhancement: enumerate full key space (presentation_kind × skin_id × variation × slot combinations × mount_state) and detect gaps at compile time.

### 4. Verification Gate
```python
mismatches = verify_render_plan_table(out_dir, bundle, actor_profiles_dir)
if mismatches:
    raise ValueError(f"RenderPlanTable verification failed: {mismatches}")
```
**Rationale:** Detects stale render_plans.json (e.g., profiles changed but not recompiled).

### 5. Cross-Repo Import
```python
PIPELINE_V3_ROOT = Path(__file__).resolve().parents[4] / "asciicker-pipeline-v3"
from src.pipeline_v2.actor_visual_profile import ActorVisualProfile
```
**Rationale:** RenderPlanTable compiler lives in Y9-2 (where appearance_bundle.py is), but imports ActorVisualProfile from pipeline-v3. In production, this would be vendored or installed as package.

---

## Integration with appearance_bundle.py

### Current State
`appearance_bundle.py` emits:
- `appearance_bundle.json`
- `ids.lock.json`
- `compile_report.json`

### Integration Point
```python
from render_plan_table import integrate_with_appearance_bundle

# In compile_bundle(), after emitting bundle/ids_lock/compile_report:
compile_report = integrate_with_appearance_bundle(
    bundle,
    ids_lock,
    compile_report,
    actor_profiles_dir=Path("config/actor_visual_profiles"),
    out_dir=out_dir,
)
# Now compile_report includes:
# {
#   "render_plan_table": {
#     "render_plans_path": "...",
#     "row_count": 42,
#     "profile_count": 42,
#     "key_space_coverage": {...}
#   },
#   "generated_files": [..., "render_plans.json"]
# }
```

---

## CLI Usage

### Compile
```bash
cd asciicker-Y9-2
python3 -m scripts.pipeline.render_plan_table compile \
  --bundle-src assets/appearance_bundle/current/appearance_bundle.json \
  --actor-profiles-dir ../asciicker-pipeline-v3/config/actor_visual_profiles/examples \
  --out-dir assets/appearance_bundle/current
```

### Verify
```bash
python3 -m scripts.pipeline.render_plan_table verify \
  --bundle-src assets/appearance_bundle/current/appearance_bundle.json \
  --actor-profiles-dir ../asciicker-pipeline-v3/config/actor_visual_profiles/examples \
  --out-dir assets/appearance_bundle/current
```

---

## Validation

```bash
cd /Users/r/Downloads/asciicker-pipeline-v3
PYTHONPATH=asciicker-Y9-2/scripts/pipeline:asciicker-Y9-2/scripts:. python3 -m pytest tests/test_render_plan_table.py -v
# 18 passed in 0.04s
```

---

## Next Steps

**Phase 1, Task 3:** Add C++ runtime parser gate

**Deliverables:**
- Minimal C++ test harness that loads render_plans.json
- Or use existing engine test infrastructure
- Integrate into `build-web.sh` and `verify-current`
- Fail if C++ parser rejects the bundle

**FL References:**
- FL-3862: build-web.sh does not invoke C++ runtime parser
- FL-3873, FL-3874: Mandatory parser gate requirements

---

## References

- **E2E Workflow Audit:** `docs/plans/2026-05-12-001-e2e-user-workflow-audit.md`
- **FL-3861:** appearance_bundle.py does not emit render_plans.json
- **Compiler:** `asciicker-Y9-2/scripts/pipeline/render_plan_table.py`
- **Tests:** `tests/test_render_plan_table.py`
- **ActorVisualProfile:** `docs/plans/2026-05-12-002-actor-visual-profile-delivery.md`
