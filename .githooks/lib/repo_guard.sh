#!/usr/bin/env bash
set -euo pipefail

readonly ZERO_OID=0000000000000000000000000000000000000000
readonly ALLOWED_BRANCHES=("main" "v3-refactor-start" "deployed-prod-baseline")

_canon_path() {
  python3 - "$1" <<'PY'
import os
import sys

print(os.path.realpath(sys.argv[1]))
PY
}

is_allowed_branch_name() {
  local name="${1:?branch name required}"
  local allowed
  for allowed in "${ALLOWED_BRANCHES[@]}"; do
    if [[ "$name" == "$allowed" ]]; then
      return 0
    fi
  done
  return 1
}

ensure_primary_worktree() {
  local git_dir common_dir
  git_dir="$(_canon_path "$(git rev-parse --git-dir)")"
  common_dir="$(_canon_path "$(git rev-parse --git-common-dir)")"
  if [[ "$git_dir" == "$common_dir" ]]; then
    return 0
  fi

  cat >&2 <<EOF
ERROR: linked git worktrees are forbidden in this repo.
Current git-dir: $git_dir
Common git-dir: $common_dir
Remove this linked worktree and use the primary checkout only.
EOF
  return 1
}

reject_disallowed_branch_ref() {
  local ref_name="${1:?ref name required}"
  case "$ref_name" in
    refs/heads/*)
      local branch_name="${ref_name#refs/heads/}"
      if ! is_allowed_branch_name "$branch_name"; then
        echo "ERROR: creating or updating disallowed branch '$branch_name' is blocked in this repo." >&2
        echo "Allowed local branches: ${ALLOWED_BRANCHES[*]}" >&2
        return 1
      fi
      ;;
  esac
  return 0
}
