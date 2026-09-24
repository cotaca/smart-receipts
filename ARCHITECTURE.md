# Architecture

Why SmartReceipts is built the way it is. The reasoning lives in `.claude/rules/`,
one file per area, each scoped to the files it governs — Claude Code loads a rule
automatically when it touches matching files; humans and other tools read them
from the links below. Several decisions look arbitrary until you hit the case
that motivated them.

| Area | What the rule covers |
|---|---|
| [Auth (backend)](.claude/rules/backend/auth.md) | custom JWT, stateless refresh, bcrypt 72-byte guard, 400 not 401, account settings as columns |
| [Receipts API & storage](.claude/rules/backend/receipts-api.md) | money/date types, 404 not 403, storage `Protocol`, replace-image ordering, line items; PDF upload (design only) |
| [Image preprocessing](.claude/rules/backend/image-processing.md) | pipeline order, always JPEG, EXIF stripped, pixel guard |
| [OCR](.claude/rules/backend/ocr.md) | PSM 6, keyword and regex traps, confidence filter, benchmark; why other receipt languages aren't built yet |
| [Backend tests](.claude/rules/backend/testing.md) | fixtures, test DB |
| [App shell & API client](.claude/rules/frontend/shell-auth.md) | single auth guard, route group, `MeContext`, `apiFetch` |
| [UI conventions](.claude/rules/frontend/ui.md) | design reference, Base UI specifics, `Select` traps, jsdom limits |
| [Receipt dialog](.claude/rules/frontend/receipt-dialog.md) | OCR review flow, replace image, zoom/pan, date picker |
| [Receipts list](.claude/rules/frontend/receipts-list.md) | client-side filters, ref-counted image cache, hover preview |
| [Settings & i18n](.claude/rules/frontend/settings-i18n.md) | no optimistic update, theme store, number format vs. language, locale cookie |
| [Frontend tests](.claude/rules/frontend/testing.md) | test patterns and what jsdom can't prove |
| [CI & environment](.claude/rules/ci.md) | workflows, env vars, Node pin |

Changing a decision? Update its rule in the same change. Touch this table only
when an area appears or disappears.
