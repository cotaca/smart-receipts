---
paths:
  - "frontend/src/**/*.tsx"
  - "frontend/components.json"
---

# Frontend UI

- **Design reference**: `docs/ui-concept/README.md` indexes the screens (v1 and the current v2 board), the components each uses and which primitives are still missing. `screens/*.html` are readable source (they don't render standalone); the `SmartReceipts UI Spec Board*.html` bundles are what you open in a browser. It is a target picture, not a to-do list. Only tokens from `globals.css` — no new colors, radii or fonts. One deliberate addition: `--warning`/`--warning-foreground` (amber, light + dark) with `Alert variant="warning"` in `components/ui/alert.tsx` — for hints the user should act on that aren't errors; re-add the variant after regenerating `alert.tsx`. Mobile-first.
- **Base UI, not Radix**: `components.json` is `base-mira` + `hugeicons`. Composition uses `render={<X />}`, not `asChild`. After `npx shadcn@latest add`, read the generated file before trusting stock shadcn docs.
- Generated components import `cn` from `@/lib/utils`; don't add the registry's `cn` package.
- **`Select` shows the raw value unless `Select` gets `items`.** Build one `{value, label}[]` and use it for both `items` and the `SelectItem`s so labels can't drift. Currency selects keep a bare `<SelectValue />` — the code (`EUR`) is the wanted display.
- **`SelectContent` is only as wide as the `w-fit` trigger**, so longer options clip. Fix at the call site (`w-auto min-w-(--anchor-width)` on the receipts filters, `w-full` on the dialog's currency trigger), never in `components/ui/select.tsx` — the default is right everywhere else. Re-check after regenerating `select.tsx`.
- **jsdom has no CSS and no layout.** Never report a visual behavior as tested. Assert a class only where the class *is* the behavior (`md:hidden`); otherwise list it as a manual check.
