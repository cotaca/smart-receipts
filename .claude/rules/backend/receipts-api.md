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
- `storage_key` is opaque and never exposed; `ReceiptPublic` exposes a computed `image_url` instead. Preprocessing re-encodes everything, so the key always ends in `.jpg`, `content_type` is always `image/jpeg` and `file_size` is the processed size. `original_filename` is display-only.
- Keys are generated as `f"{user_id}/{uuid4()}{ext}"`, never from the upload name: no path traversal, no collisions, per-user namespace for a future shared bucket.
- Another user's receipt → **404, not 403**: don't confirm the ID exists.
- Images only via the authenticated `GET /receipts/{id}/image`, never a public static mount. There is no thumbnail endpoint.
- `POST /receipts/extract` persists nothing. It's its own path so it can't collide with the `/{id}` routes.
- Upload validation (content type + `MAX_FILE_SIZE`) lives once, in `_read_upload()`, shared by create, extract and replace.
- `PUT /receipts/{id}/image` is separate from `PATCH`: `PATCH` takes JSON and every caller relies on that — no branching on `Content-Type`. Order is **save new file → commit row → delete old file**, the only order where `storage_key` never points at a missing file. Failed commit: delete the just-saved file in `except`, re-raise. Failed delete of the old file: swallow it — the row is already correct, and a remote backend's delete can fail.
- Routes and tests depend only on the `StorageBackend` `Protocol` (`save`/`read`/`delete`). `LocalStorageBackend` is the only implementation; S3/Supabase = a new class + a `STORAGE_BACKEND` value, no route changes.

## Design only, not built

- **PDF upload** (real case: e-receipts like Rewe eBon). Today `ALLOWED_CONTENT_TYPES` and the file input's `accept` reject PDFs. Add one branch before `preprocess_image` (`application/pdf` → pass through unchanged, else preprocess) returning the same shape; route and DB stay as they are (`content_type` is free text). Don't make `preprocess_image` PDF-aware — rotating, downscaling or re-encoding destroys the text layer. Try direct text extraction (`pypdf`/`pdfplumber`) before OCR. The frontend preview then needs a PDF.js thumbnail or a file-icon fallback.
- **Line items**: a normalized `ReceiptItem` child table (`receipt_id`, `description`, `quantity`, `unit_price`, `total_price`), not JSON on `Receipt` — product analytics are `GROUP BY` queries. Purely additive; no separate analytics store.
