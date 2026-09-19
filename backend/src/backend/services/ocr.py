"""Extract merchant/amount/date from a receipt image via Tesseract OCR.

Split into a pure text-parsing function and an image-driving wrapper so the
heuristics are testable without a Tesseract binary installed -- mirrors the
preprocess_image/route split in image_processing.py.
"""

import io
import re
from datetime import date
from decimal import Decimal

import pytesseract
from PIL import Image

from backend.schemas.receipt import ReceiptExtraction
from backend.services.image_processing import preprocess_image

# "BETRAG" deliberately NOT included: it's a substring of "Rabattbetrag",
# "Nettobetrag", "Steuerbetrag", "Rechnungsbetrag" -- lines that print *after*
# the total on German receipts. Combined with the "last match wins" rule
# below, that silently returns e.g. a discount amount instead of the total.
# "Gesamtbetrag" stays covered via GESAMT, "Endbetrag" via ENDBETRAG.
TOTAL_KEYWORDS = ("SUMME", "GESAMT", "ZU ZAHLEN", "ENDBETRAG")

# Either a real thousands grouping (1.234,56) or an ungrouped run of digits
# (1234,56). A naive `\d{1,3}(?:\.\d{3})*,\d{2}` matches only "234,56" out of
# "SUMME 1234,56": \d{1,3} greedily takes 3 digits and the grouping is
# optional, so it silently drops the leading digit -- and four-digit totals
# without a thousands separator are common on receipts. Wrong amount is worse
# than no amount here, since this feeds a money field.
AMOUNT_PATTERN = re.compile(r"(?:\d{1,3}(?:\.\d{3})+|\d+),\d{2}")
DATE_PATTERN = re.compile(r"\b(\d{1,2})\.(\d{1,2})\.(\d{2,4})\b")

# Default Tesseract segmentation (PSM 3) auto-detects layout and on a receipt
# often reads it as two columns, emitting all labels first and all numbers
# after -- so "SUMME EUR" and its amount end up many lines apart and
# _find_amount's line-based heuristics can never join them. PSM 6 ("assume a
# single uniform block of text") keeps the label and amount on one line.
OCR_CONFIG = "--psm 6"


def _find_amount(lines: list[str]) -> Decimal | None:
    """Find the total. `lines` must be stripped and free of blank lines."""
    # "Zwischensumme" contains "summe" as a substring, so it would otherwise
    # match TOTAL_KEYWORDS -- exclude it explicitly.
    keyword_lines = [
        i
        for i, line in enumerate(lines)
        if "ZWISCHENSUMME" not in line.upper()
        and any(keyword in line.upper() for keyword in TOTAL_KEYWORDS)
    ]
    if not keyword_lines:
        return None

    # The final total is printed after any subtotals, so the last keyword
    # match wins over the first.
    index = keyword_lines[-1]
    # Kassendrucker sometimes wrap the total onto the next printed line.
    candidates = lines[index : index + 2]

    for candidate in candidates:
        match = AMOUNT_PATTERN.search(candidate)
        if match:
            return Decimal(match.group().replace(".", "").replace(",", "."))
    return None


def _find_date(text: str) -> date | None:
    for day, month, year in DATE_PATTERN.findall(text):
        year_int = int(year)
        if year_int < 100:
            year_int += 2000
        try:
            return date(year_int, int(month), int(day))
        except ValueError:
            continue  # e.g. 99.99.2024 -- keep looking
    return None


def _find_merchant(lines: list[str]) -> str | None:
    # Shop name is almost always the header line of a receipt.
    return lines[0] if lines else None


def parse_receipt_text(text: str) -> ReceiptExtraction:
    """Apply heuristics for German receipts to raw OCR text.

    Pure and deterministic -- no Tesseract call here, so it's directly unit
    testable. Any field that can't be confidently found comes back None
    rather than guessing (a wrong amount is worse than a missing one).
    """
    # Both line helpers take the blank-free list, so neither has to re-filter.
    # _find_date gets the raw text instead: a date is a regex hit anywhere in
    # the document, line structure is irrelevant to it.
    lines = [stripped for line in text.splitlines() if (stripped := line.strip())]

    return ReceiptExtraction(
        merchant=_find_merchant(lines),
        amount=_find_amount(lines),
        purchased_at=_find_date(text),
    )


def extract_receipt_data(content: bytes) -> ReceiptExtraction:
    """Run OCR on an uploaded receipt image and parse the result.

    Reuses preprocess_image so EXIF rotation is applied before OCR -- a
    sideways receipt photo produces garbage text otherwise. Raises whatever
    preprocess_image raises (OSError, DecompressionBombError,
    ImageTooLargeError) plus pytesseract.TesseractNotFoundError if the
    binary isn't installed; callers translate the former into a 400 and let
    the latter surface as a 500 (it's an environment problem, not bad input).
    """
    processed = preprocess_image(content)
    image = Image.open(io.BytesIO(processed.content))
    text = pytesseract.image_to_string(image, lang="deu", config=OCR_CONFIG)
    return parse_receipt_text(text)
