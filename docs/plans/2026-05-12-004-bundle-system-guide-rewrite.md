# Bundle System Guide Rewrite Delivery

**Date:** 2026-05-12
**Phase:** 2, Task 1 (COMPLETE ✅)
**Related FL Entries:** FL-3864
**Audit Reference:** `docs/plans/2026-05-12-001-e2e-user-workflow-audit.md` (Step 1: Launcher Entry)

---

## Summary

The Bundle System Guide in the Y9-2 launcher has been rewritten to explain the **RenderPlanTable replacement architecture** instead of the old selector-driven bundle system.

**Location:** `asciicker-Y9-2/scripts/launcher.py` → `_show_bundle_system_guide_content()`

---

## What Changed

### Old Guide (Deleted Architecture)

```
XP → bundle → selector → resolver → fallback chain → compose
```

**Taught users:**
- 6 key terms: presentation_kind_id, skin_definition_id, item_definition_id, slot_kind_id, visual_style_id, variant_signature
- Runtime selector maps state masks to presentation family
- Fallback order for missing geometry
- Crossbow and mounted as special cases

### New Guide (Current Architecture)

```
ActorVisualProfile → ServerVisualKey → RenderPlan row → dumb presenter
```

**Teaches users:**
- 5 key terms: ActorVisualProfile, ServerVisualKey, RenderPlan row, RenderPlanTable, dumb presenter
- Exact RenderPlan lookup (no fallback, no resolver)
- Crossbow and mounted as **key dimensions**, not special cases
- C++ runtime parser gate (mandatory, not optional)

---

## New Content Structure

### 1. Why It Exists
- Eliminates runtime guesswork
- Server owns visual identity
- Client renders authorized RenderPlan rows
- **No fallback search, no runtime inference, no special cases**

### 2. The Replacement Architecture
```
Old (deleted):  XP → bundle → selector → resolver → fallback chain → compose
New (current):  ActorVisualProfile → ServerVisualKey → RenderPlan row → dumb presenter
```

### 3. The 5 Key Terms

| Term | Definition |
|------|------------|
| **ActorVisualProfile** | Authored object defining layers, slots, and visual key dimensions (variation, mount state). Created in pipeline-v3 workbench. Stored as JSON. |
| **ServerVisualKey** | Lookup key for RenderPlan rows. Components: skin_definition_id, presentation_kind_id, variation, slot_state, mount_state. |
| **RenderPlan row** | Compiled output: exact ordered layer composition. One row per ServerVisualKey. No runtime sorting. |
| **RenderPlanTable** | Full table of RenderPlan rows. Emitted as render_plans.json. |
| **Dumb presenter** | Runtime C++ code that looks up ServerVisualKey and renders ordered layers. No fallback. |

### 4. What Changed: Crossbow and Mounted

```
Old (deleted):  Crossbow had special runtime logic. Mounted had special composer.
New (current):  Crossbow is a variation dimension. Mounted is a domain.
                Both are explicit key dimensions in ServerVisualKey.
                No special runtime paths. No fallback chains.
```

### 5. The Content Authoring Workflow (16 Steps)

| Steps | Surface | Description |
|-------|---------|-------------|
| 1–3 | Launcher | Open Y9-2 launcher → 2 ASSET & MAP EDITOR → Sprite Asset Browser → Open XPEdit |
| 4–5 | Workbench | Choose domain, presentation_kind, variation |
| 6–7 | Authoring | Create/import XP, assign layers to slots, export ActorVisualProfile |
| 8–9 | Compiler | Bundle Mods → Import content artifact → Compile RenderPlan rows |
| 10 | Parser gate | **C++ runtime parser** validates render_plans.json |
| 11–12 | Preview | Preview exact RenderPlan rows, confirm ordered layers |
| 13–16 | Deploy | Build web → Candidate deploy → Runtime proof → Promote |

### 6. The XP → Screen Chain (New)

| Steps | Owner | Description |
|-------|-------|-------------|
| 0–2 | Authoring | XP/PNG → ActorVisualProfile (JSON) → ServerVisualKey |
| 3–4 | Compiler | ActorVisualProfile → RenderPlan row → render_plans.json |
| 5 | Parser gate | C++ runtime parser validates render_plans.json |
| 6–7 | Server | server_tick.cpp sends AppearanceStateV2 to clients |
| 8–9 | Client | Convert AppearanceStateV2 → ServerVisualKey |
| 10 | Client | Lookup ServerVisualKey in RenderPlanTable |
| 11–12 | Client | Render ordered layers (no fallback, no resolver) |

### 7. Common Mistakes

| Mistake | Correction |
|---------|------------|
| Expecting runtime to infer variation from state masks | Variation is explicit in ServerVisualKey |
| Confusing visual_style_id (color) with variation (geometry) | visual_style_id = color lane, variation = geometry |
| Assuming Python-only validation is sufficient | **C++ parser gate is mandatory** (FL-3862) |
| Thinking crossbow or mounted are special cases | They're key dimensions in ServerVisualKey |
| Expecting fallback search at runtime | RenderPlan lookup is exact |

### 8. How to Add New Art

**New skin:**
1. Open pipeline-v3 workbench
2. Choose domain=skin
3. Choose presentation_kind (idle_walk/attack/plydie)
4. Choose variation (default/crossbow_attack/etc.)
5. Assign body layer
6. Export ActorVisualProfile
7. Bundle Mods → Import content artifact → Compile RenderPlan
8. C++ parser gate → Preview → Deploy

**New wearable:**
1. Open pipeline-v3 workbench
2. Choose domain=wearable
3. Assign to slot (head/chest/weapon/shield)
4. Export ActorVisualProfile
5. Compile RenderPlan → Deploy

**New mounted:**
1. Open pipeline-v3 workbench
2. Choose domain=mount
3. Assign mount_rear/mount_rider/mount_front layers
4. Export ActorVisualProfile
5. Compile RenderPlan → Deploy

### 9. Key Commands

```bash
# Compile (emits render_plans.json)
python3 -m scripts.pipeline.appearance_bundle compile \
  --bundle-src assets/appearance_bundle/phase2-fixtures/positive.bundle.json \
  --sprites-root assets/sprites --out-dir assets/appearance_bundle/current

# Verify (Python validation)
Bundle Mods → [v] Verify

# Parser gate (C++ validation - MANDATORY)
testing/render_plan_parser/__build__/render_plan_parser_test \
  assets/appearance_bundle/current/render_plans.json

# Activate (swap compiled output)
Bundle Mods → [a] Activate
```

### 10. References

- E2E workflow audit: `docs/plans/2026-05-12-001-e2e-user-workflow-audit.md`
- ActorVisualProfile schema: `config/actor_visual_profile_schema.json`
- RenderPlanTable compiler: `scripts/pipeline/render_plan_table.py`
- C++ parser test: `testing/render_plan_parser/render_plan_parser_test.cpp`
- FL-3861: appearance_bundle.py does not emit render_plans.json
- FL-3862: build-web.sh does not invoke C++ runtime parser
- FL-3863: Pipeline-v3 has no ActorVisualProfile data structure
- FL-3864: Bundle System Guide describes old selector-driven architecture

---

## Testing

### Manual Test

```bash
cd asciicker-Y9-2
python3 scripts/launcher.py
# Navigate to: 2 ASSET & MAP EDITOR → Info / Help → [b] Bundle System Guide
# Verify new content renders correctly
```

### Visual Verification

Expected sections:
- [x] Why it exists
- [x] The replacement architecture (old vs new diagram)
- [x] The 5 key terms (table format)
- [x] What changed: crossbow and mounted
- [x] The content authoring workflow (16 steps)
- [x] The XP → screen chain (new)
- [x] Common mistakes
- [x] How to add new art (skin/wearable/mounted)
- [x] Key commands
- [x] References

---

## Impact

**User-Facing:**
- Users accessing "Bundle System Guide" from launcher will learn the **correct mental model**
- No confusion about runtime inference, fallback chains, or special cases
- Clear path from authoring to deployment

**Developer-Facing:**
- Guide now matches Phase 1 implementation (ActorVisualProfile, RenderPlanTable, C++ parser)
- References to FL entries for traceability
- Links to actual implementation files

---

## Next Steps

**Phase 2, Task 2:** Domain/Variation Chooser UI in Workbench

Add explicit UI in pipeline-v3 workbench for:
- Domain selection (skin/wearable/weapon/shield/mount)
- Variation selection (default/crossbow_attack/etc.)
- Presentation kind selection (idle_walk/attack/plydie)

**Phase 2, Task 3:** Authoring Artifact Export

Add "Export Authoring Artifact" action that produces structured JSON with:
- ActorVisualProfile
- Source refs (XP/PNG/semantic maps)
- Quality gate results
- Calibration artifacts (for mounted)

---

## References

- **E2E Workflow Audit:** `docs/plans/2026-05-12-001-e2e-user-workflow-audit.md`
- **FL-3864:** Bundle System Guide describes old selector-driven architecture
- **Implementation:** `asciicker-Y9-2/scripts/launcher.py:5851-5970`
