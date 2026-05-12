# Authoring Artifact Export Delivery

**Date:** 2026-05-12
**Phase:** 2, Task 3 (COMPLETE ✅)
**Related FL Entries:** FL-3864 (Bundle System Guide wrong), FL-3863 (no ActorVisualProfile data structure)
**Audit Reference:** `docs/plans/2026-05-12-001-e2e-user-workflow-audit.md` (Step 7: Export authoring artifact)

---

## Summary

Added **Export Authoring Artifact** functionality to the pipeline-v3 workbench. This feature exports a structured JSON artifact containing the ActorVisualProfile plus source references, quality gate results, and calibration artifacts.

**Locations:**
- `web/workbench.html` — New "Export Authoring Artifact" button (panel 17)
- `web/workbench.js` — New function `exportAuthoringArtifact()`
- `src/pipeline_v2/app.py` — New API endpoint `/api/workbench/actor-visual-profile/export`
- `src/pipeline_v2/service.py` — New function `workbench_export_actor_visual_profile()`

---

## UI Components

### New Export Button (Panel 17)

**Position:** Export Tools panel, below "Launch Desktop XP Tool" button

**Button:** `Export Authoring Artifact` (primary style)

**Hint Text:**
```
Export structured JSON with ActorVisualProfile, source refs, quality gates.
```

**Behavior:**
1. Clicking the button exports the current session's ActorVisualProfile
2. Uses the currently selected (domain, presentation_kind, variation) from panel 4b
3. Auto-downloads the JSON artifact file
4. Displays the export result in the `#exportOut` viewport

---

## Backend Implementation

### API Endpoint

```python
@bp.post("/api/workbench/actor-visual-profile/export")
def api_wb_export_actor_visual_profile():
    """Export ActorVisualProfile as authoring artifact (Phase 2, Task 3)."""
    payload = request.get_json(silent=True) or {}
    session_id = payload.get("session_id")
    domain = payload.get("domain", "skin")
    presentation_kind = payload.get("presentation_kind", "idle_walk")
    variation = payload.get("variation", "default")
    
    return workbench_export_actor_visual_profile(
        session_id=session_id,
        domain=domain,
        presentation_kind=presentation_kind,
        variation=variation,
        req_id=req_id,
    )
```

### Service Function

```python
def workbench_export_actor_visual_profile(
    session_id: str,
    domain: str,
    presentation_kind: str,
    variation: str,
    req_id: str,
) -> dict[str, Any]:
    """Export ActorVisualProfile as authoring artifact.
    
    Steps:
    1. Create or load ActorVisualProfile
    2. Build SourceRefs (XP/PNG paths)
    3. Build QualityGates (placeholder for future verification)
    4. Add session geometry metadata
    5. Save enhanced profile
    6. Return artifact JSON for download
    """
```

---

## Output Structure

### Exported Artifact Example

```json
{
  "profile_id": "abc123_skin_idle_walk_default",
  "profile_path": "config/actor_visual_profiles/abc123_skin_idle_walk_default.json",
  "artifact": {
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
    ],
    "source_refs": {
      "xp_file": "exports/abc123/abc123.xp",
      "png_file": "exports/abc123/abc123_source.png",
      "semantic_map": null,
      "calibration_artifact": null
    },
    "quality_gates": {
      "G7_cell_density": null,
      "G8_glyph_coverage": null,
      "G9_semantic_completeness": null,
      "mounted_alignment": null,
      "timestamp": "2026-05-12T14:30:00+00:00"
    },
    "metadata": {
      "exported_at": "2026-05-12T14:30:00+00:00",
      "exported_by": "workbench_export_actor_visual_profile",
      "session_geometry": {
        "grid_cols": 8,
        "grid_rows": 8,
        "angles": 8,
        "anims": "9",
        "cell_w": 7,
        "cell_h": 10
      }
    }
  },
  "download_ready": true
}
```

### Downloaded File

**Filename:** `{profile_id}_artifact.json`

**Example:** `abc123_skin_idle_walk_default_artifact.json`

**Format:** Pretty-printed JSON (indent=2)

---

## Key Design Decisions

### 1. SourceRefs Structure

```python
@dataclass
class SourceRefs:
    xp_file: str | None = None       # Path to XP file
    png_file: str | None = None      # Path to source PNG (if uploaded)
    semantic_map: str | None = None  # Path to semantic map (future)
    calibration_artifact: str | None = None  # For mounted domain
```

**Rationale:** Traceability from compiled RenderPlan back to authored source assets.

### 2. QualityGates Placeholders

```python
@dataclass
class QualityGates:
    G7_cell_density: bool | None = None
    G8_glyph_coverage: bool | None = None
    G9_semantic_completeness: bool | None = None
    mounted_alignment: bool | None = None
    timestamp: str | None = None
```

**Rationale:** Future integration with verification pipeline. Currently `null`, populated after verification runs.

### 3. Session Geometry Metadata

Captures the geometry used to create the profile:
- `grid_cols`, `grid_rows` — XP dimensions
- `angles` — Number of rotation angles
- `anims` — Animation frame specification
- `cell_w`, `cell_h` — Character cell dimensions

**Rationale:** Reproducibility — can recreate the exact session geometry from export.

### 4. Auto-Download Behavior

The export function automatically triggers a browser download:

```javascript
const blob = new Blob([JSON.stringify(j, null, 2)], { type: "application/json" });
const url = URL.createObjectURL(blob);
const a = document.createElement("a");
a.href = url;
a.download = `${j.profile_id}_artifact.json`;
a.click();
URL.revokeObjectURL(url);
```

**Rationale:** Immediate artifact availability for import into Bundle Mods or version control.

---

## Integration Points

### 1. Bundle Mods Import

Exported artifacts can be imported via launcher:
```
Bundle Mods → Import content artifact → Select {profile_id}_artifact.json
```

### 2. RenderPlanTable Compiler

The exported profile is compiled into RenderPlan rows:
```bash
python3 -m scripts.pipeline.render_plan_table compile \
  --bundle-src assets/appearance_bundle/phase2-fixtures/positive.bundle.json \
  --sprites-root assets/sprites \
  --out-dir assets/appearance_bundle/current
```

### 3. C++ Parser Gate

The compiled render_plans.json is validated:
```bash
testing/render_plan_parser/__build__/render_plan_parser_test \
  assets/appearance_bundle/current/render_plans.json
```

### 4. Version Control

Exported artifacts should be committed to version control:
```bash
git add config/actor_visual_profiles/{profile_id}.json
git add config/actor_visual_profiles/{profile_id}_artifact.json
git commit -m "Add {profile_id} ActorVisualProfile"
```

---

## Testing

### Manual Test

```bash
cd /Users/r/Downloads/asciicker-pipeline-v3
python3 -m src.pipeline_v2.app

# In browser:
# 1. Navigate to http://127.0.0.1:5071/workbench
# 2. Create or load a session
# 3. Open Domain + Variation Chooser (panel 4b)
# 4. Select domain=skin, presentation_kind=idle_walk, variation=default
# 5. Click "Create ActorVisualProfile"
# 6. Click "Export Authoring Artifact" (panel 17)
# 7. Verify JSON download
# 8. Verify artifact structure
```

### Expected Output

**In viewport:**
```json
{
  "profile_id": "abc123_skin_idle_walk_default",
  "profile_path": "config/actor_visual_profiles/abc123_skin_idle_walk_default.json",
  "artifact": {...},
  "download_ready": true
}
```

**Downloaded file:** `abc123_skin_idle_walk_default_artifact.json`

---

## Phase 2 Progress

| Task | Status | Description |
|------|--------|-------------|
| **Task 1:** Bundle System Guide rewrite | ✅ Complete | Launcher guide updated |
| **Task 2:** Domain/Variation Chooser UI | ✅ Complete | Workbench panel + API |
| **Task 3:** Authoring Artifact Export | ✅ Complete | Structured JSON export |

**Phase 2: COMPLETE ✅**

---

## Remaining Work

### Phase 3: Verification & Deployment

- E2E smoke script (FL-3602)
- build-web.sh integration (C++ parser gate at line 129)
- Deploy receipts with RenderPlanTable hash

### Phase 4: Runtime Cleanup

- Replace old resolver with RenderPlanTable lookup
- Remove mounted/crossbow special cases from runtime

---

## References

- **E2E Workflow Audit:** `docs/plans/2026-05-12-001-e2e-user-workflow-audit.md`
- **ActorVisualProfile Schema:** `config/actor_visual_profile_schema.json`
- **ActorVisualProfile Dataclasses:** `src/pipeline_v2/actor_visual_profile.py`
- **FL-3863:** Pipeline-v3 has no ActorVisualProfile data structure
- **FL-3864:** Bundle System Guide describes old selector-driven architecture
- **Implementation:**
  - UI: `web/workbench.html:521-532`
  - JS: `web/workbench.js:1962-2007`
  - API: `src/pipeline_v2/app.py:979-998`
  - Service: `src/pipeline_v2/service.py:5390-5485`
