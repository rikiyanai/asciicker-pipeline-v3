#!/usr/bin/env bash
# W24-W27 whole-sheet selection transform proof runner
# Usage: bash scripts/xp_fidelity_test/run_whole_sheet_transform.sh [--url <base_url>]
set -euo pipefail
cd "$(dirname "$0")/../.."

URL="${1:-}"
if [ "$URL" = "--url" ]; then URL="${2:-}"; fi
if [ -z "$URL" ]; then URL="http://localhost:5071"; fi

OUT="output/ws_transform_test"
rm -rf "$OUT"
mkdir -p "$OUT"

node scripts/xp_fidelity_test/run_whole_sheet_transform_test.mjs \
  --xp sprites/attack-0001.xp \
  --out-dir "$OUT" \
  --url "$URL" \
  "$@"
