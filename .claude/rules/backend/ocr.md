---
paths:
  - "backend/src/backend/services/ocr.py"
  - "backend/tests/test_ocr.py"
  - "backend/tests/test_receipt_extraction.py"
  - "backend/Dockerfile"
---

# OCR extraction (German receipts only)

- Two functions: `parse_receipt_text(text)` is pure and tested without Tesseract; `extract_receipt_data(bytes)` runs `preprocess_image` (EXIF rotation matters for OCR too) → `image_to_string(lang="deu", config=OCR_CONFIG)` → the parser. It raises whatever preprocessing raises, plus `TesseractNotFoundError`.
- **`OCR_CONFIG = "--psm 6"` is load-bearing.** Default PSM 3 reads a receipt as two columns (all labels, then all numbers), so `SUMME` and its amount never share a line. Measured on one image: PSM 3 → `None`, PSM 4 → `208,08` (wrong), PSM 6 → correct. A regression test asserts the config reaches `image_to_string`; removing it breaks the feature while every other test stays green.
- **Amount**: the *last* line matching `TOTAL_KEYWORDS = ("SUMME", "GESAMT", "ZU ZAHLEN", "ENDBETRAG")` (case-insensitive), skipping `ZWISCHENSUMME`; the final total prints after subtotals. If the keyword line has no number, use the next non-empty line (printers wrap). No match → `None`, never a "largest number" fallback — on a money field a wrong value is worse than none.
  - Regex `(?:\d{1,3}(?:\.\d{3})+|\d+),\d{2}`. The naive `\d{1,3}(?:\.\d{3})*,\d{2}` reads `SUMME 1234,56` as `234,56`.
  - `BETRAG` is deliberately absent: it matches `Rabattbetrag`, `Nettobetrag`, `Steuerbetrag`, `Rechnungsbetrag`, which print after the total — with "last wins" that returned a 2,00 € discount instead of the 20,00 € total. `GESAMT`/`ENDBETRAG` still cover `Gesamtbetrag`/`Endbetrag`.
- **Date**: first `dd.mm.yy(yy)` that is also a valid calendar date (`99.99.2024` is skipped). Two-digit year → `2000 + yy`.
- **Merchant**: first non-empty line.
- Tests: `test_ocr.py` covers the parser; `test_receipt_extraction.py` mocks `backend.services.ocr.pytesseract.image_to_string` and asserts nothing is persisted. No endpoint test for `TesseractNotFoundError`: `ASGITransport(raise_app_exceptions=True)` re-raises instead of returning a response.
- Tesseract ships in the backend image; native `pytest` mocks it. Running `extract_receipt_data` natively needs Tesseract with `deu` on `PATH`.

## Not built: other receipt languages

UI `language` is not the receipt's language (a German user abroad gets English receipts) — never key OCR off it; use detection or a per-upload choice. Switching `lang` alone is worse than today: the parser is German in three places — `TOTAL_KEYWORDS`, `AMOUNT_PATTERN` (`1.234,56`), `DATE_PATTERN` (`dd.mm.yyyy`; English `mm/dd` vs `dd/mm` is also ambiguous). Full scope: a second parser + tests, `tesseract-ocr-eng` in `backend/Dockerfile` and `.github/workflows/backend.yml`, and the selection mechanism. No hook or abstraction ahead of the second language.
