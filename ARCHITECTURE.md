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
- `UserPublic`: `id`, `email`, `is_active`, `created_at`, `number_format`, `default_currency` — explicitly excludes `hashed_password`
- `UserSettingsUpdate`: `number_format` (`Literal["de-DE", "en-US"]`), `default_currency` (`Literal["EUR", "USD", "GBP", "CHF"]`) — both optional, partial update, same pattern as `ReceiptUpdate`. The `Literal`s are the trust boundary; there's no DB `CHECK` constraint because `PATCH /auth/me` is the only write path
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
| DELETE | `/receipts/{id}` | required | — → 204; removes DB row **and** the stored file |
| GET | `/receipts/{id}/image` | required | — → image bytes, correct `Content-Type` |

- Ownership check returns **404, not 403** for another user's receipt — same reasoning as auth: don't confirm a resource ID exists at all to someone who doesn't own it
- Images are served through this authenticated route, never a public static file mount
- The delete confirmation (`AlertDialog` in `(pages)/page.tsx`) shows a preview row above Cancel/Delete: `ReceiptImage` thumbnail, merchant, and a `font-mono` `"{purchased_at} · {amount} {currency}"` line — the only delta from a bare confirm dialog
- `/receipts/extract` is declared as its own path (not nested under `{id}`) so it never collides with `GET /receipts/{id}` — different HTTP method, and there is no `POST /receipts/{id}` route to confuse it with
- `create_receipt` and `extract_receipt` share a `_read_upload()` helper (content-type + `MAX_FILE_SIZE` check) — same validation, one place to change it

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

- `receipt-form-dialog.tsx`: shared create/edit form (`Dialog`, two-column layout: preview left, fields right); `receipts-table.tsx`: list (`Table` + `DropdownMenu` row actions); `receipt-image.tsx`: thumbnail loader
- Dialog preview column: **create** mode shows the local `File` via `URL.createObjectURL` (created with `useMemo`, revoked in a cleanup-only `useEffect` on file change/unmount — not `useState`+`useEffect`, which would call `setState` synchronously in the effect body and trip the repo's `react-hooks/set-state-in-effect` rule); **edit** mode reuses `ReceiptImage` against the stored image. No scan states in edit mode — extraction only ever runs on a freshly selected file
- On file selection (create mode only), `receipt-form-dialog.tsx` calls `extractReceipt()` and walks through two extra phases before the plain field layout: `scanning` (`Progress value={null}` for an indeterminate bar + an `Alert` + `Skeleton` placeholders over merchant/amount/date) then `review` (an `Alert` with `"{n} of 3 fields found."`, computed from the non-null fields — not a static string — plus a `Badge` — "Suggested" or "Not detected" — next to each of the three extracted fields' labels). Both phases are derived state (`isScanning`/`isReview`), not stored separately. Deliberately **not** built: the mockup's per-field `meta` text ("top of receipt", "SUMME EUR line") and the "Highlighted on the scan" overlay — `POST /receipts/extract` returns no source or confidence, so anything more specific would be fabricated copy; and the entire PDF review branch, since the backend doesn't accept PDFs yet (see "Future: PDF upload")
- Suggestions only ever fill a field when the OCR actually returned it (`if (data.merchant) ...`), so a value the user already typed is never overwritten with `null`. Extraction errors are swallowed (no error banner): it's a convenience, manual entry must keep working unchanged
- `GET /receipts/{id}/image` requires a Bearer header, so a plain `<img src>` can't load it — `receipt-image.tsx` fetches the blob via `apiFetch` and uses `URL.createObjectURL()`, revoked on unmount
- `apiFetch` skips its default `Content-Type: application/json` when the body is `FormData`, letting the browser set the multipart boundary itself — needed for the create endpoint's file upload
- State: plain `useState` + refetch after each mutation, not TanStack Query — not enough concurrent data-fetching complexity yet to justify the dependency
- Date input is native `<input type="date">`, currency a small `Select` with a few common codes — both deliberately minimal, upgradeable later
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

Implemented and tested. Two account-wide settings — `number_format` and `default_currency` — live as columns on `users` (see Auth above) and are edited via `PATCH /auth/me`. Deliberately **not** in scope: a language/i18n field (no locale strings extracted anywhere yet), account deletion, and a sign-out control on the settings screen (it already exists, tested, in the sidebar footer — see Auth above — not duplicated here).

- **Theme stays per-device**, not promoted to an account setting — the mockup's copy ("Applies on every device...") doesn't match this decision and was rewritten in the shipped screen to "Stored on this device only — sign in elsewhere and you'll need to set it again."
- **`useTheme` is now a tri-state store** (`"light" | "dark" | "system"`, `src/hooks/use-theme.ts`), not a boolean. `"system"` has no explicit localStorage value — the mode *is* "system" whenever the `theme` key is absent, and switching to it just removes the key rather than writing a third sentinel value. Split into two independent `useSyncExternalStore`s: one snapshotting the stored mode (string, changes via `storage` events — including a manually dispatched one, since `localStorage.setItem` doesn't fire `storage` in the same tab that wrote it), one snapshotting `matchMedia("(prefers-color-scheme: dark)").matches` (plain boolean, changes via the media query's own `change` event). Kept as two stores instead of one combined `{mode, osDark}` snapshot because `useSyncExternalStore` compares snapshots with `Object.is` — a getSnapshot returning a fresh object every call never compares equal and re-renders (or loops) every time it's read. The resolved `dark` boolean is derived from both in the hook body, and a `useEffect` keyed on that boolean applies/removes the `dark` class — covers mount, a mode switch, and a live OS preference change while in `"system"`. `toggleTheme`/`dark` are kept on the return value alongside the new `mode`/`setTheme` so `app-sidebar.tsx`'s existing footer toggle (light/dark only, no UI for three states) didn't need to change
- **`formatAmount(amount, numberFormat)`** (`src/lib/utils.ts`) is a one-line wrapper over `Intl.NumberFormat(numberFormat, { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(Number(amount))` — `number_format` stores the **locale string** itself (`"de-DE"`/`"en-US"`), not a separator enum, specifically so the frontend can hand it straight to `Intl` with no mapping table on either side. Applied everywhere an amount was previously rendered raw: `receipts-table.tsx`, the receipts-page summary line, and the delete-confirmation preview line in `(pages)/page.tsx`
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

Heuristics (German-only, no i18n yet):

- **Amount**: scans lines for `TOTAL_KEYWORDS = ("SUMME", "GESAMT", "ZU ZAHLEN", "ENDBETRAG")`, case-insensitive, excluding lines containing `ZWISCHENSUMME` (a substring match on `SUMME` would otherwise catch it). Takes the **last** matching line (the final total prints after any subtotals). Regex is `(?:\d{1,3}(?:\.\d{3})+|\d+),\d{2}` — either a real thousands grouping or an arbitrarily long ungrouped run of digits. A naive `\d{1,3}(?:\.\d{3})*,\d{2}` only matches `234,56` out of `SUMME 1234,56` (the `\d{1,3}` greedily caps at 3 digits and the grouping is optional) — four-digit totals without a thousands separator are common on receipts, and a wrong amount is worse than a missing one on a money field. If the keyword line itself has no number, checks the next non-empty line (printers wrap). No match anywhere → `None`, no "largest number in the text" fallback. **`BETRAG` is deliberately absent** from the keyword list: it is a substring of `Rabattbetrag`, `Nettobetrag`, `Steuerbetrag` and `Rechnungsbetrag`, which print *after* the total — combined with "last match wins" that silently returned a discount of 2,00 € instead of a 20,00 € total. `Gesamtbetrag` stays covered via `GESAMT`, `Endbetrag` via `ENDBETRAG`, so nothing is lost
- **Date**: `\b(\d{1,2})\.(\d{1,2})\.(\d{2,4})\b` over the whole text, first match that's both syntactically and *calendarically* valid (`date(...)` in a try/except skips `99.99.2024` and keeps scanning). Two-digit year → `2000 + yy`. No match → `None`
- **`OCR_CONFIG = "--psm 6"` is load-bearing, not tuning.** Tesseract's default segmentation (PSM 3) auto-detects layout and reads a receipt as *two columns*, emitting every label first and every number afterwards — `SUMME EUR` and its amount end up many lines apart and the line-based heuristics can never join them. Measured on the same image: PSM 3 → `None`, PSM 4 → wrong value (`208,08`), PSM 6 → correct. A regression test asserts the config reaches `image_to_string`, because removing the line breaks the feature while every other test stays green
- **Merchant**: first non-empty stripped line. Empty text → `None`

Tests: `tests/test_ocr.py` exercises `parse_receipt_text` directly (no Tesseract needed); `tests/test_receipt_extraction.py` mocks `backend.services.ocr.pytesseract.image_to_string` for the endpoint and asserts nothing is persisted (`storage_backend.save` not called, `GET /receipts` stays empty). `TesseractNotFoundError` has no endpoint test — `httpx.ASGITransport` runs with `raise_app_exceptions=True`, so an uncaught exception propagates out of the test client instead of coming back as a response.

**Tesseract must be installed locally to run `extract_receipt_data` for real** (native `uv run pytest` mocks it, so this doesn't block local test runs) — either install the OS package, or use the `backend` Docker service below, which bakes it into the image.


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
above) — Settings kept its three cards (Appearance, Amounts, Account) but dropped the
Language row (no i18n yet), the Sign out row (already lives in the sidebar footer, not
duplicated) and the Delete account row (out of scope). ReceiptsDesktop contributed only
its **sidebar shell** (`app-shell.tsx`/`app-sidebar.tsx`) — its filter chrome (breadcrumb,
pagination, date/amount range popovers, PDF badge column, notes column) is still
mockup-only, since the live filters are the simpler client-side set described under
Receipts. Dashboard is still a placeholder page (`Empty` primitive) behind its nav link.
ReceiptsMobile and Detail are untouched. `badge`, `sidebar` and `progress` are now
installed (`npx shadcn@latest add badge sidebar progress` also pulled in `sheet`,
`tooltip` and the `use-mobile` hook as sidebar dependencies); still missing: `breadcrumb
pagination popover calendar toggle-group chart`.

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
  - `settings/page.test.tsx` and `(pages)/page.test.tsx` both render inside `MeProvider` (a fixed `Me` + a `vi.fn()` `setMe`) since `useMe()` throws outside it — `receipts-table.tsx` and the settings page both call it directly. The "no optimistic update" test asserts `setMe` was **not** called and the preview text is unchanged after a rejected `updateMe`, not just that an `Alert` appeared
- CI: GitHub Actions — `.github/workflows/backend.yml` (ruff + alembic + pytest on `/backend` changes) and `.github/workflows/frontend.yml` (eslint + prettier + tsc + vitest on `/frontend` changes), both live

