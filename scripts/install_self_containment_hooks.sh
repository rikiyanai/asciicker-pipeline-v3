#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"

git -C "$ROOT" config core.hooksPath .githooks
chmod +x \
  "$ROOT/.githooks/pre-commit" \
  "$ROOT/.githooks/pre-push" \
  "$ROOT/.githooks/commit-msg" \
  "$ROOT/.githooks/reference-transaction" \
  "$ROOT/.githooks/post-checkout" \
  "$ROOT/.githooks/lib/repo_guard.sh"

echo "Installed git hooks via core.hooksPath=.githooks"
echo "Running self-containment audit..."
python3 "$ROOT/scripts/self_containment_audit.py"
