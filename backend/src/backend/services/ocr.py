"""Extract merchant/amount/date from a receipt image via Tesseract OCR.

Split into a pure text-parsing function and an image-driving wrapper so the
heuristics are testable without a Tesseract binary installed -- mirrors the
preprocess_image/route split in image_processing.py.
"""

import io
import re
from datetime import date
from decimal import Decimal
from statistics import mean

import pytesseract
from PIL import Image
from pydantic import ValidationError

from backend.schemas.receipt import ReceiptExtraction, ReceiptLineItem
from backend.services.image_processing import preprocess_image
from backend.services.pdf import pdf_text, render_pdf_pages

# SUMME/ZU ZAHLEN print the actual total; GESAMT/ENDBETRAG are a fallback
# used only if neither is found, because "Gesamtbetrag" also labels a line in
# the per-VAT-rate breakdown table that prints *after* SUMME -- taking the
# last GESAMT match there returns a subtotal instead of the total.
# "BETRAG" deliberately NOT included: it's a substring of "Rabattbetrag",
# "Nettobetrag", "Steuerbetrag", "Rechnungsbetrag" -- lines that print *after*
# the total on German receipts. Combined with the "last match wins" rule
# below, that silently returns e.g. a discount amount instead of the total.
PRIMARY_TOTAL_KEYWORDS = ("SUMME", "ZU ZAHLEN")
FALLBACK_TOTAL_KEYWORDS = ("GESAMT", "ENDBETRAG")

# Either a real thousands grouping (1.234,56) or an ungrouped run of digits
# (1234,56). A naive `\d{1,3}(?:\.\d{3})*,\d{2}` matches only "234,56" out of
# "SUMME 1234,56": \d{1,3} greedily takes 3 digits and the grouping is
# optional, so it silently drops the leading digit -- and four-digit totals
# without a thousands separator are common on receipts. Wrong amount is worse
# than no amount here, since this feeds a money field.
AMOUNT_PATTERN = re.compile(r"(?:\d{1,3}(?:\.\d{3})+|\d+),\d{2}")
DATE_PATTERN = re.compile(r"\b(\d{1,2})\.(\d{1,2})\.(\d{2,4})\b")
# No trailing \b: Rossmann OCR reads the date glued to the following time as
# "2025-09-10108:49" -- a word boundary there would reject it.
ISO_DATE_PATTERN = re.compile(r"\b(20\d{2})-(\d{2})-(\d{2})")

_AMOUNT = AMOUNT_PATTERN.pattern

# A trailing amount, optionally followed by a tax class (one or two letters,
# e.g. "BW", optionally preceded by "*"/"x" with no space -- "0,50xC",
# "0,50*C") and/or a standalone "*" (both common on German receipts), with a
# description containing at least one letter before it -- excludes bare
# quantity/price lines.
ITEM_LINE_PATTERN = re.compile(
    r"^(?P<desc>.*[A-Za-zÄÖÜäöüß].*?)\s+(?P<total>-?"
    + _AMOUNT
    + r")(?:\s*[*x]?[A-Z]{1,2})?(?:\s*\*)?$"
)

# "Milch 2 x 1,29 2,58" -- an inline quantity inside an item's description.
INLINE_QTY_PATTERN = re.compile(
    r"(?P<qty>\d+(?:,\d{1,3})?)\s*(?:Stk\.?|kg)?\s*[x×*]\s*(?P<unit>" + _AMOUNT + r")"
)

# A standalone quantity line with no description of its own, e.g.
# "2 Stk x 0,99" or "0,523 kg x 2,99 EUR/kg".
QTY_LINE_PATTERN = re.compile(
    r"^(?P<qty>\d+(?:,\d{1,3})?)\s*(?:Stk\.?|kg)?\s*[x×*]\s*(?P<unit>"
    + _AMOUNT
    + r")(?:\s+\S.*)?$"
)

# Default Tesseract segmentation (PSM 3) auto-detects layout and on a receipt
# often reads it as two columns, emitting all labels first and all numbers
# after -- so "SUMME EUR" and its amount end up many lines apart and
# _find_amount's line-based heuristics can never join them. PSM 6 ("assume a
# single uniform block of text") keeps the label and amount on one line.
OCR_CONFIG = "--psm 6"


def _to_decimal(value: str) -> Decimal:
    return Decimal(value.replace(".", "").replace(",", "."))


def _last_keyword_line(lines: list[str], keywords: tuple[str, ...]) -> int | None:
    # "Zwischensumme" contains "summe" as a substring, so it would otherwise
    # match TOTAL_KEYWORDS -- exclude it explicitly.
    keyword_lines = [
        i
        for i, line in enumerate(lines)
        if "ZWISCHENSUMME" not in line.upper()
        and any(keyword in line.upper() for keyword in keywords)
    ]
    # The final total is printed after any subtotals, so the last keyword
    # match wins over the first.
    return keyword_lines[-1] if keyword_lines else None


def _find_amount(lines: list[str]) -> Decimal | None:
    """Find the total. `lines` must be stripped and free of blank lines."""
    index = _last_keyword_line(lines, PRIMARY_TOTAL_KEYWORDS)
    if index is None:
        index = _last_keyword_line(lines, FALLBACK_TOTAL_KEYWORDS)
    if index is None:
        return None

    # Kassendrucker sometimes wrap the total onto the next printed line.
    candidates = lines[index : index + 2]

    for candidate in candidates:
        match = AMOUNT_PATTERN.search(candidate)
        if match:
            return _to_decimal(match.group())
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
    # Fallback only: dd.mm.yyyy is the common German format, ISO only shows
    # up on some receipt printers/scanners.
    for year, month, day in ISO_DATE_PATTERN.findall(text):
        try:
            return date(int(year), int(month), int(day))
        except ValueError:
            continue
    return None


def _find_merchant(lines: list[str], has_header: bool) -> str | None:
    # Shop name is almost always the header line of a receipt -- but only the
    # line that was actually first in the OCR output may be it. If the
    # confidence filter dropped that line, whatever survived as lines[0] is
    # some later, unrelated sentence, not a header, and must not be reported
    # as the merchant.
    return lines[0] if has_header and lines else None


def _items_end(lines: list[str]) -> int | None:
    """Index of the line where the item list ends (exclusive), or None.

    Mirrors _find_amount's keyword priority: primary keywords (or
    ZWISCHENSUMME) win outright, and only if neither appears anywhere does a
    fallback keyword end the list. Using the *first* match either way (not
    the last, like _find_amount) -- items are always printed before any
    total/subtotal line, so the earliest one marks the boundary. Checking
    PRIMARY_TOTAL_KEYWORDS before ever considering FALLBACK_TOTAL_KEYWORDS
    also means an item description that happens to contain "GESAMT" can't
    truncate the list early when a real SUMME line exists further down.
    """
    primary_end = next(
        (
            i
            for i, line in enumerate(lines)
            if "ZWISCHENSUMME" in line.upper()
            or any(keyword in line.upper() for keyword in PRIMARY_TOTAL_KEYWORDS)
        ),
        None,
    )
    if primary_end is not None:
        return primary_end
    return next(
        (
            i
            for i, line in enumerate(lines)
            if any(keyword in line.upper() for keyword in FALLBACK_TOTAL_KEYWORDS)
        ),
        None,
    )


def _find_items(lines: list[str], has_header: bool) -> list[ReceiptLineItem]:
    """Extract line items between the header and the total.

    Conservative like the rest of this module: no total line at all means no
    items (otherwise payment/tax lines after it get parsed as items), and any
    line that doesn't clearly look like an item or a quantity line is simply
    skipped -- a wrong item is worse than a missing one.
    """
    end = _items_end(lines)
    if end is None:
        return []

    items: list[ReceiptLineItem] = []
    pending_qty: tuple[Decimal, Decimal] | None = None  # (quantity, unit_price)

    # Skip lines[0] only when it's an actual header -- otherwise it's a real
    # line (the confidence filter dropped the header) and must be considered
    # for an item like any other.
    start = 1 if has_header else 0
    for line in lines[start:end]:
        qty_match = QTY_LINE_PATTERN.fullmatch(line)
        if qty_match:
            qty = _to_decimal(qty_match.group("qty"))
            unit = _to_decimal(qty_match.group("unit"))
            # REWE style: the quantity line prints after its item.
            if items and round(qty * unit, 2) == items[-1].total_price:
                items[-1] = items[-1].model_copy(
                    update={"quantity": qty, "unit_price": unit}
                )
                pending_qty = None
            else:
                # Lidl style: it prints before its item -- try the next one.
                pending_qty = (qty, unit)
            continue

        item_match = ITEM_LINE_PATTERN.fullmatch(line)
        if not item_match:
            continue

        desc = item_match.group("desc").strip()
        total = _to_decimal(item_match.group("total"))
        quantity, unit_price = Decimal(1), total

        inline_match = INLINE_QTY_PATTERN.search(desc)
        if inline_match:
            quantity = _to_decimal(inline_match.group("qty"))
            unit_price = _to_decimal(inline_match.group("unit"))
            desc = (desc[: inline_match.start()] + desc[inline_match.end() :]).strip()
        elif pending_qty and round(pending_qty[0] * pending_qty[1], 2) == total:
            quantity, unit_price = pending_qty

        pending_qty = None
        if not desc:
            continue
        try:
            item = ReceiptLineItem(
                description=desc,
                quantity=quantity,
                unit_price=unit_price,
                total_price=total,
            )
        except ValidationError:
            # e.g. quantity 0 (inline "0 x 1,29") or a >200 char description
            # -- a wrong/missing item is fine, a 500 from OCR isn't.
            continue
        items.append(item)

    return items


def parse_receipt_text(text: str, *, has_header: bool = True) -> ReceiptExtraction:
    """Apply heuristics for German receipts to raw OCR text.

    Pure and deterministic -- no Tesseract call here, so it's directly unit
    testable. Any field that can't be confidently found comes back None
    rather than guessing (a wrong amount is worse than a missing one).

    `has_header=False` says lines[0] is NOT the receipt's header line (the
    confidence filter dropped it) -- merchant is then always None, and item
    parsing starts at line 0 instead of line 1, since that line is real data.
    """
    # Both line helpers take the blank-free list, so neither has to re-filter.
    # _find_date gets the raw text instead: a date is a regex hit anywhere in
    # the document, line structure is irrelevant to it.
    lines = [stripped for line in text.splitlines() if (stripped := line.strip())]

    return ReceiptExtraction(
        merchant=_find_merchant(lines, has_header),
        amount=_find_amount(lines),
        purchased_at=_find_date(text),
        items=_find_items(lines, has_header),
    )


# Calibrated against the 5-receipt benchmark (backend/scripts/ocr_benchmark.py).
# Mean line confidence: clean receipts (bon_edeka, bon_rewe_scan) 81-86,
# hard-to-read ones (bon_rewe, bon_rewe_bad_quality, bon_rossmann) 39-44 ->
# LOW_QUALITY_CONFIDENCE = 60 separates them cleanly.
# LINE_MIN_CONFIDENCE = 55: below it, garbage still gets parsed as real data
# (a mis-OCR'd "Pe 0,25" scored 53 and was kept as a bogus item; "Summe
# 214,41" -- a euro sign misread as "2" -- scored 47). parse_ocr_lines only
# lets lines[0] become the merchant if *that exact* line survives the filter
# (see has_header below), so raising this past 65 -- where real body text on
# the worst scans starts outscoring their own misread header -- no longer
# risks a wrong merchant; it would just turn more borderline-correct fields
# into None. 55 keeps the two clean receipts' correct fields intact.
LINE_MIN_CONFIDENCE = 55
LOW_QUALITY_CONFIDENCE = 60


def _ocr_lines(data: dict) -> list[tuple[str, float]]:
    """Group image_to_data's per-word output into lines with a mean confidence.

    Words are grouped by (block_num, par_num, line_num), Tesseract's own line
    boundaries, in order of first appearance. Words with conf < 0 (no text
    detected for that box) or empty text are ignored.
    """
    grouped: dict[tuple[int, int, int], list[tuple[str, float]]] = {}
    for i, text in enumerate(data["text"]):
        text = text.strip()
        conf = float(data["conf"][i])
        if not text or conf < 0:
            continue
        key = (data["block_num"][i], data["par_num"][i], data["line_num"][i])
        grouped.setdefault(key, []).append((text, conf))

    return [
        (" ".join(word for word, _ in words), mean(conf for _, conf in words))
        for words in grouped.values()
    ]


def parse_ocr_lines(lines: list[tuple[str, float]]) -> ReceiptExtraction:
    """Drop low-confidence lines before parsing and flag hard-to-read images.

    A wrongly OCR'd line (garbage merchant name, a total misread from a
    euro-sign-as-"2") scores far lower confidence than a correctly read one,
    so dropping lines below LINE_MIN_CONFIDENCE removes them before they can
    ever reach the regex heuristics. `low_quality` is a separate, courser
    signal for the frontend hint: even after the drop, a scan too blurry to
    read reliably should tell the user rather than silently return empty
    fields.
    """
    low_quality = not lines or mean(conf for _, conf in lines) < LOW_QUALITY_CONFIDENCE
    # Only the actual first OCR line may become the merchant -- if it was
    # dropped by the filter below, whatever survives as the new first line is
    # some unrelated, later sentence, not a header.
    has_header = bool(lines) and lines[0][1] >= LINE_MIN_CONFIDENCE
    text = "\n".join(line for line, conf in lines if conf >= LINE_MIN_CONFIDENCE)
    extraction = parse_receipt_text(text, has_header=has_header)
    return extraction.model_copy(update={"low_quality": low_quality})


def _ocr_image(image: Image.Image) -> list[tuple[str, float]]:
    data = pytesseract.image_to_data(
        image, lang="deu", config=OCR_CONFIG, output_type=pytesseract.Output.DICT
    )
    return _ocr_lines(data)


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
    return parse_ocr_lines(_ocr_image(image))


def extract_pdf_data(content: bytes) -> ReceiptExtraction:
    """Extract from a PDF: the text layer if there is one, else OCR its pages.

    Raises whatever open_pdf raises (InvalidPdfError) plus
    pytesseract.TesseractNotFoundError, same as extract_receipt_data.
    """
    text = pdf_text(content)
    if text.strip():
        return parse_receipt_text(text)

    lines: list[tuple[str, float]] = []
    for page_image in render_pdf_pages(content):
        lines.extend(_ocr_image(page_image))
    return parse_ocr_lines(lines)
