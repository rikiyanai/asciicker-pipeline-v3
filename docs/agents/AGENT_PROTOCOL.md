# Agent Protocol

## Purpose

This repo has multiple branches, worktrees, runtime bundles, and historical handoff docs. Agents must not improvise from memory or from other repositories.

This protocol defines the minimum required startup, debugging, and handoff behavior for Claude/Codex/other agents working in this repository.

---

## 0. Milestone Framing

Agents must keep the current XP-editor milestone framed correctly:

- The current milestone is **functional XP-file editor parity first**.
- The proof mechanism is the hard-fail gate sequence defined in `docs/XP_EDITOR_ACCEPTANCE_CONTRACT.md`. There is no oracle/recipe/harness shortcut — the deleted blank-flow harness is not a valid proof path.
- No narrow slice (blank-flow, single-frame, single-layer, `1,1,1` geometry) may be treated as milestone evidence. Evidence must cover both workflow families (new XP authoring and existing XP load/edit/export) with real geometry and all layers.
- Only user-reachable controls count toward editor parity. Hidden state mutation, fake geometry, and skipped layers are forbidden in any artifact described as fidelity or parity proof.
- The primary editor target is a **whole-sheet XP editing surface** aligned with the REXPaint UI model, not the legacy frame-by-frame inspector. The grid/debug sheet may support navigation and atlas structure, but per-frame inspection is not itself the parity target.
- Agents must not collapse the goal down to "single-frame blank-session fidelity" when writing plans, handoffs, or status updates.
- UX/UI polish to make the editor feel like REXPaint belongs **after** capability parity is demonstrated and verified, but replacing the frame-by-frame inspector with a whole-sheet REXPaint-style editor is part of capability parity itself.

If an agent is only working on a narrow diagnostic slice, it must say so explicitly, label the artifact as diagnostic (not fidelity/parity), and tie that slice back to the larger parity milestone.

---

## 1. Mandatory Startup

Before doing any debugging, testing, restore work, or merge planning, the agent must report:

1. current branch name
2. current `HEAD` commit
3. current working tree path
4. whether this branch is:
   - `canonical`
   - `experimental`
   - `restore`
   - `stale/unknown`

If the branch role is unknown, the agent must stop making fix claims and audit branch reality first.

Mandatory startup commands:

1. `python3 scripts/conductor_tools.py status --auto-setup`
2. `python3 scripts/self_containment_audit.py`

If the self-containment audit fails, the agent must treat that as a blocking repo-state defect for any task that would rely on runtime, build, test, or asset paths.

---

## 2. Canonical Sources

Use sources in this order:

1. `AGENTS.md`
2. [docs/INDEX.md](INDEX.md)
3. this file
4. `CLAUDE.md`
5. current live branch/worktree state
6. latest task-relevant handoff
7. focused bug handoff docs such as:
   - `docs/WORKBENCH_DOCS_ARCHIVE.md#workbench-iframe-keyboard-stuck-handoff`
   - `docs/WORKBENCH_DOCS_ARCHIVE.md#claude-research-dump-workbench-move-freeze-2026-02-27`
   - relevant docs under `docs/plans/`

Old summary docs are supporting evidence, not branch truth.

---

## 3. Cross-Repo Isolation

**This repo must be self-contained.** Never reference, symlink, or depend on external folders at runtime or build time. If you need assets from the game source, copy them into the repo and commit them.

Agents must not:

- import code or tools from a different repo path unless the user explicitly asked for that
- run Playwright from another checkout
- read fixtures from another repo to "make the current repo work"
- treat another repo's `node_modules`, scripts, or runtime assets as canonical for this repo
- reference, symlink, or hardcode paths to external folders (e.g. `/Users/r/Downloads/asciicker-Y9-2`, `/Users/r/Downloads/n`)
- use build scripts that pull assets from outside this repo

Concrete example of forbidden behavior:

- writing `/tmp/headed-test.mjs` that imports Playwright from `/Users/r/Downloads/asciicker-Y9-2/node_modules/playwright/index.js`
- a build script that reads `.web` files or sprites from `/Users/r/Downloads/asciicker-Y9-2/`
- symlinks under `runtime/` or `sprites/` that point outside this repo

If a required dependency or asset is missing in this repo, the agent must say so explicitly — not silently reach outside the repo to find it.

Enforcement:

- install hooks with `bash scripts/install_self_containment_hooks.sh`
- hooks run `python3 scripts/self_containment_audit.py` on `pre-commit` and `pre-push`
- blocking findings:
  - symlinks that resolve outside the repo
  - live/build/runtime/test files that reference absolute paths outside the repo
- historical doc references are warnings by default and can be made blocking with `python3 scripts/self_containment_audit.py --strict-docs`

---

## 4. Test Script Policy

Agents must prefer existing runners before creating new scripts.

Before writing any new test script, the agent must check for existing relevant runners in:

- `scripts/`
- `tests/`
- `docs/` handoff instructions

If a new script is still required:

- it must live in the repo, not silently in `/tmp`
- it must state its purpose at the top
- it must not become the new "truth" unless the user approves

One-off throwaway scripts are a last resort, not the default workflow.

---

## 5. Background Process Policy

Agents must not launch unattended background processes without explicitly stating:

1. what process was started
2. why it is needed
3. how to stop it
4. which branch/worktree it belongs to

Forbidden default behavior:

- `node some-script.mjs &`
- server starts that are not tied to a stated branch and port owner

Preferred behavior:

- foreground command
- or a clearly announced background server with stop instructions

---

## 6. Branch Truth Before Debugging

For any bug involving "restore", "regression", "why did this stop working", or "bundle fix version", the agent must determine:

1. which branch the user is currently running
2. which branch contains the known-good restore line
3. whether those are the same branch
4. whether the runtime bundle in use matches the expected branch

If the known-good restore line is on another branch, the agent must say that plainly before suggesting file-level fixes.

### Canonical Bundle Checkpoint

For the current Workbench bundle checkpoint, the canonical evidence is:

- branch/worktree: main worktree `/Users/r/Downloads/asciicker-pipeline-v2` on `restore/bundle-override-filter-8279e11`
- committed base: `89b7d0616853276043cccd6130b1463700742c7d`
- required dirty baseline delta:
  - `web/workbench.html`
  - `web/workbench.js`
  - `scripts/workbench_bundle_manual_watchdog.mjs`
- saved manual recording: `/Users/r/Downloads/workbench-ui-recording-2026-03-11T13-27-24-653Z.json`
- fresh headed verification artifact: [result.json](/Users/r/Downloads/asciicker-pipeline-v2/output/playwright/workbench-headed-replay-2026-03-12T13-56-16-164Z/result.json)

The canonical action order is:

1. `Attack`
2. `Death`
3. `Idle / Walk`
4. `Test Bundle Skin`

The checkpoint is only considered matched when the workbench reaches `Bundle: 3/3 actions converted` and `Applied bundle skin`.

---

## 7. Runtime / Asset Bugs

For Workbench skin-dock, flat-arena, runtime, or map issues, agents must distinguish between:

- UI logic bug
- runtime bundle mismatch
- flatmap/bootstrap mismatch
- gameplay/world freeze after runtime entry

Agents must not collapse all of these into "the iframe is broken" or "the test dock is missing."

When the user says:

- "world is wrong"
- "bundle fix version"
- "freeze after move"

the agent must inspect runtime bundle and flatmap/bootstrap state first.

---

## 8. Claim Discipline

Agents must not say:

- "fixed"
- "restored"
- "working"
- "same as known-good version"

without attaching:

1. branch name
2. commit hash
3. verification command or artifact

If any of those are missing, the claim must be downgraded to:

- "suspected"
- "partially restored"
- "not yet verified"

---

## 9. Merge / Restore Rules

Agents must not write merge plans or restore advice based on local `master` alone.

They must check:

- current branch
- `origin/master`
- active worktrees
- whether the restore branch was actually merged

If a restore happened on a side branch and was never merged back, the agent must treat that as the main finding.

---

## 10. Session-End Requirements

At the end of any substantial session, the agent must leave one handoff containing:

- branch
- `HEAD`
- what changed
- what was tested
- what was not tested
- known blockers
- exact next command

If no handoff was updated, the session is incomplete.

---

## 11. First Read For Current Repo State

Start with the canonical hub and then pick the task-specific handoff:

- [docs/INDEX.md](INDEX.md)
- [XP Editor Acceptance Contract](XP_EDITOR_ACCEPTANCE_CONTRACT.md)

For editor/doc status work on audited `master`, read:

- [2026-03-13-CLAUDE-HANDOFF-EDITOR-DOC-ALIGNMENT.md](docs/WORKBENCH_DOCS_ARCHIVE.md#2026-03-13-claude-handoff-editor-doc-alignment)
- [2026-03-13 claim verification](docs/WORKBENCH_DOCS_ARCHIVE.md#2026-03-13-claim-verification)

Do not use any deleted or historical "XP fidelity harness" plan as current truth. If XP-editor
verification work resumes, it must load real XP through the product path and hard-fail on
metadata, layer, visual, export, and Skin Dock/runtime mismatches.

Current restart handoff:

- [2026-03-15-CLAUDE-HANDOFF-FOUR-AUDITS-XP-EDITOR.md](docs/WORKBENCH_DOCS_ARCHIVE.md#2026-03-15-claude-handoff-four-audits-xp-editor)

For the branch confusion and restore/bundle history, read:

- [2026-03-11-CLAUDE-HANDOFF-CURRENT-STATE.md](docs/WORKBENCH_DOCS_ARCHIVE.md#2026-03-11-claude-handoff-current-state#L1)

That older handoff explains:

- why `feat/workbench-mcp-server` is not the full restore line
- why `restore/bundle-override-filter-8279e11` matters
- which commits changed runtime truth
- what not to do next

---

## 12. Decision Rule

If the agent has not identified the exact branch/runtime baseline, it is not ready to fix the bug.

---

## 13. Verification Evidence Protocol

### 13a. Canonical Verifier Path

The only path that may produce acceptance evidence for XP-editor parity is the canonical
recipe-driven verifier:

1. `scripts/xp_fidelity_test/truth_table.py` — extracts ground truth from source XP
2. `scripts/xp_fidelity_test/recipe_generator.py` — generates a spec-constrained recipe of
   user-reachable actions
3. `scripts/xp_fidelity_test/run_fidelity_test.mjs` — executes the recipe through the shipped
   workbench and compares the result against the truth table

Acceptance evidence must come from this path. No other script, harness, or manual procedure
may be cited as acceptance evidence for parity claims.

### 13b. Ad Hoc Scripts Are Diagnostic Only

Ad hoc Playwright scripts, browser-console probes, `page.evaluate()` state mutations,
`window.__wb_debug` calls, and one-off test files are permitted for **implementation diagnosis
only**. They may:

- help narrow down a specific bug
- verify a single code change in isolation
- explore browser behavior during development

They may NOT:

- be cited as acceptance evidence
- be labeled with reserved words (fidelity, parity, acceptance, verified, PASS)
- substitute for the canonical verifier when the canonical verifier fails or cannot express
  the workflow under test

### 13c. Verifier Inability Is a Verifier Bug

If the canonical verifier cannot express a required workflow (e.g., whole-sheet tool
activation, apply-mode toggling, multi-layer editing), that is a **failure in the verifier**,
not permission to bypass it.

The correct response is:

1. record the verifier gap as a blocking issue
2. fix the verifier so it can express the workflow
3. then run the workflow through the fixed verifier

The incorrect response is:

- writing an ad hoc script that tests the workflow outside the verifier
- citing that ad hoc script as acceptance evidence
- claiming the workflow is verified because the ad hoc script passed

### 13d. Recipe Mode Requirement

The recipe generator must distinguish between:

- **acceptance mode** (`--mode acceptance`): emits only user-reachable actions through the
  shipped whole-sheet editor surface. Inspector-only, debug-only, and hidden actions are
  refused. Only this mode produces acceptance-eligible recipes.
- **diagnostic mode** (`--mode diagnostic`): may emit inspector-primary actions for
  implementation debugging. Results must be labeled as diagnostic, not acceptance.

The test runner must enforce the same mode distinction and refuse to execute debug-only
actions when running in acceptance mode.
