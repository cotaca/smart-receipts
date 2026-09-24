---
name: shadcn-add
description: Adding or regenerating a shadcn/ui component in SmartReceipts (Base UI, base-mira style). Use before running `npx shadcn@latest add`, or when a screen needs a primitive not yet in frontend/src/components/ui/.
---

# Add or regenerate a shadcn/ui component

1. Check `docs/ui-concept/README.md`: which screen needs the primitive, and whether it is listed as missing.
2. Regenerating an existing file? Regeneration silently drops local changes. Diff the current file first and re-apply what matters — the call-site traps for `select.tsx` and `calendar.tsx` are documented in the frontend rules.
3. From `frontend/`: `npx shadcn@latest add <name>`. Note every extra file and dependency it pulls in.
4. Read each generated file before using it and apply the Base UI facts from `.claude/rules/frontend/ui.md` (`render` prop, `cn` import — remove a `cn` package dependency if one was added).
5. Build with it; custom Tailwind only for layout.
6. Update the missing-primitives list in `docs/ui-concept/README.md`.
