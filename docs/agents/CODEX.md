# Codex Memory

Use this file as short-lived repo memory, not as proof over code.

## Startup

- Run `python3 scripts/conductor_tools.py status --auto-setup` first.
- Then run `python3 scripts/self_containment_audit.py`.
- Then read `AGENTS.md`, `docs/INDEX.md`, and `docs/AGENT_PROTOCOL.md`.
- Then read `PLAYWRIGHT_FAILURE_LOG.md` and the active milestone plans before making status claims.

## Document Authority Model

This repo uses a 3-doc canonical authority model:

1. `PLAYWRIGHT_FAILURE_LOG.md` — reality/failure/proof log
2. `docs/plans/2026-03-23-workbench-canonical-spec.md` — normative requirements / roadmap / bug-priority / policy
3. `docs/plans/2026-03-23-m2-capability-canon-inventory.md` — capability inventory / SAR canon

All other docs are worksheets or reference. Worksheets must be retired after completion via `scripts/doc_lifecycle_stitch.sh`. See `AGENTS.md` § Document Authority Model for the full policy.

## Milestone Requirements

### Milestone 1 Pass

Milestone 1 passes only when:

- the canonical root-hosted workbench passes the `full_recreation` verifier lane for the bundle-native workflow
- the edge-case workflow verifier passes for the defined bundle/session/gating/hydration flows
- acceptance evidence comes from user-reachable actions only
- the save/export/test loop works for the full bundle flow
- the full bundle works in Skin Dock/runtime
- base-path verification shows no `/xpedit`-specific regressions
- any remaining issues are explicitly classified as verifier-only artifacts or accepted non-blocking residuals

Short version:

- M1 pass = full-recreation passes + edge-case passes + user-reachable acceptance path + full bundle works in Skin Dock/runtime + no unresolved prefix-only regressions

### Milestone 2 Pass

Milestone 2 passes only when the verifier and product cover the entire shipped workbench for PNG ingest/manual assembly, not just the whole-sheet XP editor.

- all user-reachable actions are mapped in a canonical SAR table
- that includes buttons, mode switches, source-panel actions, grid actions, whole-sheet actions, runtime actions, and context-menu actions
- the SAR model defines starting state, allowed actions, required responses/invariants, and valid next states for each workflow family
- the verifier executes predefined contract-driven workflow sequences representing what the shipped workbench must be able to do
- those sequences produce structured evidence analogous to the M1 truth-table -> recipe -> run flow, but adapted for workflow-state correctness rather than only XP-cell fidelity
- acceptance-critical M2 lanes pass on both root-hosted and prefixed/base-path hosting without errors

Short version:

- M2 pass = the entire workbench is covered by a canonical SAR/action-response model and the verifier can execute the required workflow sequences successfully on both root-hosted and base-path hosting

## Current High-Signal Truths

- Milestone 1 is closed on canonical root-hosted `master` as of 2026-03-23.
- Base-path verification found no `/xpedit`-specific regressions for the M1 edge-workflow lane.
- `window.__wb_debug.getState()` is the preferred verifier state surface; `_state()` fallback should be treated as temporary and audited.
- The project requirement is one coherent verifier architecture across canonical and base-path hosting.
- Any doc still referencing `feat/base-path-support` as a live branch is stale — that branch was merged and retired on 2026-03-23.

## Drift Guardrail

- Do not continue M2 implementation on top of stale planning docs or drifted verifier code.
- `feat/base-path-support` was fully merged into `master` at `e895298` and retired on 2026-03-23. All base-path work now lives on `master`.
- Do not describe the verifier as unified unless the shared library, active runners, and planning docs actually match.
