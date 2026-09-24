---
paths:
  - "backend/src/backend/services/image_processing.py"
  - "backend/tests/test_image_processing.py"
  - "backend/tests/images.py"
---

# Image preprocessing

`preprocess_image(bytes) -> ProcessedImage` is a plain function, not a `Protocol`: one implementation, no external resource.

Order matters: `Image.open()` (HEIC via `pillow_heif.register_heif_opener()`) → pixel guard → `exif_transpose()` (also clears the tag so viewers don't rotate twice) → `convert("RGB")` → `thumbnail(2000)` (keeps aspect ratio, never upscales) → JPEG, quality 85, `optimize=True`.

- Always JPEG: one content type, one extension. WebP would be a change inside this file only.
- EXIF is stripped on purpose (GPS in phone photos). A test asserts it — don't "fix" it by preserving metadata.
- Called via `run_in_threadpool`: decoding a 12 MP photo takes 200–800 ms and would block the event loop.
- Errors map to 400 in the route: `OSError` (covers `UnidentifiedImageError` *and* truncated uploads that fail mid-decode — catching only the former returned 500 on flaky mobile uploads), `DecompressionBombError`, `ImageTooLargeError`. The last is deliberately not an `OSError` subclass: "too big" ≠ "corrupt".
- `MAX_PIXELS = 50_000_000`, checked right after the lazy `Image.open()`, before decoding. Pillow's own bomb check only fires above ~178 MP, and compression ratio is unbounded (a flat 12000×12000 PNG is 435 KB → ~430 MB decoded), so `MAX_FILE_SIZE` can't cover it. Allows 48 MP phones, rejects A4 at 600 dpi (70 MP) — raise it if scanner uploads become real.
- `ALLOWED_CONTENT_TYPES` is only a pre-filter; the real check is "Pillow decodes it". `MAX_FILE_SIZE` applies to the original bytes.
- No deskew/contrast/binarization: that's a Tesseract workaround; skip it if extraction moves to LLM vision.
- `pillow-heif` ships cp314 manylinux wheels — CI needs no `libheif`.
- Tests: uploads need decodable bytes (`tests/images.py`); placeholders like `b"fake-jpeg"` get 400. Never assert exact output bytes — JPEG re-encoding differs across Pillow versions.
