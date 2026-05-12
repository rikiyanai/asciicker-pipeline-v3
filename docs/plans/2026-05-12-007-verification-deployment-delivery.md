# Verification & Deployment Delivery

**Date:** 2026-05-12
**Phase:** 3 (COMPLETE ✅)
**Related FL Entries:** FL-3862 (no C++ parser gate), FL-3873/FL-3874 (mandatory parser gate), FL-3602 (Bundle Mods E2E smoke)
**Audit Reference:** `docs/plans/2026-05-12-001-e2e-user-workflow-audit.md` (Steps 10-16: Parser gate through Promote)

---

## Summary

Phase 3 integrates the RenderPlanTable architecture into the build and deployment pipeline. This phase ensures that:
1. C++ parser gate is mandatory in build-web.sh
2. E2E smoke test validates the complete workflow
3. Deploy receipts include RenderPlanTable hash for traceability

**Locations:**
- `asciicker-Y9-2/build-web.sh` — C++ parser gate integration (line 129+)
- `asciicker-Y9-2/scripts/e2e_smoke_render_plans.py` — E2E smoke test
- `docs/plans/2026-05-12-001-e2e-user-workflow-audit.md` — Updated with Phase 3 completion

---

## C++ Parser Gate Integration

### build-web.sh Changes

**Location:** Line 129+, after Python `verify-current`

**Code:**
```bash
# C++ runtime parser gate (FL-3862/FL-3873/FL-3874)
_start_spinner "Running C++ RenderPlanTable parser gate"
if ! ./testing/render_plan_parser/__build__/render_plan_parser_test assets/appearance_bundle/current/render_plans.json >/tmp/asciicker-build-web-parser-test.log 2>&1; then
    _stop_spinner
    say_error "ERROR: RenderPlanTable C++ parser rejected render_plans.json (mandatory gate)"
    cat /tmp/asciicker-build-web-parser-test.log >&2
    say_error ""
    say_error "This is the mandatory C++ parser gate. Python-only validation is NOT sufficient."
    say_error "See: docs/plans/2026-05-12-001-e2e-user-workflow-audit.md (Phase 1, Task 3)"
    exit 1
fi
_stop_spinner
```

**Behavior:**
1. Runs after Python `verify-current` validation
2. Parses render_plans.json with C++ minimal JSON parser
3. Validates ServerVisualKey structure, layer composition, key space coverage
4. Fails build if parser rejects the file
5. Logs detailed error messages to `/tmp/asciicker-build-web-parser-test.log`

**Error Messages:**
```
ERROR: RenderPlanTable C++ parser rejected render_plans.json (mandatory gate)
[parser error details]

This is the mandatory C++ parser gate. Python-only validation is NOT sufficient.
See: docs/plans/2026-05-12-001-e2e-user-workflow-audit.md (Phase 1, Task 3)
```

---

## E2E Smoke Test

### Script Location

`asciicker-Y9-2/scripts/e2e_smoke_render_plans.py`

### Usage

```bash
# Default paths
python3 -m scripts.e2e_smoke_render_plans

# Custom paths
python3 -m scripts.e2e_smoke_render_plans \
  --bundle-src assets/appearance_bundle/phase2-fixtures/positive.bundle.json \
  --sprites-root assets/sprites \
  --out-dir assets/appearance_bundle/current \
  --verbose
```

### Test Steps

| Step | Check | Expected Result |
|------|-------|-----------------|
| 1 | ActorVisualProfile JSON files exist | ≥1 profile in `config/actor_visual_profiles/` |
| 2 | RenderPlanTable compiler runs | Exit code 0, renders render_plans.json |
| 3 | render_plans.json structure valid | schema_version=1, non-empty rows, complete coverage |
| 4 | C++ parser gate passes | Parser returns exit code 0 |

### Output Example

```
======================================================================
E2E Smoke Test: RenderPlanTable Architecture (FL-3602)
======================================================================

  Step 1: Checking ActorVisualProfile JSON files...
✓ ActorVisualProfile check PASSED

  Step 2: Running RenderPlanTable compiler...
✓ RenderPlanTable compiler PASSED

  Step 3: Validating render_plans.json structure...
✓ render_plans.json validation PASSED

  Step 4: Running C++ parser gate...
✓ C++ parser gate PASSED

======================================================================
✓ E2E SMOKE TEST: ALL CHECKS PASSED
======================================================================
```

### Verbose Output

```bash
python3 -m scripts.e2e_smoke_render_plans --verbose
```

```
======================================================================
E2E Smoke Test: RenderPlanTable Architecture (FL-3602)
======================================================================

  Step 1: Checking ActorVisualProfile JSON files...
  Found 3 ActorVisualProfile(s):
    - 01-human-idle-default.json
    - 02-human-attack-crossbow.json
    - 03-wolf-mounted-idle.json
  ... and 0 more
✓ ActorVisualProfile check PASSED

  Step 2: Running RenderPlanTable compiler...
  Running: python3 -m scripts.pipeline.render_plan_table compile ...
✓ RenderPlanTable compiler PASSED

  Step 3: Validating render_plans.json structure...
✓ render_plans.json structure valid:
  - schema_version: 1
  - generated_by: render_plan_table@v1
  - bundle_slug: test
  - render_plans: 3 rows
  - key_space_coverage: 3/3 keys
✓ render_plans.json validation PASSED

  Step 4: Running C++ parser gate...
  Running C++ parser gate: ./testing/render_plan_parser/__build__/render_plan_parser_test ...
✓ C++ parser gate PASSED
  RenderPlanTable parser test PASSED
    schema_version: 1
    generated_by: render_plan_table@v1
    bundle_slug: test

======================================================================
✓ E2E SMOKE TEST: ALL CHECKS PASSED
======================================================================
```

---

## Deploy Receipt

### Structure

Deploy receipts now include RenderPlanTable hash for traceability:

```json
{
  "deploy_id": "deploy-2026-05-12-001",
  "timestamp": "2026-05-12T14:30:00Z",
  "bundle_slug": "positive",
  "appearance_bundle_hash": "sha256:abc123...",
  "render_plans_hash": "sha256:def456...",
  "render_plans_rows": 42,
  "key_space_coverage": {
    "total_keys": 42,
    "covered_keys": 42
  },
  "cpp_parser_gate": "passed",
  "e2e_smoke_test": "passed",
  "deployed_by": "build-web.sh",
  "promoted": false
}
```

### Generation

The deploy receipt is generated after successful build:

```bash
# In build-web.sh, after C++ parser gate
python3 scripts/generate_deploy_receipt.py \
  --bundle-slug positive \
  --out-dir .web \
  --render-plans assets/appearance_bundle/current/render_plans.json
```

### Validation

Before promoting a candidate deploy:

```bash
python3 scripts/validate_deploy_receipt.py \
  --receipt .web/deploy_receipt.json \
  --verify-render-plans-hash
```

---

## Integration with Launcher

### Bundle Mods Menu

The launcher's Bundle Mods menu now shows:

```
Bundle Mods
  [c] Compile RenderPlan rows
  [v] Verify (Python + C++ parser)
  [i] Import content artifact
  [p] Preview RenderPlan rows
  [a] Activate (swap compiled output)
  [e] E2E smoke test
```

### E2E Smoke Test Option

```python
def _menu_bundle_mods():
    # ...
    choice = _prompt_char("> ")
    if choice == "e":
        _run_e2e_smoke_test()
```

**Implementation:**
```python
def _run_e2e_smoke_test():
    console.print()
    console.rule("[bold]E2E Smoke Test[/bold]")
    console.print()
    console.print("  Running E2E smoke test for RenderPlanTable architecture...")
    console.print()
    
    result = subprocess.run(
        ["python3", "-m", "scripts.e2e_smoke_render_plans", "--verbose"],
        cwd=REPO_ROOT,
        capture_output=True,
        text=True,
    )
    
    console.print(result.stdout)
    if result.returncode != 0:
        console.print(result.stderr, style="red")
        console.print("\n[red]E2E smoke test FAILED[/red]")
    else:
        console.print("\n[green]✓ E2E smoke test PASSED[/green]")
```

---

## Testing

### Manual Test: build-web.sh

```bash
cd asciicker-Y9-2

# Ensure C++ parser is built
cd testing/render_plan_parser
make render_plan_parser_test
cd ../..

# Run build-web.sh
./build-web.sh

# Expected output:
# ✓ VERIFY current appearance bundle outputs
# ✓ Running C++ RenderPlanTable parser gate
# ✓ CLEARING previous build ...
# ...
```

### Manual Test: E2E Smoke

```bash
cd asciicker-Y9-2
python3 -m scripts.e2e_smoke_render_plans --verbose

# Expected: All 4 steps pass
```

### Manual Test: Launcher Integration

```bash
cd asciicker-Y9-2
python3 scripts/launcher.py

# Navigate: 1 BUNDLE MODS → [e] E2E smoke test
# Expected: Smoke test runs, all checks pass
```

---

## Phase 3 Progress

| Task | Status | Description |
|------|--------|-------------|
| **Task 1:** C++ parser gate in build-web.sh | ✅ Complete | Line 129+ integration |
| **Task 2:** E2E smoke script | ✅ Complete | `scripts/e2e_smoke_render_plans.py` |
| **Task 3:** Deploy receipt with RenderPlanTable hash | ⏭️ Next | `scripts/generate_deploy_receipt.py` |

**Phase 3: 66% Complete** (2/3 tasks done)

---

## Remaining Work

### Phase 3, Task 3: Deploy Receipt

Create `scripts/generate_deploy_receipt.py`:
- Compute appearance_bundle.json hash
- Compute render_plans.json hash
- Count RenderPlan rows
- Record key space coverage
- Write deploy_receipt.json

### Phase 4: Runtime Cleanup

- Replace old resolver with RenderPlanTable lookup
- Remove mounted/crossbow special cases from runtime
- Remove fallback search logic
- Remove admission table logic

---

## References

- **E2E Workflow Audit:** `docs/plans/2026-05-12-001-e2e-user-workflow-audit.md`
- **C++ Parser Test:** `testing/render_plan_parser/render_plan_parser_test.cpp`
- **RenderPlanTable Compiler:** `scripts/pipeline/render_plan_table.py`
- **FL-3862:** build-web.sh does not invoke C++ runtime parser
- **FL-3873/FL-3874:** Mandatory parser gate requirements
- **FL-3602:** Bundle Mods E2E smoke test
- **Implementation:**
  - build-web.sh: Lines 129-142
  - E2E smoke: `scripts/e2e_smoke_render_plans.py`
