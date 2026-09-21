# Architecture

Why SmartReceipts is built the way it is. The value here is the **reasoning** —
several of these decisions look arbitrary until you hit the case that motivated
them, and a few encode traps that cost real debugging time.

For what the app does and how to run it, see [README.md](README.md). For the
rules you follow while changing it, see [AGENTS.md](AGENTS.md).

## Auth

Custom JWT auth via FastAPI (no third-party auth service for now). OAuth/social login: out of scope for MVP.

**Table `users`** (`models/user.py`)

| Field | Type | Notes |
|---|---|---|
| id | UUID | PK, default `uuid4` |
| email | str | unique, indexed |
| hashed_password | str | bcrypt (direct, no `passlib` — incompatible with bcrypt>=4.1). bcrypt hashes at most **72 bytes** and drops the rest silently, so a longer passphrase would authenticate with any arbitrary tail. `NewPassword` in `schemas/auth.py` rejects that (422) wherever a password is *set* — register and change-password. Deliberately **not** applied to login or `current_password`: accounts predating the limit may hold a longer password, and rejecting the input would lock them out instead of letting bcrypt compare the 72 bytes it stored |
| is_active | bool | default `True` |
| created_at | datetime | default `utcnow` |
| number_format | str | default `"de-DE"`; account setting, see Settings below |
| default_currency | str | default `"EUR"`; account setting, see Settings below |
| language | str | default `"de"`; UI language, account setting, see Settings below |

**Endpoints** (`routers/auth.py`)

| Method | Path | Auth | Body → Response |
|---|---|---|---|
| POST | `/auth/register` | public | `RegisterRequest` → `TokenResponse` |
| POST | `/auth/login` | public | `LoginRequest` → `TokenResponse` |
| POST | `/auth/refresh` | public, reads refresh cookie | — → `TokenResponse` |
| POST | `/auth/logout` | public | — → clears refresh cookie |
| GET | `/auth/me` | required | — → `UserPublic` |
| PATCH | `/auth/me` | required | `UserSettingsUpdate` (all fields optional) → `UserPublic` |
| POST | `/auth/change-password` | required | `ChangePasswordRequest` → 204 |

**Schemas** (`/schemas`, since none map 1:1 to the table)

- `RegisterRequest` / `LoginRequest`: `email`, `password` (plain)
- `UserPublic`: `id`, `email`, `is_active`, `created_at`, `number_format`, `default_currency`, `language` — explicitly excludes `hashed_password`
- `UserSettingsUpdate`: `number_format` (`Literal["de-DE", "en-US"]`), `default_currency` (`Literal["EUR", "USD", "GBP", "CHF"]`), `language` (`Literal["de", "en"]`) — all optional, partial update, same pattern as `ReceiptUpdate`. The `Literal`s are the trust boundary; there's no DB `CHECK` constraint because `PATCH /auth/me` is the only write path
- `ChangePasswordRequest`: `current_password`, `new_password`
- `TokenResponse`: `access_token`, `token_type="bearer"`

**Tokens**

- JWT via `pyjwt`; payload has `sub` (user id), `exp`, and `type` (`access`/`refresh`) — the `type` claim stops a refresh token being replayed as an access token
- Access token: 15 min expiry, returned in the response body; `Depends(get_current_user)` decodes it for protected routes
- Refresh token: 7 day expiry, set as an httpOnly + secure + samesite=lax cookie — never in the JSON body
- Stateless for MVP: no DB-tracked/revocable refresh tokens. Logout only clears the cookie client-side; a stolen refresh token stays valid until it expires. Revisit with a `refresh_tokens` table (rotate-on-use) if this becomes a real risk.
- `POST /auth/change-password` does **not** invalidate existing access/refresh tokens — a direct consequence of the point above: there's no revocation table to write to. A stolen token survives a password change until it expires. Don't add a test asserting this "works" (it just asserts nothing happens); the constraint lives here and in the endpoint's docstring instead, and both should be revisited together if a `refresh_tokens` table ever gets built. Wrong current password on this endpoint returns **400, not 401**: the bearer token is valid and the request is authenticated, so a 401 here would make a future global "401 → sign out" interceptor log the user out on every password-change typo
- Frontend: `/login` page (login + register, error/loading/success states) implemented and tested; access token kept in memory (not localStorage) via `src/lib/api.ts`
- Route protection: `src/hooks/use-auth-guard.ts` (`useAuthGuard`) runs the client-side check on mount (silent `refresh()` via the cookie, redirect to `/login` on failure) and is called **once**, from `src/app/(pages)/layout.tsx` — not per-page. It used to live directly in the receipts page; pulled out once a second protected route (`/dashboard`) existed, so every route under the `(pages)` group shares one guard instead of racing three separate redirects. Still client-side rather than Next.js middleware — revisit if that becomes a real cost
- App shell: `src/app/(pages)/layout.tsx` wraps every protected route in `AppShell` (`src/components/layout/app-shell.tsx`), a shadcn `Sidebar` (`SidebarProvider` + `Sidebar` + `SidebarInset`) with the workspace nav (Dashboard/Receipts/Settings via `next/link` + `usePathname`) in `app-sidebar.tsx`. Theme toggle and sign-out moved from a page-level topbar into a `DropdownMenu` in the sidebar footer (avatar + email). `(pages)` is a Next.js **route group** — pathneutral, so `(pages)/page.tsx` still serves `/`. No receipt-count badge in the sidebar nav (mockup shows one) — the count lives in the receipts page's own state; lifting it into the layout or double-fetching just for a sidebar number isn't worth it
- Mobile nav: the sidebar defaults to `collapsible="offcanvas"`, which renders as a closed `Sheet` below 768px — without a trigger, mobile has no way to reach nav, theme toggle or sign-out. `AppShell` renders one `SidebarTrigger` (`className="md:hidden"`) inside `SidebarInset`, shared by all three routes, rather than one per page
- CORS: backend allows `FRONTEND_ORIGIN` (`.env`, required field, no dev default) with `allow_credentials=True` — needed for the httpOnly refresh cookie to work across the 3000/8000 origin split in dev


## Receipts

Core CRUD for receipts, with manual data entry (no OCR yet — see Image Preprocessing/OCR in Tech Stack for the later plan). Uploads do run through image preprocessing before they are stored (see Image Preprocessing below).

**Table `receipts`** (`models/receipt.py`)

| Field | Type | Notes |
|---|---|---|
| id | UUID | PK, default `uuid4` |
| user_id | UUID | FK → `users.id`, indexed — every query filters on this |
| storage_key | str | opaque key into the storage backend; never exposed to clients. Always ends in `.jpg` — preprocessing re-encodes everything |
| original_filename | str | display only — the name the user uploaded (may still be `IMG_1234.HEIC`) |
| content_type | str | describes the **stored** image, so always `image/jpeg` today; `GET /{id}/image` serves it as the `Content-Type` header |
| file_size | int | bytes of the **processed** image, not the upload |
| merchant | str | **required** — no OCR, so this is user-entered at create time |
| amount | Decimal | **required**; `Decimal` not `float` — avoids floating-point rounding on money |
| currency | str | default `"EUR"` |
| purchased_at | date | **required**; `date` not `datetime` — no meaningful time-of-day |
| notes | str \| None | optional |
| created_at | datetime | default `utcnow` |
| updated_at | datetime | set via SQLAlchemy `onupdate=`, not manually per-route |

OCR now fills `merchant`/`amount`/`purchased_at` as a form-fill suggestion on upload, but the fields themselves stay required and user-editable/confirmable — extraction never writes to the DB directly. Don't loosen to nullable pre-emptively; that's a real migration to make *when* an async-extraction flow actually exists, not before.

**Endpoints** (`routers/receipts.py`)

| Method | Path | Auth | Body → Response |
|---|---|---|---|
| POST | `/receipts` | required | multipart: `file` + `Form()` (merchant, amount, purchased_at required; currency, notes optional) → `ReceiptPublic`, 201 |
| POST | `/receipts/extract` | required | multipart: `file` → `ReceiptExtraction`; OCR preview, persists nothing |
| GET | `/receipts` | required | — → `list[ReceiptPublic]`, own receipts only |
| GET | `/receipts/{id}` | required | — → `ReceiptPublic` |
| PATCH | `/receipts/{id}` | required | `ReceiptUpdate` (all fields optional) → `ReceiptPublic` |
| PUT | `/receipts/{id}/image` | required | multipart: `file` → `ReceiptPublic`; replaces the stored image of an existing receipt |
| DELETE | `/receipts/{id}` | required | — → 204; removes DB row **and** the stored file |
| GET | `/receipts/{id}/image` | required | — → image bytes, correct `Content-Type` |

- Ownership check returns **404, not 403** for another user's receipt — same reasoning as auth: don't confirm a resource ID exists at all to someone who doesn't own it
- Images are served through this authenticated route, never a public static file mount
- The delete confirmation (`AlertDialog` in `(pages)/page.tsx`) shows a preview row above Cancel/Delete: `ReceiptImage` thumbnail, merchant, and a `font-mono` `"{purchased_at} · {amount} {currency}"` line — the only delta from a bare confirm dialog
- `/receipts/extract` is declared as its own path (not nested under `{id}`) so it never collides with `GET /receipts/{id}` — different HTTP method, and there is no `POST /receipts/{id}` route to confuse it with
- `create_receipt` and `extract_receipt` share a `_read_upload()` helper (content-type + `MAX_FILE_SIZE` check) — same validation, one place to change it
- **`PUT /receipts/{id}/image`** is a separate endpoint from `PATCH /receipts/{id}`, not a multipart variant of it — `PATCH` takes a JSON body and every existing caller relies on that; adding a file field would mean branching on `Content-Type` in one route. It reuses `_get_owned_receipt`, `_read_upload`, `preprocess_image` and `_to_public` unchanged, generates the new `storage_key` the same way `create_receipt` does (never from the uploaded filename), and updates `storage_key`/`content_type`/`file_size`/`original_filename` (`updated_at` follows via the existing `onupdate`). **Order: save the new file, commit the DB row, then delete the old file** — the only ordering where `storage_key` never points at a missing file. A failed save leaves everything untouched; a failed commit orphans the just-saved new file (a leak, not a dangling reference) and is cleaned up in an `except` before re-raising; a failed delete of the old file is caught and swallowed, since the row is already correctly committed and a cleanup failure must not turn a successful replace into an error response — `LocalStorageBackend.delete` practically never raises, but `StorageBackend` is a `Protocol` for exactly this reason (a future remote backend's delete can fail)

**Schemas** (`/schemas`, since none map 1:1 to the table)

- `ReceiptPublic`: id, original_filename, content_type, file_size, merchant, amount, currency, purchased_at, notes, created_at, updated_at, plus a computed `image_url` (points at `/receipts/{id}/image`) — never the raw `storage_key`
- `ReceiptUpdate`: merchant, amount, currency, purchased_at, notes — all optional (partial update)
- `ReceiptExtraction`: merchant, amount, purchased_at, all `| None` — an OCR guess, any field can come back unrecognized

**Storage abstraction** (`services/storage.py`) — the actual "S3/Supabase later, not a rewrite" mechanism

- `StorageBackend`: a `Protocol` with `save(key, content, content_type)`, `read(key)`, `delete(key)`. Routes and tests depend only on this, never on a concrete backend
- `LocalStorageBackend`: writes to `STORAGE_LOCAL_PATH` (default `./storage/receipts`, gitignored) — the only implementation for now
- `get_storage_backend()`: FastAPI dependency selecting the backend via `STORAGE_BACKEND` setting (`"local"` for now); adding S3/Supabase later is a new class + one config value, no route changes
- Storage keys are generated (`f"{user_id}/{uuid4()}{ext}"`), never the user's original filename — avoids path traversal, collisions, and namespaces per-user for a future shared bucket

**Frontend** (`src/components/receipts/`, wired into `src/app/(pages)/page.tsx`) — implemented and tested

- `receipt-form-dialog.tsx`: shared create/edit form (`Dialog`, two-column layout: preview left, fields right, `sm:grid-cols-[280px_1fr]` inside a `sm:max-w-3xl` `DialogContent`); `receipts-table.tsx`: list (`Table` + `DropdownMenu` row actions); `receipt-image.tsx`: thumbnail loader; `receipt-zoom-view.tsx`: the zoom overlay's pan/zoom surface
- Dialog preview column: all three branches (edit `ReceiptImage`, create-mode local `<img>`, the "no file" placeholder) share one wrapper, `h-96 w-full overflow-y-auto rounded-lg bg-muted` (plus `border`/`border-dashed` where they already had one), with the image itself `w-full h-auto` — no `aspect-*`, no `object-contain`. Width is always filled edge-to-edge; a receipt taller than 384px (280px column width × the original `aspect-3/4` box's height, so the column's visual weight next to the form fields is unchanged) scrolls inside the wrapper instead of being letterboxed. A wide receipt leaves `bg-muted` below the image — no `object-fit` can fix that without cropping when only one axis (width) is fixed, and the actual complaint (tall receipts getting side margins) is fixed. **`ReceiptImage`'s loading `Skeleton` gets the same `className` as the image** (here `h-auto w-full`), so during loading it collapses to 0px height — no pulse animation is visible while the wrapper's `bg-muted` background alone shows through. The obvious fix, hardcoding `h-full` onto the `Skeleton`, is not applied: the same `className` prop also drives the `size-10` table-row thumbnail's skeleton, which that would silently override. Left as a documented, harmless gap, not "fixed"
- Create mode's `<img>` (the local blob preview) still gets `w-full h-auto` directly since it isn't `ReceiptImage`-backed and has no loading state to worry about
- **Replace image** (edit mode only — there is no existing file to replace in create mode) is a second, hidden `<input type="file">` behind its own "Replace file" button, calling `replaceReceiptImage(receipt.id, file)` (`PUT /receipts/{id}/image`) immediately on selection, not deferred to the form's Save. Deferring would recreate, client-side, exactly the JSON/multipart mixing the endpoint split was meant to avoid, plus a partial-failure state ("text saved, image didn't") that would need explaining to the user; it also matches the existing "save immediately, no optimistic update" pattern from the Settings page (see below). On success it calls `refreshReceiptImage(receipt.id)` then `onSaved(updated)`; the dialog stays open (`onOpenChange` is not called) so the user can keep editing. A rejected call surfaces in the existing `error` slot (`replaceImageError`) and does not call `onSaved`
- **Zoom** opens a second `Dialog` stacked over the edit/create one, showing the same object URL `ReceiptImage`/the create-mode preview already hold (via `useReceiptImageUrl` in edit mode, `previewUrl` in create mode) — no second network request. Its accessible name comes from an `sr-only` `DialogTitle` (`zoomTitle`, includes the merchant name); the `<img>` gets `alt=""` since the title already announces the content, same pattern as the receipts-table `HoverCard` preview. Base UI's `Dialog` gives the overlay its own focus trap and Escape handling, which closes only the top (zoom) dialog and leaves the edit/create dialog open underneath. That *is* unit-tested, and deliberately so: the test presses Escape, asserts the zoom dialog is gone **and** that the edit form's Merchant field is still mounted — without the second assertion it would pass just as happily if both dialogs had closed, which is the actual failure mode worth guarding
- **`receipt-zoom-view.tsx`** renders the actual pan/zoom surface: a `relative h-[78vh] w-full overflow-hidden` frame around an `<img className="h-full w-full object-contain" style={{ transform: ... }}>`, mounted only while `zoomOpen` (`{zoomOpen && <ReceiptZoomView ... />}`, same pattern the dialog already uses for its form) so every open starts from fresh state with no reset effect needed. Scale and pan offset live in **one** state object, `{ scale, x, y }`, updated with the functional `setView((v) => ...)` form — the new offset always depends on the new scale (see the anchor math below), and keeping them together is what lets the wheel listener's `useEffect` run with an empty dependency array and register exactly once
  - **Wheel zoom is a manually registered listener**, not React's `onWheel`: React attaches its wheel handler passively at the root, so `preventDefault()` inside `onWheel` is silently a no-op and the page behind the dialog scrolls too. The effect does `frame.addEventListener("wheel", handler, { passive: false })` with cleanup on the frame ref
  - **Anchor**: the wheel zooms on the cursor position (checking a receipt, you want the spot under the pointer to grow, not the frame center) — `p = (cursor − offset) / scale`, `scale' = clamp(scale · factor)`, `offset' = cursor − p · scale'`, keeping the same image point under the pointer. The three toolbar buttons zoom on the frame center (`cursor = {0, 0}`) since a click carries no pointer position over the image. Bounds: `MIN_SCALE = 1` (the receipt already fits the frame; zooming out further has no use), `MAX_SCALE = 4`; wheel step is multiplicative (`1 − deltaY · 0.0015`), clamped per-event to `[0.85, 1.15]` so one fast trackpad swing can't jump through the whole range in a tick; button step is `×1.25` / `÷1.25`
  - **`clampOffset(offset, scale, frame, image)` is a pure exported function taking plain numbers**, no refs or DOM access — the only part of this feature that's honestly unit-testable, since jsdom reports every element's size as 0. If the scaled image side is smaller than the frame, the offset on that axis is forced to `0`; otherwise it's clamped to `±(scaled − frame) / 2`. Its `image` argument is the **painted** size, not the element box — a distinction that was a real bug during implementation: the `<img>` is `h-full w-full object-contain`, so its `clientWidth`/`clientHeight` always equal the frame's while the painted image is letterboxed inside it. Clamping against the element box let a tall receipt be dragged sideways out of view on its letterboxed axis. A second pure helper, **`containedSize(frameW, frameH, naturalW, naturalH)`**, derives the painted size from the natural dimensions and the contain fit, and has its own regression test (a 400×800 image in a 400×400 frame must come back 200×400, not 400×800)
  - **Dragging** binds `pointerdown`/`pointermove` to the `<img>` itself, not the frame, and calls `setPointerCapture` so the drag keeps tracking once the pointer leaves the element. The hint bar's buttons are the image's siblings, so a `pointerdown` on a button never reaches the drag handler at all — no `stopPropagation` or `pointer-events` juggling needed. Cursor is `grab`/`grabbing` driven by drag state, not `:active`, which doesn't reliably reflect an active pointer capture outside the element
  - **Accessibility, stated plainly**: zooming works from the keyboard via the three real buttons (Zoom in/out, Reset — visible text labels, so no extra `aria-label` needed). Panning does not — dragging is a pointer-only gesture and no ARIA role would honestly describe a substitute for it. Keyboard-only users can zoom in but can't change which part of the receipt is in view; arrow-key panning would be a small, separate addition, named here rather than speculatively built. `zoomDescription` (already `sr-only`, already the dialog's accessible description) was reworded to mention the controls so screen-reader users learn about them at all
  - **`draggable={false}` on the `<img>` is load-bearing, not tidying.** An image element is natively draggable, so a left-press starts the browser's own HTML5 drag-and-drop (ghost image, drop cursor) and swallows the `pointermove` stream the pan depends on — dragging simply didn't work until this was set. `select-none` stops the same press from selecting text in the dialog around it. `handlePointerDown` also ignores anything but `e.button === 0`: a right-press would otherwise start a pan that the context menu then strands, since no `pointerup` comes back and the image keeps following the cursor. Both are covered by regression tests (the `draggable` attribute is plain DOM, and a synthetic `pointerDown` with `button: 2` followed by a `pointerMove` must leave the transform at `translate(0px, 0px)`)
  - **Not unit-tested** (the fourth instance of the trap AGENTS.md documents): whether the image visually stays in frame under clamping, whether `setPointerCapture` behaves like a real browser, how the transform actually looks — jsdom has no layout engine, so such tests would pass without proving anything. Tested instead: `clampOffset` and `containedSize` with made-up numbers (image bigger than frame clamps to `±(scaled − frame)/2`; smaller clamps to `0`; a tall image letterboxes horizontally), the initial `scale(1)` transform, that the three buttons change/restore the transform, and that a real `fireEvent.wheel` on the frame changes the transform (proving the manually registered, non-passive listener — routing through React's `onWheel` would miss the actual bug this guards against)
- On file selection (create mode only), `receipt-form-dialog.tsx` calls `extractReceipt()` and walks through two extra phases before the plain field layout: `scanning` (`Progress value={null}` for an indeterminate bar + an `Alert` + `Skeleton` placeholders over merchant/amount/date) then `review` (an `Alert` with `"{n} of 3 fields found."`, computed from the non-null fields — not a static string — plus a `Badge` — "Suggested" or "Not detected" — next to each of the three extracted fields' labels). Both phases are derived state (`isScanning`/`isReview`), not stored separately. Deliberately **not** built: the mockup's per-field `meta` text ("top of receipt", "SUMME EUR line") and the "Highlighted on the scan" overlay — `POST /receipts/extract` returns no source or confidence, so anything more specific would be fabricated copy; and the entire PDF review branch, since the backend doesn't accept PDFs yet (see "Future: PDF upload")
- Suggestions only ever fill a field when the OCR actually returned it (`if (data.merchant) ...`), so a value the user already typed is never overwritten with `null`. Extraction errors are swallowed (no error banner): it's a convenience, manual entry must keep working unchanged
- `GET /receipts/{id}/image` requires a Bearer header, so a plain `<img src>` can't load it — `receipt-image.tsx` fetches the blob via `apiFetch` and uses `URL.createObjectURL()`, revoked on unmount
- `apiFetch` skips its default `Content-Type: application/json` when the body is `FormData`, letting the browser set the multipart boundary itself — needed for the create endpoint's file upload
- State: plain `useState` + refetch after each mutation, not TanStack Query — not enough concurrent data-fetching complexity yet to justify the dependency
- Date input is native `<input type="date">`, currency a small `Select` with a few common codes — both deliberately minimal, upgradeable later
- **Base UI `Select` needs `items` or its trigger shows the raw value.** `<SelectValue />` renders the selected item's *label* only when the matching `Select` (i.e. `Select.Root`) also gets an `items` prop; without it Base UI falls back to the raw `value`, so the period and sort filters displayed `all` / `this-month` / `amount-desc` in the trigger while the popup showed proper labels. It went unnoticed before i18n because the internal values read as English words — switching the UI to German made it obvious. Both filters now build one `{value, label}[]` array that is passed as `items` **and** mapped into the `SelectItem`s, so the labels can't drift apart. The currency `Select`s in `settings/page.tsx` and `receipt-form-dialog.tsx` deliberately keep the bare `<SelectValue />`: there the raw value *is* the wanted display (`EUR`), and it needs no translation
- **A `Select` popup clips options longer than the selected one.** `SelectContent` (`components/ui/select.tsx`) is `w-(--anchor-width)` — pinned to the trigger's width — and the trigger is `w-fit`, so the popup is only ever as wide as the *currently selected* label. German labels made this visible: with “Neueste zuerst” selected, “Betrag (aufsteigend)” was cut off mid-word. Both receipts-page filters pass `className="w-auto min-w-(--anchor-width)"` to keep the trigger width as a floor while letting the popup grow. Fixed at the two call sites rather than in `components/ui/select.tsx`, because the trigger-width default is deliberate Base UI behavior (it mimics a native `<select>`) that the two currency selects still want — only these two have options long enough to overflow. **Not unit-tested**: jsdom applies no CSS, so a test could only assert the class string, and unlike the `md:hidden` sidebar-trigger case (where the class *is* the behavior) this is cosmetic. It lives here instead — if a future `shadcn@latest add select` regenerates the file, re-check that these overrides still work
- **Third instance of the same `w-fit` trade-off**: the currency `SelectTrigger` in `receipt-form-dialog.tsx` shrank to the width of "EUR" instead of filling its `w-28` column, making the amount-and-currency row look shorter than the fields above and below it. Fixed with `className="w-full"` at that one call site, not in `components/ui/select.tsx` — same reasoning as the two filters above: the default is still correct for every other `Select` in the app
- **`receipt-image.tsx` shares object URLs through a module-level, ref-counted cache** (`Map<receiptId, {promise, refCount, listeners}>`), because there is no thumbnail endpoint — `GET /receipts/{id}/image` always returns the full stored JPEG, and the table row and the hover preview (below) display the same bytes. `acquire(id, onUpdate)` creates the fetch once per `receiptId`, increments `refCount`, and registers `onUpdate` as a listener; concurrent mounts await the same promise instead of triggering a second request. **Ownership rule**: the object URL is revoked only when the last mounted `ReceiptImage` (or `useReceiptImageUrl`) instance for that `receiptId` unmounts (`refCount` reaches 0) — if the row and the hover card both show the same receipt and the card closes, the count only drops from 2 to 1 and the row's `<img>` keeps working. A rejected fetch removes its cache entry immediately, so a transient failure doesn't permanently break that receipt's image for the rest of the session; the component's effect also gained the `.catch()` it lacked before (the `Skeleton` just stays visible on failure)
- **The fetch logic lives in a `useReceiptImageUrl(receiptId)` hook**, used by both `ReceiptImage` and the form dialog's zoom overlay so the overlay shares the cached URL instead of fetching a second time. Passing `""` (no receipt yet, create mode) is a no-op — nothing to load, and the initial `null` state already reflects that.
- **`refreshReceiptImage(receiptId)`** exists because replacing a receipt's image (see `PUT /receipts/{id}/image` above) leaves the cache's URL stale while its key — `receiptId` — hasn't changed, and simply deleting the cache entry would break every currently mounted consumer (e.g. the receipts-table row still mounted behind the open edit dialog) instead of just the next one to mount. It fetches the new bytes once, pushes the new URL to every registered listener, and only *then* revokes the old URL — so no consumer ever observes a moment with no valid URL. A no-op if nothing has that `receiptId` mounted (cache has no entry); the next mount fetches fresh anyway.
- **Hovering (or keyboard-focusing) a receipts-table row opens a `HoverCard` preview** of the full image next to that row (`npx shadcn@latest add hover-card`, wraps `@base-ui/react/preview-card`; `Root` renders no DOM element, so the `<tbody>`/`<tr>` structure stays valid). Each row is the card's `Trigger` via `render={<TableRow />}`, at `delay={250}`/`closeDelay={150}` (Base UI's 600/300 defaults are tuned for inline text links, not for skimming down a table). The row is deliberately **not** given `tabIndex` or an `aria-label` — that would add one tab stop per receipt (50 receipts → 50 extra stops), and the clean fix (`role="grid"` + roving tabindex) is disproportionate for a visual-only preview. Keyboard support instead comes for free: React's `onFocus` bubbles from `focusin`, and Base UI attaches its trigger `onFocus` without a `target === currentTarget` guard, so focusing the row's existing "…" actions button (already in the tab order, already labeled) opens the card too — a `:focus-visible` guard in Base UI still keeps a mouse click on that button from opening it. The card image uses `alt=""` (decorative — the row thumbnail already carries `alt={merchant}`) and `object-contain` to override `ReceiptImage`'s built-in `object-cover` (`cn()`/tailwind-merge lets the later class win) so a tall receipt is shown in full rather than cropped. No new i18n keys — the card shows only an image. Not unit-tested: actual viewport-edge flipping and "nothing opens on touch" — jsdom has no layout engine or pointer model, so such a test would pass without proving anything (same trap as the `md:hidden` case above)
- List page filters (`(pages)/page.tsx`): merchant search, a period `Select` (`all | this-month | last-3-months | this-year`, default **`all`** — not "This month" like the mockup, so older receipts don't look like they vanished on open), and a sort `Select` (`newest | oldest | amount-desc | amount-asc`) are all `useMemo` derivations over the already-fetched `receipts` array — no query params on `GET /receipts`, no debounce, native `Date` comparisons (no date library). The header's summary line ("N receipts · X.XX CUR tracked") is the account-wide total (unaffected by the active filters) and is only shown when every receipt shares one `currency` — mixed currencies mean no summary line rather than a wrong summed total

**Future: PDF upload** (not built yet, design-only)

- Currently image-only: `ALLOWED_CONTENT_TYPES` (backend, `routers/receipts.py`) and the file input's `accept` (frontend, `receipt-form-dialog.tsx`) both reject PDFs today
- Real motivating use case, not speculative: connected e-receipt services (e.g. Rewe eBon and similar digital receipts from other discounters/shops) deliver PDFs, not photos — the service needs to accept both a photographed/scanned image *and* a PDF for the same `Receipt` record
- Preview breaks naively: `receipt-image.tsx` renders `<img src={blobUrl}>`, which can't display a PDF blob — needs either a rendered thumbnail (e.g. PDF.js) or a fallback file-icon + "open" link instead of an inline image
- Extraction strategy differs by source: photographed receipts need OCR/LLM-vision (per the OCR plan), but many digital e-receipt PDFs (like eBon) have a real text layer — direct PDF text extraction (e.g. `pypdf`/`pdfplumber`) is more accurate and cheaper than OCR and should be tried first when the upload is a PDF
- The hook already exists: `create_receipt` never hardcodes `image/jpeg`/`.jpg`, it reads both off the `ProcessedImage` returned by `preprocess_image`. Adding PDFs is one branch before that call (`application/pdf` → pass through unchanged, else preprocess) returning the same shape; the rest of the route and the DB are untouched, since `content_type` is a free text column. Do **not** try to make `preprocess_image` itself PDF-aware — a PDF gets no rotation, no downscale and no re-encode (that would destroy the text layer), so it would be an abstraction with nothing in it

**Future: product-level analytics** (not built yet, design-only)

- A `ReceiptItem` child table (`receipt_id` FK, `description`, `quantity`, `unit_price`, `total_price`) is the planned way to store line items once OCR can extract them — purely additive, no changes to `Receipt` needed when it's added
- Normalized table, not a JSON column on `Receipt` — "frequently bought products" is a `GROUP BY`/aggregate query, which relational tables with indexes handle natively; a JSON blob would fight that
- No separate analytics store/warehouse — Postgres handles this scale fine; that's solving a scale problem the app doesn't have


## Settings

Implemented and tested. Three account-wide settings — `number_format`, `default_currency` and `language` — live as columns on `users` (see Auth above) and are edited via `PATCH /auth/me`. Deliberately **not** in scope: account deletion, and a sign-out control on the settings screen (it already exists, tested, in the sidebar footer — see Auth above — not duplicated here).

- **Theme stays per-device**, not promoted to an account setting — the mockup's copy ("Applies on every device...") doesn't match this decision. The Appearance card description was neutralized to "How the app looks and reads." and the device-vs-account distinction moved into each row's own sub-line instead: the Theme row says "System follows your OS setting — stored on this device only", the Language row says "Applies to your account, wherever you sign in."
- **`useTheme` is now a tri-state store** (`"light" | "dark" | "system"`, `src/hooks/use-theme.ts`), not a boolean. `"system"` has no explicit localStorage value — the mode *is* "system" whenever the `theme` key is absent, and switching to it just removes the key rather than writing a third sentinel value. Split into two independent `useSyncExternalStore`s: one snapshotting the stored mode (string, changes via `storage` events — including a manually dispatched one, since `localStorage.setItem` doesn't fire `storage` in the same tab that wrote it), one snapshotting `matchMedia("(prefers-color-scheme: dark)").matches` (plain boolean, changes via the media query's own `change` event). Kept as two stores instead of one combined `{mode, osDark}` snapshot because `useSyncExternalStore` compares snapshots with `Object.is` — a getSnapshot returning a fresh object every call never compares equal and re-renders (or loops) every time it's read. The resolved `dark` boolean is derived from both in the hook body, and a `useEffect` keyed on that boolean applies/removes the `dark` class — covers mount, a mode switch, and a live OS preference change while in `"system"`. `toggleTheme`/`dark` are kept on the return value alongside the new `mode`/`setTheme` so `app-sidebar.tsx`'s existing footer toggle (light/dark only, no UI for three states) didn't need to change
- **`formatAmount(amount, numberFormat)`** (`src/lib/utils.ts`) is a one-line wrapper over `Intl.NumberFormat(numberFormat, { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(Number(amount))` — `number_format` stores the **locale string** itself (`"de-DE"`/`"en-US"`), not a separator enum, specifically so the frontend can hand it straight to `Intl` with no mapping table on either side. Applied everywhere an amount was previously rendered raw: `receipts-table.tsx`, the receipts-page summary line, and the delete-confirmation preview line in `(pages)/page.tsx`
- **UI language via `next-intl`, no locale routing.** No `/de`/`/en` URL prefixes, no middleware, no `[locale]` segment — the active locale comes from a `locale` cookie read server-side in `src/i18n/request.ts` (`getRequestConfig`). Message catalogs live in `frontend/messages/{de,en}.json`, one namespace per page/component (`useTranslations("SettingsPage")`, etc.) rather than one flat catalog, matching the existing feature-based component split. A `Common` namespace was deliberately **not** created — no string repeats identically at 3+ call sites, so it would just be a flat catalog with an extra lookup step. Date/amount formatting stays keyed to `number_format`, not `language` (see the `formatAmount` bullet above) — they're independent settings; a German-speaking user shopping in the US still wants US-formatted amounts if they set `number_format` that way. This is why the receipts-page summary line passes its amount into the catalog **already formatted** by `formatAmount`: the message is an ICU one (`{count, plural, one {# receipt} other {# receipts}} · <mono>{amount}</mono> tracked`, rendered with `t.rich()` so the `font-mono` span stays inside the sentence rather than splitting it into two word-order-locked fragments), but next-intl's own number formatter is never used — it would key off `language` and quietly undo the separation. The plural is not cosmetic: the pre-i18n line hardcoded `{n} receipts` and rendered “1 receipts”
- **Cookie sync and the refresh-loop guard** (`src/lib/locale.ts`, `syncLocaleCookie`). On first load without a cookie, the server guesses the locale from `Accept-Language` and the client hydrates with the same value — no mismatch, since both come from the same request config. `useAuthGuard` then fetches the real account `language` via `getMe()`; if it differs from the cookie, `syncLocaleCookie` writes the cookie and **reads it back** to confirm the write landed before returning `true` — only a confirmed write triggers `router.refresh()`. This matters because the write happens client-side (not httpOnly) and fails silently if cookies are blocked: without the read-back check, a blocked cookie would leave the mismatch in place forever and `router.refresh()` would fire on every render (`getMe()` → mismatch → refresh → `getMe()` → mismatch → ...). If cookies stay blocked, the account setting is still the source of truth — Settings shows the correct value, only the *rendered* language lags, and it's display-only (decision above keeps amounts/dates unaffected). It self-heals on the next full page load. `router.refresh()`, not `location.reload()`, re-renders the server components (root layout, `NextIntlClientProvider`, metadata) while keeping the in-memory access token alive; a full reload would discard it and force a second silent refresh. The Settings language `Tabs` reuses the same `syncLocaleCookie` + `router.refresh()` path after a confirmed `PATCH /auth/me`. The cookie is deliberately **not** cleared on logout — it's a device preference for the login page, and the next login corrects it if it's stale
- **`MeContext`** (`src/lib/me-context.tsx`, `MeProvider`/`useMe`) exists because Next.js layouts can't pass props down to the pages they wrap — `(pages)/layout.tsx` already fetches `me` for the sidebar via `useAuthGuard`, but `(pages)/page.tsx` and `receipts-table.tsx` had no way to read it for `formatAmount`/`default_currency` without either prop-drilling through every route or refetching. `useAuthGuard` now also returns `setMe`, and `(pages)/layout.tsx` wraps its children in `MeProvider` with both — the settings page calls `setMe` with the server's response after a confirmed `PATCH /auth/me`, so a new default currency is immediately visible in the receipt form without a refetch. No state-management package: it's one `createContext`/`useContext` pair, ~20 lines
- **`receipt-form-dialog.tsx` stays props-only** (its existing interface) — the create/edit dialog takes a new `defaultCurrency` prop from the calling page's `useMe()` instead of reading the context itself, so the dialog's dependency surface doesn't grow
- **"Saved automatically", no Save button, no optimistic update**: the number-format `Tabs` and currency `Select` in `/settings` are controlled directly by `me.number_format`/`me.default_currency` from context. `onValueChange` fires the `PATCH` immediately; the displayed value only moves once `setMe` runs with the server's response, so the screen never shows a selection that isn't actually persisted. A failed `PATCH` surfaces as an `Alert` and leaves the previous value in place
- Password change reuses the existing `Dialog` pattern from `receipt-form-dialog.tsx`; a 400 response (wrong current password) is shown inline in the dialog, not as a redirect or logout — see the Tokens note above for why 400 and not 401


## Image Preprocessing

Implemented and tested. `services/image_processing.py` runs between upload and storage, independent of whichever extraction method comes later.

`preprocess_image(content: bytes) -> ProcessedImage` is a plain module function, deliberately **not** a `Protocol`/dependency like `StorageBackend` — there is only one implementation and no external resource, so it is a pure bytes→bytes transform that tests call directly.

Pipeline order (order matters — see EXIF below):

1. `Image.open()` — HEIC/HEIF readable because the module calls `pillow_heif.register_heif_opener()` at import
2. `ImageOps.exif_transpose()` — applies EXIF orientation (phone photos are often sideways) and clears the tag so viewers don't rotate a second time
3. `.convert("RGB")` — JPEG has no alpha/palette; PNG transparency is lost, which is irrelevant for receipts
4. `thumbnail()` to max 2000px longest edge — `thumbnail()` keeps the aspect ratio and never scales up, unlike `resize()`
5. Re-encode to JPEG (quality 85, `optimize=True`)

- **Always JPEG**, not "JPEG or WebP": one format means one `content_type` and one extension, no decision tree. Universally renderable and fine for Tesseract later; switching to WebP would be a change inside this one file
- **EXIF is stripped, on purpose.** `save()` is called without `exif=`, so GPS coordinates in phone photos never reach storage. There is a test asserting the result carries no EXIF — don't "fix" it by preserving metadata
- **Runs in a threadpool**: `create_receipt` is `async def` and decoding a 12 MP photo takes 200–800 ms, which would block the event loop for every concurrent request. The route calls `await run_in_threadpool(preprocess_image, content)`
- **Errors**: the service raises, the route maps to 400 — `OSError` (covers `UnidentifiedImageError` *and* truncated files that pass the header check but fail mid-decode), `DecompressionBombError`, and `ImageTooLargeError`. Catching only `UnidentifiedImageError` was a bug: a half-uploaded photo from a flaky mobile connection returned 500
- **Pixel guard**: `MAX_PIXELS = 50_000_000`, checked right after `Image.open()` — which is lazy, so the check runs before any pixel is decoded. Necessary because Pillow's own `DecompressionBombError` only fires above *2x* `MAX_IMAGE_PIXELS` (~178 MP): a flat-colour 12000x12000 PNG compresses to 435 KB, sails through `MAX_FILE_SIZE`, and would decode into a ~430 MB RGB buffer. `MAX_FILE_SIZE` cannot cover this — the compression ratio is unbounded. Trade-off: leaves ~2% headroom over a 48 MP phone camera and rejects an A4 scan at 600 dpi (70 MP); raise it if scanner uploads become a real case
- `ImageTooLargeError` is deliberately **not** an `OSError` subclass, so "too big" stays distinguishable from "corrupt" even though both currently map to the same 400
- `ALLOWED_CONTENT_TYPES` is now only a cheap pre-filter — the real validation is "Pillow can decode it". A mislabelled but valid image gets through, which is harmless since everything is re-encoded anyway. `MAX_FILE_SIZE` still applies to the **original** bytes, because it limits what the decoder is fed at all
- No deskew/contrast/binarization step — that's a Tesseract-accuracy workaround; skip it if extraction moves to an LLM-vision approach
- Dependencies: `pillow` + `pillow-heif`, both with `cp314` manylinux wheels, so CI needs **no** `libheif` system packages
- Tests: `tests/test_image_processing.py` (pure unit tests) plus real generated images in `tests/images.py`. Upload tests must use decodable bytes — placeholder bytes like `b"fake-jpeg"` now fail with 400. Never assert on exact stored bytes: a JPEG re-encode is not reproducible across Pillow versions


## OCR Extraction

Implemented and tested. `services/ocr.py` recognizes merchant/amount/purchase date on **German** receipts via Tesseract; `POST /receipts/extract` exposes it as a preview that persists nothing.

Split into two functions, same reasoning as `image_processing.py`'s standalone `preprocess_image`:

- `parse_receipt_text(text: str) -> ReceiptExtraction` — pure, takes already-OCR'd text and applies the heuristics below. Deterministic, unit-tested without a Tesseract binary
- `extract_receipt_data(content: bytes) -> ReceiptExtraction` — runs `preprocess_image()` first (EXIF rotation matters for OCR accuracy, not just display), then `pytesseract.image_to_string(image, lang="deu")`, then `parse_receipt_text`. Raises whatever `preprocess_image` raises, plus `pytesseract.TesseractNotFoundError`

Heuristics (German-only, no i18n yet — see "Future: OCR language" below):

- **Amount**: scans lines for `TOTAL_KEYWORDS = ("SUMME", "GESAMT", "ZU ZAHLEN", "ENDBETRAG")`, case-insensitive, excluding lines containing `ZWISCHENSUMME` (a substring match on `SUMME` would otherwise catch it). Takes the **last** matching line (the final total prints after any subtotals). Regex is `(?:\d{1,3}(?:\.\d{3})+|\d+),\d{2}` — either a real thousands grouping or an arbitrarily long ungrouped run of digits. A naive `\d{1,3}(?:\.\d{3})*,\d{2}` only matches `234,56` out of `SUMME 1234,56` (the `\d{1,3}` greedily caps at 3 digits and the grouping is optional) — four-digit totals without a thousands separator are common on receipts, and a wrong amount is worse than a missing one on a money field. If the keyword line itself has no number, checks the next non-empty line (printers wrap). No match anywhere → `None`, no "largest number in the text" fallback. **`BETRAG` is deliberately absent** from the keyword list: it is a substring of `Rabattbetrag`, `Nettobetrag`, `Steuerbetrag` and `Rechnungsbetrag`, which print *after* the total — combined with "last match wins" that silently returned a discount of 2,00 € instead of a 20,00 € total. `Gesamtbetrag` stays covered via `GESAMT`, `Endbetrag` via `ENDBETRAG`, so nothing is lost
- **Date**: `\b(\d{1,2})\.(\d{1,2})\.(\d{2,4})\b` over the whole text, first match that's both syntactically and *calendarically* valid (`date(...)` in a try/except skips `99.99.2024` and keeps scanning). Two-digit year → `2000 + yy`. No match → `None`
- **`OCR_CONFIG = "--psm 6"` is load-bearing, not tuning.** Tesseract's default segmentation (PSM 3) auto-detects layout and reads a receipt as *two columns*, emitting every label first and every number afterwards — `SUMME EUR` and its amount end up many lines apart and the line-based heuristics can never join them. Measured on the same image: PSM 3 → `None`, PSM 4 → wrong value (`208,08`), PSM 6 → correct. A regression test asserts the config reaches `image_to_string`, because removing the line breaks the feature while every other test stays green
- **Merchant**: first non-empty stripped line. Empty text → `None`

Tests: `tests/test_ocr.py` exercises `parse_receipt_text` directly (no Tesseract needed); `tests/test_receipt_extraction.py` mocks `backend.services.ocr.pytesseract.image_to_string` for the endpoint and asserts nothing is persisted (`storage_backend.save` not called, `GET /receipts` stays empty). `TesseractNotFoundError` has no endpoint test — `httpx.ASGITransport` runs with `raise_app_exceptions=True`, so an uncaught exception propagates out of the test client instead of coming back as a response.

**Tesseract must be installed locally to run `extract_receipt_data` for real** (native `uv run pytest` mocks it, so this doesn't block local test runs) — either install the OS package, or use the `backend` Docker service below, which bakes it into the image.

### Future: OCR language

Checked and deliberately deferred when the frontend `language` account setting was
added (see Settings above). The UI language and the OCR language are **not the
same setting** — `language` is what the interface reads in; the OCR language is
the language *printed on the receipt itself*. A German-speaking user shopping
abroad still has German as their UI language but an English (or French, or
Spanish) receipt — defaulting OCR to the UI language would silently be wrong for
exactly that case. The real fix is language detection on the recognized text, or
a per-upload choice, not a hook driven by `language`.

Switching `pytesseract.image_to_string(..., lang=...)` to `"eng"` alone is not
enough — `parse_receipt_text` (`backend/src/backend/services/ocr.py`) is
hardcoded to German in three independent places, and fixing only the Tesseract
language argument would produce cleanly recognized English text that the parser
then discards entirely, which is worse than today's behavior because it looks
supported:

- `TOTAL_KEYWORDS = ("SUMME", "GESAMT", "ZU ZAHLEN", "ENDBETRAG")` — none of these
  match an English receipt's `TOTAL` / `AMOUNT DUE` / `BALANCE`
- `AMOUNT_PATTERN` expects `1.234,56` (period groups, comma is the decimal
  separator); an English receipt prints `1,234.56` and never matches
- `DATE_PATTERN` expects `dd.mm.yyyy`; English receipts print `mm/dd/yyyy` or
  `dd/mm/yyyy`, which is additionally ambiguous without knowing the source locale

Full scope, if this gets built: a second `lang="eng"` code path through
`extract_receipt_data`, `tesseract-ocr-eng` added to `backend/Dockerfile` and
`.github/workflows/backend.yml`, a second set of `parse_receipt_text` heuristics
and tests, and a decision on how the language is chosen (detected vs. selected
per upload). No hook, parameter or `Protocol` abstraction was added ahead of
this — same reasoning as `preprocess_image` and `parse_receipt_text` above: an
abstraction with one implementation is speculative until the second language
actually exists.


## UI Design Reference

UI concepts for SmartReceipts are designed in Claude Design and exported into
`docs/ui-concept/` (mockup HTML/screens + a per-screen list of the shadcn/ui
components each one uses). That folder is the reference for any frontend work:
check it before hand-building a screen, and treat its component lists as the
implementation checklist (`npx shadcn@latest add <name>` for anything not yet in
`frontend/src/components/ui/`).

Constraints the design was generated under, so exports stay 1:1 implementable:

- Only shadcn/ui patterns — no custom widgets for anything a primitive covers
- Only the design tokens already defined in `frontend/src/app/globals.css`
  (purple theme, light + dark); no new colors, radii or fonts
- Custom Tailwind only for layout (flex/grid, spacing)
- Mobile-first (upload happens on the phone), desktop is the analysis context

`frontend/components.json` uses `"style": "base-mira"` / `"iconLibrary": "hugeicons"`, not
stock shadcn — but the generated `sidebar.tsx` still exports the standard API
(`SidebarProvider`, `Sidebar`, `SidebarInset`, `SidebarMenuButton`, `SidebarGroupLabel`,
etc.), just built on Base UI's `render` prop (`<SidebarMenuButton render={<Link .../>}>`)
instead of Radix's `asChild` — same pattern already used throughout `components/ui/`
(`dialog.tsx`, `select.tsx`, ...). Verify with `npx shadcn@latest add <name>` and read
the generated file before assuming stock shadcn docs apply as-is.

Status: **exported.** `docs/ui-concept/README.md` is the index — read it before any
frontend work; it lists all 10 screens with their shadcn components and marks which
primitives are still missing from `frontend/src/components/ui/`.

- `SmartReceipts UI Spec Board.html` — the rendered board (single-file bundle, React
  + fonts inlined); open this one in a browser
- `screens/Screen-*.html` — the same 10 screens unpacked out of that bundle: readable
  HTML with inline styles, the source for layout, copy and states. They don't render
  standalone (they reference a `./support.js` that only exists inside the bundle)

Screens: Auth, Dashboard, ReceiptsToday, ReceiptsDesktop, ReceiptsMobile,
UploadInline, UploadReview, Detail, Delete, Settings. Auth, ReceiptsToday, Delete,
UploadReview and Settings are **implemented** (see Auth, Receipts and Settings sections
above) — Settings kept its three cards (Appearance, Amounts, Account), including the
Language row in Appearance (see Settings above; the mockup's placeholder copy "German
is next in the i18n queue" is now built), but dropped the Sign out row (already lives
in the sidebar footer, not duplicated) and the Delete account row (out of scope).
ReceiptsDesktop contributed only
its **sidebar shell** (`app-shell.tsx`/`app-sidebar.tsx`) — its filter chrome (breadcrumb,
pagination, date/amount range popovers, PDF badge column, notes column) is still
mockup-only, since the live filters are the simpler client-side set described under
Receipts. Dashboard is still a placeholder page (`Empty` primitive) behind its nav link.
ReceiptsMobile and Detail are untouched. `badge`, `sidebar` and `progress` are now
installed (`npx shadcn@latest add badge sidebar progress` also pulled in `sheet`,
`tooltip` and the `use-mobile` hook as sidebar dependencies), and `hover-card` for the
receipts-table preview; still missing: `breadcrumb pagination popover calendar
toggle-group chart`.

The receipts-table hover preview (see Receipts above) is a deliberate addition on top
of the design, not a rebuild of a mockup screen — `docs/ui-concept/` has no hover-card
state for the table.

The concept assumes features that don't exist yet (dashboard analytics, PDF upload,
line items) — it is a target picture, not a to-do list. Its PDF and line-item screens
line up with the "Future:" sections above.

On re-export: replace the bundle, unpack `screens/` again, and update the README.


## Testing

- Backend: `pytest` + `pytest-asyncio` + `httpx.AsyncClient` against the FastAPI app; migrations applied via Alembic in a session fixture, transactional rollback per test
  - Local: second DB (`smart_receipts_test`) inside the same dev Postgres container
  - CI: separate throwaway Postgres service container
- Frontend: `Vitest` + `React Testing Library` (jsdom, `@vitejs/plugin-react-swc` — not `@vitejs/plugin-react`, which conflicts with shadcn's Babel peer deps) for components; `Playwright` for the core e2e flow (upload receipt → see extracted data → confirm/save) — deferred until that flow exists
  - `use-auth-guard.test.ts` tests the redirect-on-failed-refresh behavior **once**, against the hook directly (`renderHook`) — now that it's shared by every `(pages)` route, testing it per-page again would be the same assertion three times
  - `(pages)/page.test.tsx` mocks `extractReceipt` explicitly in every create-flow test (rather than letting the real unmocked call fail silently, which used to work by accident) and waits for the scan phase to settle (`extractReceipt` called, then the Merchant field back in the DOM) before touching form fields — they're swapped for `Skeleton`s while `isExtracting` is true
  - `app-sidebar.test.tsx` mocks `next/navigation`'s `usePathname` to assert the active nav item, and must render `AppSidebar` inside a `SidebarProvider` (it calls `useSidebar()` internally). Sidebar collapse/keyboard-shortcut behavior isn't tested — that's shadcn's own, not app logic
  - `receipt-image.test.tsx` covers `refreshReceiptImage`: two `ReceiptImage` mounted on the same `receiptId` (row + dialog) both switch to the new object URL after a refresh, and the old URL is revoked exactly once — the subtle part of the ref-counted cache that a per-component test can't reach. `receipt-form-dialog.test.tsx` covers replace-file (calls `replaceReceiptImage`, then `onSaved`, without closing the dialog; a rejection shows `replaceImageError` and skips `onSaved`) and the zoom overlay opening/closing (by accessible name). `receipt-zoom-view.test.tsx` covers `clampOffset` and the pan/zoom surface, per the bullet above. Neither `receipt-form-dialog.test.tsx` nor `receipt-image.test.tsx` tests the CSS-dependent bits (bigger-looking preview, `object-contain` vs `object-cover`, the currency trigger filling its column, whether an outside *click* rather than Escape also closes only the top dialog, and where focus lands afterwards) — jsdom applies no CSS, so those stay manual checks, per the trap already documented in AGENTS.md
  - `settings/page.test.tsx` and `(pages)/page.test.tsx` both render inside `MeProvider` (a fixed `Me` + a `vi.fn()` `setMe`) since `useMe()` throws outside it — `receipts-table.tsx` and the settings page both call it directly. The "no optimistic update" test asserts `setMe` was **not** called and the preview text is unchanged after a rejected `updateMe`, not just that an `Alert` appeared
- CI: GitHub Actions — `.github/workflows/backend.yml` (ruff + alembic + pytest on `/backend` changes) and `.github/workflows/frontend.yml` (eslint + prettier + tsc + vitest on `/frontend` changes), both live

