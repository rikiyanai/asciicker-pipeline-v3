#!/usr/bin/env bash
# Randomized bundle smoke test — entry point.
#
# Runs the randomized bundle test: each action (idle, attack, death) gets
# a randomly assigned authoring method (new_xp, upload_xp, upload_png).
# Always runs headed so the operator can observe.
#
# Usage:
#   bash scripts/xp_fidelity_test/run_randomized_bundle.sh [--seed <n>] [--url <url>] [--hold]
set -euo pipefail

OUT_ROOT="output/xp-fidelity-test"
STAMP="$(date -u +%Y-%m-%dT%H-%M-%SZ)"
OUT_DIR="${OUT_ROOT}/randomized-bundle-${STAMP}"
mkdir -p "${OUT_DIR}"

ARGS=(--out-dir "${OUT_DIR}" --headed)

# Pass through any extra args
while [[ $# -gt 0 ]]; do
  ARGS+=("$1"); shift
done

echo "=== Randomized Bundle Smoke Test ==="
echo "  output: ${OUT_DIR}"
node scripts/xp_fidelity_test/run_randomized_bundle_test.mjs "${ARGS[@]}"
