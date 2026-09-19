# Working on SmartReceipts

Rules for anyone changing this repo — human or agent. The *why* behind the
design lives in [ARCHITECTURE.md](ARCHITECTURE.md); setup and what the app does
live in [README.md](README.md).

## Before you hand work over

```bash
cd backend
uv run pytest
uv run ruff check --fix . && uv run ruff format .

cd frontend
npm run test -- --run
npm run lint:fix && npm run format
npm run typecheck
```

All of it green, or say plainly what isn't and why.

## Conventions

- Code language (variables, functions, comments): English
- Commit messages: Conventional Commits (`feat:`, `fix:`, `chore:`, ...)
- Backend: SQLModel classes for request/response and table models, no raw dicts over the API; use plain Pydantic models in `/schemas` only where a request/response shape doesn't map to a table
- Frontend: functional components, TypeScript strict mode; all backend calls go through `src/lib/api.ts` (`apiFetch` wrapper), not raw `fetch()` calls scattered in components
- Frontend UI: prefer a shadcn/ui primitive over hand-rolled markup+Tailwind whenever one exists for the pattern (e.g. `Tabs` for a mode switcher, `Dialog`/`Table`/`DropdownMenu` for the receipts UI, not hand-rolled equivalents). Check `npx shadcn@latest add <name>` / the registry before hand-building — keeps styling centralized and cuts custom Tailwind. Custom Tailwind is still fine for one-off layout (flex/grid containers, spacing) that isn't a reusable component pattern
- Formatting: Prettier (frontend), Ruff (backend) — run before every commit
- Frontend typography: `font-mono` (mapped to Geist Mono in `globals.css`) on every amount, date and ID — matches the `docs/ui-concept/` mockups, which use it consistently for the same fields. Applied in `receipts-table.tsx` (date/amount columns), the delete-confirmation preview line, the receipts-page summary line, and the amount/date inputs in `receipt-form-dialog.tsx`
- CI: when a change touches `.github/workflows/*`, or adds a required env var/dependency a workflow relies on (e.g. a new `Settings` field), verify the workflow (YAML syntax + env vars it needs) before committing — CI env doesn't inherit local `.env`, so missing vars only surface once a run actually fails
- Frontend runtime: Node version is pinned via `frontend/.nvmrc`, read by CI via `node-version-file` — keep it matching whatever Node generates `package-lock.json` locally. A mismatched npm major version (bundled with Node) can resolve optional deps differently and make `npm ci` fail in CI ("Missing X from lock file") even though `npm install` works fine locally

## How a change gets made

1. **Ask before planning.** Open decisions go to the repo owner first, each with
   a recommendation and its trade-off. Don't plan around an unresolved fork.
2. **Get the plan approved** before writing code.
3. **Review the result** against the working-tree diff — blast radius, security,
   test coverage, breaking changes.
4. **Verify fixes empirically.** Re-run the exact case that produced a finding.
   A report saying it's fixed is not evidence.
5. **Never commit or push.** Work stays uncommitted for the owner to review.
   Hand over Conventional Commit messages and which file belongs to which commit
   — as a suggestion, not something you execute.
6. **End with the docs.** If behaviour, a field's meaning or a design decision
   changed, ARCHITECTURE.md changes in the same breath.

Step 4 exists because of two real cases in this repo. A test asserting the mobile
nav trigger renders passed at *every* viewport — jsdom applies no CSS, so it
proved nothing until it asserted the `md:hidden` class directly. And an OCR
amount regex reported as fixed still returned `2,00` instead of `20,00` on a
realistic receipt, because `BETRAG` matches `Rabattbetrag`. Both looked fixed.

## Keeping the docs honest

One fact, one home. Each file has an audience; anything that lives elsewhere gets
linked, never copied:

| File | Audience |
|---|---|
| `README.md` | evaluating or running the project |
| `ARCHITECTURE.md` | changing the code — data model, endpoints, decisions, traps |
| `AGENTS.md` | how to work here |
| `CLAUDE.md` | Claude Code specifics |

Duplication is how these drift. It has already happened twice: the docs named a
keyword that had been removed from the code, and an exception clause that had
since been widened.
