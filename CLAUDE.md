@AGENTS.md

# Claude Code

<!-- Maintainers: keep this file short. Design knowledge lives in .claude/rules/
(path-scoped), enforcement in .claude/settings.json, the change loop in
.claude/skills/implement/. HTML comments are stripped before Claude sees them. -->

- Coding work: apply `ponytail:ponytail` — simplest thing that holds, reuse before writing, stdlib/platform before a dependency, no abstraction with one implementation. Never cut corners on validation at trust boundaries, error handling that prevents data loss, security or accessibility.
- **Non-trivial** = touches more than 3 files, adds a dependency, changes an API, DB schema or `Settings` field, or has an open design decision. Non-trivial → `/implement`. Otherwise do it directly, then `scripts/check.sh` and the docs step from AGENTS.md.
- Plan in the main thread. Subagents: `implementer` builds and fixes (Sonnet, gated on `scripts/check.sh`), `reviewer` reviews read-only, `ui-verifier` checks real browser behavior.
- Design reasoning for the files you touch arrives via `.claude/rules/`. Before undoing a decision a rule states, say so and ask.
- git is read-only for you (enforced): `diff`/`status`/`log` yes, `add`/`commit`/`push` no.
