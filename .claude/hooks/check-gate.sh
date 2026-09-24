#!/usr/bin/env bash
# Stop gate for the `implementer` subagent (declared in its frontmatter, runs as
# SubagentStop). Blocks the agent from finishing while scripts/check.sh is red.
# Gives up after 3 blocked attempts so an unfixable failure can't loop forever —
# the agent is told to report it instead.
input=$(cat)
field() { node -e 'try{const v=JSON.parse(process.argv[1])[process.argv[2]];process.stdout.write(v==null?"":String(v))}catch{}' "$input" "$1"; }
root="${CLAUDE_PROJECT_DIR:-$(pwd)}"
cd "$root" || exit 0

# Nothing changed in the working tree → nothing to check.
if git diff --quiet && [ -z "$(git ls-files --others --exclude-standard)" ]; then exit 0; fi

counter="${TMPDIR:-/tmp}/claude-check-gate-$(field session_id)-$(field agent_id)"
[ "$(field stop_hook_active)" = "true" ] || rm -f "$counter"

log=$(mktemp)
if scripts/check.sh >"$log" 2>&1; then rm -f "$counter" "$log"; exit 0; fi

n=$(( $(cat "$counter" 2>/dev/null || echo 0) + 1 )); echo "$n" >"$counter"
if [ "$n" -gt 3 ]; then rm -f "$counter" "$log"; exit 0; fi
{
  echo "scripts/check.sh is red (attempt $n/3). Fix it before finishing; if it is genuinely unfixable, stop and say so in your report."
  tail -n 60 "$log"
} >&2
rm -f "$log"
exit 2
