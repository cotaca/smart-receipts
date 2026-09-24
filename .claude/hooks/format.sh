#!/usr/bin/env bash
# PostToolUse (Edit|Write): format the file Claude just changed. Formatting only —
# no `ruff check --fix` / `eslint --fix` here: they would delete an import Claude
# added one edit before using it. Lint runs in scripts/check.sh. Never blocks.
file=$(node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>{try{process.stdout.write(JSON.parse(s).tool_input?.file_path??"")}catch{}})')
root="${CLAUDE_PROJECT_DIR:-$(pwd)}"
case "$file" in
  "$root"/backend/*.py)
    (cd "$root/backend" && uv run --quiet ruff format --quiet "$file") ;;
  "$root"/frontend/*.ts|"$root"/frontend/*.tsx|"$root"/frontend/*.js|"$root"/frontend/*.jsx|"$root"/frontend/*.json|"$root"/frontend/*.css)
    (cd "$root/frontend" && npx --no-install prettier --write --log-level silent "$file") ;;
esac
exit 0
