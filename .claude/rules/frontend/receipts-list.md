---
paths:
  - "frontend/src/app/?pages?/page.tsx"
  - "frontend/src/app/?pages?/page.test.tsx"
  - "frontend/src/components/receipts/receipts-table*"
  - "frontend/src/components/receipts/receipt-image*"
---

# Receipts list, table, image cache

- Filters (merchant search, period, sort) are `useMemo` over the loaded array — no query params, no debounce, native `Date`. Period defaults to `all`, not the mockup's "this month", so older receipts don't look lost.
- The summary line is the account-wide total, independent of filters, and is hidden when currencies are mixed (no wrong sum). Its amount is pre-formatted by `formatAmount` and passed into an ICU plural message via `t.rich()`, keeping the `<mono>` span inside the sentence.
- Delete uses an `AlertDialog` with a preview row: thumbnail, merchant, mono `date · amount currency`.
- **Image cache** (`receipt-image.tsx`): images need a Bearer header, so they're fetched via `apiFetch` into object URLs. A module-level ref-counted `Map<receiptId, {promise, refCount, listeners}>` shares one fetch per receipt across row, hover card and zoom. Revoke only when `refCount` reaches 0. A rejected fetch drops its entry, so a transient failure isn't permanent. Consumers use `useReceiptImageUrl(id)`; `""` is a no-op.
- `refreshReceiptImage(id)` after a replace: fetch once, push the new URL to every listener, **then** revoke the old one. Deleting the entry instead would break consumers already mounted (the row behind the open dialog). No-op when nothing is mounted.
- **Hover preview**: `HoverCard` with each `TableRow` as trigger via `render`, delays 250/150 (Base UI's defaults suit links, not tables). No `tabIndex`/`aria-label` on rows — one tab stop per receipt; keyboard users open it by focusing the row's merchant `<button>` (focus bubbles up from that button, not from the row itself). Image `alt=""`, `object-contain` overriding `ReceiptImage`'s `object-cover`.
- **Detail**: a row click, or the merchant button (its click bubbles to the row), opens `ReceiptDetailDialog` instead of the old "…" menu — see `.claude/rules/frontend/receipt-dialog.md`. The open id is mirrored into `?receipt=<id>` via `history.replaceState`, read once by a lazy `useState` initializer (`new URLSearchParams(window.location.search)`, no `useSearchParams`/Suspense boundary needed). `replaceState` adds no history entries, so Back/Forward leaves the dialog alone — deliberate: reload and shared links are the use case, not navigation. The detail is derived from the loaded list by id, not stored separately, so an edit or a delete keeps it in sync (or closes it) automatically. Dialog stacking order in `page.tsx`: detail < edit form < delete alert.
