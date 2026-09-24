---
paths:
  - "frontend/src/components/receipts/receipt-form-dialog*"
  - "frontend/src/components/receipts/receipt-zoom-view*"
  - "frontend/src/components/ui/date-picker*"
  - "frontend/src/lib/utils.ts"
---

# Receipt dialog, zoom, date picker

The create/edit `Dialog` stays props-only: `defaultCurrency` comes from the caller's `useMe()`.

**Preview column**: all three branches share one `h-96 overflow-y-auto` wrapper; the image is `w-full h-auto`, so tall receipts scroll instead of letterboxing. Accepted gap: `ReceiptImage`'s Skeleton takes the image's `className` and is 0px tall here while loading — don't hardcode `h-full` on it, that breaks the `size-10` table thumbnail.

**OCR flow (create only)**: file selected → `extractReceipt()` → `scanning` → `review` (`"{n} of 3 fields found."` + Suggested/Not detected badges); both phases are derived, not stored. Fill a field only if OCR returned it — never overwrite typed input with `null`. Extraction errors are swallowed; manual entry must keep working. Deliberately not built: per-field source text and scan highlighting (the API returns no source or confidence — it would be made up), the PDF review branch.

**Replace image (edit only)**: its own hidden file input, calls `replaceReceiptImage` immediately, not on Save — deferring re-creates the JSON/multipart mix the endpoint split avoids, plus a "text saved, image didn't" state. Success: `refreshReceiptImage(id)` → `onSaved(updated)`, dialog stays open. Failure: `replaceImageError`, no `onSaved`.

**Zoom**: a second `Dialog` on top, reusing the object URL already held (no second request). Named by an `sr-only` `DialogTitle`; `<img alt="">`. Escape closes only the zoom — its test asserts the zoom is gone **and** the Merchant field is still mounted, because both closing is the failure mode.

`receipt-zoom-view.tsx` (mounted only while open, so every open starts fresh):
- `{scale, x, y}` is one state object updated via functional `setView` — lets the wheel effect register once with `[]` deps.
- Wheel: `addEventListener("wheel", …, { passive: false })`, not React `onWheel` (passive at the root → `preventDefault` does nothing, the page scrolls behind).
- Wheel zooms on the cursor (`p = (cursor − offset)/scale`, `offset' = cursor − p·scale'`), buttons on the center. Scale 1–4; wheel factor per event clamped to [0.85, 1.15]; buttons ×/÷ 1.25.
- `clampOffset` and `containedSize` are pure, exported, numbers only — the honestly unit-testable part. Clamp against the **painted** size from `containedSize`, not the `<img>` box: with `object-contain` the box always equals the frame, which let tall receipts be dragged out of view.
- Drag: pointer events on the `<img>` + `setPointerCapture`; toolbar buttons are siblings, so no `stopPropagation`. Cursor from drag state, not `:active`.
- **`draggable={false}` is load-bearing** (native image drag swallows `pointermove`), plus `select-none`, plus ignoring `e.button !== 0` (a right-press strands a pan). Both regression-tested.
- A11y: zoom works from the keyboard via the three labelled buttons; panning is pointer-only. Keyboard panning is a named, unbuilt addition.
- Not unit-testable (jsdom): visual clamping, pointer capture, how the transform looks.

**Date picker** (shadcn `Popover` + `Calendar`, replaced the native date input):
- `purchased_at` is a `"YYYY-MM-DD"` string end to end; convert with `parseDateOnly`/`formatDateOnly` (local midnight). Never `new Date(str)` — the UTC parse shifts the day west of UTC.
- Trigger text follows `number_format` (`formatDate`); weekday/month names follow the UI language (`useLocale()` → date-fns locale). Future dates are disabled in the UI only; the backend accepts them.
- Month/year views are a hand-built `day | month | year` swap (all `w-64`), not `captionLayout="dropdown"` (native selects, useless for jumping decades). Opening resets to the day view on the value's month.
- The `MonthCaption` override goes through a `useMemo`'d `components` object — an inline component remounts each render and kills the `aria-live` month announcement. The caption button needs `relative z-10`: the generated nav bar overlays the caption row and eats clicks. Not unit-tested; re-check after regenerating `calendar.tsx`.
- The trigger is a `Button` (no `required`), so `handleSubmit` guards `!purchasedAt` itself (`selectDateError`).
