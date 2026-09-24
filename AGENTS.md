# Working on SmartReceipts

Rules for anyone changing this repo, human or agent. Setup and features: [README.md](README.md). Why the code looks the way it does: [ARCHITECTURE.md](ARCHITECTURE.md).

## Before you hand work over

Run `scripts/check.sh` (backend: ruff fix + format, pytest; frontend: lint fix, format, typecheck, vitest). All green, or say plainly what isn't and why.

## Conventions

- English in code, comments and identifiers. Commits: Conventional Commits (`feat:`, `fix:`, `chore:` …).
- Backend: SQLModel classes for request/response and table models, never raw dicts over the API. Plain Pydantic models in `schemas/` only where a shape doesn't map to a table.
- Frontend: functional components, TypeScript strict. Every backend call goes through `apiFetch` in `src/lib/api.ts`, never a raw `fetch()` in a component.
- UI: use a shadcn/ui primitive whenever one exists for the pattern (`npx shadcn@latest add <name>`); custom Tailwind only for one-off layout. Check `docs/ui-concept/` before building a screen.
- `font-mono` on every amount, date and ID.
- Formatting: Prettier (frontend), Ruff (backend).

## How a change gets made

1. **Ask before planning.** Open decisions go to the repo owner, each with a recommendation and its trade-off.
2. **Plan approved** before any code.
3. **Review the working-tree diff**: blast radius, security, test coverage, breaking changes.
4. **Verify fixes empirically.** Rerun the exact case that failed; a bug fix ships with a test that fails before and passes after. A report saying "fixed" is not evidence — here a jsdom test passed at every viewport (jsdom applies no CSS), and a "fixed" OCR regex still read `2,00` instead of `20,00`.
5. **Never stage, commit or push.** Hand over Conventional Commit messages and the files belonging to each.
6. **End with the docs.** If behaviour, a field's meaning or a design decision changed, update its home (below) in the same change.

## Keeping the docs honest

One fact, one home — link, never copy. Copies have drifted here twice.

| Where | What |
|---|---|
| `README.md` | what the app does, how to run it |
| `AGENTS.md` | how to work here |
| `ARCHITECTURE.md` | map of the design areas → the rule file for each |
| `.claude/rules/**` | the decisions and traps themselves, scoped to the files they govern |
| `CLAUDE.md`, `.claude/{skills,agents,hooks,settings.json}` | Claude Code specifics |

A decision tied to a single line of code may instead live as a comment on that line; the rule then doesn't repeat it.
