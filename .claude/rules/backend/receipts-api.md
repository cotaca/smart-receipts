---
paths:
  - "backend/src/backend/routers/receipts.py"
  - "backend/src/backend/models/receipt.py"
  - "backend/src/backend/schemas/receipt*.py"
  - "backend/src/backend/services/storage.py"
  - "backend/tests/**/*receipt*"
---

# Receipts API & storage

- Money is `Decimal`, never `float`. `purchased_at` is `date` (no meaningful time of day). `updated_at` comes from SQLAlchemy `onupdate=`, never set per route.
- `merchant`, `amount`, `purchased_at` stay required: OCR only pre-fills the form, it never writes to the DB. Don't make them nullable until an async-extraction flow actually exists — that is a real migration.
- `storage_key` is opaque and never exposed; `ReceiptPublic` exposes a computed `image_url` instead. Preprocessing re-encodes an image upload to JPEG (key ends in `.jpg`, `content_type` `image/jpeg`); a PDF upload passes through byte-for-byte instead (key ends in `.pdf`, `content_type` `application/pdf`) — see below. Either way `file_size` is the stored size and `original_filename` is display-only.
- Keys are generated as `f"{user_id}/{uuid4()}{ext}"`, never from the upload name: no path traversal, no collisions, per-user namespace for a future shared bucket.
- Another user's receipt → **404, not 403**: don't confirm the ID exists.
- Images only via the authenticated `GET /receipts/{id}/image`, never a public static mount. There is no thumbnail endpoint.
- `POST /receipts/extract` persists nothing. It's its own path so it can't collide with the `/{id}` routes.
- Upload validation (content type + `MAX_FILE_SIZE`) lives once, in `_read_upload()`, shared by create, extract and replace.
- `PUT /receipts/{id}/image` is separate from `PATCH`: `PATCH` takes JSON and every caller relies on that — no branching on `Content-Type`. Order is **save new file → commit row → delete old file**, the only order where `storage_key` never points at a missing file. Failed commit: delete the just-saved file in `except`, re-raise. Failed delete of the old file: swallow it — the row is already correct, and a remote backend's delete can fail.
- Routes and tests depend only on the `StorageBackend` `Protocol` (`save`/`read`/`delete`). `LocalStorageBackend` is the only implementation; S3/Supabase = a new class + a `STORAGE_BACKEND` value, no route changes.

## Line items

- Normalized `ReceiptItem` child table (`receipt_items`): `id`, `receipt_id` FK with `ondelete="CASCADE"` (indexed), `position` (order on the receipt — UUIDs have no order), `description`, `quantity` `Numeric(10,3)`, `unit_price`/`total_price` `Numeric(10,2)`, all NOT NULL. Not JSON on `Receipt` — product analytics (later: most-bought products) are `GROUP BY` queries.
- `Receipt.items` is a `Relationship` with `cascade="all, delete-orphan"`, `order_by="ReceiptItem.position"`, `lazy="selectin"` — `selectin` avoids N+1 on `GET /receipts`, `delete-orphan` makes PATCH's replace-all a single `receipt.items = [...]` assignment, and the DB's `ON DELETE CASCADE` plus the ORM cascade together clean up on delete without any code in the route.
- `ReceiptLineItem` (`schemas/receipt.py`) is one shape for in, out and OCR — no `id`, because PATCH always replaces the whole list rather than patching individual rows. `quantity` must be `> 0`; `unit_price`/`total_price` may be negative (deposit return, discount line). No check that `total == quantity × unit`: weighed goods round (0,523 × 2,99 = 1,5638 → 1,56).
- `POST /receipts` takes `items: str = Form("[]")` (a JSON string, since the rest of the request is `multipart/form-data`) — `TypeAdapter(list[ReceiptLineItem]).validate_json(...)`, converted to a `RequestValidationError` on failure so it comes back as the same 422 shape as every other field. Validated **before** `storage.save`, so a bad `items` payload never leaves an orphaned file.
- `PATCH /receipts/{id}` takes `items: list[ReceiptLineItem] | None` on the JSON body; `None` (unset) leaves the rows alone, an explicit list replaces all of them. The shared `_to_rows()` helper builds `ReceiptItem` rows (assigning `position` from list order) for both create and update.

## PDF upload (e-receipts, e.g. Rewe eBon)

`ALLOWED_CONTENT_TYPES` includes `application/pdf`. `_process_upload()` (`routers/receipts.py`), shared by create and replace, branches on the *declared* content type: `application/pdf` → `validate_pdf()` (pass the bytes through unchanged), else `preprocess_image()`. The bytes decide, not the header — a PDF sent with an image content type fails in Pillow, junk sent as `application/pdf` fails in PDFium, and both land in `_PROCESSING_ERRORS` → 400. `preprocess_image` itself stays PDF-unaware on purpose: rotating, downscaling or re-encoding would destroy the text layer that direct extraction depends on (see `.claude/rules/backend/ocr.md`).

`open_pdf()` (`services/pdf.py`) rejects a corrupt or unreadable PDF and one over `MAX_PDF_PAGES` (10) with `InvalidPdfError` → 400. It does **not** special-case an encrypted PDF — pypdfium2 raises `PdfiumError` opening one, caught the same way. Not covered by a test: no library in the project's dependencies can produce an encrypted PDF to open it against.

The `image_url` field and `GET /receipts/{id}/image` path are kept as-is for PDFs too, despite the name — renaming either is a breaking API change, and the endpoint already just streams `content_type` + bytes regardless of what they are.

PDF metadata is **not** stripped (unlike image EXIF, see below) — rewriting a PDF to scrub it risks the text layer, and the German eBon PDFs this targets carry no location data the way a phone photo's EXIF does.

## Not built

- A sum check of items against the receipt total (add it once OCR line-item extraction is shown to be reliably off), an item category, dragging rows to reorder.
