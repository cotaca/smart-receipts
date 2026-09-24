#!/usr/bin/env bash
# Full pre-handover check (see AGENTS.md). Fixes lint/format in place, then verifies.
# Runs every step even if one fails; exit code is non-zero if any step failed.
set -uo pipefail
root="$(cd "$(dirname "$0")/.." && pwd)"
failed=()
run() { echo "▶ $*"; "$@" || failed+=("$*"); }

cd "$root/backend"
run uv run ruff check --fix .
run uv run ruff format .
run uv run pytest -q

cd "$root/frontend"
run npm run lint:fix
run npm run format
run npm run typecheck
run npm run test -- --run

if ((${#failed[@]})); then
  printf '✗ failed: %s\n' "${failed[@]}"; exit 1
fi
echo "✓ all checks green"
