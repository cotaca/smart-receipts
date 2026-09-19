"""Unit tests for the pure text-parsing heuristics -- no Tesseract needed."""

from datetime import date
from decimal import Decimal
from unittest.mock import patch

from backend.services.ocr import OCR_CONFIG, extract_receipt_data, parse_receipt_text
from tests.images import make_image_bytes


def test_parses_all_fields_from_a_typical_receipt():
    text = "REWE Markt\nBrot 2,50\nSUMME 12,34\n15.01.2024"

    result = parse_receipt_text(text)

    assert result.merchant == "REWE Markt"
    assert result.amount == Decimal("12.34")
    assert result.purchased_at == date(2024, 1, 15)


def test_amount_without_thousands_separator():
    result = parse_receipt_text("SUMME 1234,56")
    assert result.amount == Decimal("1234.56")


def test_amount_with_thousands_separator():
    result = parse_receipt_text("SUMME 1.234,56")
    assert result.amount == Decimal("1234.56")


def test_final_total_wins_over_zwischensumme():
    text = "ZWISCHENSUMME 10,00\nSUMME 12,34"

    result = parse_receipt_text(text)

    assert result.amount == Decimal("12.34")


def test_no_total_keyword_gives_no_amount():
    result = parse_receipt_text("Brot 2,50\nMilch 1,20")
    assert result.amount is None


def test_empty_text_gives_no_fields():
    result = parse_receipt_text("")

    assert result.merchant is None
    assert result.amount is None
    assert result.purchased_at is None


def test_two_digit_year():
    result = parse_receipt_text("15.01.24")
    assert result.purchased_at == date(2024, 1, 15)


def test_invalid_date_is_skipped_for_a_later_valid_one():
    result = parse_receipt_text("99.99.2024 15.01.2024")
    assert result.purchased_at == date(2024, 1, 15)


def test_amount_on_the_line_after_the_keyword():
    # Kassendrucker sometimes wrap the total onto the next line.
    result = parse_receipt_text("SUMME\n12,34")
    assert result.amount == Decimal("12.34")


def test_betrag_keyword_does_not_shadow_the_real_total():
    # "Rabattbetrag" matched TOTAL_KEYWORDS via the "BETRAG" substring and,
    # as the later line, won under the "last match wins" rule -- returning
    # the discount instead of the total. Regression test for that.
    text = "REWE Markt GmbH\n12.03.2026 14:32\nMilch 1,29\nSUMME EUR 20,00\nGeg. BAR 50,00\nRabattbetrag 2,00"

    result = parse_receipt_text(text)

    assert result.amount == Decimal("20.00")


def test_extract_receipt_data_passes_psm_config_to_tesseract():
    # Without an explicit PSM, Tesseract's default layout detection can split
    # a receipt into two columns (labels, then amounts), which breaks
    # _find_amount's line-based heuristics. Guards against someone dropping
    # the config and all other tests staying green while the feature breaks.
    content = make_image_bytes()

    with patch(
        "backend.services.ocr.pytesseract.image_to_string", return_value=""
    ) as mock_ocr:
        extract_receipt_data(content)

    mock_ocr.assert_called_once()
    assert mock_ocr.call_args.kwargs["config"] == OCR_CONFIG
